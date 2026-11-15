-- Audit technique : le stock du dépôt (≈ 70 ko) n'est plus renvoyé à chaque geste avec les données d'un événement.
-- L'appli le charge à part, une fois à l'ouverture, puis toutes les 5 minutes au plus.
-- Lecture seule du schéma public (dépôt epicure-app) : aucune modification.

-- Étape 1 (avant la nouvelle appli) : la liste à part
create or replace function orga.depot_liste(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.article_id, 'nom', s.name, 'qte', s.quantity, 'photo', s.photo_url, 'cat', c.name) order by s.name), '[]')
          from public.current_stock s left join public.categories c on c.id = s.category_id where s.active);
end $$;
grant execute on function orga.depot_liste(uuid) to anon, authenticated;

-- Étape 2 (une fois la nouvelle appli en ligne) : les données d'un événement n'embarquent plus le dépôt
do $$
declare def text := pg_get_functiondef('orga._donnees_brut(uuid,text)'::regprocedure);
  vieux text := $v$'depot', (select coalesce(jsonb_agg(jsonb_build_object('id', s.article_id, 'nom', s.name, 'qte', s.quantity, 'photo', s.photo_url, 'cat', c.name) order by s.name), '[]')
              from public.current_stock s left join public.categories c on c.id = s.category_id where s.active),$v$;
begin
  if position(vieux in def) > 0 then execute replace(def, vieux, $n$'depot', '[]'::jsonb,$n$); end if;
end $$;
