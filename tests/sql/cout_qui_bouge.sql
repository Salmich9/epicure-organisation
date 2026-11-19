-- Test v81 : le coût qui bouge. À lancer dans le MÊME appel qu'après le contenu de supabase/81_cout_qui_bouge.sql
-- (avant la mise en ligne) ou seul (après). Finit par une erreur volontaire : rien n'est gardé.
-- Scénario : 180 invités, bar + traiteur, 1 bar ; deux postes de test (plancher 3 200 si sol = sable, tapis « à régler » si extérieur).
do $$
declare ts uuid := gen_random_uuid(); ev jsonb; vid text; ap jsonb; r text := ''; ok int := 0; nb int := 0;
        c0 numeric; cp numeric; cn numeric; j jsonb; nmsg int; msg text := ''; nchef int; jt text := '';
begin
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet');
  insert into orga.chiffrage_params (cle, section, groupe, libelle, calcul, valeur, ratio, si, zone, mode, affichage, actif, ordre, a_regler) values
    ('zz_plancher', 'materiel', 'Test v81', 'Plancher', 'fixe', 3200, 1, 'sol:sable', 'Lieu technique et admin', 'location', 'materiel', true, 9990, false),
    ('zz_tapis', 'materiel', 'Test v81', 'Tapis de sol', 'fixe', 0, 1, 'emplacement:exterieur', 'Lieu technique et admin', 'location', 'materiel', true, 9991, true);
  update orga.parametres set valeur = jsonb_set(coalesce(valeur, '{}'), '{testeurs}', coalesce(valeur->'testeurs', '[]') || '["Salmane"]') where cle = 'notifs';
  ev := orga.evenement_creer(ts, '{"nom":"Cout test","date":"2031-11-20","invites":180,"prestations":["Traiteur","Bar"],"entite":"Epicure","heure_debut":"19h","heure_fin":"1h"}');
  vid := ev->>'id';
  ap := orga.chiffrage_apercu(ts, vid, '{"nb_bars":1}');
  perform orga.chiffrage_valider(ts, vid, ap->'lignes', ap->'base', '', null);
  c0 := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));

  -- 1. Pas encore signé : les réponses du cadrage ne changent rien
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"sable"}}');
  nb := nb + 1;
  if orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid)) = c0
     and not exists (select 1 from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage') then ok := ok + 1; else r := r || ' [1 pas signé : a bougé]'; end if;
  update orga.evenements set cadrage = cadrage - 'affine', prix_signe = 250000, statut = 'Confirmé' where id = vid;
  update orga.postes set source = 'manuel', montant = 9999 where evenement_id = vid and cle = 'materiel';

  -- 2. Signé, « extérieur » : le tapis arrive à 0 « à régler », pas de plancher (le sol n'est pas dit)
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur"}}');
  cp := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));
  select changements into j from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage' order by id desc limit 1;
  nb := nb + 1;
  if cp = c0 and exists (select 1 from orga.chiffrages c, jsonb_array_elements(c.lignes) zl where c.evenement_id = vid and zl->>'param' = 'zz_tapis')
     and not exists (select 1 from orga.chiffrages c, jsonb_array_elements(c.lignes) zl where c.evenement_id = vid and zl->>'param' = 'zz_plancher')
     and exists (select 1 from jsonb_array_elements(j->'lignes') zg where zg->>'nom' = 'Tapis de sol' and (zg->>'a_regler')::boolean) then ok := ok + 1;
  else r := r || ' [2 tapis : ' || coalesce(j::text, 'pas de journal') || ']'; end if;

  -- 3. Sol sable : plancher +3 200 ; l'enveloppe matériel corrigée à la main reste et c'est dit
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"sable"}}');
  cn := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));
  select changements into j from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage' order by id desc limit 1;
  nb := nb + 1;
  if cn - cp = 3200 and (select montant from orga.postes where evenement_id = vid and cle = 'materiel') = 9999
     and exists (select 1 from jsonb_array_elements(j->'lignes') zg where zg->>'nom' like 'Enveloppe matériel%' and (zg->>'garde')::boolean and (zg->>'delta')::numeric = 3200)
  then ok := ok + 1; else r := r || ' [3 plancher : ' || (cn - cp) || ' ' || coalesce(j::text, '') || ']'; end if;
  cp := cn;

  -- 4. Correction du devis : 1 → 2 bars ; « Repris du devis » montre toujours 1 ; la base du chiffrage dit 2
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"sable","nb_bars":2}}');
  cn := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));
  select changements into j from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage' order by id desc limit 1;
  nb := nb + 1;
  if cn > cp and exists (select 1 from jsonb_array_elements(j->'lignes') zg where zg->>'nom' = 'Chef de bar' and (zg->>'delta')::numeric = 1500)
     and (select base->>'nb_bars' from orga.chiffrages where evenement_id = vid) = '2'
     and (select base #>> '{_avant_cadrage,nb_bars}' from orga.chiffrages where evenement_id = vid) = '1'
     and (orga.cadrage_contexte(ts, vid) #>> '{base,nb_bars}') = '1'
  then ok := ok + 1; else r := r || ' [4 bars : ' || (cn - cp) || ' ' || coalesce(j::text, '') || ']'; end if;
  cp := cn;

  -- 5. Chef de bar retouché à la main (🔒), 2 → 3 bars : il est gardé et signalé, le reste suit
  update orga.chiffrages set lignes = (select jsonb_agg(case when zl->>'param' = 's_chef_bar' then zl || '{"verrou":true}' else zl end order by zo)
                                       from jsonb_array_elements(lignes) with ordinality zt(zl, zo)) where evenement_id = vid;
  select count(*) into nchef from orga.chiffrages c, jsonb_array_elements(c.lignes) zl where c.evenement_id = vid and zl->>'param' = 's_chef_bar';
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"sable","nb_bars":3}}');
  cn := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));
  select changements into j from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage' order by id desc limit 1;
  nb := nb + 1;
  if exists (select 1 from jsonb_array_elements(j->'lignes') zg where zg->>'nom' = 'Chef de bar' and (zg->>'garde')::boolean)
     and nchef = (select count(*) from orga.chiffrages c, jsonb_array_elements(c.lignes) zl where c.evenement_id = vid and zl->>'param' = 's_chef_bar')
  then ok := ok + 1; else r := r || ' [5 verrou : ' || coalesce(j::text, '') || ']'; end if;
  cp := cn;

  -- 6. Sol dur : le plancher part (−3 200)
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"dur","nb_bars":3}}');
  cn := orga._lignes_total((select lignes from orga.chiffrages where evenement_id = vid));
  nb := nb + 1;
  if cn - cp = -3200 then ok := ok + 1; else r := r || ' [6 sol dur : ' || (cn - cp) || ']'; end if;

  -- 7. La même réponse renvoyée (fin du cadrage) ne crée rien
  perform orga.cadrage_maj(ts, vid, '{"affine":{"emplacement":"exterieur","sol":"dur","nb_bars":3},"fait_le":"2031-11-01"}');
  nb := nb + 1;
  if (select count(*) from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage') = 5 then ok := ok + 1;
  else r := r || ' [7 journal : ' || (select count(*) from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage') || ']'; end if;

  select string_agg(titre || ' | ' || coalesce(detail, ''), E'\n' order by id) into jt from orga.chiffrage_journal where evenement_id = vid and source = 'cadrage';

  -- 8. Message à Salmane : rien pendant la séance, un seul message après le calme, puis plus rien
  nb := nb + 1;
  nmsg := orga._notifs_cout(now());
  if nmsg = 0 then ok := ok + 1; else r := r || ' [8 message pendant la séance]'; end if;
  nb := nb + 1;
  nmsg := orga._notifs_cout(now() + interval '11 minutes');
  select titre || E'\n' || corps into msg from orga.alertes_envoyees where cle like 'CT|' || vid || '|%' order by cree_le desc limit 1;
  if nmsg = 1 and msg like 'Coût en hausse' || E'\n' || (select code from orga.evenements where id = vid) || ' · +%' and length(split_part(msg, E'\n', 1)) <= 28
     and msg like '%+' || orga._mt(cn - c0) || ' · marge%' and msg like '%🔒 Chef de bar gardé%' and msg like '%prix à régler%'
  then ok := ok + 1; else r := r || ' [9 message : ' || nmsg || ' ' || coalesce(msg, '-') || ']'; end if;
  nb := nb + 1;
  if orga._notifs_cout(now() + interval '12 minutes') = 0 then ok := ok + 1; else r := r || ' [10 message répété]'; end if;

  -- 9. Le passage et les enveloppes tournent avec les nouveaux morceaux
  perform orga._notifs_enveloppes(now());
  perform orga._notifs_passage(now() + interval '13 minutes');
  nb := nb + 1; ok := ok + 1;

  raise exception E'RESULTATS % / % : %\n%\n--- journal\n%', ok, nb, case when ok = nb then 'tout passe' else r end, msg, jt;
end $$;
