-- Article dicté pendant la revue : la source du prix proposé par l'IA est gardée dans la bibliothèque
create or replace function orga.catalogue_creer(p_token uuid, p jsonb, p_evt text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare me text := orga._qui(p_token); cid text; m text := coalesce(nullif(p->>'mode', ''), 'Location'); prix numeric := nullif(p->>'prix', '')::numeric;
begin
  if coalesce(trim(p->>'element'), '') = '' or coalesce(p->>'zone', '') = '' then raise exception 'nom_ou_zone_manquant'; end if;
  if exists (select 1 from orga.catalogue where zone = p->>'zone' and lower(regexp_replace(element, '[^[:alnum:]]', '', 'g')) = lower(regexp_replace(p->>'element', '[^[:alnum:]]', '', 'g'))) then
    raise exception 'article_existe_deja';
  end if;
  cid := orga._next_id('catalogue', 'CAT-');
  insert into orga.catalogue (id, zone, sous_zone, element, unite, base, qte_par_base, mode_defaut, prix_achat, prix_location, prix_production,
                              fournisseur, reutilisable, source_prix, origine)
  values (cid, p->>'zone', nullif(p->>'sous_zone', ''), trim(p->>'element'), coalesce(nullif(p->>'unite', ''), 'pièce'),
          coalesce(nullif(p->>'base', ''), 'Fixe'), coalesce(nullif(p->>'qte_par_base', '')::numeric, 1), m,
          case when m = 'Achat' then prix end, case when m = 'Location' then prix end, case when m = 'Production / sous-traitance' then prix end,
          nullif(p->>'fournisseur', ''), case when m = 'Location' then 'Oui' else 'Non' end,
          coalesce(nullif(p->>'source_prix', ''), case when prix is null then 'À estimer' else 'Saisi dans l''appli' end), 'Ajouté depuis l''appli par ' || me);
  if nullif(p_evt, '') is not null then return orga.element_depuis_catalogue(p_token, p_evt, cid); end if;
  return jsonb_build_object('id', cid);
end $function$;
