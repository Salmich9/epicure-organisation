-- Tests des propositions du cadrage (v75) : même lieu (orthographe libre), proches (gamme, prestations, ±30 %), désaccord, ancien cadrage traduit.
-- Finit par une erreur volontaire : rien n'est gardé. Résultat attendu : « RESULTATS 8 / 8 : tout passe ».
do $$
declare ts uuid := gen_random_uuid(); j jsonb; p jsonb;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet');
  insert into orga.evenements (id, nom, date, invites, entite, statut, gamme, prestations, lieu, cadrage) values
   ('EV-P0', 'Nouveau', current_date + 30, 200, 'Epicure', 'Confirmé', 'Premium', '{Traiteur,Boissons}', 'Domaine Zéphyr', null),
   ('EV-P1', 'Ancien au même lieu', current_date - 200, 80, 'Epicure', 'Réalisé', 'Classique', '{Traiteur}', 'domaine-zephyr',
     '{"reponses":{"emplacement":"Extérieur","sol":"Gazon","plonge":"Un espace vide"}}'),
   ('EV-P2', 'Proche A', current_date - 100, 180, 'Epicure', 'Réalisé', 'Premium', '{Boissons,Traiteur}', 'Ailleurs 1', '{"affine":{"emplacement":"interieur","theme":"x","cuisine":"rien"}}'),
   ('EV-P3', 'Proche B', current_date - 90, 230, 'Epicure', 'Réalisé', 'Premium', '{Traiteur,Boissons}', 'Ailleurs 2', '{"affine":{"emplacement":"interieur","cuisine":"rien"}}'),
   ('EV-P4', 'Trop gros', current_date - 80, 400, 'Epicure', 'Réalisé', 'Premium', '{Traiteur,Boissons}', 'Ailleurs 3', '{"affine":{"cuisine":"equipee"}}'),
   ('EV-P5', 'Autre gamme', current_date - 70, 200, 'Epicure', 'Réalisé', 'Classique', '{Traiteur,Boissons}', 'Ailleurs 4', '{"affine":{"cuisine":"equipee"}}');
  j := orga.cadrage_contexte(ts, 'EV-P0');
  p := j->'propositions';
  insert into r values (1, 'même lieu malgré l''orthographe', p->'sol'->>'source' = 'lieu' and p->'sol'->>'valeur' = 'gazon');
  insert into r values (2, 'ancien libellé traduit', p->'plonge'->>'valeur' = 'espace');
  insert into r values (3, 'le lieu gagne le désaccord', p->'emplacement'->>'valeur' = 'exterieur' and p->'emplacement'->'autre'->>'valeur' = 'interieur');
  insert into r values (4, 'proches : gamme, prestations, ±30 %', p->'cuisine'->>'source' = 'proches' and p->'cuisine'->>'valeur' = 'rien' and p->'cuisine'->>'pourquoi' = '2 événements proches sur 2');
  update orga.chiffrage_params set valeur = 3 where cle = 'r_proche_min';
  insert into r values (5, 'minimum de proches respecté', not (orga.cadrage_contexte(ts, 'EV-P0')->'propositions' ? 'cuisine'));
  update orga.chiffrage_params set valeur = 2 where cle = 'r_proche_min';
  update orga.chiffrage_params set valeur = 0 where cle = 'r_proche_gamme';
  insert into r values (6, 'sans critère de gamme, plus de proches', (orga.cadrage_contexte(ts, 'EV-P0')->'propositions'->'cuisine'->>'pourquoi') = '2 événements proches sur 3');
  insert into r values (7, 'pas de proposition pour du texte', not (p ? 'theme'));
  insert into r values (8, 'lieux connus sans doublon', (select count(*) from jsonb_array_elements_text(orga.lieux_connus(ts)) x where orga._cle_lieu(x) = 'domainezephyr') = 1);
  raise exception 'RESULTATS % / % : %', (select count(*) from r where ok), (select count(*) from r),
    coalesce((select string_agg(n || ' ' || quoi, ' ; ') from r where not ok), 'tout passe');
end $$;
