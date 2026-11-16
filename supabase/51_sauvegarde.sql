-- 16/11 : sauvegarde avant la fusion du dépôt dans l'appli Événements.
-- 1) Copie complète dans la base : schéma sauvegarde_20261116 (55 tables + liste des 314 photos), fermé au public.
-- 2) Copie Drive sans codes, jetons, secrets, CIN ni téléphones du staff : fonction orga-sauvegarde → « Sauvegardes appli ».
create or replace function orga._tables_sauvegarde() returns table (s text, t text)
language sql stable security definer set search_path = '' as $$
  select n.nspname::text, c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'orga') and c.relkind = 'r' order by 1, 2
$$;
revoke execute on function orga._tables_sauvegarde() from public, anon, authenticated;
grant execute on function orga._tables_sauvegarde() to service_role;
grant usage on schema public, orga to service_role;
grant select on all tables in schema public, orga to service_role;
