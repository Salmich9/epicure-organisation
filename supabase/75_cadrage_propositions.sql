-- 75 · Le cadrage propose : d'abord le même lieu, puis les événements proches (même gamme, mêmes prestations, invités à ±30 %),
--   l'IA en dernier sur ce que les règles n'ont pas tranché. Si le lieu et les proches divergent, le lieu gagne et le « pourquoi » montre les deux.
--   Tout se règle dans Paramètres › Marges › « Cadrage · propositions ». Lieux reconnus par leur nom sans accents, espaces ni ponctuation.

insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, si, mode, actif, ordre) values
 ('r_proche_invites',     'marges', 'Cadrage · propositions', 'Proche : écart d''invités au plus', null, 'regle', 30, '%', 'toujours', 'achat', true, 660),
 ('r_proche_gamme',       'marges', 'Cadrage · propositions', 'Proche : même gamme', '1 = oui, 0 = non', 'regle', 1, '', 'toujours', 'achat', true, 661),
 ('r_proche_prestations', 'marges', 'Cadrage · propositions', 'Proche : mêmes prestations', '1 = oui, 0 = non', 'regle', 1, '', 'toujours', 'achat', true, 662),
 ('r_proche_min',         'marges', 'Cadrage · propositions', 'Proches qui doivent être d''accord', 'au moins', 'regle', 2, 'évén.', 'toujours', 'achat', true, 663),
 ('r_ia_cadrage',         'marges', 'Cadrage · propositions', 'L''IA propose le reste', '1 = oui, 0 = non', 'regle', 1, '', 'toujours', 'achat', true, 664)
on conflict (cle) do nothing;

-- « Kasbah d'If », « Kasbah Dif » et « kasbah-dif » : le même lieu
create or replace function orga._cle_lieu(t text) returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(lower(translate(coalesce(t, ''), 'ÀÂÄÉÈÊËÎÏÔÖÙÛÜÇàâäéèêëîïôöùûüç', 'AAAEEEEIIOOUUUCaaaeeeeiioouuuc')), '[^a-z0-9]', '', 'g'), '')
$$;

-- Les lieux connus, une orthographe par lieu (la plus récente)
create or replace function orga.lieux_connus(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return (select coalesce(jsonb_agg(nom order by nom), '[]') from (
    select distinct on (orga._cle_lieu(e.lieu)) trim(e.lieu) nom from orga.evenements e
    where orga._cle_lieu(e.lieu) is not null order by orga._cle_lieu(e.lieu), e.date desc nulls last) x);
end $$;

-- Ce qu'un événement a répondu : ancien cadrage (traduit), puis ce que dit son devis, puis son cadrage affiné
create or replace function orga._reponses_evt(p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev orga.evenements; b jsonb; r jsonb := '{}'; o jsonb; k text; v jsonb; q orga.chiffrage_questions; nk text; nv jsonb;
  m jsonb := '{"energie":{"cle":"electricite","v":{"Le lieu suffit":"ok","Groupe électrogène":"groupe"}},
              "cuisine":{"cle":"cuisine","v":{"Oui, équipée":"equipee","Incomplète":"incomplete","Aucune":"rien"}},
              "plonge":{"cle":"plonge","v":{"Oui, fournie":"fournie","Un espace vide":"espace","Rien":"rien"}},
              "invites":{"cle":"invites_particuliers","v":{"Des enfants":"enfants","Des régimes particuliers":"regimes","Rien de spécial":"rien"}},
              "bars":{"cle":"nb_bars","v":{"1":1,"2":2,"3":3,"4 et plus":4}},
              "fourni":{"cle":"fourni","v":{"Rien de tout ça":null}}}';
begin
  select * into ev from orga.evenements where id = p_evt;
  o := coalesce(ev.cadrage->'reponses', '{}');
  for k, v in select * from jsonb_each(o) loop
    nk := coalesce(m #>> array[k, 'cle'], k);
    select * into q from orga.chiffrage_questions where cle = nk and type in ('choix', 'multi', 'nombre', 'oui_non');
    if q.cle is null then continue; end if;
    -- une valeur : le dictionnaire, sinon le libellé d'une réponse de la question
    nv := case when jsonb_typeof(v) = 'array'
      then (select jsonb_agg(z) from (select coalesce(m #> array[k, 'v', x], (select c->'cle' from jsonb_array_elements(q.choix) c where lower(c->>'libelle') = lower(x) limit 1)) z
            from jsonb_array_elements_text(v) x) y where z is not null and jsonb_typeof(z) <> 'null')
      else coalesce(m #> array[k, 'v', v #>> '{}'], (select c->'cle' from jsonb_array_elements(q.choix) c where lower(c->>'libelle') = lower(v #>> '{}') limit 1)) end;
    if nv is not null and jsonb_typeof(nv) <> 'null' then r := r || jsonb_build_object(nk, nv); end if;
  end loop;
  select c.base into b from orga.chiffrages c where c.evenement_id = p_evt;
  r := r || (select coalesce(jsonb_object_agg(e.k, e.v), '{}') from jsonb_each(coalesce(b, '{}')) e(k, v)
             where exists (select 1 from orga.chiffrage_questions q2 where q2.cle = e.k) and jsonb_typeof(e.v) <> 'null');
  r := r || (select coalesce(jsonb_object_agg(e.k, e.v), '{}') from jsonb_each(coalesce(ev.cadrage->'affine', '{}')) e(k, v) where e.v <> '"?"');
  return r;
end $$;

-- Les propositions par règles, question par question
create or replace function orga._cadrage_propositions(p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev orga.evenements; cl text; pct numeric := coalesce(orga._param('r_proche_invites'), 30);
  mg boolean := coalesce(orga._param('r_proche_gamme'), 1) > 0; mp boolean := coalesce(orga._param('r_proche_prestations'), 1) > 0;
  mn int := greatest(coalesce(orga._param('r_proche_min'), 2), 1)::int; q record; res jsonb := '{}'; l record; p record; tot int; prop jsonb; cand jsonb;
begin
  select * into ev from orga.evenements where id = p_evt;
  cl := orga._cle_lieu(ev.lieu);
  select coalesce(jsonb_agg(jsonb_build_object('nom', e.nom, 'date', e.date,
    'lieu', cl is not null and orga._cle_lieu(e.lieu) is not distinct from cl,
    'proche', (not mg or e.gamme is not distinct from ev.gamme)
      and (not mp or (select coalesce(array_agg(x order by x), '{}') from unnest(coalesce(e.prestations, '{}')) x) = (select coalesce(array_agg(x order by x), '{}') from unnest(coalesce(ev.prestations, '{}')) x))
      and coalesce(ev.invites, 0) > 0 and coalesce(e.invites, 0) > 0 and abs(e.invites - ev.invites) <= ev.invites * pct / 100,
    'r', orga._reponses_evt(e.id))), '[]') into cand
  from orga.evenements e where e.id <> p_evt and coalesce(e.statut, '') <> 'Perdu';
  for q in select * from orga.chiffrage_questions where actif and type in ('choix', 'multi', 'oui_non', 'nombre') loop
    prop := null;
    -- 1. Le même lieu : la réponse la plus récente
    select c->>'nom' nom, (c->>'date')::date d, c->'r'->q.cle v into l from jsonb_array_elements(cand) c
    where (c->>'lieu')::boolean and c->'r' ? q.cle order by (c->>'date')::date desc nulls last limit 1;
    if l.v is not null then
      tot := (select count(*) from jsonb_array_elements(cand) c where (c->>'lieu')::boolean and c->'r' ? q.cle);
      prop := jsonb_build_object('valeur', l.v, 'source', 'lieu',
        'pourquoi', 'Même lieu : ' || l.nom || coalesce(' (' || to_char(l.d, 'MM/YYYY') || ')', '') || case when tot > 1 then ' · le plus récent de ' || tot else '' end);
    end if;
    -- 2. Les événements proches (hors même lieu) : une majorité d'au moins « r_proche_min »
    select c->'r'->q.cle v, count(*) n into p from jsonb_array_elements(cand) c
    where (c->>'proche')::boolean and not (c->>'lieu')::boolean and c->'r' ? q.cle
    group by c->'r'->q.cle order by count(*) desc, max((c->>'date')::date) desc nulls last limit 1;
    tot := (select count(*) from jsonb_array_elements(cand) c where (c->>'proche')::boolean and not (c->>'lieu')::boolean and c->'r' ? q.cle);
    if p.v is not null and p.n >= mn and p.n * 2 > tot then
      if prop is null then
        prop := jsonb_build_object('valeur', p.v, 'source', 'proches', 'pourquoi', p.n || ' événements proches sur ' || tot);
      elsif prop->'valeur' <> p.v then
        prop := prop || jsonb_build_object('autre', jsonb_build_object('valeur', p.v, 'pourquoi', p.n || ' événements proches sur ' || tot));
      end if;
    end if;
    if prop is not null then res := res || jsonb_build_object(q.cle, prop); end if;
  end loop;
  return res;
end $$;

-- Le contexte du cadrage porte maintenant les propositions et celles déjà faites par l'IA
create or replace function orga.cadrage_contexte(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev orga.evenements; b jsonb; garde text[];
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  select c.base into b from orga.chiffrages c where c.evenement_id = p_evt;
  garde := array(select q.cle from orga.chiffrage_questions q) || array['traiteur', 'bar', 'hors_marrakech', 'autre_ville', 'alcool_client'];
  b := (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(coalesce(b, '{}')) e(k, v) where k = any(garde) and jsonb_typeof(v) <> 'null');
  if ev.gamme is not null and not b ? 'gamme' then b := b || jsonb_build_object('gamme', ev.gamme); end if;
  return jsonb_build_object('a_chiffrage', exists (select 1 from orga.chiffrages c where c.evenement_id = p_evt and c.base is not null),
    'base', b, 'affine', coalesce(ev.cadrage->'affine', '{}'),
    'propositions', orga._cadrage_propositions(p_evt),
    'ia', coalesce(ev.cadrage->'ia', '{}'), 'ia_actif', coalesce(orga._param('r_ia_cadrage'), 1) > 0,
    'questions', (select coalesce(jsonb_agg(jsonb_build_object('cle', q.cle, 'section', q.section, 'texte', q.texte, 'aide', q.aide, 'type', q.type,
        'choix', q.choix, 'defaut', q.defaut, 'quand', to_jsonb(q.quand), 'actif', q.actif, 'ordre', q.ordre) order by q.ordre), '[]')
      from orga.chiffrage_questions q where q.actif and q.type <> 'etape'));
end $$;

revoke all on function orga._cle_lieu(text), orga._reponses_evt(text), orga._cadrage_propositions(text) from public, anon, authenticated;
grant execute on function orga._cle_lieu(text) to anon, authenticated;
revoke all on function orga.lieux_connus(uuid) from public;
grant execute on function orga.lieux_connus(uuid) to anon, authenticated;
