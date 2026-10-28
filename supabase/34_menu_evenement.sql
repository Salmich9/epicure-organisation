-- Menu de l'événement : écrit à la main et/ou PDF rangés dans le dossier Drive (sous-dossier Organisation).
-- La bibliothèque ne garde plus le détail des plats : le coût matière passe par « Matière … (par couvert) ».
alter table orga.evenements add column if not exists menu jsonb not null default '{}'::jsonb;

create or replace function orga.menu_maj(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.evenements set menu = coalesce(menu, '{}'::jsonb)
    || case when p ? 'texte' then jsonb_build_object('texte', p->>'texte', 'texte_par', me, 'texte_le', now()) else '{}'::jsonb end
    || case when p ? 'retirer' then jsonb_build_object('fichiers', coalesce((select jsonb_agg(f) from jsonb_array_elements(coalesce(menu->'fichiers', '[]')) f where f->>'id' <> p->>'retirer'), '[]')) else '{}'::jsonb end
  where id = p_evt;
  return (select menu from orga.evenements where id = p_evt);
end $$;
grant execute on function orga.menu_maj(uuid, text, jsonb) to anon, authenticated;
