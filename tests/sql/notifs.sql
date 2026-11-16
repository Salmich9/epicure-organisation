-- Tests des rappels. Tout le script finit par une erreur volontaire qui porte les résultats : rien n'est jamais gardé.
-- Heures en Africa/Casablanca. Le 15/01/2027 Casablanca = UTC+1.
do $$
declare z text := 'Africa/Casablanca';
  c int;
begin
  create temp table r (n int, quoi text, ok boolean) on commit drop;
  update orga.parametres set valeur = valeur || '{"actif":true,"ouvert_equipe":false,"testeurs":["Salmane","Hamza","Ghali","Driss"]}' where cle = 'notifs';
  delete from orga.alertes_envoyees;

  insert into orga.evenements (id, nom, date, entite, statut, lieu, equipe) values
    ('EV-TA', 'Mariage Ahmed', '2027-01-15', 'Epicure', 'Confirmé', 'Jnan', '{"coordination":"Ghali"}'),
    ('EV-TB', 'Soirée Oberoi', '2027-01-15', 'Business Boys', 'Confirmé', 'Oberoi', '{}');
  insert into orga.planning (id, evenement_id, date, heure, titre, qui, suppleant, type, critique, fait) values
    ('PL-T1', 'EV-TA', '2027-01-15', '18:00', 'Tasting cocktail', 'Salmane', 'Hamza', 'tasting', false, false),
    ('PL-T2', 'EV-TA', '2027-01-15', '09:00', 'Montage bar', 'Driss', null, 'montage', false, false),
    ('PL-T3', 'EV-TA', '2027-01-15', '20:00', 'Ouverture du bar', 'Oussama', null, 'ouverture_bar', false, false),
    ('PL-T4', 'EV-TA', '2027-01-15', '18:00', 'Déjà fait', 'Salmane', null, 'tasting', false, true),
    ('PL-T5', 'EV-TB', '2027-01-15', '18:00', 'Tasting', 'Salmane', null, 'tasting', false, false),
    ('PL-T6', 'EV-TA', '2027-01-15', '01:00', 'Retour dépôt', 'Salima', null, null, false, false);

  -- code de l'événement
  insert into r values (1, 'code AHMED1501', (select code from orga.evenements where id = 'EV-TA') = 'AHMED1501');
  -- heure < 06:00 le jour J = le lendemain ; tasting = 15 min ; matin = veille 18 h
  insert into r values (2, 'heure de nuit = lendemain', (select quand from orga._taches_timeline('2027-01-14', '2027-01-16') where id = 'PL-T6') = timestamp '2027-01-16 01:00' at time zone z);
  insert into r values (3, 'tasting : 15 min avant', (select rappel_at from orga._taches_timeline('2027-01-14', '2027-01-16') where id = 'PL-T1') = timestamp '2027-01-15 17:45' at time zone z);
  insert into r values (4, 'tâche du matin : veille 18 h', (select rappel_at from orga._taches_timeline('2027-01-14', '2027-01-16') where id = 'PL-T2') = timestamp '2027-01-14 18:00' at time zone z);
  insert into r values (5, 'défaut : 30 min avant', (select rappel_at from orga._taches_timeline('2027-01-14', '2027-01-16') where id = 'PL-T3') = timestamp '2027-01-15 19:30' at time zone z);

  perform orga._notifs_passage(timestamp '2027-01-14 18:00' at time zone z);
  insert into r values (6, 'veille 18 h : Driss prévenu', exists (select 1 from orga.alertes_envoyees where cle = 'R|PL-T2|Driss'));

  perform orga._notifs_passage(timestamp '2027-01-15 17:44' at time zone z);
  insert into r values (7, 'rien avant l''heure du rappel', not exists (select 1 from orga.alertes_envoyees where planning_id = 'PL-T1'));

  perform orga._notifs_passage(timestamp '2027-01-15 17:45' at time zone z);
  insert into r values (8, 'responsable et suppléant reçoivent', (select count(*) from orga.alertes_envoyees where cle in ('R|PL-T1|Salmane', 'R|PL-T1|Hamza')) = 2);
  insert into r values (9, 'titre ≤ 28 et « dans 15 min »', (select titre from orga.alertes_envoyees where cle = 'R|PL-T1|Salmane') = 'Tasting cocktail dans 15 min');
  insert into r values (10, 'code + société dans la notif', (select corps from orga.alertes_envoyees where cle = 'R|PL-T5|Salmane') like 'OBEROI1501 · Oberoi · Business Boys%');
  insert into r values (11, 'deux événements le même jour : deux rappels', (select count(*) from orga.alertes_envoyees where dest = 'Salmane' and cle like 'R|%') = 2);
  insert into r values (12, 'tâche cochée : rien', not exists (select 1 from orga.alertes_envoyees where planning_id = 'PL-T4'));
  insert into r values (13, 'pas de compte, pas de notif', not exists (select 1 from orga.alertes_envoyees where dest not in ('Salmane', 'Hamza', 'Ghali', 'Driss')));
  select count(*) into c from orga.alertes_envoyees;
  perform orga._notifs_passage(timestamp '2027-01-15 17:46' at time zone z);
  insert into r values (14, 'un rappel dit une fois', (select count(*) from orga.alertes_envoyees) = c);

  -- heure changée et tâche réaffectée après le rappel
  update orga.planning set heure = '18:30' where id = 'PL-T1';
  update orga.planning set qui = 'Driss' where id = 'PL-T5';
  perform orga._notifs_passage(timestamp '2027-01-15 17:50' at time zone z);
  insert into r values (15, 'changement d''heure annoncé', (select corps from orga.alertes_envoyees where cle = 'C|PL-T1|Salmane') like 'Passé à 18 h 30%');
  insert into r values (16, 'réaffectée : l''ancien est prévenu', (select titre from orga.alertes_envoyees where cle = 'C|PL-T5|Salmane') like 'Plus pour toi%');
  select count(*) into c from orga.alertes_envoyees;
  perform orga._notifs_passage(timestamp '2027-01-15 17:51' at time zone z);
  insert into r values (17, 'changement dit une fois', (select count(*) from orga.alertes_envoyees) = c);

  -- en retard : 15 min après, une seule fois, coordinateur compris
  perform orga._notifs_passage(timestamp '2027-01-15 18:44' at time zone z);
  insert into r values (18, 'pas de retard avant 15 min', not exists (select 1 from orga.alertes_envoyees where cle like 'L|PL-T1|%'));
  perform orga._notifs_passage(timestamp '2027-01-15 18:45' at time zone z);
  insert into r values (19, 'retard : responsable, suppléant, coordinateur', (select count(*) from orga.alertes_envoyees where cle like 'L|PL-T1|%') = 3);
  select count(*) into c from orga.alertes_envoyees where cle like 'L|%';
  perform orga._notifs_passage(timestamp '2027-01-15 18:50' at time zone z);
  insert into r values (20, 'retard dit une fois', (select count(*) from orga.alertes_envoyees where cle like 'L|%') = c);

  -- tâche critique pas cochée : le coordinateur
  perform orga._notifs_passage(timestamp '2027-01-15 20:00' at time zone z);
  insert into r values (21, 'critique pas cochée : coordinateur prévenu', exists (select 1 from orga.alertes_envoyees where cle = 'K|PL-T3|Ghali'));

  -- rappel en retard de plus de 10 min : silence
  update orga.planning set heure = '23:00', type = null where id = 'PL-T4';
  update orga.planning set fait = false where id = 'PL-T4';
  perform orga._notifs_passage(timestamp '2027-01-15 22:41' at time zone z);
  insert into r values (22, 'rappel manqué de 11 min : silence', not exists (select 1 from orga.alertes_envoyees where cle = 'R|PL-T4|Salmane'));

  -- heures calmes : hors veille-lendemain de l'événement, rien
  insert into orga.evenements (id, nom, date, entite, statut) values ('EV-TC', 'Gala Loin', '2027-01-20', 'Epicure', 'Confirmé');
  insert into orga.planning (id, evenement_id, date, heure, titre, qui) values ('PL-T7', 'EV-TC', '2027-01-17', '23:30', 'Repérage', 'Salmane');
  perform orga._notifs_passage(timestamp '2027-01-17 23:00' at time zone z);
  insert into r values (23, 'heures calmes respectées loin de l''événement', not exists (select 1 from orga.alertes_envoyees where planning_id = 'PL-T7'));
  insert into r values (24, 'aucun titre au-delà de 28 caractères', not exists (select 1 from orga.alertes_envoyees where length(titre) > 28));
  insert into r values (25, 'aucun prix dans les notifs de timeline', not exists (select 1 from orga.alertes_envoyees where famille = 'timeline' and (corps ~* 'MAD|prix|marge' or titre ~* 'MAD|prix|marge')));
  raise exception 'RESULTATS % / % : %', (select count(*) filter (where ok) from r), (select count(*) from r),
    coalesce((select string_agg(n || ' ' || quoi, ' | ' order by n) from r where ok is not true), 'tout passe');
end $$;
