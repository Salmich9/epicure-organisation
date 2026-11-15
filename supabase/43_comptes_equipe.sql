-- Comptes de l'équipe : rôle « direction » (tout) ou « equipe » (ses actions et ses enveloppes,
-- jamais le prix de vente, la marge ni les encaissements ; seulement les événements confirmés où il a quelque chose).
-- Le filtrage se fait ici, dans la base : l'écran ne reçoit jamais ce qu'il ne doit pas montrer.

alter table orga.membres add column if not exists role text not null default 'direction';
alter table orga.membres drop constraint if exists membres_role_ck;
alter table orga.membres add constraint membres_role_ck check (role in ('direction', 'equipe'));

create or replace function orga._role(p_nom text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.role from orga.membres m where m.nom = p_nom), 'direction');
$$;
revoke execute on function orga._role(text) from public, anon, authenticated;

create or replace function orga._qui_direction(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := orga._qui(p_token);
begin
  if orga._role(v) = 'equipe' then raise exception 'reserve_direction'; end if;
  return v;
end $$;
create or replace function orga._qui_voix_direction(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := orga._qui_voix(p_token);
begin
  if orga._role(v) = 'equipe' then raise exception 'reserve_direction'; end if;
  return v;
end $$;
revoke execute on function orga._qui_direction(uuid), orga._qui_voix_direction(uuid) from public, anon, authenticated;

-- Les événements qu'un compte Équipe voit : confirmés, et où il tient une enveloppe, une action ou une ligne
create or replace function orga._evts_equipe(p_nom text) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(e.id order by e.date nulls last, e.id), '{}') from orga.evenements e
  where e.statut in ('Confirmé', 'En préparation')
    and (exists (select 1 from orga.postes p where p.evenement_id = e.id and p.resp = p_nom and not p.retire)
      or exists (select 1 from orga.actions a where a.evenement_id = e.id and a.resp = p_nom)
      or exists (select 1 from orga.elements x where x.evenement_id = e.id and x.resp = p_nom));
$$;
revoke execute on function orga._evts_equipe(text) from public, anon, authenticated;

-- Ce qu'un compte Équipe ne reçoit jamais sur un événement
create or replace function orga._evt_equipe(e jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select e - array['prix', 'prix_signe', 'coef', 'budget', 'budget_zones', 'zoho_devis', 'bilan', 'intermediaire', 'imprevus_pct', 'presentation', 'tiers', 'encaisse', 'chiffre']
$$;
revoke execute on function orga._evt_equipe(jsonb) from public, anon, authenticated;

-- Fonctions réservées à la direction (argent client, chiffrage, staff, réglages, corbeille de tout le monde)
do $$
declare f text; def text;
begin
  foreach f in array array['bilan_liste', 'bilan_maj', 'budget_retenir', 'cadrage_appliquer', 'cadrage_maj', 'encaissement_ajouter', 'encaissement_supprimer',
    'enveloppe_remettre', 'equipe_maj', 'especes_liste', 'evenement_cloturer', 'evenement_confirmer', 'evenement_statut', 'lecon_annuler', 'lecon_decider',
    'lecons_enregistrer', 'piece_imputer', 'piece_suggestions', 'porteur_ajouter', 'poste_creer', 'poste_maj', 'staff_affecter', 'staff_evt_liste',
    'staff_fiche', 'staff_liste', 'staff_maj', 'staff_noter', 'corbeille_liste', 'session_voix'] loop
    for def in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'orga' and p.proname = f loop
      if def ~ 'orga\._qui\(' then execute replace(def, 'orga._qui(', 'orga._qui_direction('); end if;
    end loop;
  end loop;
  foreach f in array array['chiffrage_contexte', 'chiffrage_enregistrer', 'evenement_creer', 'evenement_maj', 'voix_contexte'] loop
    for def in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'orga' and p.proname = f loop
      if def ~ 'orga\._qui_voix\(' then execute replace(def, 'orga._qui_voix(', 'orga._qui_voix_direction('); end if;
    end loop;
  end loop;
  -- Retirer une enveloppe : direction seulement
  def := pg_get_functiondef('orga.objet_supprimer'::regproc);
  if def !~ 'reserve_direction' then
    execute replace(def, '  elsif p_type = ''poste'' then', '  elsif p_type = ''poste'' then
    if orga._role(me) = ''equipe'' then raise exception ''reserve_direction''; end if;');
  end if;
end $$;

-- Les trois lectures principales passent par un filtre selon le rôle
do $$
begin
  if to_regprocedure('orga._donnees_brut(uuid, text)') is null then alter function orga.donnees(uuid, text) rename to _donnees_brut; end if;
  if to_regprocedure('orga._accueil_brut(uuid)') is null then alter function orga.accueil(uuid) rename to _accueil_brut; end if;
  if to_regprocedure('orga._aujourdhui_brut(uuid)') is null then alter function orga.aujourdhui(uuid) rename to _aujourdhui_brut; end if;
end $$;
revoke execute on function orga._donnees_brut(uuid, text), orga._accueil_brut(uuid), orga._aujourdhui_brut(uuid) from public, anon, authenticated;

create or replace function orga.donnees(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix(p_token); r text := orga._role(me); ok text[]; ev text := p_evt; d jsonb; miens text[];
begin
  if r <> 'equipe' then
    return orga._donnees_brut(p_token, p_evt) || jsonb_build_object('role', r, 'admin', coalesce((select m.admin from orga.membres m where m.nom = me), false));
  end if;
  ok := orga._evts_equipe(me);
  if ev is null or not (ev = any(ok)) then ev := ok[1]; end if;
  d := orga._donnees_brut(p_token, ev);
  d := d || jsonb_build_object('role', 'equipe', 'admin', false,
    'evenements', coalesce((select jsonb_agg(orga._evt_equipe(x)) from jsonb_array_elements(d->'evenements') x where x->>'id' = any(ok)), '[]'),
    'factures', '[]'::jsonb, 'pieces', '[]'::jsonb);
  if ev is null then
    return d || jsonb_build_object('evt', null, 'elements', '[]'::jsonb, 'actions', '[]'::jsonb, 'postes', '[]'::jsonb);
  end if;
  -- Les montants des enveloppes des autres disparaissent, avec les prix de leurs lignes et le coût de leurs actions
  select coalesce(array_agg(x->>'cle'), '{}') into miens from jsonb_array_elements(d->'postes') x where x->>'resp' = me;
  return d || jsonb_build_object(
    'postes', coalesce((select jsonb_agg(case when x->>'resp' = me then x else x || '{"prevu":null,"engage":null,"reel":null,"montant":null,"prix_couvert":null}'::jsonb end) from jsonb_array_elements(d->'postes') x), '[]'),
    'elements', coalesce((select jsonb_agg(case when coalesce(x->>'poste', '') = any(miens) or x->>'resp' = me then x
                                                else x || '{"prix_achat":null,"prix_location":null,"prix_production":null,"cout":null,"facture":null}'::jsonb end) from jsonb_array_elements(d->'elements') x), '[]'),
    'actions', coalesce((select jsonb_agg(case when coalesce(x->>'poste', '') = any(miens) or x->>'resp' = me then x else x || '{"cout":null}'::jsonb end) from jsonb_array_elements(d->'actions') x), '[]'));
end $$;

create or replace function orga.accueil(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r text := orga._role(me); d jsonb := orga._accueil_brut(p_token); ok text[];
begin
  if r <> 'equipe' then return d || jsonb_build_object('role', r, 'admin', coalesce((select m.admin from orga.membres m where m.nom = me), false)); end if;
  ok := orga._evts_equipe(me);
  return d || jsonb_build_object('role', 'equipe', 'admin', false,
    'evenements', coalesce((select jsonb_agg(orga._evt_equipe(x)) from jsonb_array_elements(d->'evenements') x where x->>'id' = any(ok)), '[]'));
end $$;

create or replace function orga.aujourdhui(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); r text := orga._role(me); d jsonb := orga._aujourdhui_brut(p_token); ok text[];
begin
  if r <> 'equipe' then return d || jsonb_build_object('role', r); end if;
  ok := orga._evts_equipe(me);
  return d || jsonb_build_object('role', 'equipe',
    'actions', coalesce((select jsonb_agg(case when x->>'resp' = me or exists (select 1 from orga.postes p where p.evenement_id = x->>'evenement_id' and p.cle = x->>'poste' and p.resp = me)
                                              then x else x || '{"cout":null}'::jsonb end)
                         from jsonb_array_elements(d->'actions') x where x->>'evenement_id' = any(ok)), '[]'),
    'evenements', coalesce((select jsonb_agg(orga._evt_equipe(x)) from jsonb_array_elements(coalesce(d->'evenements', '[]')) x where x->>'id' = any(ok)), '[]'));
end $$;

-- Gestion des comptes (administrateurs)
create or replace function orga._qui_admin(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text := orga._qui(p_token);
begin
  if not coalesce((select m.admin from orga.membres m where m.nom = v), false) then raise exception 'reserve_admin'; end if;
  return v;
end $$;
revoke execute on function orga._qui_admin(uuid) from public, anon, authenticated;

create or replace function orga._code6() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
$$;
revoke execute on function orga._code6() from public, anon, authenticated;

create or replace function orga.comptes_liste(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('nom', m.nom, 'role', m.role, 'admin', m.admin,
    'vu_le', (select max(s.cree_le) from orga.sessions s where s.nom = m.nom)) order by m.admin desc, m.nom) from orga.membres m where m.nom not like 'ZZ%'), '[]');
end $$;

create or replace function orga.compte_creer(p_token uuid, p_nom text, p_role text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token); n text := initcap(trim(coalesce(p_nom, ''))); c text := orga._code6();
begin
  if n = '' then raise exception 'manque_obligatoire'; end if;
  if exists (select 1 from orga.membres m where lower(m.nom) = lower(n)) then raise exception 'nom_pris'; end if;
  insert into orga.membres (nom, pin_hash, admin, role) values (n, extensions.crypt(c, extensions.gen_salt('bf')), false, case when p_role = 'direction' then 'direction' else 'equipe' end);
  return jsonb_build_object('nom', n, 'pin', c);
end $$;

create or replace function orga.compte_maj(p_token uuid, p_nom text, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token);
begin
  if p ? 'role' then
    if (select m.admin from orga.membres m where m.nom = p_nom) then raise exception 'reserve_admin'; end if;
    update orga.membres set role = case when p->>'role' = 'direction' then 'direction' else 'equipe' end where nom = p_nom;
  end if;
  return found;
end $$;

create or replace function orga.compte_nouveau_code(p_token uuid, p_nom text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token); c text := orga._code6();
begin
  update orga.membres set pin_hash = extensions.crypt(c, extensions.gen_salt('bf')) where nom = p_nom;
  if not found then raise exception 'introuvable'; end if;
  delete from orga.sessions where nom = p_nom;
  delete from orga.connexion_essais where nom = lower(p_nom);
  return jsonb_build_object('nom', p_nom, 'pin', c);
end $$;

create or replace function orga.compte_retirer(p_token uuid, p_nom text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token);
begin
  if coalesce((select m.admin from orga.membres m where m.nom = p_nom), true) then raise exception 'reserve_admin'; end if;
  delete from orga.sessions where nom = p_nom;
  delete from orga.membres where nom = p_nom;
  return true;
end $$;

grant execute on function orga.donnees(uuid, text), orga.accueil(uuid), orga.aujourdhui(uuid), orga.comptes_liste(uuid), orga.compte_creer(uuid, text, text),
  orga.compte_maj(uuid, text, jsonb), orga.compte_nouveau_code(uuid, text), orga.compte_retirer(uuid, text) to anon, authenticated;
