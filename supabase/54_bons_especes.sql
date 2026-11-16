-- Bon d'achat espèces signé à l'écran : numéro qui se suit par société et par année, achats entrés au dépôt,
-- dépense déduite de l'enveloppe de celui qui paie (pour un événement), PDF rangé dans le Drive par orga-bon.
-- Migrations orga_54_bons_especes et orga_54b_aujourdhui_droits_depot.
create table if not exists orga.bons (
  id bigint generated always as identity primary key,
  num text not null unique,
  societe text not null check (societe in ('BB', 'EPI')),
  evenement_id text references orga.evenements(id) on delete set null,
  pour text not null,
  vendeur text not null,
  payeur text not null,
  lignes jsonb not null,
  total numeric not null,
  signature text not null,
  achats uuid[] not null default '{}',
  mouvement_id bigint,
  drive_url text,
  cree_le timestamptz not null default now()
);
alter table orga.bons enable row level security;
revoke all on orga.bons from anon, authenticated;
create table if not exists orga.bons_compteur (societe text, annee int, dernier int not null default 0, primary key (societe, annee));
alter table orga.bons_compteur enable row level security;
revoke all on orga.bons_compteur from anon, authenticated;

create or replace function orga.bon_creer(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'acheter');
  soc text := p->>'societe'; ev text := nullif(p->>'evenement_id', ''); vend text := trim(coalesce(p->>'vendeur', '')); sig text := p->>'signature';
  an int := extract(year from now())::int; k int; num text; l jsonb; r json; achats uuid[] := '{}'; tot numeric := 0; pid bigint; mid bigint; bid bigint; pour text; propres jsonb := '[]';
begin
  if soc not in ('BB', 'EPI') or vend = '' or jsonb_array_length(coalesce(p->'lignes', '[]')) = 0 then raise exception 'manque_obligatoire'; end if;
  if sig is null or sig !~ '^data:image/png;base64,' or length(sig) > 400000 then raise exception 'signature_manquante'; end if;
  if ev is not null then perform orga._acces_evt(me, ev); end if;
  pour := coalesce((select e.nom from orga.evenements e where e.id = ev), 'Dépôt (réassort)');
  insert into orga.bons_compteur (societe, annee, dernier) values (soc, an, 1) on conflict (societe, annee) do update set dernier = orga.bons_compteur.dernier + 1 returning dernier into k;
  num := soc || '-' || an || '-' || lpad(k::text, 4, '0');
  for l in select * from jsonb_array_elements(p->'lignes') loop
    if coalesce((l->>'qte')::numeric, 0) <= 0 or coalesce((l->>'prix')::numeric, -1) < 0 then raise exception 'montant_invalide'; end if;
    r := public.enregistrer_achat(u, (l->>'qte')::numeric, (l->>'prix')::numeric, nullif(l->>'article_id', '')::uuid, null, current_date,
           'Bon ' || num || ' · ' || vend || ' · ' || pour, nullif(trim(l->>'nom'), ''), nullif(l->>'cat_id', '')::uuid, nullif(l->>'unite_id', '')::uuid, 'consommable');
    achats := achats || (r->>'purchase_id')::uuid;
    tot := tot + (l->>'qte')::numeric * (l->>'prix')::numeric;
    propres := propres || jsonb_build_object('nom', coalesce(nullif(trim(l->>'nom'), ''), (select a.name from public.articles a where a.id = (r->>'article_id')::uuid)),
      'article_id', r->>'article_id', 'qte', (l->>'qte')::numeric, 'prix', (l->>'prix')::numeric);
  end loop;
  if ev is not null then
    insert into orga.pieces (evenement_id, depose_par, fournisseur, type, montant, date_piece, statut, source)
    values (ev, me, vend, 'BON ESPECES', tot, current_date, 'rangee', 'bon') returning id into pid;
    insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, piece_id, par)
    values (ev, me, 'depense', tot, 'ok', 'Bon ' || num || ' · ' || vend, pid, me) returning id into mid;
  end if;
  insert into orga.bons (num, societe, evenement_id, pour, vendeur, payeur, lignes, total, signature, achats, mouvement_id)
  values (num, soc, ev, pour, vend, me, propres, tot, sig, achats, mid) returning id into bid;
  return jsonb_build_object('id', bid, 'num', num, 'total', tot, 'pour', pour, 'reste', case when ev is not null then orga._reste(ev, me) end);
end $$;

-- Pour l'écran : ce que la personne a dans son enveloppe pour un événement
create or replace function orga.bon_contexte(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if p_evt is not null then perform orga._acces_evt(me, p_evt); end if;
  return jsonb_build_object('moi', me, 'enveloppe', case when p_evt is not null then orga._reste(p_evt, me) end,
    'evenements', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nom', e.nom, 'date', e.date, 'entite', e.entite) order by e.date)
      from orga.evenements e where e.date >= current_date - 3 and (orga._role(me) <> 'equipe' or e.id = any(orga._evts_equipe(me)))), '[]'));
end $$;

-- Le PDF rangé dans Drive (appelé par la fonction orga-bon)
create or replace function orga._bon_pour_pdf(p_id bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(b) || jsonb_build_object('drive_sous', e.drive_sous, 'drive_id', e.drive_id, 'evt_nom', e.nom, 'evt_date', e.date, 'entite', e.entite)
  from orga.bons b left join orga.evenements e on e.id = b.evenement_id where b.id = p_id
$$;
revoke execute on function orga._bon_pour_pdf(bigint) from public, anon, authenticated;
grant execute on function orga._bon_pour_pdf(bigint) to service_role;
grant select, update on orga.bons to service_role;
grant update on orga.evenements to service_role;

grant execute on function orga.bon_creer(uuid, jsonb), orga.bon_contexte(uuid, text) to anon, authenticated;

-- 54b. Aujourd'hui porte les droits dépôt de la personne (pour montrer « Achat en espèces » à ceux qui peuvent acheter)
do $$
declare def text := pg_get_functiondef('orga.aujourdhui(uuid)'::regprocedure);
begin
  if def !~ '_droits_depot' then
    def := replace(def, 'if r <> ''equipe'' then return d || jsonb_build_object(''role'', r); end if;',
      'd := d || jsonb_build_object(''depot'', to_jsonb(coalesce(orga._droits_depot(me), ''{}''::text[])));
  if r <> ''equipe'' then return d || jsonb_build_object(''role'', r); end if;');
    execute def;
  end if;
end $$;

-- 54c. Un acheteur sans enveloppe (pas porteur) : le bon, le stock et la pièce passent, rien n'est déduit.
--      (appliqué en base par remplacement dans bon_creer et bon_contexte ; voir migration orga_54c_bon_sans_enveloppe)
-- 54d. Remplace 54c : l'acheteur sans enveloppe devient porteur (enveloppe à 0) ; sa dépense passe en négatif,
--      c'est l'avance que la société lui doit (« on lui doit » dans Espèces), remboursée avec « Confier ».
--      (migration orga_54d_bon_avance)
