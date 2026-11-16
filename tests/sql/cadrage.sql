-- Tests du cadrage v74 : contexte sans prix, questions du cadrage hors agent vocal, réponses affinées sans toucher aux anciennes.
-- Finit par une erreur volontaire : rien n'est gardé. Résultat attendu : « RESULTATS 7 / 7 : tout passe ».
do $$
declare ts uuid := gen_random_uuid(); j jsonb; v jsonb;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet');
  insert into orga.evenements (id, nom, date, invites, entite, statut, gamme, prestations, cadrage)
  values ('EV-CD', 'Cadrage test', current_date + 30, 120, 'Epicure', 'Confirmé', 'Premium', '{Traiteur,Boissons}', '{"reponses":{"repas":["Buffet"]}}');
  insert into orga.chiffrages (evenement_id, lignes, base) values ('EV-CD', '[]',
    '{"invites":120,"prestations":["bar","traiteur"],"nb_bars":2,"plonge":"rien","surcharges":{"s_chef_rang":{"valeur":999}},"effectifs":{"s_bartender":3}}')
  on conflict (evenement_id) do update set base = excluded.base;

  j := orga.cadrage_contexte(ts, 'EV-CD');
  insert into r values (1, 'base reprise', (j->'base'->>'nb_bars') = '2' and (j->'base'->>'plonge') = 'rien');
  insert into r values (2, 'aucun prix ni effectif', not (j->'base' ? 'surcharges') and not (j->'base' ? 'effectifs'));
  insert into r values (3, 'gamme de l''événement', j->'base'->>'gamme' = 'Premium');
  insert into r values (4, 'questions du cadrage présentes', exists (select 1 from jsonb_array_elements(j->'questions') q where q->>'cle' = 'sol' and q->>'section' = 'organisation'));
  v := orga.voix_questions(ts, 'complet');
  insert into r values (5, 'agent vocal sans questions du cadrage', not exists (select 1 from jsonb_array_elements(v->'questions') q where q->>'cle' in ('sol', 'theme', 'profil', 'emplacement')));
  perform orga.cadrage_maj(ts, 'EV-CD', '{"affine":{"emplacement":"exterieur","sol":"gazon","plonge":"fournie"}}');
  insert into r values (6, 'affiné enregistré', (orga.cadrage_contexte(ts, 'EV-CD')->'affine'->>'sol') = 'gazon');
  insert into r values (7, 'anciennes réponses et prestations intactes', (select cadrage #> '{reponses,repas}' = '["Buffet"]' and prestations = '{Traiteur,Boissons}' from orga.evenements where id = 'EV-CD'));

  raise exception 'RESULTATS % / % : %', (select count(*) from r where ok), (select count(*) from r),
    coalesce((select string_agg(n || ' ' || quoi, ' ; ') from r where not ok), 'tout passe');
end $$;
