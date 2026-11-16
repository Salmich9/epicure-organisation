-- 74 · Le cadrage lit les Paramètres et affine au lieu de reprendre.
--   Ses questions vivent dans Paramètres › Questions, partie « organisation » (posées au cadrage, jamais au chiffrage).
--   Ce que le devis a déjà tranché n'est plus reposé ; ce qu'il a laissé au défaut revient, pré-choisi, pour être confirmé.
--   Les réponses du cadrage vont dans evenements.cadrage->'affine' (l'ancienne clé 'reponses' reste lue telle quelle).

-- Les questions propres au cadrage
insert into orga.chiffrage_questions (cle, section, texte, aide, type, choix, defaut, quand, express, ordre, systeme) values
 ('emplacement', 'organisation', 'Où ça se passe ?', null, 'choix',
   '[{"cle":"interieur","libelle":"Intérieur"},{"cle":"exterieur","libelle":"Extérieur"},{"cle":"les_deux","libelle":"Les deux"}]', null, '{}', false, 510, false),
 ('sol', 'organisation', 'Le sol côté service ?', null, 'choix',
   '[{"cle":"dur","libelle":"Dur"},{"cle":"gazon","libelle":"Gazon"},{"cle":"sable","libelle":"Sable ou terre"}]', null, '{emplacement:exterieur|les_deux}', false, 520, false),
 ('invites_particuliers', 'organisation', 'Parmi les invités…', null, 'multi',
   '[{"cle":"enfants","libelle":"Des enfants"},{"cle":"regimes","libelle":"Des régimes particuliers"},{"cle":"rien","libelle":"Rien de spécial"}]', null, '{}', false, 540, false),
 ('theme', 'organisation', 'Un thème, une ambiance ?', 'ex : bohème chic, blanc et or', 'texte', '[]', null, '{}', false, 550, false),
 ('particularite', 'organisation', 'Quelque chose de différent d''habitude ?', 'ex : les invités ne veulent pas voir l''alcool', 'texte', '[]', null, '{}', false, 560, false)
on conflict (cle) do nothing;

-- « profil » passe du chiffrage (où il ne comptait rien) au cadrage
update orga.chiffrage_questions set section = 'organisation', texte = 'Qui sont les invités ?', aide = 'corporate, mariage, âge, nationalités…', ordre = 530, maj_le = now()
where cle = 'profil' and section = 'cadrage';

-- L'agent vocal ne pose pas les questions du cadrage
create or replace function orga.voix_questions(p_token uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return jsonb_build_object('mode', coalesce(p_mode, 'express'),
    'seuils', jsonb_build_object('marge_visee', orga._param('r_marge_visee'), 'delai_court_jours', orga._param('r_delai_court')),
    'questions', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cle', q.cle, 'question', q.texte, 'aide', q.aide, 'type', q.type,
        'reponses', case when jsonb_array_length(q.choix) > 0 then (select jsonb_agg(c->>'cle') from jsonb_array_elements(q.choix) c) end,
        'defaut', q.defaut, 'quand', case when cardinality(q.quand) > 0 then to_jsonb(q.quand) end)) order by q.ordre), '[]')
      from orga.chiffrage_questions q where q.actif and q.section <> 'organisation' and (q.express or coalesce(p_mode, 'express') <> 'express')));
end $$;

-- Ce dont l'écran du cadrage a besoin : les questions, ce que le devis a dit (sans aucun prix), ce que le cadrage a déjà affiné
create or replace function orga.cadrage_contexte(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev orga.evenements; b jsonb; garde text[];
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  select c.base into b from orga.chiffrages c where c.evenement_id = p_evt;
  garde := array(select q.cle from orga.chiffrage_questions q) || array['traiteur', 'bar', 'hors_marrakech', 'autre_ville', 'alcool_client'];
  -- Seulement les réponses : jamais les surcharges de prix, effectifs ou personnes
  b := (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(coalesce(b, '{}')) e(k, v) where k = any(garde) and jsonb_typeof(v) <> 'null');
  if ev.gamme is not null and not b ? 'gamme' then b := b || jsonb_build_object('gamme', ev.gamme); end if;
  return jsonb_build_object('a_chiffrage', exists (select 1 from orga.chiffrages c where c.evenement_id = p_evt and c.base is not null),
    'base', b, 'affine', coalesce(ev.cadrage->'affine', '{}'),
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('cle', q.cle, 'section', q.section, 'texte', q.texte, 'aide', q.aide, 'type', q.type,
        'choix', q.choix, 'defaut', q.defaut, 'quand', to_jsonb(q.quand), 'actif', q.actif, 'ordre', q.ordre) order by q.ordre), '[]')
      from orga.chiffrage_questions q where q.actif and q.type <> 'etape'));
end $$;

revoke all on function orga.cadrage_contexte(uuid, text) from public;
grant execute on function orga.cadrage_contexte(uuid, text) to anon, authenticated;
