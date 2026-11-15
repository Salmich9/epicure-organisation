-- Lot C (audit 2) : chargement et retour compté par ligne, véhicules par défaut, retours dans la jauge.

alter table orga.elements add column if not exists charge numeric;
alter table orga.elements add column if not exists revenu numeric;
alter table orga.elements add column if not exists casse numeric;
alter table orga.elements add column if not exists charge_le timestamptz;
alter table orga.elements add column if not exists retour_le timestamptz;

-- Véhicules proposés dans la fiche d'une action (modifiables dans parametres.regles)
update orga.parametres set valeur = valeur || jsonb_build_object('vehicules', jsonb_build_array('Camion Epicure', 'Utilitaire', 'Voiture', 'Taxi ou course', 'Livré par le fournisseur'))
where cle = 'regles' and not (valeur ? 'vehicules');

-- Chargé, revenu, cassé : n'importe quel compte connecté (l'équipe compte sur le terrain)
create or replace function orga.ligne_terrain(p_token uuid, p_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.elements set
    charge = case when p ? 'charge' then nullif(p->>'charge', '')::numeric else charge end,
    charge_le = case when p ? 'charge' then now() else charge_le end,
    revenu = case when p ? 'revenu' then nullif(p->>'revenu', '')::numeric else revenu end,
    casse = case when p ? 'casse' then nullif(p->>'casse', '')::numeric else casse end,
    retour_le = case when p ? 'revenu' then case when p->>'revenu' is null then null else now() end else retour_le end,
    modifie_le = now(), modifie_par = me
  where id = p_id;
  if not found then raise exception 'introuvable'; end if;
  return (select jsonb_build_object('charge', e.charge, 'revenu', e.revenu, 'casse', e.casse) from orga.elements e where e.id = p_id);
end $$;
grant execute on function orga.ligne_terrain(uuid, text, jsonb) to anon, authenticated;

-- Les lignes de l'événement portent leur chargement et leur retour
create or replace function orga._terrain(d jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select d || jsonb_build_object('elements', coalesce((select jsonb_agg(x || coalesce((select jsonb_build_object('charge', e.charge, 'revenu', e.revenu, 'casse', e.casse)
                                                                                         from orga.elements e where e.id = x->>'id'), '{}'))
                                                       from jsonb_array_elements(coalesce(d->'elements', '[]')) x), '[]'));
$$;
revoke execute on function orga._terrain(jsonb) from public, anon, authenticated;

create or replace function orga.donnees(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix(p_token); r text := orga._role(me); ok text[]; ev text := p_evt; d jsonb; miens text[];
begin
  if r <> 'equipe' then
    return orga._terrain(orga._donnees_brut(p_token, p_evt)) || jsonb_build_object('role', r, 'admin', coalesce((select m.admin from orga.membres m where m.nom = me), false));
  end if;
  ok := orga._evts_equipe(me);
  if ev is null or not (ev = any(ok)) then ev := ok[1]; end if;
  d := orga._terrain(orga._donnees_brut(p_token, ev));
  d := d || jsonb_build_object('role', 'equipe', 'admin', false,
    'evenements', coalesce((select jsonb_agg(orga._evt_equipe(x)) from jsonb_array_elements(d->'evenements') x where x->>'id' = any(ok)), '[]'),
    'factures', '[]'::jsonb, 'pieces', '[]'::jsonb);
  if ev is null then
    return d || jsonb_build_object('evt', null, 'elements', '[]'::jsonb, 'actions', '[]'::jsonb, 'postes', '[]'::jsonb);
  end if;
  select coalesce(array_agg(x->>'cle'), '{}') into miens from jsonb_array_elements(d->'postes') x where x->>'resp' = me;
  return d || jsonb_build_object(
    'postes', coalesce((select jsonb_agg(case when x->>'resp' = me then x else x || '{"prevu":null,"engage":null,"reel":null,"montant":null,"prix_couvert":null}'::jsonb end) from jsonb_array_elements(d->'postes') x), '[]'),
    'elements', coalesce((select jsonb_agg(case when coalesce(x->>'poste', '') = any(miens) or x->>'resp' = me then x
                                                else x || '{"prix_achat":null,"prix_location":null,"prix_production":null,"cout":null,"facture":null}'::jsonb end) from jsonb_array_elements(d->'elements') x), '[]'),
    'actions', coalesce((select jsonb_agg(case when coalesce(x->>'poste', '') = any(miens) or x->>'resp' = me then x else x || '{"cout":null}'::jsonb end) from jsonb_array_elements(d->'actions') x), '[]'));
end $$;

-- Jauge : une fois l'événement passé, chaque ligne prélevée ou louée compte aussi par son retour
create or replace function orga._pret(p_evt text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with cles as (select po.cle from orga.postes po where po.evenement_id = p_evt and not po.retire),
  passe as (select coalesce((select ev.date < (now() at time zone 'Africa/Casablanca')::date from orga.evenements ev where ev.id = p_evt), false) v),
  l as (select count(*) total, count(*) filter (where e.reception = 'Reçu') fait from orga.elements e
        where e.evenement_id = p_evt and e.poste in (select cle from cles) and e.mode_ligne in ('louer', 'acheter', 'produire', 'rafistoler')),
  r as (select count(*) total, count(*) filter (where e.revenu is not null) fait from orga.elements e, passe
        where passe.v and e.evenement_id = p_evt and e.poste in (select cle from cles) and e.mode_ligne in ('prelever', 'louer')),
  a as (select count(*) total, count(*) filter (where x.statut = 'Fait') fait from orga.actions x
        where x.evenement_id = p_evt and x.poste in (select cle from cles))
  select jsonb_build_object('fait', l.fait + r.fait + a.fait, 'total', l.total + r.total + a.total) from l, r, a;
$$;
revoke execute on function orga._pret(text) from public, anon, authenticated;
