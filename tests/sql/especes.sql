-- Tests du circuit des espèces (v68) : besoin proposé, lancer, préparer (taux du fournisseur), valider (frais au chiffrage), reçu (écart),
-- remettre (pas plus que ce qu'Amina a), confirmer ou non, droits de l'équipe. Finit par une erreur volontaire : rien n'est gardé.
-- Résultat attendu : « RESULTATS 21 / 21 : tout passe ».
do $$
declare z timestamptz := now(); ts uuid := gen_random_uuid(); ta uuid := gen_random_uuid(); tg uuid := gen_random_uuid(); tq uuid := gen_random_uuid();
  j jsonb; rid bigint; mid bigint; refuse boolean;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  update orga.parametres set valeur = valeur || '{"actif":true,"ouvert_equipe":false,"testeurs":["Salmane","Amina Hadni","Ghali"]}' where cle = 'notifs';
  update orga.parametres set valeur = valeur || '{"fournisseurs":[{"nom":"Relais A","taux":6}]}' where cle = 'especes';
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet'), (ta, 'Amina Hadni', now() + interval '1 hour', 'complet'),
    (tg, 'Ghali', now() + interval '1 hour', 'complet'), (tq, 'Ouadia', now() + interval '1 hour', 'complet');
  insert into orga.evenements (id, nom, date, invites, entite, statut, prix_signe, intermediaire, equipe) values ('EV-TS', 'Mariage Cash', current_date + 20, 100, 'Epicure', 'Confirmé', 100000, 'Agence X', '{"coordination":"Ghali"}');
  insert into orga.chiffrages (evenement_id, lignes) values ('EV-TS', '[{"param":"s_chef_rang","groupe":"staff","quantite":1,"prix":10000},{"param":"s_repas","groupe":"frais_staff","quantite":1,"prix":2000},{"param":"d_petits_achats","groupe":"divers","quantite":1,"prix":500},{"zone":"Menu","element":"Viande","quantite":1,"prix":9000}]')
  on conflict (evenement_id) do update set lignes = excluded.lignes;

  j := orga.especes_evt(ts, 'EV-TS');
  insert into r values (1, 'besoin proposé par catégorie', (select jsonb_object_agg(x->>'cat', (x->>'montant')::numeric) from jsonb_array_elements(j->'proposition') x) = '{"staff":10000,"commissions":10000,"repas_transport":2000,"petits_achats":500}'::jsonb);
  j := orga.especes_lancer(ts, 'EV-TS', j->'proposition');
  select id into rid from orga.especes_relais where evenement_id = 'EV-TS';
  insert into r select 2, 'lancé : 22 500, commission 5 % du cash', besoin = 22500 and commission = 1125 and virement = 23625 and statut = 'a_preparer' from orga.especes_relais where id = rid;
  insert into r values (3, 'Amina prévenue', exists (select 1 from orga.alertes_envoyees where cle = 'ES|' || rid || '|Amina Hadni'));
  j := orga.especes_preparer(ta, rid, 'Relais A');
  insert into r select 4, 'taux du fournisseur (6 %)', taux = 6 and commission = 1350 and virement = 23850 and statut = 'a_valider' from orga.especes_relais where id = rid;
  insert into r values (5, 'Salmane doit valider', exists (select 1 from orga.alertes_envoyees where cle like 'EV|' || rid || '|Salmane|%'));
  begin perform orga.especes_valider(tq, rid, true, null); refuse := false; exception when others then refuse := true; end;
  insert into r values (6, 'l''équipe ne valide pas', refuse);
  j := orga.especes_valider(ts, rid, true, null);
  insert into r select 7, 'frais d''espèces au chiffrage', exists (select 1 from jsonb_array_elements((select lignes from orga.chiffrages where evenement_id = 'EV-TS')) x where x->>'uid' = 'especes_' || rid and (x->>'prix')::numeric = 1350);
  insert into r values (8, 'noté au journal du chiffrage', exists (select 1 from orga.chiffrage_journal where evenement_id = 'EV-TS' and source = 'especes'));
  j := orga.especes_recu(ta, rid, 22000);
  insert into r select 9, 'écart de 500 signalé', ecart = 500 and statut = 'recu' from orga.especes_relais where id = rid;
  insert into r values (10, 'Salmane prévenu de l''écart', exists (select 1 from orga.alertes_envoyees where cle = 'EC|' || rid));
  insert into r values (11, 'l''enveloppe d''Amina = reçu', orga._reste('EV-TS', 'Amina Hadni') = 22000);
  j := orga.especes_remettre(ta, rid, 'Ghali', 10000);
  select max(id) into mid from orga.mouvements_esp where relais_id = rid and type = 'transfert_in';
  insert into r values (12, 'remis : pas compté avant confirmation', orga._reste('EV-TS', 'Ghali') = 0 and orga._reste('EV-TS', 'Amina Hadni') = 12000);
  insert into r values (13, 'Ghali prévenu', exists (select 1 from orga.alertes_envoyees where cle = 'TR|' || mid));
  perform orga.especes_confirmer(tg, mid, true);
  insert into r values (14, 'confirmé : compté chez Ghali', orga._reste('EV-TS', 'Ghali') = 10000);
  begin perform orga.especes_remettre(ta, rid, 'Ghali', 13000); refuse := false; exception when others then refuse := true; end;
  insert into r values (15, 'pas plus que ce qu''Amina a', refuse);
  j := orga.especes_remettre(ta, rid, 'Ghali', 2000);
  select max(id) into mid from orga.mouvements_esp where relais_id = rid and type = 'transfert_in';
  perform orga.especes_confirmer(tg, mid, false);
  insert into r values (16, 'pas reçu : l''argent revient chez Amina', orga._reste('EV-TS', 'Amina Hadni') = 12000 and orga._reste('EV-TS', 'Ghali') = 10000);
  begin perform orga.especes_evt(tq, 'EV-TS'); refuse := false; exception when others then refuse := true; end;
  insert into r values (17, 'l''équipe ne voit pas l''écran espèces', refuse);
  j := orga.mes_especes(ta);
  insert into r values (18, 'Amina voit sa tâche', jsonb_array_length(j->'taches') = 1);
  insert into r values (19, 'titres ≤ 28', not exists (select 1 from orga.alertes_envoyees where cree_le >= z and length(titre) > 28));
  begin perform orga.especes_ecart_regler(tq, rid); refuse := false; exception when others then refuse := true; end;
  insert into r values (20, 'l''équipe ne règle pas l''écart', refuse);
  j := orga.especes_ecart_regler(ts, rid);
  insert into r select 21, 'écart réglé par Salmane', ecart_regle from orga.especes_relais where id = rid;
  raise exception 'RESULTATS % / % : %', (select count(*) filter (where r.ok) from r), (select count(*) from r),
    coalesce((select string_agg(r.n || ' ' || r.quoi, ' | ' order by r.n) from r where r.ok is not true), 'tout passe');
end $$;
