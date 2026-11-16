-- Tests des enveloppes (v67). Un seul bloc qui finit par une erreur volontaire portant les résultats : rien n'est gardé.
do $$
declare z timestamptz := now(); pid bigint; c int; f text;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  update orga.parametres set valeur = valeur || '{"actif":true,"ouvert_equipe":false,"testeurs":["Salmane","Ghali","Ouadia"]}' where cle = 'notifs';
  insert into orga.evenements (id, nom, date, invites, entite, statut, equipe) values ('EV-TE', 'Mariage Envel', current_date + 20, 100, 'Epicure', 'Confirmé', '{"coordination":"Ghali"}');
  update orga.postes set retire = true where evenement_id = 'EV-TE';
  insert into orga.postes (evenement_id, cle, type, nom, prix_couvert, montant, resp, ordre) values
    ('EV-TE', 'cocktail', 'matiere', 'Cocktail', 20, null, 'Ouadia', 1), ('EV-TE', 'diner', 'matiere', 'Dîner', 60, null, 'Ouadia', 2),
    ('EV-TE', 'materiel', 'achat', 'Matériel', null, 5000, 'Ghali', 3)
  on conflict (evenement_id, cle) do update set type = excluded.type, nom = excluded.nom, prix_couvert = excluded.prix_couvert, montant = excluded.montant, resp = excluded.resp, retire = false, source = 'manuel';
  insert into orga.elements (id, evenement_id, zone, element, poste) values ('EL-TE1', 'EV-TE', 'Menu', 'Viande', 'diner'), ('EL-TE2', 'EV-TE', 'Art de table', 'Assiettes', 'materiel');

  insert into r select 1, 'cuisine = une enveloppe, 2 moments, 8 000', (select count(*) = 1 and min(prevu) = 8000 and jsonb_array_length(min(detail::text)::jsonb) = 2 from orga._env_groupes('EV-TE') where grp = 'matiere');
  -- validation du budget (comme budget_valider)
  update orga.evenements set budget_valide_le = z - interval '1 minute' where id = 'EV-TE';
  update orga.postes po set envoye = (x->>'prevu')::numeric from jsonb_array_elements(orga._postes_evt('EV-TE')) x where po.evenement_id = 'EV-TE' and po.cle = x->>'cle';

  -- un achat rangé par l'IA
  insert into orga.pieces (evenement_id, depose_par, fournisseur, type, montant, date_piece, statut, source) values ('EV-TE', 'Ouadia', 'Boucherie', 'FACTURE', 3000, current_date, 'rangee', 'bot') returning id into pid;
  insert into r values (2, 'rangé par l''IA', orga._piece_ranger(pid, 'EL-TE1'));
  insert into r select 3, 'à vérifier après l''IA', a_verifier and impute_par = 'IA' from orga.pieces where id = pid;
  perform orga._notifs_enveloppes(z);
  select facture_id into f from orga.pieces where id = pid;
  insert into r select 4, 'notif d''achat au responsable', exists (select 1 from orga.alertes_envoyees where cle = 'AA|' || f || '|Ouadia' and titre = 'Achat 3 000 · cuisine' and corps like '%reste 5 000 sur 8 000 (37 %)%');
  insert into r select 5, 'pas de notif aux autres', not exists (select 1 from orga.alertes_envoyees where cree_le >= z and dest <> 'Ouadia');
  select count(*) into c from orga.alertes_envoyees where cree_le >= z;
  perform orga._notifs_enveloppes(z);
  insert into r select 6, 'un achat dit une fois', (select count(*) from orga.alertes_envoyees where cree_le >= z) = c;
  -- 80 %
  insert into orga.pieces (evenement_id, depose_par, fournisseur, montant, statut, source) values ('EV-TE', 'Ouadia', 'Marché', 3600, 'rangee', 'bon') returning id into pid;
  perform orga._piece_ranger(pid, 'EL-TE1'); perform orga._notifs_enveloppes(z);
  insert into r select 7, 'alerte à 80 %', exists (select 1 from orga.alertes_envoyees where cle = 'S80|EV-TE|matiere|Ouadia' and titre = 'Cuisine à 82 %');
  -- dépassement : responsable et coordinateur
  insert into orga.pieces (evenement_id, depose_par, fournisseur, montant, statut, source) values ('EV-TE', 'Ouadia', 'Primeur', 2000, 'rangee', 'bot') returning id into pid;
  perform orga._piece_ranger(pid, 'EL-TE1'); perform orga._notifs_enveloppes(z);
  insert into r select 8, 'dépassée : responsable + coordinateur', (select count(*) from orga.alertes_envoyees where cle like 'S100|EV-TE|matiere|%') = 2;
  insert into r select 9, 'montant du dépassement', exists (select 1 from orga.alertes_envoyees where cle = 'S100|EV-TE|matiere|Ouadia' and corps like '%(+600)%');
  -- enveloppe changée
  update orga.postes set prix_couvert = 70 where evenement_id = 'EV-TE' and cle = 'diner';
  perform orga._notifs_enveloppes(z);
  insert into r select 10, 'enveloppe changée annoncée', exists (select 1 from orga.alertes_envoyees where cle like 'CH|EV-TE|matiere|Ouadia|%' and corps like '%8 000 → 9 000%');
  select count(*) into c from orga.alertes_envoyees where cle like 'CH|%';
  perform orga._notifs_enveloppes(z);
  insert into r select 11, 'changement dit une fois', (select count(*) from orga.alertes_envoyees where cle like 'CH|%') = c;
  -- la direction déplace la pièce : plus à vérifier
  update orga.pieces set a_verifier = false where id = pid;
  insert into r select 12, 'achats listés', jsonb_array_length(orga._env_achats('EV-TE', (select lignes from orga._env_groupes('EV-TE') where grp = 'matiere'), '[]')) = 3;
  insert into r values (13, 'aucun prix de vente dans les notifs', not exists (select 1 from orga.alertes_envoyees where cree_le >= z and corps ~* 'prix|marge|vente'));
  insert into r values (14, 'titres ≤ 28', not exists (select 1 from orga.alertes_envoyees where cree_le >= z and length(titre) > 28));
  -- budget pas validé : rien
  update orga.evenements set budget_valide_le = null where id = 'EV-TE';
  insert into orga.pieces (evenement_id, depose_par, fournisseur, montant, statut, source) values ('EV-TE', 'Ouadia', 'Épicier', 500, 'rangee', 'bot') returning id into pid;
  perform orga._piece_ranger(pid, 'EL-TE1');
  select count(*) into c from orga.alertes_envoyees where cree_le >= z;
  perform orga._notifs_enveloppes(z);
  insert into r values (15, 'budget pas validé : silence', (select count(*) from orga.alertes_envoyees where cree_le >= z) = c);
  raise exception 'RESULTATS % / % : %', (select count(*) filter (where ok) from r), (select count(*) from r),
    coalesce((select string_agg(n || ' ' || quoi, ' | ' order by n) from r where ok is not true), 'tout passe');
end $$;
