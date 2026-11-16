-- Sortie vers / retour d'un établissement du groupe (hors événement) et motif des manquants au retour d'un événement
-- (migration orga_58_sorties_motifs)
alter table orga.elements add column if not exists ecart_motif text;

create or replace function orga._terrain(d jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select d || jsonb_build_object('elements', coalesce((select jsonb_agg(x || coalesce((select jsonb_build_object('charge', e.charge, 'revenu', e.revenu, 'casse', e.casse, 'ecart_motif', e.ecart_motif)
                                                                                         from orga.elements e where e.id = x->>'id'), '{}'))
                                                       from jsonb_array_elements(coalesce(d->'elements', '[]')) x), '[]'));
$$;
revoke execute on function orga._terrain(jsonb) from public, anon, authenticated;

create or replace function orga.depot_transfert(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); d text[] := orga._droits_depot(me); u uuid; l jsonb; q numeric; vers text := nullif(trim(p->>'vers'), ''); sens text := p->>'sens'; n int := 0;
begin
  if d is null or not (d && array['acheter', 'inventaire', 'gerer']) then raise exception 'reserve_depot'; end if;
  if vers is null or sens not in ('sortie', 'retour') or jsonb_array_length(coalesce(p->'lignes', '[]')) = 0 then raise exception 'manque_obligatoire'; end if;
  u := orga._depot_comme(me, 'voir');
  for l in select * from jsonb_array_elements(p->'lignes') loop
    q := (l->>'qte')::numeric;
    if q is null or q <= 0 then raise exception 'montant_invalide'; end if;
    insert into public.stock_movements (article_id, type, quantity, reference_type, note, created_by)
    values ((l->>'article_id')::uuid, case when sens = 'sortie' then 'prelevement' else 'retour' end, case when sens = 'sortie' then -q else q end,
            'transfert', vers || coalesce(' · ' || nullif(trim(p->>'note'), ''), ''), u);
    n := n + 1;
  end loop;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values ('transfert', null, sens, u, p);
  return jsonb_build_object('lignes', n);
end $$;
grant execute on function orga.depot_transfert(uuid, jsonb) to anon, authenticated;

-- L'historique montre l'établissement d'une sortie (« vers ») ; la recherche le trouve aussi.
-- Appliqué par remplacement dans orga.depot_historique :
--   'fournisseur', f.name, 'vers', case when s.reference_type = 'transfert' then split_part(s.note, ' · ', 1) end,
--   'note', case when s.reference_type = 'transfert' then nullif(substr(s.note, length(split_part(s.note, ' · ', 1)) + 4), '') else s.note end
--   … or (s.reference_type = 'transfert' and s.note ilike '%' || q || '%')

-- Le retour : le motif choisi (p.motif) se garde sur la ligne (elements.ecart_motif) et s'enregistre comme écart du dépôt
-- pour la quantité qui manque (chargé − revenu) ; il remplace l'ancien compteur « cassés ».
-- Appliqué par remplacement dans orga.ligne_terrain :
--   ecart_motif = case when p ? 'motif' then nullif(p->>'motif', '') else ecart_motif end
--   if ap.ecart_motif is not null then
--     delete from public.ecarts_motifs where event_id = d and article_id = ap.article_id;
--     motif = celui du nom, sinon « Pas d'explication » ; insert quantite = charge − revenu si > 0
--   elsif casse a changé then (ancien comportement : motif « Casse »)
