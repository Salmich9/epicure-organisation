-- Cadrage : une douzaine de questions avant la revue ; le copilote pré-remplit la liste depuis la bibliothèque.
alter table orga.evenements add column if not exists cadrage jsonb;

-- Enregistre les réponses (fusion) ; les prestations suivent la réponse « prestations »
create or replace function orga.cadrage_maj(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.evenements set
    cadrage = coalesce(cadrage, '{}'::jsonb) || p,
    prestations = case when jsonb_typeof(p #> '{reponses,prestations}') = 'array'
                       then array(select jsonb_array_elements_text(p #> '{reponses,prestations}')) else prestations end
  where id = p_evt;
  return (select cadrage from orga.evenements where id = p_evt);
end $$;

-- Ajoute les articles choisis par le copilote ; jamais de doublon, jamais d'écrasement d'une décision déjà prise
create or replace function orga.cadrage_appliquer(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); x jsonb; el jsonb; v_n int := 0; v_nous int := 0; v_tiers int := 0; v_clar int := 0; peri text;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    continue when not exists (select 1 from orga.catalogue where id = x->>'id');
    continue when exists (select 1 from orga.elements where evenement_id = p_evt and catalogue_id = x->>'id');
    peri := case when x->>'perimetre' in ('À notre charge','En partie','Tiers','À clarifier') then x->>'perimetre' else 'À notre charge' end;
    el := orga.element_depuis_catalogue(p_token, p_evt, x->>'id');
    update orga.elements set
      perimetre = peri,
      fourni_par = case when peri = 'Tiers' then nullif(x->>'par', '') end,
      qte_forcee = case when (x->>'qte') ~ '^[0-9]+(\.[0-9]+)?$' and (x->>'qte')::numeric > 0 then (x->>'qte')::numeric end,
      note = nullif(x->>'note', '')
    where id = el->>'id';
    v_n := v_n + 1;
    if peri = 'Tiers' then v_tiers := v_tiers + 1; elsif peri = 'À clarifier' then v_clar := v_clar + 1; else v_nous := v_nous + 1; end if;
  end loop;
  update orga.evenements set cadrage = coalesce(cadrage, '{}'::jsonb) || jsonb_build_object(
    'fait_le', now(), 'fait_par', me,
    'resultat', jsonb_build_object('ajoutes', v_n, 'nous', v_nous, 'tiers', v_tiers, 'clarifier', v_clar,
                                   'resume', p->>'resume', 'tiers_txt', p->>'tiers_txt', 'clarifier_txt', p->>'clarifier_txt', 'nous_txt', p->>'nous_txt'))
  where id = p_evt;
  return (select cadrage from orga.evenements where id = p_evt);
end $$;

revoke all on function orga.cadrage_maj(uuid, text, jsonb) from public;
revoke all on function orga.cadrage_appliquer(uuid, text, jsonb) from public;
grant execute on function orga.cadrage_maj(uuid, text, jsonb) to anon, authenticated;
grant execute on function orga.cadrage_appliquer(uuid, text, jsonb) to anon, authenticated;
