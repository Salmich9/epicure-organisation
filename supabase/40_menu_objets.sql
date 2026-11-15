-- Chantier 3 : chaque ligne, action et enveloppe se déplace, se duplique, se supprime, et la suppression s'annule.
-- Une suppression part dans orga.corbeille (type + copie complète) ; « Annuler » la remet telle quelle.

alter table orga.corbeille add column if not exists type text not null default 'evenement';
alter table orga.corbeille add column if not exists objet_id text;
alter table orga.corbeille add column if not exists restaure_le timestamptz;

-- Supprimer une ligne, une action ou une enveloppe ; renvoie le numéro de corbeille (pour Annuler)
create or replace function orga.objet_supprimer(p_token uuid, p_type text, p_id text, p_evt text default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); snap jsonb; ev text; nom text; cid bigint;
begin
  if p_type = 'element' then
    if exists (select 1 from orga.factures where element_id = p_id) then raise exception 'element_facture'; end if;
    select to_jsonb(e), e.evenement_id, e.element into snap, ev, nom from orga.elements e where e.id = p_id;
    if snap is null then raise exception 'introuvable'; end if;
    snap := jsonb_build_object('ligne', snap, 'actions', coalesce((select jsonb_agg(a.id) from orga.actions a where a.element_id = p_id), '[]'));
    update orga.actions set element_id = null where element_id = p_id;
    delete from orga.elements where id = p_id;
  elsif p_type = 'action' then
    select to_jsonb(a), a.evenement_id, a.quoi into snap, ev, nom from orga.actions a where a.id = p_id;
    if snap is null then raise exception 'introuvable'; end if;
    snap := jsonb_build_object('ligne', snap);
    delete from orga.actions where id = p_id;
  elsif p_type = 'poste' then
    select to_jsonb(po), po.evenement_id, po.nom into snap, ev, nom from orga.postes po where po.evenement_id = p_evt and po.cle = p_id and not po.retire;
    if snap is null then raise exception 'introuvable'; end if;
    if exists (select 1 from jsonb_array_elements(orga._postes_evt(p_evt)) x where x->>'cle' = p_id
               and (jsonb_array_length(x->'actions') > 0 or exists (select 1 from orga.elements e where e.id in (select jsonb_array_elements_text(x->'lignes')) and (e.mode_ligne is not null or coalesce(e.stock,0) + coalesce(e.location,0) + coalesce(e.achat,0) + coalesce(e.production,0) > 0))))
      then raise exception 'enveloppe_non_vide'; end if;
    snap := jsonb_build_object('ligne', snap);
    update orga.postes set retire = true where evenement_id = p_evt and cle = p_id;
  else raise exception 'type_inconnu'; end if;
  insert into orga.corbeille (evenement_id, nom, supprime_par, donnees, type, objet_id) values (ev, nom, me, snap, p_type, p_id) returning id into cid;
  return cid;
end $$;

-- Remettre ce qui vient d'être supprimé
create or replace function orga.objet_restaurer(p_token uuid, p_corbeille bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); c orga.corbeille;
begin
  select * into c from orga.corbeille where id = p_corbeille and restaure_le is null;
  if c.id is null then raise exception 'introuvable'; end if;
  if c.type = 'element' then
    insert into orga.elements select * from jsonb_populate_record(null::orga.elements, c.donnees->'ligne');
    update orga.actions set element_id = c.objet_id where id in (select jsonb_array_elements_text(c.donnees->'actions'));
  elsif c.type = 'action' then
    insert into orga.actions select * from jsonb_populate_record(null::orga.actions, c.donnees->'ligne');
  elsif c.type = 'poste' then
    update orga.postes set retire = false where evenement_id = c.evenement_id and cle = c.objet_id;
  else raise exception 'type_inconnu'; end if;
  update orga.corbeille set restaure_le = now() where id = p_corbeille;
  return true;
end $$;

-- Déplacer une ligne dans une autre enveloppe (ses actions suivent)
create or replace function orga.ligne_deplacer(p_token uuid, p_id text, p_poste text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.elements set poste = p_poste, modifie_le = now(), modifie_par = me where id = p_id;
  update orga.actions set poste = p_poste where element_id = p_id;
  return orga._element(p_id) || jsonb_build_object('poste', p_poste);
end $$;

-- Dupliquer une ligne ou une action (même enveloppe, à côté de l'original)
create or replace function orga.objet_dupliquer(p_token uuid, p_type text, p_id text) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid text; r jsonb;
begin
  if p_type = 'element' then
    nid := orga._next_id('elements', 'EL-');
    select to_jsonb(e) into r from orga.elements e where e.id = p_id;
    if r is null then raise exception 'introuvable'; end if;
    insert into orga.elements select * from jsonb_populate_record(null::orga.elements,
      r || jsonb_build_object('id', nid, 'element', (r->>'element') || ' (copie)', 'revu_le', null, 'modifie_le', now(), 'modifie_par', me, 'piece', null));
  elsif p_type = 'action' then
    nid := orga._next_id('actions', 'ACT-');
    select to_jsonb(a) into r from orga.actions a where a.id = p_id;
    if r is null then raise exception 'introuvable'; end if;
    insert into orga.actions select * from jsonb_populate_record(null::orga.actions,
      r || jsonb_build_object('id', nid, 'statut', 'À faire', 'paye', false, 'reponse', null, 'cree_le', now(), 'cree_par', me));
  else raise exception 'type_inconnu'; end if;
  return nid;
end $$;

-- Enveloppes personnalisées : créer et renommer
create or replace function orga.poste_creer(p_token uuid, p_evt text, p_nom text, p_type text default 'achat') returns text
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); c text;
begin
  if coalesce(trim(p_nom), '') = '' then raise exception 'manque_obligatoire'; end if;
  c := 'perso_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into orga.postes (evenement_id, cle, type, nom, montant, prix_couvert, source, ordre, resp)
  values (p_evt, c, case when p_type = 'matiere' then 'matiere' else 'achat' end, trim(p_nom), case when p_type = 'matiere' then null else 0 end,
          case when p_type = 'matiere' then 0 end, 'manuel', case when p_type = 'matiere' then 6 else 14 end, me);
  return c;
end $$;

do $$
declare def text;
begin
  def := pg_get_functiondef('orga.poste_maj'::regproc);
  if def !~ 'p \? ''nom''' then
    execute replace(def, 'retire = case when p ? ''retire''', 'nom = case when p ? ''nom'' and trim(p->>''nom'') <> '''' then trim(p->>''nom'') else nom end,
    retire = case when p ? ''retire''');
  end if;
  -- les enveloppes personnalisées n'ont pas de rôle par défaut : jointure souple
  def := pg_get_functiondef('orga._postes_evt'::regproc);
  if def !~ 'left join orga\._postes_def' then
    execute replace(def, 'join orga._postes_def() f on f.cle = po.cle', 'left join orga._postes_def() f on f.cle = po.cle');
  end if;
  def := pg_get_functiondef('orga.aujourdhui'::regproc);
  if def ~ 'from orga\._postes_def\(\) f where f\.cle = a\.poste' then
    execute replace(def, '(select f.nom from orga._postes_def() f where f.cle = a.poste)', '(select po.nom from orga.postes po where po.evenement_id = a.evenement_id and po.cle = a.poste)');
  end if;
end $$;

grant execute on function orga.objet_supprimer(uuid, text, text, text), orga.objet_restaurer(uuid, bigint), orga.ligne_deplacer(uuid, text, text),
  orga.objet_dupliquer(uuid, text, text), orga.poste_creer(uuid, text, text, text) to anon, authenticated;
