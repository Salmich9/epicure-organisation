-- Tests des parts des associés (v76) : accès réservé, Salmane seul modifie, calcul, versements.
-- Finit par une erreur volontaire : rien n'est gardé. Résultat attendu : « RESULTATS 9 / 9 : tout passe ».
do $$
declare ts uuid := gen_random_uuid(); th uuid := gen_random_uuid(); tg uuid := gen_random_uuid(); j jsonb; bon boolean;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet'),
    (th, 'Hamza', now() + interval '1 hour', 'complet'), (tg, 'Ghali', now() + interval '1 hour', 'complet');
  insert into orga.evenements (id, nom, date, invites, entite, statut, prix_signe, resp, note) values
   ('EV-PA1', 'Test espèces', make_date(2031, 6, 1), 100, 'Espèce', 'Confirmé', 100000, 'Ghali', null),
   ('EV-PA2', 'Test virement', make_date(2031, 7, 1), 100, 'Epicure', 'Confirmé', 100000, 'Salmane', 'Sur place : Hamza, Soufiane · Apporteur : Salmane');
  -- Ghali (administrateur, pas associé) : refusé
  begin perform orga.parts_associes(tg, 2031); bon := false; exception when others then bon := sqlerrm = 'reserve_associes'; end;
  insert into r values (1, 'Ghali refusé', bon);
  -- Hamza voit, ne modifie pas
  j := orga.parts_associes(th, 2031);
  insert into r values (2, 'Hamza voit les trois parts', jsonb_array_length(j->'associes') = 3 and not (j->>'peut_modifier')::boolean);
  begin perform orga.parts_evt_maj(th, 'EV-PA1', '{"apporteur":"Hamza"}'); bon := false; exception when others then bon := sqlerrm = 'reserve_editeur_parts'; end;
  insert into r values (3, 'Hamza ne modifie pas', bon);
  -- Sans agence : marge = 100 000 − 5 % apporteur − 5 % opérateurs − coût ; charité 2,5 % de la marge ; reste partagé
  j := (select x from jsonb_array_elements(j->'evenements') x where x->>'id' = 'EV-PA1');
  insert into r values (4, 'marge et opérateurs à choisir', (j->>'marge')::numeric = 90000 - (j->>'cout')::numeric and (j->'operateurs'->>'a_attribuer')::boolean and j->'apporteur'->>'qui' = 'Ghali');
  insert into r values (5, 'parts 37,5 / 37,5 / 25 du reste', (j->'parts'->>'Hamza')::numeric = round((j->>'reste')::numeric * .375) and (j->'parts'->>'Salmane')::numeric = round((j->>'reste')::numeric * .25) and (j->>'reste')::numeric = (j->>'marge')::numeric - round((j->>'marge')::numeric * .025));
  -- Virement : commissions seulement, lues dans la note ; le reste reste dans Epicure
  j := orga._parts_evt('EV-PA2'::text);
  insert into r values (6, 'virement : pas de partage', (j->'parts'->>'Hamza')::numeric = 2500 and (j->'parts'->>'Soufiane Hadni')::numeric = 2500 and (j->'parts'->>'Salmane')::numeric = 5000 and (j->>'epicure')::numeric > 0);
  -- Salmane règle : opérateurs, réinvestissement en MAD
  j := orga.parts_evt_maj(ts, 'EV-PA1', '{"operateurs":["Salmane"],"allocations":{"reinvest":{"mad":10000}}}');
  insert into r values (7, 'réglage appliqué', (j->'parts'->>'Salmane')::numeric = 5000 + round((j->>'reste')::numeric * .25) and (j->'allocations'->'reinvest'->>'montant')::numeric = 10000);
  -- Versement puis annulation
  j := orga.parts_verser(ts, '{"associe":"Hamza","montant":15000,"le":"2031-06-02","annee":2031}');
  insert into r values (8, 'versement compté', (select (a->>'verse')::numeric from jsonb_array_elements(j->'associes') a where a->>'nom' = 'Hamza') = 15000);
  j := orga.parts_verser(ts, jsonb_build_object('annuler', (j->'versements'->0->>'id')::bigint, 'annee', 2031));
  insert into r values (9, 'versement annulé', (select (a->>'verse')::numeric from jsonb_array_elements(j->'associes') a where a->>'nom' = 'Hamza') = 0);
  raise exception 'RESULTATS % / % : %', (select count(*) from r where r.ok), (select count(*) from r),
    coalesce((select string_agg(n || ' ' || quoi, ' ; ') from r where not r.ok), 'tout passe');
end $$;
