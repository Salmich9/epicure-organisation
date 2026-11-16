-- Réglages du dépôt (droit « gerer ») : référentiels, articles (créer, modifier, archiver, remettre)
-- (migration orga_57_reglages_depot)
create or replace function orga.depot_reglages(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'gerer');
begin
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.name, 'n', (select count(*) from public.articles a where a.category_id = c.id and a.active)) order by c.sort_order, c.name) from public.categories c where c.active), '[]'),
    'unites', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.name, 'abr', x.abbreviation) order by x.name) from public.units x where x.active), '[]'),
    'fournisseurs', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.name, 'tel', f.phone, 'note', f.note) order by f.name) from public.suppliers f where f.active), '[]'),
    'motifs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nom', m.name, 'perte', m.perte_reelle) order by m.sort_order) from public.motifs_ecart m where m.active), '[]'),
    'archives', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.name, 'cat', c.name) order by a.name) from public.articles a left join public.categories c on c.id = a.category_id where not a.active), '[]'));
end $$;

create or replace function orga.depot_reglage_maj(p_token uuid, p_type text, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'gerer'); nom text := nullif(trim(p->>'nom'), ''); act boolean := (p->>'actif')::boolean; r uuid := p_id; i int := 0; x text;
begin
  if p_type = 'categorie' and p ? 'ordre' then
    for x in select jsonb_array_elements_text(p->'ordre') loop i := i + 1; update public.categories set sort_order = i * 10, updated_at = now() where id = x::uuid; end loop;
    return jsonb_build_object('ok', true);
  end if;
  if act is false then
    case p_type when 'categorie' then update public.categories set active = false, updated_at = now() where id = p_id;
      when 'unite' then update public.units set active = false, updated_at = now() where id = p_id;
      when 'fournisseur' then update public.suppliers set active = false, updated_at = now() where id = p_id;
      when 'motif' then update public.motifs_ecart set active = false, updated_at = now() where id = p_id;
      else raise exception 'type_inconnu'; end case;
    return jsonb_build_object('id', p_id);
  end if;
  if nom is null then raise exception 'manque_obligatoire'; end if;
  if p_type = 'categorie' then
    if p_id is null then insert into public.categories (name, sort_order, active) values (nom, coalesce((select max(sort_order) from public.categories), 0) + 10, true) returning id into r;
    else update public.categories set name = nom, updated_at = now() where id = p_id; end if;
  elsif p_type = 'unite' then
    if nullif(trim(p->>'abr'), '') is null then raise exception 'manque_obligatoire'; end if;
    if p_id is null then insert into public.units (name, abbreviation, active) values (nom, trim(p->>'abr'), true) returning id into r;
    else update public.units set name = nom, abbreviation = trim(p->>'abr'), updated_at = now() where id = p_id; end if;
  elsif p_type = 'fournisseur' then
    if p_id is null then insert into public.suppliers (name, phone, note, active) values (nom, nullif(trim(p->>'tel'), ''), nullif(trim(p->>'note'), ''), true) returning id into r;
    else update public.suppliers set name = nom, phone = nullif(trim(p->>'tel'), ''), note = nullif(trim(p->>'note'), ''), updated_at = now() where id = p_id; end if;
  elsif p_type = 'motif' then
    if p_id is null then insert into public.motifs_ecart (name, perte_reelle, sort_order, active) values (nom, coalesce((p->>'perte')::boolean, true), coalesce((select max(sort_order) from public.motifs_ecart where sort_order < 99), 0) + 10, true) returning id into r;
    else update public.motifs_ecart set name = nom, perte_reelle = coalesce((p->>'perte')::boolean, perte_reelle), updated_at = now() where id = p_id; end if;
  else raise exception 'type_inconnu'; end if;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values (p_type, r, case when p_id is null then 'cree' else 'modifie' end, u, p);
  return jsonb_build_object('id', r);
end $$;

create or replace function orga.depot_article_maj(p_token uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'gerer'); r uuid := p_id; nom text := nullif(trim(p->>'nom'), '');
begin
  if p ? 'actif' and not (p ? 'nom') then
    update public.articles set active = (p->>'actif')::boolean, updated_at = now() where id = p_id;
    if not found then raise exception 'article_introuvable'; end if;
  else
    if nom is null or nullif(p->>'cat_id', '') is null or nullif(p->>'unite_id', '') is null then raise exception 'manque_obligatoire'; end if;
    if p_id is null then
      if exists (select 1 from public.articles a where lower(a.name) = lower(nom) and a.active) then raise exception 'article_existe_deja'; end if;
      insert into public.articles (name, category_id, unit_id, type, low_stock_threshold, active)
      values (nom, (p->>'cat_id')::uuid, (p->>'unite_id')::uuid, coalesce(nullif(p->>'nature', ''), 'consommable'), nullif(p->>'seuil', '')::numeric, true) returning id into r;
    else
      update public.articles set name = nom, category_id = (p->>'cat_id')::uuid, unit_id = (p->>'unite_id')::uuid,
        type = coalesce(nullif(p->>'nature', ''), type), low_stock_threshold = nullif(p->>'seuil', '')::numeric, updated_at = now() where id = p_id;
      if not found then raise exception 'article_introuvable'; end if;
    end if;
  end if;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values ('article', r, case when p_id is null then 'cree' else 'modifie' end, u, p);
  return jsonb_build_object('id', r);
end $$;
grant execute on function orga.depot_reglages(uuid), orga.depot_reglage_maj(uuid, text, uuid, jsonb), orga.depot_article_maj(uuid, uuid, jsonb) to anon, authenticated;

-- Le stock donne aussi l'unité (pour modifier un article)
do $$
declare def text := pg_get_functiondef('orga.depot_stock(uuid)'::regprocedure);
begin
  if def !~ 'unite_id' then
    def := replace(def, '''unite'', v.unite,', '''unite'', v.unite, ''unite_id'', (select a.unit_id from public.articles a where a.id = v.article_id),');
    if def !~ 'unite_id' then raise exception 'remplacement raté'; end if;
    execute def;
  end if;
end $$;
