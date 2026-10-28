-- Du général au particulier : enveloppes de budget (« postes »), lignes rattachées, actions chiffrées.
-- Enveloppes : matière par moment (prix/couvert × invités) + achats (matériel, consommables, staff, logistique).
-- Montant : chiffrage vocal s'il existe, sinon ratio par invité ; corrigeable (source = 'manuel').
-- Engagé = coût des lignes + coût des actions ; réel = pièces imputées + actions payées.

create table if not exists orga.postes (
  id bigserial primary key,
  evenement_id text not null references orga.evenements(id) on delete cascade,
  cle text not null,               -- accueil, cocktail, diner, desserts, late_snack, materiel, consommables, staff, logistique
  type text not null,              -- matiere | achat
  nom text not null,
  prix_couvert numeric,            -- matière
  montant numeric,                 -- achats (prévu)
  source text not null default 'calcul',   -- calcul | chiffrage | manuel
  retire boolean not null default false,
  resp text,                       -- si vide : la personne du rôle (équipe de l'événement)
  ordre int not null default 0,
  unique (evenement_id, cle)
);
alter table orga.postes enable row level security;

alter table orga.elements add column if not exists poste text;
alter table orga.elements add column if not exists mode_ligne text;
alter table orga.actions add column if not exists cout numeric;
alter table orga.actions add column if not exists poste text;
alter table orga.actions add column if not exists logistique jsonb not null default '{}'::jsonb;
alter table orga.actions add column if not exists paiement text;
alter table orga.actions add column if not exists carte text;
alter table orga.actions add column if not exists paye boolean not null default false;
alter table orga.actions add column if not exists heure text;

insert into orga.parametres (cle, valeur) values ('postes_defaut', jsonb_build_object(
  'matiere', jsonb_build_object('accueil', 15, 'cocktail', 38.5, 'diner', 150, 'desserts', 30, 'late_snack', 40),
  'par_invite', jsonb_build_object('materiel_traiteur', 110, 'materiel_bar', 40, 'consommables_bar', 45, 'consommables_traiteur', 10,
                                   'staff', 200, 'logistique', 30)))
on conflict (cle) do nothing;

-- Catalogue des enveloppes
create or replace function orga._postes_def() returns table (cle text, type text, nom text, role text, ordre int)
language sql immutable set search_path = '' as $$
  values ('accueil','matiere','Accueil','cuisine',1), ('cocktail','matiere','Cocktail','cuisine',2), ('diner','matiere','Dîner','cuisine',3),
         ('desserts','matiere','Desserts','cuisine',4), ('late_snack','matiere','Late snack','cuisine',5),
         ('materiel','achat','Matériel et équipement','production',10), ('consommables','achat','Consommables','achats',11),
         ('staff','achat','Staff','coordination',12), ('logistique','achat','Logistique et transport','production',13)
$$;

-- Moment d'une ligne de menu
create or replace function orga._moment(p_el text) returns text language sql immutable set search_path = '' as $$
  select case when p_el ilike '%accueil%' then 'accueil'
              when p_el ilike '%cocktail%' then 'cocktail'
              when p_el ilike '%dessert%' or p_el ilike '%pièce montée%' or p_el ilike '%gâteau%' or p_el ilike '%gateau%' then 'desserts'
              when p_el ilike '%late%' or p_el ilike '%snack%' then 'late_snack'
              else 'diner' end
$$;

-- Enveloppe d'une ligne (élément) quand elle n'est pas fixée à la main
create or replace function orga._poste_auto(p_zone text, p_el text, p_mode text, p_achat numeric, p_location numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_zone = 'Menu' then orga._moment(p_el)
    when p_zone = 'Staff' then 'staff'
    when p_zone = 'Logistique' then 'logistique'
    when p_mode in ('louer','prelever','rafistoler') then 'materiel'
    when p_mode = 'acheter' then 'consommables'
    when p_zone = 'Bar' then case when coalesce(p_location,0) > 0 then 'materiel' else 'consommables' end
    when coalesce(p_achat,0) > 0 and coalesce(p_achat,0) >= coalesce(p_location,0) then 'consommables'
    when p_el ilike '%petits achats%' or p_el ilike '%gaz%' or p_el ilike '%jetable%' then 'consommables'
    else 'materiel' end
$$;

-- Crée les enveloppes manquantes et met à jour les montants non corrigés à la main
create or replace function orga._postes_calc(p_evt text) returns void
language plpgsql security definer set search_path = '' as $$
declare ev orga.evenements; d jsonb; pi jsonb; lignes jsonb; inv numeric; trait boolean; bar boolean;
        moments text[] := '{}'; m text; tot jsonb := '{}'::jsonb; l jsonb; k text; v numeric; repas jsonb;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then return; end if;
  select valeur into d from orga.parametres where cle = 'postes_defaut';
  pi := d->'par_invite';
  inv := greatest(coalesce(ev.invites, 0), 0);
  trait := 'Traiteur' = any(coalesce(ev.prestations, '{}'));
  bar := 'Boissons' = any(coalesce(ev.prestations, '{}'));
  if not trait and not bar then trait := true; bar := true; end if;
  select c.lignes into lignes from orga.chiffrages c where c.evenement_id = p_evt and jsonb_array_length(coalesce(c.lignes, '[]')) > 0;

  -- Totaux par enveloppe depuis le chiffrage vocal
  if lignes is not null then
    for l in select * from jsonb_array_elements(lignes) loop
      v := coalesce(nullif(l->>'prix','')::numeric, 0) * coalesce(nullif(l->>'quantite','')::numeric, 0);
      k := orga._poste_auto(l->>'zone', l->>'element',
             case l->>'mode' when 'location' then 'louer' when 'achat' then 'acheter' when 'stock' then 'prelever' end,
             case when l->>'mode' = 'achat' then 1 end, case when l->>'mode' = 'location' then 1 end);
      tot := tot || jsonb_build_object(k, coalesce((tot->>k)::numeric, 0) + v);
    end loop;
  end if;

  -- Moments de matière
  if trait then
    if lignes is not null then
      select coalesce(array_agg(distinct x), '{}') into moments from jsonb_object_keys(tot) x where x in ('accueil','cocktail','diner','desserts','late_snack');
    end if;
    if coalesce(array_length(moments, 1), 0) = 0 then
      repas := ev.cadrage #> '{reponses,repas}';
      if jsonb_typeof(repas) = 'array' and jsonb_array_length(repas) > 0 then
        if repas ? 'Cocktail dînatoire' then moments := moments || 'cocktail'::text; end if;
        if repas ? 'Dîner assis' or repas ? 'Buffet' or repas ? 'Brunch' then moments := moments || array['diner','desserts']; end if;
      end if;
      if coalesce(array_length(moments, 1), 0) = 0 then moments := array['cocktail','diner','desserts']; end if;
    end if;
    foreach m in array moments loop
      insert into orga.postes (evenement_id, cle, type, nom, prix_couvert, source, ordre)
      select p_evt, f.cle, f.type, f.nom,
             case when tot ? m and inv > 0 then round((tot->>m)::numeric / inv, 1) else (d #>> array['matiere', m])::numeric end,
             case when tot ? m and inv > 0 then 'chiffrage' else 'calcul' end, f.ordre
      from orga._postes_def() f where f.cle = m
      on conflict (evenement_id, cle) do update set
        prix_couvert = case when orga.postes.source = 'manuel' then orga.postes.prix_couvert else excluded.prix_couvert end,
        source = case when orga.postes.source = 'manuel' then 'manuel' else excluded.source end;
    end loop;
  end if;

  -- Achats
  insert into orga.postes (evenement_id, cle, type, nom, montant, source, ordre)
  select p_evt, f.cle, f.type, f.nom,
         case when tot ? f.cle then round((tot->>f.cle)::numeric)
              else round(inv * case f.cle
                when 'materiel' then (case when trait then (pi->>'materiel_traiteur')::numeric else 0 end) + (case when bar then (pi->>'materiel_bar')::numeric else 0 end)
                when 'consommables' then (case when bar then (pi->>'consommables_bar')::numeric else 0 end) + (case when trait then (pi->>'consommables_traiteur')::numeric else 0 end)
                else (pi->>f.cle)::numeric end) end,
         case when tot ? f.cle then 'chiffrage' else 'calcul' end, f.ordre
  from orga._postes_def() f where f.type = 'achat'
  on conflict (evenement_id, cle) do update set
    montant = case when orga.postes.source = 'manuel' then orga.postes.montant else excluded.montant end,
    source = case when orga.postes.source = 'manuel' then 'manuel' else excluded.source end;
end $$;

-- Déclencheurs : création / prestations / cadrage / invités, et chiffrage vocal
create or replace function orga._t_postes_evt() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform orga._postes_calc(new.id); return null; end $$;
drop trigger if exists t_postes_evt on orga.evenements;
create trigger t_postes_evt after insert or update of prestations, cadrage, invites on orga.evenements
  for each row execute function orga._t_postes_evt();

create or replace function orga._t_postes_chiffrage() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform orga._postes_calc(new.evenement_id); return null; end $$;
drop trigger if exists t_postes_chiffrage on orga.chiffrages;
create trigger t_postes_chiffrage after insert or update of lignes on orga.chiffrages
  for each row execute function orga._t_postes_chiffrage();

-- Enveloppes de l'événement avec engagé / réel et la clé de chaque ligne
create or replace function orga._postes_evt(p_evt text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ev as (select * from orga.evenements where id = p_evt),
  eq as (select orga._equipe(p_evt) j),
  p as (select po.*, f.role from orga.postes po join orga._postes_def() f on f.cle = po.cle where po.evenement_id = p_evt and not po.retire),
  el as (
    select v.id, v.cout, v.facture, v.perimetre,
           coalesce(case when e.poste in (select cle from p) then e.poste end,
                    case when orga._poste_auto(v.zone, v.element, e.mode_ligne, v.achat, v.location) in (select cle from p)
                         then orga._poste_auto(v.zone, v.element, e.mode_ligne, v.achat, v.location) end,
                    case when v.zone = 'Menu' then (select cle from p where type = 'matiere' order by ordre limit 1) end,
                    'materiel') k
    from orga.v_elements v join orga.elements e on e.id = v.id where v.evenement_id = p_evt),
  ac as (
    select a.id, coalesce(a.cout, 0) cout, a.paye, coalesce(a.poste, (select k from el where el.id = a.element_id), 'materiel') k
    from orga.actions a where a.evenement_id = p_evt and coalesce(a.statut, '') <> 'Annulé')
  select coalesce(jsonb_agg(jsonb_build_object(
    'cle', p.cle, 'type', p.type, 'nom', p.nom, 'source', p.source, 'prix_couvert', p.prix_couvert, 'role', p.role,
    'resp', coalesce(p.resp, (select j->>p.role from eq)),
    'prevu', case when p.type = 'matiere' then round(coalesce(p.prix_couvert, 0) * coalesce((select invites from ev), 0)) else coalesce(p.montant, 0) end,
    'engage', coalesce((select sum(cout) from el where el.k = p.cle and coalesce(el.perimetre, '') not in ('Tiers', 'Pas besoin')), 0)
              + coalesce((select sum(cout) from ac where ac.k = p.cle), 0),
    'reel', coalesce((select sum(facture) from el where el.k = p.cle), 0) + coalesce((select sum(cout) from ac where ac.k = p.cle and ac.paye), 0),
    'lignes', coalesce((select jsonb_agg(el.id) from el where el.k = p.cle and coalesce(el.perimetre, '') <> 'Pas besoin'), '[]'),
    'actions', coalesce((select jsonb_agg(ac.id) from ac where ac.k = p.cle), '[]')
  ) order by p.ordre), '[]') from p
$$;

-- Les données de l'événement portent désormais ses enveloppes
create or replace function orga.donnees(p_token uuid, p_evt text DEFAULT NULL::text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare me text := orga._qui(p_token); ev text; res jsonb;
begin
  ev := p_evt;
  if ev is null then
    select id into ev from orga.evenements where date >= current_date order by date limit 1;
    if ev is null then select id into ev from orga.evenements order by date desc nulls last limit 1; end if;
  end if;
  if ev is not null and not exists (select 1 from orga.postes where evenement_id = ev) then perform orga._postes_calc(ev); end if;
  select jsonb_build_object(
    'moi', me,
    'aujourdhui', current_date,
    'evt', ev,
    'evenements', (select coalesce(jsonb_agg(to_jsonb(e) order by e.date nulls last), '[]') from orga.evenements e),
    'zones', (select coalesce(jsonb_agg(to_jsonb(z) order by z.ordre), '[]') from orga.zones z where z.active),
    'listes', (select coalesce(jsonb_object_agg(l.liste, l.vals), '{}') from (select liste, jsonb_agg(valeur order by ordre) vals from orga.listes group by liste) l),
    'intervenants', (select coalesce(jsonb_agg(jsonb_build_object('nom', i.nom, 'type', i.type, 'tel', i.tel) order by i.nom), '[]') from orga.intervenants i),
    'elements', (select coalesce(jsonb_agg(to_jsonb(v) || jsonb_build_object('poste', e.poste, 'mode_ligne', e.mode_ligne) order by v.zone, v.sous_zone, v.id), '[]')
                 from orga.v_elements v join orga.elements e on e.id = v.id where v.evenement_id = ev),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.echeance nulls last), '[]') from orga.actions a where a.evenement_id = ev),
    'postes', orga._postes_evt(ev),
    'equipe_evt', orga._equipe(ev),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n) order by n.date desc), '[]') from orga.notes n where n.evenement_id = ev or n.evenement_id is null),
    'deroule', (select coalesce(jsonb_agg(to_jsonb(d) order by d.ordre), '[]') from orga.deroule d where d.evenement_id = ev),
    'pieces', (select coalesce(jsonb_agg(to_jsonb(pc) order by pc.cree_le desc), '[]') from (select * from orga.pieces where evenement_id = ev and (facture_id is null and not ignoree or cree_le > now() - interval '30 days') order by cree_le desc limit 60) pc),
    'factures', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'element_id', f.element_id, 'fournisseur', f.fournisseur, 'montant', f.montant_ventile, 'lien', f.lien, 'date', f.date) order by f.date desc), '[]') from orga.factures f where f.evenement_id = ev),
    'depot', (select coalesce(jsonb_agg(jsonb_build_object('id', s.article_id, 'nom', s.name, 'qte', s.quantity, 'photo', s.photo_url, 'cat', c.name) order by s.name), '[]')
              from public.current_stock s left join public.categories c on c.id = s.category_id where s.active),
    'reserve', (select coalesce(jsonb_object_agg(x.article_id, x.q), '{}') from (
                  select el.article_id, sum(coalesce(el.stock,0)) q from orga.elements el
                  join orga.evenements e2 on e2.id = el.evenement_id
                  where el.article_id is not null and el.evenement_id <> ev and coalesce(e2.date, current_date) >= current_date
                  group by el.article_id) x)
  ) into res;
  return res;
end $function$;

-- Corriger une enveloppe : montant, prix par couvert, responsable, retirer / remettre
create or replace function orga.poste_maj(p_token uuid, p_evt text, p_cle text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if not exists (select 1 from orga.postes where evenement_id = p_evt and cle = p_cle) then
    insert into orga.postes (evenement_id, cle, type, nom, prix_couvert, source, ordre)
    select p_evt, f.cle, f.type, f.nom, ((select valeur from orga.parametres where cle = 'postes_defaut') #>> array['matiere', f.cle])::numeric, 'manuel', f.ordre
    from orga._postes_def() f where f.cle = p_cle;
  end if;
  update orga.postes set
    montant = case when p ? 'montant' then nullif(p->>'montant', '')::numeric else montant end,
    prix_couvert = case when p ? 'prix_couvert' then nullif(p->>'prix_couvert', '')::numeric else prix_couvert end,
    source = case when p ? 'montant' or p ? 'prix_couvert' then 'manuel' else source end,
    resp = case when p ? 'resp' then nullif(p->>'resp', '') else resp end,
    retire = case when p ? 'retire' then (p->>'retire')::boolean else retire end
  where evenement_id = p_evt and cle = p_cle;
  return orga._postes_evt(p_evt);
end $$;

-- Ajouter une ligne dans une enveloppe (mode : prelever / louer / acheter / produire / rafistoler)
create or replace function orga.ligne_ajouter(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid text; zn text; mo text := coalesce(p->>'mode', 'acheter'); q numeric; pr numeric; cle text := p->>'poste';
begin
  if coalesce(trim(p->>'nom'), '') = '' then raise exception 'manque_obligatoire'; end if;
  q := coalesce(nullif(p->>'qte', '')::numeric, 1);
  pr := nullif(p->>'prix', '')::numeric;
  if nullif(p->>'catalogue_id', '') is not null and exists (select 1 from orga.catalogue where id = p->>'catalogue_id') then
    nid := (orga.element_depuis_catalogue(p_token, p_evt, p->>'catalogue_id'))->>'id';
    update orga.elements set element = coalesce(nullif(trim(p->>'nom'), ''), element) where id = nid;
  else
    zn := case when cle in ('accueil','cocktail','diner','desserts','late_snack') then 'Menu' when cle = 'staff' then 'Staff'
               when cle = 'logistique' then 'Logistique' when cle = 'consommables' then 'Lieu, technique et admin' else 'Art de table' end;
    nid := orga._next_id('elements', 'EL-');
    insert into orga.elements (id, evenement_id, zone, element, perimetre, engagement, modifie_par)
    values (nid, p_evt, zn, trim(p->>'nom'), 'À notre charge', 'À lancer', me);
  end if;
  update orga.elements set
    poste = cle, mode_ligne = mo, qte_forcee = q,
    stock = case when mo = 'prelever' then q else 0 end,
    location = case when mo = 'louer' then q else 0 end,
    achat = case when mo = 'acheter' then q else 0 end,
    production = case when mo in ('produire', 'rafistoler') then q else 0 end,
    prix_location = case when mo = 'louer' then coalesce(pr, prix_location) else prix_location end,
    prix_achat = case when mo = 'acheter' then coalesce(pr, prix_achat) else prix_achat end,
    prix_production = case when mo in ('produire', 'rafistoler') then coalesce(pr, prix_production) else prix_production end,
    statut_prix = case when pr is not null then 'Estimé' else statut_prix end,
    fournisseur = coalesce(nullif(p->>'fournisseur', ''), fournisseur),
    note = coalesce(nullif(p->>'note', ''), note),
    resp = coalesce(nullif(p->>'resp', ''), resp),
    revu_le = now(), revu_par = me, modifie_le = now(), modifie_par = me
  where id = nid;
  return orga._element(nid) || jsonb_build_object('poste', cle, 'mode_ligne', mo);
end $$;

-- Créer ou modifier une action : quoi, coût, qui, quand obligatoires à la création
create or replace function orga.action_enregistrer(p_token uuid, p_evt text, p_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid text := p_id;
begin
  if nid is null then
    if coalesce(trim(p->>'quoi'), '') = '' or nullif(p->>'qui', '') is null or nullif(p->>'quand', '') is null or nullif(p->>'cout', '') is null
      then raise exception 'manque_obligatoire'; end if;
    nid := orga._next_id('actions', 'ACT-');
    insert into orga.actions (id, evenement_id, quoi, resp, echeance, statut, cree_par) values (nid, p_evt, trim(p->>'quoi'), p->>'qui', (p->>'quand')::date, 'À faire', me);
  end if;
  update orga.actions set
    quoi = case when p ? 'quoi' and trim(p->>'quoi') <> '' then trim(p->>'quoi') else quoi end,
    resp = case when p ? 'qui' and p->>'qui' <> '' then p->>'qui' else resp end,
    echeance = case when p ? 'quand' and p->>'quand' <> '' then (p->>'quand')::date else echeance end,
    heure = case when p ? 'heure' then nullif(p->>'heure', '') else heure end,
    cout = case when p ? 'cout' then nullif(p->>'cout', '')::numeric else cout end,
    poste = case when p ? 'poste' then nullif(p->>'poste', '') else poste end,
    element_id = case when p ? 'element_id' then nullif(p->>'element_id', '') else element_id end,
    logistique = case when p ? 'logistique' then coalesce(p->'logistique', '{}'::jsonb) else logistique end,
    paiement = case when p ? 'paiement' then nullif(p->>'paiement', '') else paiement end,
    carte = case when p ? 'carte' then nullif(p->>'carte', '') else carte end,
    paye = case when p ? 'paye' then (p->>'paye')::boolean else paye end,
    note = case when p ? 'note' then nullif(p->>'note', '') else note end,
    statut = case when p ? 'fait' then (case when (p->>'fait')::boolean then 'Fait' else 'À faire' end) else statut end
  where id = nid;
  return (select to_jsonb(a) from orga.actions a where a.id = nid);
end $$;

create or replace function orga.action_supprimer(p_token uuid, p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin delete from orga.actions where id = p_id; return found; end $$;

-- Écran « Aujourd'hui » : actions en retard, du jour, de demain et à venir, tous événements
create or replace function orga.aujourdhui(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); j date := (now() at time zone 'Africa/Casablanca')::date;
begin
  return jsonb_build_object('moi', me, 'aujourdhui', j,
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('evt_nom', e.nom, 'evt_date', e.date, 'entite', e.entite,
                  'poste_nom', (select f.nom from orga._postes_def() f where f.cle = a.poste),
                  'element', (select x.element from orga.elements x where x.id = a.element_id))
                  order by a.echeance nulls last, a.heure nulls last, a.cree_le), '[]')
                from orga.actions a join orga.evenements e on e.id = a.evenement_id
                where e.statut not in ('Clôturé', 'Perdu') and coalesce(a.statut, '') <> 'Annulé'
                  and (a.statut <> 'Fait' or a.echeance >= j - 1)),
    'evenements', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom, 'date', e.date) order by e.date nulls last), '[]')
                   from orga.evenements e where e.statut not in ('Clôturé', 'Perdu')),
    'intervenants', (select coalesce(jsonb_agg(jsonb_build_object('nom', i.nom, 'tel', i.tel)), '[]') from orga.intervenants i where i.type in ('Équipe', 'Staff / extra')));
end $$;

grant execute on function orga.poste_maj(uuid, text, text, jsonb), orga.ligne_ajouter(uuid, text, jsonb), orga.action_enregistrer(uuid, text, text, jsonb),
  orga.action_supprimer(uuid, text), orga.aujourdhui(uuid) to anon, authenticated;
revoke execute on function orga._postes_calc(text), orga._postes_evt(text) from anon, authenticated, public;

-- La corbeille garde aussi les enveloppes (elles ont evenement_id) ; la suppression d'événement les efface en cascade.
