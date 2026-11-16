-- 73 · L'agent vocal lit les questions des Paramètres ; « Challenge-moi » devient un appel vocal sur un événement en cours d'organisation.
--   voix_evenement : tout ce que l'agent doit savoir pour challenger (chiffrage, réponses, postes à régler ou fournis, enveloppes,
--   actions et planning en retard, leçons). Proposé par notification à la confirmation et à J−30, J−7 (réglable : parametres 'challenge').

insert into orga.parametres (cle, valeur) values ('challenge', jsonb_build_object('actif', false, 'confirmation', true, 'jours', jsonb_build_array(30, 7)))
-- 'actif' passe à true à la fusion de la v73 (rien n'est envoyé avant)
on conflict (cle) do nothing;

create or replace function orga.challenge_reglages(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  if p is not null then
    if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
    update orga.parametres set valeur = valeur || jsonb_strip_nulls(jsonb_build_object('confirmation', (p->>'confirmation')::boolean,
      'jours', case when jsonb_typeof(p->'jours') = 'array' then (select coalesce(jsonb_agg(distinct (j #>> '{}')::int order by (j #>> '{}')::int desc), '[]') from jsonb_array_elements(p->'jours') j where (j #>> '{}') ~ '^\d+$') end))
    where cle = 'challenge';
  end if;
  return jsonb_build_object('reglages', (select valeur from orga.parametres where cle = 'challenge'), 'peut_modifier', orga._chiffrage_editeur(me));
end $$;

-- Ce que l'agent sait d'un événement pour le challenger
create or replace function orga.voix_evenement(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token); ev orga.evenements; c orga.chiffrages; l jsonb; cout numeric; aujourd date := (now() at time zone 'Africa/Casablanca')::date; env jsonb := '[]';
begin
  begin env := coalesce((orga.enveloppes_evt(p_token, p_evt))->'enveloppes', '[]'); exception when others then env := '[]'; end;
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  l := coalesce(c.lignes, '[]');
  cout := (select coalesce(sum((x->>'quantite')::numeric * (x->>'prix')::numeric), 0) from jsonb_array_elements(l) x);
  return jsonb_build_object('ok', true,
    'evenement', jsonb_strip_nulls(jsonb_build_object('nom', ev.nom, 'code', ev.code, 'date', ev.date, 'jours_restants', ev.date - aujourd, 'lieu', ev.lieu,
      'invites', ev.invites, 'gamme', ev.gamme, 'statut', ev.statut, 'societe', ev.entite, 'client', ev.client, 'prix_signe_ht', ev.prix_signe)),
    'chiffrage', jsonb_build_object('cout', round(cout), 'marge_pct', case when coalesce(ev.prix_signe, 0) > 0 then round((1 - cout * 1.05 / ev.prix_signe) * 100) end,
      'reponses', case when c.base is not null then orga._reponses(c.base)->'reponses' end,
      'blocs', (select coalesce(jsonb_agg(jsonb_build_object('bloc', g, 'total', t) order by t desc), '[]') from (
                 select coalesce(x->>'groupe', x->>'zone', 'divers') g, round(sum((x->>'quantite')::numeric * (x->>'prix')::numeric)) t from jsonb_array_elements(l) x group by 1) z),
      'prix_a_regler', (select coalesce(jsonb_agg(distinct x->>'element'), '[]') from jsonb_array_elements(l) x where (x->>'a_regler')::boolean),
      'fourni_a_confirmer', (select coalesce(jsonb_agg(x->>'element'), '[]') from jsonb_array_elements(l) x where (x->>'fourni')::boolean)),
    'actions', jsonb_build_object(
      'ouvertes', (select count(*) from orga.actions a where a.evenement_id = p_evt and coalesce(a.statut, '') not in ('Fait', 'Annulé')),
      'en_retard', (select coalesce(jsonb_agg(jsonb_build_object('quoi', a.quoi, 'qui', a.resp, 'pour', a.echeance) order by a.echeance), '[]') from orga.actions a
                    where a.evenement_id = p_evt and coalesce(a.statut, '') not in ('Fait', 'Annulé') and a.echeance < aujourd),
      'sans_responsable', (select count(*) from orga.actions a where a.evenement_id = p_evt and coalesce(a.statut, '') not in ('Fait', 'Annulé') and coalesce(a.resp, '') = '')),
    'lignes_sans_responsable', (select count(*) from orga.elements e where e.evenement_id = p_evt and coalesce(e.resp, '') = ''),
    'planning', jsonb_build_object(
      'en_retard', (select coalesce(jsonb_agg(jsonb_build_object('titre', p.titre, 'qui', p.qui, 'date', p.date) order by p.date), '[]') from orga.planning p
                    where p.evenement_id = p_evt and not coalesce(p.fait, false) and p.date < aujourd),
      'prochains', (select coalesce(jsonb_agg(z), '[]') from (select jsonb_build_object('titre', p.titre, 'qui', p.qui, 'date', p.date) z from orga.planning p
                    where p.evenement_id = p_evt and not coalesce(p.fait, false) and p.date >= aujourd order by p.date, p.heure limit 5) q)),
    'enveloppes', (select coalesce(jsonb_agg(jsonb_build_object('nom', x->>'nom', 'resp', x->>'resp', 'prevu', x->'prevu', 'reel', x->'reel')), '[]')
                   from jsonb_array_elements(env) x),
    'lecons', (select coalesce(jsonb_agg(z), '[]') from (select jsonb_build_object('zone', le.zone, 'lecon', le.texte) z from orga.lecons le
               where le.statut = 'retenue' order by le.decide_le desc nulls last limit 6) q),
    'seuils', jsonb_build_object('marge_visee', orga._param('r_marge_visee'), 'delai_court_jours', orga._param('r_delai_court')));
end $$;

-- Proposer un challenge vocal : à la confirmation, puis à J−30 et J−7 (réglables)
create or replace function orga._notifs_challenge(p_now timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare cfg jsonb := (select valeur from orga.parametres where cle = 'challenge'); loc date := (p_now at time zone 'Africa/Casablanca')::date;
        x record; j int; k int; n int := 0; d text;
begin
  if not coalesce((cfg->>'actif')::boolean, false) or not coalesce((orga._notifs_cfg() #>> '{familles,challenge}')::boolean, true) then return 0; end if;
  for x in select e.* from orga.evenements e where e.statut = 'Confirmé' and e.date >= loc loop
    d := coalesce(orga._membre_de(x.resp), 'Salmane');
    if not orga._dest_ok(d) then continue; end if;
    if coalesce((cfg->>'confirmation')::boolean, true) then
      insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
      values ('CH|' || x.id || '|conf', d, 'challenge', '🎙 Challenge : ' || orga._court(coalesce(x.code, x.nom), 14),
        concat_ws(' · ', x.nom, 'confirmé', orga._societe(x.entite)) || E'\nTouche : lancer le challenge', '/#/challenge/' || x.id, 'CH' || x.id)
      on conflict (cle) do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;
    for j in select (v #>> '{}')::int from jsonb_array_elements(coalesce(cfg->'jours', '[]')) v loop
      if x.date - loc = j then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('CH|' || x.id || '|J' || j, d, 'challenge', orga._court('🎙 J−' || j || ' : challenge ' || coalesce(x.code, x.nom), 28),
          concat_ws(' · ', x.nom, x.lieu, orga._societe(x.entite)) || E'\nTouche : lancer le challenge', '/#/challenge/' || x.id, 'CH' || x.id)
        on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- Les événements déjà confirmés ne reçoivent pas d'un coup la proposition « à la confirmation »
insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, statut)
select 'CH|' || e.id || '|conf', coalesce(orga._membre_de(e.resp), 'Salmane'), 'challenge', 'Challenge', 'déjà confirmé avant la v73', '/#/challenge/' || e.id, 'CH' || e.id, 'groupe'
from orga.evenements e where e.statut = 'Confirmé'
on conflict (cle) do nothing;

do $$ declare d text := pg_get_functiondef('orga._notifs_passage(timestamptz)'::regprocedure); a text := 'n := n + orga._notifs_enveloppes(p_now); end if;'; begin
  if d ~ '_notifs_challenge' then return; end if;
  if position(a in d) = 0 then raise exception '_notifs_passage a changé'; end if;
  execute replace(d, a, a || E'\n  n := n + orga._notifs_challenge(p_now);');
end $$;

create or replace function orga._reponses_texte(r jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if r is null then return '{}'; end if;
  if jsonb_typeof(r) = 'object' then return r; end if;
  if jsonb_typeof(r) = 'string' then
    begin return case when jsonb_typeof((r #>> '{}')::jsonb) = 'object' then (r #>> '{}')::jsonb else '{}' end;
    exception when others then return '{}'; end;
  end if;
  return '{}';
end $$;

-- L'agent passe « reponses » en texte JSON : on le lit
do $$ declare d text := pg_get_functiondef('orga.voix_chiffrer(uuid,jsonb)'::regprocedure);
  a text := 'coalesce(case when jsonb_typeof(p->''reponses'') = ''object'' then p->''reponses'' end, ''{}'')'; begin
  if d ~ '_reponses_texte' then return; end if;
  if position(a in d) = 0 then raise exception 'voix_chiffrer a changé'; end if;
  execute replace(d, a, 'orga._reponses_texte(p->''reponses'')');
end $$;

revoke execute on function orga._notifs_challenge(timestamptz), orga._reponses_texte(jsonb) from public, anon, authenticated;
grant execute on function orga.voix_evenement(uuid, text), orga.challenge_reglages(uuid, jsonb) to anon, authenticated;
