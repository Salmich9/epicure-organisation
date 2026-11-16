-- 76 · Parts des associés, en direct, visibles par les seuls associés (Salmane, Hamza, Soufiane) ; Salmane seul modifie.
--   Par événement : prix signé HT − agence − apporteur − opérateurs − coût = marge nette.
--   Coût : par enveloppe, le plus haut entre le prévu et le dépensé (engagé + réel), plus les imprévus ; après clôture, le dépensé seul.
--   Encaissé en espèces : marge − charité, réinvestissement, dettes, provision = reste, partagé 37,5 / 37,5 / 25 (Paramètres).
--   Sinon le reste reste dans Epicure. Chaque associé : ses commissions + sa part du reste ; moins ce qui lui a été versé.

-- Qui sont les associés (le nom du compte, le nom court affiché, le paramètre de sa part) et qui modifie
insert into orga.parametres (cle, valeur) values ('associes', jsonb_build_object(
  'editeur', 'Salmane',
  'liste', jsonb_build_array(
    jsonb_build_object('nom', 'Hamza', 'court', 'Hamza', 'part', 'g_part_hamza'),
    jsonb_build_object('nom', 'Soufiane Hadni', 'court', 'Soufiane', 'part', 'g_part_soufiane'),
    jsonb_build_object('nom', 'Salmane', 'court', 'Salmane', 'part', 'g_part_salmane'))))
on conflict (cle) do nothing;

-- Allocations par défaut, sur la marge nette (0 % au départ, réglables dans Paramètres › Marges)
insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, si, mode, actif, ordre) values
 ('g_reinvest',  'marges', 'Commissions et partage', 'Réinvestissement', 'sur la marge nette', 'regle', 0, '%', 'toujours', 'achat', true, 635),
 ('g_dettes',    'marges', 'Commissions et partage', 'Remboursement de dettes', 'sur la marge nette', 'regle', 0, '%', 'toujours', 'achat', true, 636),
 ('g_provision', 'marges', 'Commissions et partage', 'Provision', 'sur la marge nette', 'regle', 0, '%', 'toujours', 'achat', true, 637)
on conflict (cle) do nothing;

-- Réglages d'un événement : apporteur, opérateurs, agence, allocations retouchées (en % ou en MAD)
create table if not exists orga.parts_evt (
  evenement_id text primary key references orga.evenements(id),
  apporteur text, operateurs text[], agence_pct numeric,
  allocations jsonb not null default '{}',
  maj_par text, maj_le timestamptz not null default now()
);
alter table orga.parts_evt enable row level security;
revoke all on orga.parts_evt from anon, authenticated;

-- Versements aux associés (annulables, jamais effacés)
create table if not exists orga.parts_versements (
  id bigserial primary key,
  associe text not null, montant numeric not null check (montant > 0), le date not null,
  evenement_id text references orga.evenements(id), note text,
  annule boolean not null default false,
  par text not null, cree_le timestamptz not null default now()
);
alter table orga.parts_versements enable row level security;
revoke all on orga.parts_versements from anon, authenticated;

-- Le porte : seulement un associé
create or replace function orga._qui_associe(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := orga._qui(p_token);
begin
  if not exists (select 1 from jsonb_array_elements((select valeur->'liste' from orga.parametres where cle = 'associes')) a where a->>'nom' = v) then
    raise exception 'reserve_associes';
  end if;
  return v;
end $$;

create or replace function orga._qui_associe_editeur(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := orga._qui_associe(p_token);
begin
  if v is distinct from (select valeur->>'editeur' from orga.parametres where cle = 'associes') then raise exception 'reserve_editeur_parts'; end if;
  return v;
end $$;

-- Le calcul d'un événement
create or replace function orga._parts_evt(p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev orga.evenements; r orga.parts_evt; ass jsonb := (select valeur->'liste' from orga.parametres where cle = 'associes');
  ht numeric; clos boolean; cout numeric := 0; prevu numeric := 0; depense numeric := 0; imp numeric := 0; ag numeric; app numeric; op numeric;
  marge numeric; esp boolean; alloc jsonb := '{}'; tot_alloc numeric := 0; reste numeric; parts jsonb := '{}'; a jsonb; k text; x jsonb; v numeric;
  ops text[]; apq text; ip numeric; nt text; nom_de jsonb;
begin
  select * into ev from orga.evenements where id = p_evt;
  select * into r from orga.parts_evt where evenement_id = p_evt;
  ht := coalesce(ev.prix_signe, 0);
  clos := ev.statut = 'Clôturé';
  select coalesce(sum((p->>'prevu')::numeric), 0), coalesce(sum(coalesce((p->>'engage')::numeric, 0) + coalesce((p->>'reel')::numeric, 0)), 0),
         coalesce(sum(greatest(coalesce((p->>'prevu')::numeric, 0), coalesce((p->>'engage')::numeric, 0) + coalesce((p->>'reel')::numeric, 0))), 0)
    into prevu, depense, cout from jsonb_array_elements(orga._postes_evt(p_evt)) p;
  ip := coalesce(ev.imprevus_pct, orga._param('g_imprevus'), 0); if ip < 1 then ip := ip * 100; end if;   -- l'appel vocal note 0,03 pour 3 %
  if clos then cout := depense; else imp := round(cout * ip / 100); cout := cout + imp; end if;
  -- Sans réglage : ce que l'appel vocal a noté (« Commission agence : 17 % · Sur place : Salmane · Apporteur : Salmane »), sinon le responsable
  nt := coalesce(ev.note, '');
  nom_de := (select jsonb_object_agg(lower(z), aa->>'nom') from jsonb_array_elements(ass) aa, unnest(array[aa->>'nom', aa->>'court']) z);
  ag := case when r.agence_pct is not null then round(ht * r.agence_pct / 100)
             when substring(nt from 'Commission agence : ([0-9]+(?:[.,][0-9]+)?) %') is not null then round(ht * replace(substring(nt from 'Commission agence : ([0-9]+(?:[.,][0-9]+)?) %'), ',', '.')::numeric / 100)
             when coalesce(ev.intermediaire, '') <> '' then round(ht * coalesce(orga._param('g_agence'), 0) / 100) else 0 end;
  apq := case when r.apporteur is not null then nullif(r.apporteur, '')
              else coalesce(nom_de->>lower(trim(substring(nt from 'Apporteur : ([^·]+)'))), ev.resp) end;
  app := case when apq is null then 0 else round(ht * coalesce(orga._param('g_apporteur'), 0) / 100) end;
  ops := case when r.operateurs is not null then r.operateurs
              else array(select distinct nom_de->>lower(trim(o)) from unnest(string_to_array(substring(nt from 'Sur place : ([^·]+)'), ',')) o where nom_de ? lower(trim(o))) end;
  op := round(ht * coalesce(orga._param('g_operateurs'), 0) / 100);
  marge := ht - ag - app - op - cout;
  esp := ev.entite = 'Espèce';
  -- Allocations sur la marge nette : défaut des Paramètres, retouchables en % ou en MAD
  foreach k in array array['charite', 'reinvest', 'dettes', 'provision'] loop
    x := r.allocations->k;
    v := case when x ? 'mad' then (x->>'mad')::numeric
              else round(greatest(marge, 0) * coalesce((x->>'pct')::numeric, orga._param('g_' || k), 0) / 100) end;
    alloc := alloc || jsonb_build_object(k, jsonb_build_object('montant', v, 'pct', case when x ? 'mad' then null else coalesce((x->>'pct')::numeric, orga._param('g_' || k), 0) end, 'retouche', x is not null));
    tot_alloc := tot_alloc + v;
  end loop;
  reste := marge - tot_alloc;
  for a in select * from jsonb_array_elements(ass) loop
    v := (case when apq = a->>'nom' then app else 0 end)
       + (case when cardinality(ops) > 0 and a->>'nom' = any(ops) then round(op / cardinality(ops)) else 0 end)
       + (case when esp then round(reste * coalesce(orga._param(a->>'part'), 0) / 100) else 0 end);
    parts := parts || jsonb_build_object(a->>'nom', v);
  end loop;
  return jsonb_build_object('id', ev.id, 'nom', ev.nom, 'date', ev.date, 'statut', ev.statut, 'especes', esp, 'ht', ht,
    'cout', cout, 'prevu', prevu, 'depense', depense, 'imprevus', imp,
    'source', case when clos then 'reel' when depense > 0 then 'partiel' else 'prevu' end,
    'agence', ag, 'agence_pct', case when ht > 0 and ag > 0 then round(ag / ht * 1000) / 10 end, 'imprevus_pct', case when clos then null else ip end,
    'apporteur', jsonb_build_object('qui', apq, 'montant', app),
    'operateurs', jsonb_build_object('qui', to_jsonb(ops), 'montant', op, 'a_attribuer', cardinality(ops) = 0),
    'marge', marge, 'marge_pct', case when ht > 0 then round(marge / ht * 100) end,
    'allocations', alloc, 'reste', reste, 'epicure', case when esp then 0 else reste end, 'parts', parts,
    'encaisse', (select coalesce(sum(e.montant), 0) from orga.encaissements e where e.evenement_id = p_evt));
end $$;

-- L'écran : l'année, chaque événement, chaque associé (gagné, versé, reste à verser)
create or replace function orga.parts_associes(p_token uuid, p_annee int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_associe(p_token); an int := coalesce(p_annee, extract(year from (now() at time zone 'Africa/Casablanca'))::int);
  evs jsonb; ass jsonb := (select valeur from orga.parametres where cle = 'associes');
begin
  select coalesce(jsonb_agg(orga._parts_evt(e.id) order by e.date), '[]') into evs from orga.evenements e
  where extract(year from e.date) = an and coalesce(e.prix_signe, 0) > 0 and coalesce(e.statut, '') <> 'Perdu';
  return jsonb_build_object('annee', an, 'moi', me, 'peut_modifier', me = ass->>'editeur', 'evenements', evs,
    'associes', (select jsonb_agg(jsonb_build_object('nom', a->>'nom', 'court', a->>'court', 'pct', orga._param(a->>'part'),
        'gagne', (select coalesce(sum((x->'parts'->>(a->>'nom'))::numeric), 0) from jsonb_array_elements(evs) x),
        'acquis', (select coalesce(sum((x->'parts'->>(a->>'nom'))::numeric), 0) from jsonb_array_elements(evs) x where x->>'source' = 'reel'),
        'verse', (select coalesce(sum(v.montant), 0) from orga.parts_versements v where v.associe = a->>'nom' and not v.annule and extract(year from v.le) = an)))
      from jsonb_array_elements(ass->'liste') a),
    'versements', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'associe', v.associe, 'montant', v.montant, 'le', v.le, 'evenement_id', v.evenement_id,
        'evenement', (select e.nom from orga.evenements e where e.id = v.evenement_id), 'note', v.note, 'par', v.par) order by v.le desc, v.id desc), '[]')
      from orga.parts_versements v where not v.annule and extract(year from v.le) = an));
end $$;

-- Salmane règle un événement : apporteur, opérateurs, agence, allocations ({"reinvest":{"pct":10}} ou {"dettes":{"mad":5000}} ; null = défaut)
create or replace function orga.parts_evt_maj(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_associe_editeur(p_token); al jsonb; k text;
begin
  if not exists (select 1 from orga.evenements where id = p_evt) then raise exception 'evenement_introuvable'; end if;
  insert into orga.parts_evt (evenement_id, maj_par) values (p_evt, me) on conflict (evenement_id) do nothing;
  al := (select allocations from orga.parts_evt where evenement_id = p_evt);
  if jsonb_typeof(p->'allocations') = 'object' then
    for k in select jsonb_object_keys(p->'allocations') loop
      if k not in ('charite', 'reinvest', 'dettes', 'provision') then continue; end if;
      al := case when jsonb_typeof(p->'allocations'->k) = 'object' then al || jsonb_build_object(k, p->'allocations'->k) else al - k end;
    end loop;
  end if;
  update orga.parts_evt set
    apporteur = case when p ? 'apporteur' then coalesce(p->>'apporteur', '') else apporteur end,
    operateurs = case when p ? 'operateurs' then array(select jsonb_array_elements_text(p->'operateurs')) else operateurs end,
    agence_pct = case when p ? 'agence_pct' then (p->>'agence_pct')::numeric else agence_pct end,
    allocations = al, maj_par = me, maj_le = now()
  where evenement_id = p_evt;
  return orga._parts_evt(p_evt);
end $$;

-- Salmane note un versement, ou l'annule
create or replace function orga.parts_verser(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_associe_editeur(p_token);
begin
  if p ? 'annuler' then
    update orga.parts_versements set annule = true where id = (p->>'annuler')::bigint;
  else
    if not exists (select 1 from jsonb_array_elements((select valeur->'liste' from orga.parametres where cle = 'associes')) a where a->>'nom' = p->>'associe') then raise exception 'associe_inconnu'; end if;
    if coalesce((p->>'montant')::numeric, 0) <= 0 then raise exception 'montant_invalide'; end if;
    insert into orga.parts_versements (associe, montant, le, evenement_id, note, par)
    values (p->>'associe', (p->>'montant')::numeric, coalesce((p->>'le')::date, (now() at time zone 'Africa/Casablanca')::date), nullif(p->>'evenement_id', ''), nullif(trim(p->>'note'), ''), me);
  end if;
  return orga.parts_associes(p_token, (p->>'annee')::int);
end $$;

revoke all on function orga._qui_associe(uuid), orga._qui_associe_editeur(uuid), orga._parts_evt(text) from public, anon, authenticated;
revoke all on function orga.parts_associes(uuid, int), orga.parts_evt_maj(uuid, text, jsonb), orga.parts_verser(uuid, jsonb) from public;
grant execute on function orga.parts_associes(uuid, int), orga.parts_evt_maj(uuid, text, jsonb), orga.parts_verser(uuid, jsonb) to anon, authenticated;
