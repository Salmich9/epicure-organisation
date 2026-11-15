-- Lot D (audit 2) : le brief du jour J. Les extras affectés à l'événement, prénom et poste seulement
-- (ni téléphone, ni pièce d'identité, ni tarif), lisible par la direction et par l'équipe de l'événement.
create or replace function orga.brief(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if orga._role(me) = 'equipe' and not (p_evt = any(orga._evts_equipe(me))) then raise exception 'reserve_direction'; end if;
  return jsonb_build_object('staff', coalesce((
    select jsonb_agg(jsonb_build_object('nom', trim(coalesce(nullif(s.surnom, ''), s.prenom, s.nom)), 'poste', coalesce(nullif(a.role, ''), e.element)) order by e.element, s.prenom)
    from orga.staff_evt a join orga.staff s on s.id = a.staff_id left join orga.elements e on e.id = a.element_id
    where a.evenement_id = p_evt), '[]'));
end $$;
grant execute on function orga.brief(uuid, text) to anon, authenticated;
