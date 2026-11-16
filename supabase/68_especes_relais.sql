-- 68 · Espèces de l'événement : un virement à un fournisseur relais, qui garde sa commission et rend le reste en espèces.
--   Réglages (orga.parametres 'especes') : catégories payées en espèces par défaut, fournisseurs relais et leur taux, responsable (Amina Hadni).
--   Commission = taux × espèces rendues ; virement = espèces + commission ; la commission entre au chiffrage (ligne « Frais d'espèces »).
--   Circuit : Salmane lance → Amina choisit le fournisseur → Salmane valide → Amina saisit ce qu'elle a reçu (écart signalé) → elle remet à chacun, qui confirme.
--   Les espèces reçues entrent dans l'enveloppe d'Amina (mouvements_esp « remise ») ; chaque remise = transfert, compté chez le destinataire quand il confirme.
--   Un bon d'espèces dit qui paie : l'enveloppe de l'événement (comme avant) ou la caisse de la société (rien n'est retiré de l'enveloppe).

insert into orga.parametres (cle, valeur) values ('especes', jsonb_build_object(
  'categories', jsonb_build_array('staff', 'commissions', 'repas_transport', 'petits_achats'),
  'fournisseurs', jsonb_build_array(), 'taux', 5, 'responsable', 'Amina Hadni'))
on conflict (cle) do nothing;

create table if not exists orga.especes_relais (
  id bigserial primary key,
  evenement_id text not null,
  statut text not null default 'a_preparer',     -- a_preparer | a_valider | valide | refuse | recu | termine
  lignes jsonb not null default '[]',            -- [{cat, nom, montant, dest}]
  besoin numeric not null, taux numeric not null, commission numeric not null, virement numeric not null,
  fournisseur text, responsable text not null,
  demande_par text, demande_le timestamptz not null default now(),
  prepare_le timestamptz, valide_par text, valide_le timestamptz, raison text,
  recu numeric, recu_le timestamptz, ecart numeric, ecart_regle boolean not null default false
);
alter table orga.especes_relais enable row level security;
alter table orga.mouvements_esp add column if not exists relais_id bigint;
alter table orga.bons add column if not exists paye_par text;
alter table orga.evenements add column if not exists especes jsonb;   -- catégories propres à l'événement (sinon celles des réglages)

-- Une alerte (famille enveloppes) si la personne la reçoit
create or replace function orga._alerter(p_cle text, p_dest text, p_titre text, p_corps text, p_url text, p_tag text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not orga._dest_ok(p_dest) or not coalesce((orga._notifs_cfg() #>> '{familles,enveloppes}')::boolean, true) then return; end if;
  insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag) values (p_cle, p_dest, 'enveloppes', orga._court(p_titre, 28), p_corps, p_url, p_tag)
  on conflict (cle) do nothing;
end $$;

-- Ce qu'il faut en espèces pour un événement, catégorie par catégorie (proposé ; Salmane ajuste avant de lancer)
create or replace function orga._especes_besoin(p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare cfg jsonb := (select valeur from orga.parametres where cle = 'especes'); ev orga.evenements; l jsonb; cats jsonb; out jsonb := '[]';
  staff numeric; frais numeric; petits numeric; com numeric; resp_staff text; resp_cuisine text; p jsonb := orga._postes_evt(p_evt);
begin
  select * into ev from orga.evenements where id = p_evt;
  l := coalesce((select lignes from orga.chiffrages where evenement_id = p_evt), '[]');
  cats := coalesce(ev.especes #> '{categories}', cfg->'categories');
  staff := (select coalesce(sum((x->>'quantite')::numeric * (x->>'prix')::numeric), 0) from jsonb_array_elements(l) x where x->>'groupe' = 'staff');
  frais := (select coalesce(sum((x->>'quantite')::numeric * (x->>'prix')::numeric), 0) from jsonb_array_elements(l) x where x->>'groupe' in ('frais_staff', 'transport_personnel'));
  petits := (select coalesce(sum((x->>'quantite')::numeric * (x->>'prix')::numeric), 0) from jsonb_array_elements(l) x where x->>'param' = 'd_petits_achats');
  com := round(coalesce(ev.prix_signe, 0) * (case when coalesce(ev.intermediaire, '') <> '' then coalesce(orga._param('g_apporteur'), 5) else 0 end + coalesce(orga._param('g_operateurs'), 5)) / 100);
  resp_staff := (select x->>'resp' from jsonb_array_elements(p) x where x->>'cle' = 'staff');
  resp_cuisine := (select x->>'resp' from jsonb_array_elements(p) x where x->>'type' = 'matiere' limit 1);
  if cats ? 'staff' then out := out || jsonb_build_object('cat', 'staff', 'nom', 'Staff (extras)', 'montant', round(staff), 'dest', resp_staff); end if;
  if cats ? 'commissions' then out := out || jsonb_build_object('cat', 'commissions', 'nom', 'Commissions', 'montant', com, 'dest', 'Salmane',
    'note', concat_ws(', ', case when coalesce(ev.intermediaire, '') <> '' then 'apporteur ' || orga._param('g_apporteur') || ' %' end, 'opérateurs ' || orga._param('g_operateurs') || ' %')); end if;
  if cats ? 'repas_transport' then out := out || jsonb_build_object('cat', 'repas_transport', 'nom', 'Repas et transport du staff', 'montant', round(frais), 'dest', resp_staff); end if;
  if cats ? 'petits_achats' then out := out || jsonb_build_object('cat', 'petits_achats', 'nom', 'Petits achats', 'montant', round(petits), 'dest', resp_cuisine); end if;
  return out;
end $$;
-- Écran « Espèces » d'un événement (direction ; Amina aussi pour le suivi)
create or replace function orga.especes_evt(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); cfg jsonb := (select valeur from orga.parametres where cle = 'especes');
begin
  if orga._role(me) = 'equipe' and me is distinct from orga._membre_de(cfg->>'responsable') then raise exception 'reserve_direction'; end if;
  return jsonb_build_object('reglages', cfg, 'proposition', orga._especes_besoin(p_evt),
    'relais', (select coalesce(jsonb_agg(to_jsonb(r) || jsonb_build_object('remises', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'dest', m.titulaire, 'montant', m.montant, 'statut', m.statut, 'le', m.confirme_le) order by m.id), '[]')
        from orga.mouvements_esp m where m.relais_id = r.id and m.type = 'transfert_in')) order by r.id desc), '[]') from orga.especes_relais r where r.evenement_id = p_evt),
    'evenement', (select jsonb_build_object('id', e.id, 'nom', e.nom, 'code', e.code, 'entite', e.entite) from orga.evenements e where e.id = p_evt),
    'membres', (select coalesce(jsonb_agg(nom order by nom), '[]') from orga.membres),
    'peut_valider', orga._role(me) <> 'equipe');
end $$;

-- 1. Salmane lance (montants ajustés) : la tâche part chez Amina
create or replace function orga.especes_lancer(p_token uuid, p_evt text, p_lignes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); cfg jsonb := (select valeur from orga.parametres where cle = 'especes'); b numeric; t numeric; rid bigint; resp text; ev orga.evenements;
begin
  b := (select coalesce(sum((x->>'montant')::numeric), 0) from jsonb_array_elements(coalesce(p_lignes, '[]')) x);
  if b <= 0 then raise exception 'montant_invalide'; end if;
  if exists (select 1 from orga.especes_relais where evenement_id = p_evt and statut in ('a_preparer', 'a_valider', 'valide')) then raise exception 'deja_en_cours'; end if;
  t := coalesce((cfg->>'taux')::numeric, 5); resp := coalesce(orga._membre_de(cfg->>'responsable'), cfg->>'responsable');
  insert into orga.especes_relais (evenement_id, lignes, besoin, taux, commission, virement, responsable, demande_par)
  values (p_evt, p_lignes, b, t, round(b * t / 100), b + round(b * t / 100), resp, me) returning id into rid;
  select * into ev from orga.evenements where id = p_evt;
  perform orga._alerter('ES|' || rid || '|' || resp, resp, 'Virement espèces à préparer', concat_ws(' · ', ev.code, orga._mt(b) || ' en espèces à récupérer') || E'\nTouche : préparer', '/#/especes-relais/' || rid, 'R' || rid);
  return orga.especes_evt(p_token, p_evt);
end $$;

-- 2. Amina choisit le fournisseur (son taux) : Salmane doit valider
create or replace function orga.especes_preparer(p_token uuid, p_id bigint, p_fournisseur text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r orga.especes_relais; cfg jsonb := (select valeur from orga.parametres where cle = 'especes'); t numeric; ev orga.evenements;
begin
  select * into r from orga.especes_relais where id = p_id for update;
  if r.id is null then raise exception 'introuvable'; end if;
  if me is distinct from r.responsable and orga._role(me) = 'equipe' then raise exception 'reserve_direction'; end if;
  if r.statut not in ('a_preparer', 'refuse') then raise exception 'deja_traitee'; end if;
  t := coalesce((select (f->>'taux')::numeric from jsonb_array_elements(cfg->'fournisseurs') f where f->>'nom' = p_fournisseur), (cfg->>'taux')::numeric, 5);
  update orga.especes_relais set fournisseur = nullif(trim(p_fournisseur), ''), taux = t, commission = round(besoin * t / 100), virement = besoin + round(besoin * t / 100),
    statut = 'a_valider', prepare_le = now(), raison = null where id = p_id returning * into r;
  if r.fournisseur is null then raise exception 'manque_obligatoire'; end if;
  select * into ev from orga.evenements where id = r.evenement_id;
  perform orga._alerter('EV|' || p_id || '|' || r.demande_par || '|' || extract(epoch from now())::bigint, coalesce(r.demande_par, 'Salmane'), 'Virement à valider',
    concat_ws(' · ', ev.code, orga._mt(r.virement) || ' à ' || r.fournisseur || ' (' || trim_scale(t) || ' %)') || E'\nTouche : valider ou refuser', '/#/especes-evt/' || r.evenement_id, 'R' || p_id);
  return orga.especes_evt(p_token, r.evenement_id);
end $$;

-- 3. Salmane valide (la commission entre au chiffrage) ou refuse (retour chez Amina)
create or replace function orga.especes_valider(p_token uuid, p_id bigint, p_ok boolean, p_raison text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); r orga.especes_relais; ev orga.evenements; l jsonb;
begin
  select * into r from orga.especes_relais where id = p_id for update;
  if r.statut <> 'a_valider' then raise exception 'deja_traitee'; end if;
  select * into ev from orga.evenements where id = r.evenement_id;
  if not p_ok then
    update orga.especes_relais set statut = 'refuse', raison = nullif(trim(p_raison), '') where id = p_id;
    perform orga._alerter('EX|' || p_id || '|' || extract(epoch from now())::bigint, r.responsable, 'Virement refusé', concat_ws(' · ', ev.code, nullif(trim(p_raison), '')) || E'\nTouche : revoir', '/#/especes-relais/' || p_id, 'R' || p_id);
    return orga.especes_evt(p_token, r.evenement_id);
  end if;
  update orga.especes_relais set statut = 'valide', valide_par = me, valide_le = now() where id = p_id;
  -- « Frais d'espèces » dans le chiffrage : une ligne par virement, notée au journal
  l := coalesce((select lignes from orga.chiffrages where evenement_id = r.evenement_id), '[]');
  l := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(l) x where x->>'uid' is distinct from 'especes_' || p_id)
       || jsonb_build_object('uid', 'especes_' || p_id, 'zone', 'Lieu technique et admin', 'element', 'Frais d''espèces · ' || r.fournisseur, 'mode', 'achat', 'quantite', 1, 'prix', r.commission,
                             'note', trim_scale(r.taux) || ' % de ' || orga._mt(r.besoin), 'verrou', true);
  insert into orga.chiffrages (evenement_id, lignes, maj_par) values (r.evenement_id, l, me)
  on conflict (evenement_id) do update set lignes = excluded.lignes, maj_le = now(), maj_par = me;
  insert into orga.chiffrage_journal (evenement_id, qui, source, titre, detail)
  values (r.evenement_id, me, 'especes', 'Frais d''espèces : ' || orga._mt(r.commission), trim_scale(r.taux) || ' % de ' || orga._mt(r.besoin) || ' · ' || r.fournisseur);
  perform orga._alerter('EO|' || p_id, r.responsable, 'Virement validé', concat_ws(' · ', ev.code, orga._mt(r.virement) || ' à ' || r.fournisseur) || E'\nTouche : saisir les espèces reçues', '/#/especes-relais/' || p_id, 'R' || p_id);
  return orga.especes_evt(p_token, r.evenement_id);
end $$;

-- 4. Amina saisit ce qu'elle a reçu : entre dans son enveloppe ; un écart prévient Salmane
create or replace function orga.especes_recu(p_token uuid, p_id bigint, p_montant numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r orga.especes_relais; ev orga.evenements;
begin
  select * into r from orga.especes_relais where id = p_id for update;
  if me is distinct from r.responsable and orga._role(me) = 'equipe' then raise exception 'reserve_direction'; end if;
  if r.statut <> 'valide' then raise exception 'deja_traitee'; end if;
  if coalesce(p_montant, 0) <= 0 then raise exception 'montant_invalide'; end if;
  update orga.especes_relais set statut = 'recu', recu = p_montant, recu_le = now(), ecart = r.besoin - p_montant, ecart_regle = (r.besoin - p_montant) <= 0 where id = p_id;
  insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, par, relais_id, confirme_le, confirme_par)
  values (r.evenement_id, r.responsable, 'remise', p_montant, 'ok', 'Espèces rendues par ' || r.fournisseur, me, p_id, now(), me);
  select * into ev from orga.evenements where id = r.evenement_id;
  if r.besoin - p_montant > 0 then
    perform orga._alerter('EC|' || p_id, coalesce(r.demande_par, 'Salmane'), 'Espèces : il manque ' || orga._mt(r.besoin - p_montant),
      concat_ws(' · ', ev.code, r.fournisseur, orga._mt(p_montant) || ' reçus sur ' || orga._mt(r.besoin)) || E'\nTouche : voir', '/#/especes-evt/' || r.evenement_id, 'R' || p_id);
  end if;
  return orga.especes_evt(p_token, r.evenement_id);
end $$;

-- 5. Amina remet une part : transfert chez elle, à confirmer par le destinataire
create or replace function orga.especes_remettre(p_token uuid, p_id bigint, p_dest text, p_montant numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r orga.especes_relais; ev orga.evenements; mid bigint; d text := coalesce(orga._membre_de(p_dest), trim(p_dest));
begin
  select * into r from orga.especes_relais where id = p_id;
  if me is distinct from r.responsable and orga._role(me) = 'equipe' then raise exception 'reserve_direction'; end if;
  if r.statut not in ('recu', 'termine') then raise exception 'deja_traitee'; end if;
  if coalesce(p_montant, 0) <= 0 or coalesce(d, '') = '' then raise exception 'montant_invalide'; end if;
  if p_montant > orga._reste(r.evenement_id, r.responsable) then raise exception 'depasse_encaisse: il ne reste que % MAD', round(orga._reste(r.evenement_id, r.responsable)); end if;
  insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, par, relais_id) values (r.evenement_id, r.responsable, 'transfert_out', p_montant, 'ok', 'Remis à ' || d, me, p_id);
  insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, par, relais_id) values (r.evenement_id, d, 'transfert_in', p_montant, 'a_confirmer', 'Remis par ' || r.responsable, me, p_id) returning id into mid;
  select * into ev from orga.evenements where id = r.evenement_id;
  perform orga._alerter('TR|' || mid, d, 'Espèces pour toi : ' || orga._mt(p_montant), concat_ws(' · ', ev.code, 'remis par ' || r.responsable) || E'\nTouche : confirmer', '/#/mapart', 'T' || mid);
  if orga._reste(r.evenement_id, r.responsable) <= 0 then update orga.especes_relais set statut = 'termine' where id = p_id; end if;
  return orga.especes_evt(p_token, r.evenement_id);
end $$;

-- Le destinataire confirme (ou non) avoir reçu
create or replace function orga.especes_confirmer(p_token uuid, p_mvt bigint, p_ok boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); m orga.mouvements_esp;
begin
  select * into m from orga.mouvements_esp where id = p_mvt for update;
  if m.id is null or m.type <> 'transfert_in' or m.titulaire is distinct from me then raise exception 'introuvable'; end if;
  if m.statut <> 'a_confirmer' then return true; end if;
  update orga.mouvements_esp set statut = case when p_ok then 'ok' else 'refuse' end, confirme_le = now(), confirme_par = me where id = p_mvt;
  if not p_ok then
    update orga.mouvements_esp set statut = 'refuse' where relais_id = m.relais_id and type = 'transfert_out' and montant = m.montant and statut = 'ok'
      and id = (select max(id) from orga.mouvements_esp where relais_id = m.relais_id and type = 'transfert_out' and montant = m.montant and id < p_mvt);
    perform orga._alerter('TN|' || p_mvt, (select responsable from orga.especes_relais where id = m.relais_id), 'Remise pas reçue : ' || orga._mt(m.montant),
      me || E' dit ne pas avoir reçu\nTouche : voir', '/#/especes-relais/' || m.relais_id, 'T' || p_mvt);
  end if;
  return true;
end $$;

-- Ce qui m'attend (Ma part) : tâches d'Amina et remises à confirmer
create or replace function orga.mes_especes(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return jsonb_build_object(
    'taches', (select coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'statut', r.statut, 'besoin', r.besoin, 'virement', r.virement, 'evt', e.nom, 'code', e.code) order by r.id desc), '[]')
      from orga.especes_relais r join orga.evenements e on e.id = r.evenement_id where r.responsable = me and r.statut in ('a_preparer', 'refuse', 'valide', 'recu')),
    'a_confirmer', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'montant', m.montant, 'par', replace(m.motif, 'Remis par ', ''), 'evt', e.nom, 'code', e.code) order by m.id), '[]')
      from orga.mouvements_esp m join orga.evenements e on e.id = m.evenement_id where m.titulaire = me and m.type = 'transfert_in' and m.statut = 'a_confirmer'));
end $$;

-- Une tâche d'Amina (écran de la tâche)
create or replace function orga.especes_relais_voir(p_token uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r orga.especes_relais;
begin
  select * into r from orga.especes_relais where id = p_id;
  if r.id is null then raise exception 'introuvable'; end if;
  if me is distinct from r.responsable and orga._role(me) = 'equipe' then raise exception 'reserve_direction'; end if;
  return to_jsonb(r) || jsonb_build_object('reste', orga._reste(r.evenement_id, r.responsable),
    'evenement', (select jsonb_build_object('id', e.id, 'nom', e.nom, 'code', e.code, 'entite', e.entite) from orga.evenements e where e.id = r.evenement_id),
    'fournisseurs', (select valeur->'fournisseurs' from orga.parametres where cle = 'especes'),
    'remises', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'dest', m.titulaire, 'montant', m.montant, 'statut', m.statut) order by m.id), '[]')
      from orga.mouvements_esp m where m.relais_id = r.id and m.type = 'transfert_in'),
    'membres', (select coalesce(jsonb_agg(nom order by nom), '[]') from orga.membres));
end $$;

-- Réglages espèces (Paramètres ; Salmane seul change)
create or replace function orga.especes_reglages(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  if p is not null then
    if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
    update orga.parametres set valeur = valeur || (p - array['secret']) where cle = 'especes';
  end if;
  return jsonb_build_object('reglages', (select valeur from orga.parametres where cle = 'especes'), 'peut_modifier', orga._chiffrage_editeur(me),
    'membres', (select coalesce(jsonb_agg(nom order by nom), '[]') from orga.membres));
end $$;

-- Bon d'espèces : payé par l'enveloppe de l'événement (comme avant) ou par la caisse de la société
do $$ declare d text := pg_get_functiondef('orga.bon_creer(uuid,jsonb)'::regprocedure); a text; begin
  if d ~ 'paye_par' then return; end if;
  a := $x$    if true then
      insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, piece_id, par)$x$;
  if position(a in d) = 0 then raise exception 'bon_creer a changé'; end if;
  d := replace(d, a, $x$    if coalesce(p->>'paye_par', 'enveloppe') = 'enveloppe' then
      insert into orga.mouvements_esp (evenement_id, titulaire, type, montant, statut, motif, piece_id, par)$x$);
  a := $x$  return jsonb_build_object('id', bid,$x$;
  if position(a in d) = 0 then raise exception 'bon_creer a changé (fin)'; end if;
  d := replace(d, a, $x$  update orga.bons set paye_par = case when p->>'paye_par' = 'caisse' then 'caisse' else 'enveloppe' end where id = bid;
  return jsonb_build_object('id', bid,$x$);
  execute d;
end $$;

revoke all on function orga._alerter(text, text, text, text, text, text), orga._especes_besoin(text) from public, anon, authenticated;
grant execute on function orga.especes_evt(uuid, text), orga.especes_lancer(uuid, text, jsonb), orga.especes_preparer(uuid, bigint, text), orga.especes_valider(uuid, bigint, boolean, text),
  orga.especes_recu(uuid, bigint, numeric), orga.especes_remettre(uuid, bigint, text, numeric), orga.especes_confirmer(uuid, bigint, boolean), orga.mes_especes(uuid),
  orga.especes_relais_voir(uuid, bigint), orga.especes_reglages(uuid, jsonb) to anon, authenticated;

-- 68b · Salmane marque l'écart réglé (il reste visible jusque-là)
create or replace function orga.especes_ecart_regler(p_token uuid, p_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); r orga.especes_relais;
begin
  update orga.especes_relais set ecart_regle = true where id = p_id returning * into r;
  if r.id is null then raise exception 'introuvable'; end if;
  return orga.especes_evt(p_token, r.evenement_id);
end $$;
grant execute on function orga.especes_ecart_regler(uuid, bigint) to anon, authenticated;
