-- Bascule : l'ancienne appli du dépôt passe en lecture seule. Toute écriture arrivant avec les clés de l'appli (anon / authenticated)
-- est refusée, sauf celles de la nouvelle appli, qui se signalent (epicure.depuis_orga = on, posé par orga._depot_comme et orga._depot_user).
-- Le serveur (service_role, tâches planifiées, SQL direct) reste libre. Lecture et connexion inchangées.
-- (migration orga_60_ancienne_appli_lecture_seule)
create or replace function public._lecture_seule() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '') in ('anon', 'authenticated')
     and coalesce(current_setting('epicure.depuis_orga', true), 'off') <> 'on' then
    raise exception 'L''ancienne appli est en lecture seule : saisis dans l''appli Epicure (onglet Dépôt).' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['articles','categories','units','suppliers','motifs_ecart','stock_movements','purchases','inventories','inventory_lines','events','event_responsibles','ecarts_motifs','app_settings'] loop
    execute format('drop trigger if exists lecture_seule on public.%I; create trigger lecture_seule before insert or update or delete on public.%I for each row execute function public._lecture_seule()', t, t);
  end loop; end $$;
-- et en tête de orga._depot_comme et orga._depot_user : perform set_config('epicure.depuis_orga', 'on', true);
