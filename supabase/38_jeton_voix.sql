-- Correction n°2 de l'audit : l'agent vocal reçoit un jeton d'appel, plus le jeton de session.
-- Jeton d'appel : valable 2 h, fermé 10 min après le raccrochage (le temps du chiffrage en arrière-plan),
-- accepté seulement par les opérations de l'agent vocal ; partout ailleurs, la base le refuse.
alter table orga.sessions add column if not exists portee text not null default 'complet';

-- Le contrôle habituel refuse désormais les jetons d'appel
create or replace function orga._qui(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select s.nom into v from orga.sessions s where s.token = p_token and s.expire_le > now() and s.portee = 'complet';
  if v is null then raise exception 'session_expiree'; end if;
  return v;
end $$;

-- Contrôle des opérations ouvertes à l'agent vocal : session complète ou jeton d'appel
create or replace function orga._qui_voix(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select s.nom into v from orga.sessions s where s.token = p_token and s.expire_le > now() and s.portee in ('complet', 'voix');
  if v is null then raise exception 'session_expiree'; end if;
  return v;
end $$;
revoke execute on function orga._qui_voix(uuid) from anon, authenticated, public;

create or replace function orga.session_voix(p_token uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); t uuid;
begin
  delete from orga.sessions where portee = 'voix' and expire_le < now();
  insert into orga.sessions (nom, expire_le, portee) values (me, now() + interval '2 hours', 'voix') returning token into t;
  return t;
end $$;

create or replace function orga.session_voix_fin(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update orga.sessions set expire_le = least(expire_le, now() + interval '10 minutes') where token = p_token and portee = 'voix';
  return found;
end $$;
grant execute on function orga.session_voix(uuid), orga.session_voix_fin(uuid) to anon, authenticated;

-- Les 7 opérations utilisées par l'agent vocal (directement ou via le copilote et Zoho) acceptent le jeton d'appel
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'orga' and p.proname in ('voix_contexte', 'donnees', 'evenement_creer', 'evenement_maj',
                                                      'chiffrage_contexte', 'catalogue_liste', 'chiffrage_enregistrer') loop
    def := pg_get_functiondef(f.oid);
    if def !~ 'orga\._qui\(p_token\)' then raise exception 'contrôle introuvable dans %', f.oid::regprocedure; end if;
    execute replace(def, 'orga._qui(p_token)', 'orga._qui_voix(p_token)');
  end loop;
end $$;
