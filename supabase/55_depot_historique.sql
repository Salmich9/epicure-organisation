-- Historique du dépôt : tous les mouvements, filtrables par type et par mot (article, fournisseur, événement)
-- (migration orga_55_depot_historique)
create or replace function orga.depot_historique(p_token uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'voir');
  t text := nullif(p->>'type', ''); q text := nullif(trim(p->>'q'), ''); lim int := least(greatest(coalesce((p->>'limite')::int, 80), 1), 200);
begin
  return jsonb_build_object('lignes', coalesce((select jsonb_agg(x order by x->>'quand' desc) from (
    select jsonb_build_object('id', s.id, 'type', s.type, 'qte', s.quantity, 'quand', s.created_at, 'article', a.name, 'article_id', a.id,
      'qui', btrim(us.full_name), 'evt', ev.name, 'fournisseur', f.name, 'note', s.note) x
    from public.stock_movements s join public.articles a on a.id = s.article_id
      left join public.users us on us.id = s.created_by
      left join public.events ev on s.reference_type = 'event' and ev.id = s.reference_id
      left join public.purchases pu on s.reference_type = 'purchase' and pu.id = s.reference_id
      left join public.suppliers f on f.id = pu.supplier_id
    where (t is null or s.type = t or (t = 'inventaire' and s.type in ('ajustement', 'inventaire_initial')))
      and (q is null or a.name ilike '%' || q || '%' or f.name ilike '%' || q || '%' or ev.name ilike '%' || q || '%')
    order by s.created_at desc limit lim) z), '[]'));
end $$;
grant execute on function orga.depot_historique(uuid, jsonb) to anon, authenticated;
