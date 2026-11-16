-- Photo d'un article : la fonction orga-photo vérifie le droit « gerer » ici, puis met à jour l'article
-- (migration orga_59_photos_articles)
create or replace function orga.depot_photo_ok(p_token uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'gerer');
begin
  if not exists (select 1 from public.articles a where a.id = p_id) then raise exception 'article_introuvable'; end if;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values ('article', p_id, 'photo', u, '{}');
  return true;
end $$;
grant execute on function orga.depot_photo_ok(uuid, uuid) to anon, authenticated;
grant update (photo_url, updated_at) on public.articles to service_role;
