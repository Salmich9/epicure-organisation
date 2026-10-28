-- Contexte pour l'agent vocal : autres événements le même jour, historique du lieu,
-- événements de taille proche, leçons retenues et prix de la bibliothèque.
create or replace function orga.voix_contexte(p_token uuid, p_date date, p_lieu text, p_pax int, p_cherche text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
  v_lieu text := nullif(lower(trim(coalesce(p_lieu, ''))), '');
  v_mots text[] := array(select m from unnest(regexp_split_to_array(lower(coalesce(p_cherche, '')), '[\s,;]+')) m where length(m) >= 3);
begin
  return jsonb_build_object(
    'meme_jour', case when p_date is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('nom', e.nom, 'lieu', e.lieu, 'invites', e.invites, 'statut', e.statut))
       from orga.evenements e where e.date = p_date and coalesce(e.statut, '') <> 'Perdu'), '[]') end,
    'lieu_connu', v_lieu is not null and exists (select 1 from orga.evenements e where lower(e.lieu) like '%' || v_lieu || '%'),
    'au_meme_lieu', case when v_lieu is null then '[]'::jsonb else coalesce((select jsonb_agg(x order by x->>'date' desc) from (
       select jsonb_build_object('nom', e.nom, 'date', e.date, 'invites', e.invites, 'prix', coalesce(e.prix_signe, e.prix), 'coef', e.coef,
         'prix_par_invite', case when e.invites > 0 then round(coalesce(e.prix_signe, e.prix) / e.invites) end, 'note', left(e.note, 300)) x
       from orga.evenements e where lower(e.lieu) like '%' || v_lieu || '%' limit 5) t), '[]') end,
    'taille_proche', case when coalesce(p_pax, 0) <= 0 then '[]'::jsonb else coalesce((select jsonb_agg(x) from (
       select jsonb_build_object('nom', e.nom, 'date', e.date, 'lieu', e.lieu, 'invites', e.invites, 'prix', coalesce(e.prix_signe, e.prix), 'coef', e.coef,
         'prix_par_invite', round(coalesce(e.prix_signe, e.prix) / e.invites)) x
       from orga.evenements e where e.invites between p_pax * 0.7 and p_pax * 1.3 and coalesce(e.prix_signe, e.prix) > 0
       order by abs(e.invites - p_pax) limit 5) t), '[]') end,
    'lecons', coalesce((select jsonb_agg(jsonb_build_object('zone', l.zone, 'lecon', l.texte, 'detail', l.detail)) from (
       select * from orga.lecons where coalesce(statut, '') not in ('Refusée', 'refusee') order by cree_le desc limit 15) l), '[]'),
    'bibliotheque', case when cardinality(v_mots) = 0 then '[]'::jsonb else coalesce((select jsonb_agg(x) from (
       select jsonb_build_object('element', c.element, 'zone', c.zone, 'unite', c.unite, 'par', c.base, 'qte_par', c.qte_par_base,
         'prix_achat', c.prix_achat, 'prix_location', c.prix_location, 'prix_production', c.prix_production, 'fournisseur', c.fournisseur) x
       from orga.catalogue c where (select bool_or(lower(c.element || ' ' || coalesce(c.sous_zone, '')) like '%' || m || '%') from unnest(v_mots) m)
       limit 12) t), '[]') end);
end $$;
grant execute on function orga.voix_contexte(uuid, date, text, int, text) to anon, authenticated;
