-- Tests de non-régression de la base (schéma orga).
-- Tout se passe dans une transaction annulée à la fin : rien n'est écrit.
-- Résultat : l'erreur « REGRESSION OK (n vérifications) » si tout passe, sinon « ECHEC : … ».
-- À lancer après chaque migration (SQL editor ou outil execute_sql).
do $$
declare
  ok int := 0; tok uuid; tok_simple uuid; ev text; v jsonb; a jsonb; l jsonb; msg text;
begin
  -- 1. Sécurité : toute fonction appelable sans compte doit vérifier une session, un secret de bot ou un lien
  select string_agg(p.proname, ', ') into msg
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'orga' and has_function_privilege('anon', p.oid, 'execute')
    and pg_get_functiondef(p.oid) !~ '_qui(_voix)?(_direction|_admin)?\(|_bot_ok\(|from orga.liens'
    and p.proname not in ('connexion', 'deconnexion', 'session_voix_fin', '_moment', '_poste_auto', '_postes_def')
    and p.prorettype <> 'trigger'::regtype;
  if msg is not null then raise exception 'ECHEC : fonctions ouvertes sans contrôle : %', msg; end if; ok := ok + 1;

  -- 2. Sécurité : RLS active sur toutes les tables orga, aucune politique ouverte à anon
  select string_agg(c.relname, ', ') into msg from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'orga' and c.relkind = 'r' and not c.relrowsecurity;
  if msg is not null then raise exception 'ECHEC : RLS désactivée sur %', msg; end if; ok := ok + 1;
  select string_agg(tablename, ', ') into msg from pg_policies where schemaname = 'orga' and 'anon' = any(roles);
  if msg is not null then raise exception 'ECHEC : politique ouverte à anon sur %', msg; end if; ok := ok + 1;

  -- 3. Connexion : mauvais code refusé, faux jeton refusé
  insert into orga.membres (nom, pin_hash, admin) values ('ZZTestAdmin', extensions.crypt('135790', extensions.gen_salt('bf')), true),
                                                        ('ZZTestSimple', extensions.crypt('135790', extensions.gen_salt('bf')), false);
  if orga.connexion('ZZTestAdmin', '000000')->>'erreur' is distinct from 'code_incorrect' then raise exception 'ECHEC : mauvais code accepté'; end if; ok := ok + 1;
  -- Verrou : 5 échecs → bloqué, même avec le bon code ; on débloque pour la suite du test
  perform orga.connexion('ZZTestAdmin', '000000'); perform orga.connexion('ZZTestAdmin', '000000'); perform orga.connexion('ZZTestAdmin', '000000'); perform orga.connexion('ZZTestAdmin', '000000');
  if orga.connexion('ZZTestAdmin', '135790')->>'erreur' is distinct from 'compte_bloque' then raise exception 'ECHEC : pas de blocage après 5 échecs'; end if; ok := ok + 1;
  delete from orga.connexion_essais where nom = 'zztestadmin';
  begin perform orga._qui(gen_random_uuid()); raise exception 'ECHEC : faux jeton accepté';
  exception when others then if sqlerrm not like '%session_expiree%' then raise; end if; end; ok := ok + 1;
  tok := (orga.connexion('ZZTestAdmin', '135790')->>'token')::uuid;
  tok_simple := (orga.connexion('ZZTestSimple', '135790')->>'token')::uuid; ok := ok + 1;
  -- Déconnexion : la session ne marche plus
  perform orga.deconnexion(tok_simple);
  begin perform orga._qui(tok_simple); raise exception 'ECHEC : session encore valide après déconnexion';
  exception when others then if sqlerrm not like '%session_expiree%' then raise; end if; end; ok := ok + 1;
  tok_simple := (orga.connexion('ZZTestSimple', '135790')->>'token')::uuid;
  -- Jeton d'appel vocal : accepté pour lire l'événement, refusé ailleurs, et ne crée pas de jeton à son tour
  declare tv uuid := orga.session_voix(tok); begin
    perform orga.donnees(tv, null);
    begin perform orga.aujourdhui(tv); raise exception 'ECHEC : jeton d''appel accepté hors agent vocal';
    exception when others then if sqlerrm not like '%session_expiree%' then raise; end if; end;
    begin perform orga.session_voix(tv); raise exception 'ECHEC : un jeton d''appel en crée un autre';
    exception when others then if sqlerrm not like '%session_expiree%' then raise; end if; end;
  end; ok := ok + 1;

  -- 4. Un événement créé reçoit ses enveloppes (4 achats + matière si traiteur)
  ev := orga.evenement_creer(tok, '{"nom":"ZZ Test régression","date":"2030-06-01","invites":100,"prestations":["Boissons","Traiteur"],"entite":"Epicure"}')->>'id';
  v := orga._postes_evt(ev);
  -- Règles de calcul : une seule source, servie avec les données
  if (orga.donnees(tok, ev)->'regles'->>'imprevus_pct') is null or (orga.accueil(tok)->'regles'->'tva'->>'Epicure') is null then raise exception 'ECHEC : règles absentes des données'; end if; ok := ok + 1;
  if jsonb_array_length(v) < 7 then raise exception 'ECHEC : % enveloppes au lieu de 7', jsonb_array_length(v); end if; ok := ok + 1;
  if (select (x->>'prevu')::numeric from jsonb_array_elements(v) x where x->>'cle' = 'diner') <> 15000 then raise exception 'ECHEC : prévu dîner ≠ 150 × 100'; end if; ok := ok + 1;

  -- 5. Une ligne louée 10 × 20 engage 200 dans Matériel
  l := orga.ligne_ajouter(tok, ev, '{"poste":"materiel","nom":"ZZ chaises","mode":"louer","qte":10,"prix":20}');
  if (select (x->>'engage')::numeric from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = 'materiel') <> 200 then raise exception 'ECHEC : engagé matériel ≠ 200'; end if; ok := ok + 1;

  -- 5 bis. « + Ligne » sur une idée existante : la même ligne est reprise, pas de doublon
  declare nb int := (select count(*) from orga.elements where evenement_id = ev); begin
    perform orga.ligne_ajouter(tok, ev, jsonb_build_object('poste', 'materiel', 'nom', 'ZZ chaises', 'mode', 'louer', 'qte', 10, 'prix', 20, 'element_id', l->>'id'));
    if (select count(*) from orga.elements where evenement_id = ev) <> nb then raise exception 'ECHEC : idée reprise en doublon'; end if;
  end; ok := ok + 1;
  -- 6. Action : coût obligatoire ; engagé +400 ; payée → réel 400
  begin perform orga.action_enregistrer(tok, ev, null, '{"quoi":"ZZ sans coût","qui":"Ouadia","quand":"2030-05-30"}'); raise exception 'ECHEC : action sans coût acceptée';
  exception when others then if sqlerrm not like '%manque_obligatoire%' then raise; end if; end; ok := ok + 1;
  a := orga.action_enregistrer(tok, ev, null, jsonb_build_object('quoi', 'ZZ vernir', 'qui', 'Ouadia', 'quand', '2030-05-30', 'cout', 400, 'poste', 'materiel', 'element_id', l->>'id'));
  if (select (x->>'engage')::numeric from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = 'materiel') <> 600 then raise exception 'ECHEC : engagé matériel ≠ 600 après action'; end if; ok := ok + 1;
  perform orga.action_enregistrer(tok, ev, a->>'id', '{"paye":true}');
  if (select (x->>'reel')::numeric from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = 'materiel') <> 400 then raise exception 'ECHEC : réel matériel ≠ 400 après paiement'; end if; ok := ok + 1;

  -- 7. Correction manuelle d'une enveloppe : gardée même si le chiffrage change
  perform orga.poste_maj(tok, ev, 'staff', '{"montant":12345}');
  update orga.evenements set invites = 120 where id = ev;
  if (select (x->>'prevu')::numeric from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = 'staff') <> 12345 then raise exception 'ECHEC : montant corrigé écrasé'; end if; ok := ok + 1;

  -- 8. Écran Aujourd'hui : l'action apparaît avec le nom de l'événement
  if not exists (select 1 from jsonb_array_elements(orga.aujourdhui(tok)->'actions') y where y->>'id' = a->>'id' and y->>'evt_nom' = 'ZZ Test régression') then
    raise exception 'ECHEC : action absente de Aujourd''hui'; end if; ok := ok + 1;

  -- 8 bis bis. Lot B : jauge, merci, journée
  declare pr jsonb; mj jsonb; begin
    perform orga.action_enregistrer(tok, ev, a->>'id', '{"fait":true}');
    pr := orga._pret(ev);
    if (pr->>'total')::int < 2 or (pr->>'fait')::int < 1 then raise exception 'ECHEC : jauge prêt %', pr; end if;
    if jsonb_array_length(orga.action_merci(tok_simple, a->>'id')) <> 1 or jsonb_array_length(orga.action_merci(tok_simple, a->>'id')) <> 1 then raise exception 'ECHEC : merci'; end if;
    begin perform orga.action_merci(tok, ev); raise exception 'ECHEC : merci sur rien';
    exception when others then if sqlerrm not like '%introuvable%' then raise; end if; end;
    mj := orga.ma_journee(tok);
    if (mj->>'faites')::int < 1 then raise exception 'ECHEC : journée sans la coche'; end if;
    if (orga.accueil(tok)->'evenements'->0) ? 'pret_total' is not true then raise exception 'ECHEC : jauge absente de l''accueil'; end if;
  end; ok := ok + 1;
  -- 8 ter. Compte Équipe : seulement les événements confirmés où il a quelque chose, jamais le prix ni la marge
  declare te uuid; d jsonb; c jsonb; begin
    insert into orga.membres (nom, pin_hash, admin, role) values ('ZZTestEquipe', extensions.crypt('135790', extensions.gen_salt('bf')), false, 'equipe');
    te := (orga.connexion('ZZTestEquipe', '135790')->>'token')::uuid;
    if exists (select 1 from jsonb_array_elements(orga.donnees(te, ev)->'evenements') x where x->>'id' = ev) then raise exception 'ECHEC : événement non confirmé visible par l''équipe'; end if;
    update orga.evenements set statut = 'Confirmé', prix_signe = 50000 where id = ev;
    update orga.postes set resp = 'ZZTestEquipe' where evenement_id = ev and cle = 'materiel';
    d := orga.donnees(te, ev);
    if d->>'evt' <> ev or d->>'role' <> 'equipe' or (select x ? 'prix_signe' from jsonb_array_elements(d->'evenements') x where x->>'id' = ev)
       or (select x->>'prevu' from jsonb_array_elements(d->'postes') x where x->>'cle' = 'staff') is not null
       or (select x->>'prevu' from jsonb_array_elements(d->'postes') x where x->>'cle' = 'materiel') is null
      then raise exception 'ECHEC : filtre équipe sur les données'; end if;
    if exists (select 1 from jsonb_array_elements(orga.accueil(te)->'evenements') x where x ? 'prix_signe') then raise exception 'ECHEC : prix visible sur l''accueil équipe'; end if;
    begin perform orga.especes_liste(te, ev); raise exception 'ECHEC : encaissements ouverts à l''équipe';
    exception when others then if sqlerrm not like '%reserve_direction%' then raise; end if; end;
    begin perform orga.evenement_maj(te, ev, '{"nom":"x"}'); raise exception 'ECHEC : événement modifiable par l''équipe';
    exception when others then if sqlerrm not like '%reserve_direction%' then raise; end if; end;
    begin perform orga.comptes_liste(te); raise exception 'ECHEC : comptes ouverts à l''équipe';
    exception when others then if sqlerrm not like '%reserve_admin%' then raise; end if; end;
    c := orga.compte_creer(tok, 'zz nouveau', 'equipe');
    if c->>'pin' !~ '^\d{6}$' or orga.connexion('Zz Nouveau', c->>'pin')->>'token' is null then raise exception 'ECHEC : création de compte'; end if;
    perform orga.compte_retirer(tok, 'Zz Nouveau');
    if orga.connexion('Zz Nouveau', c->>'pin')->>'erreur' is null then raise exception 'ECHEC : accès retiré encore valable'; end if;
    delete from orga.connexion_essais where nom = 'zz nouveau';
  end; ok := ok + 1;
  -- 8 bis. Menu ⋯ : déplacer, dupliquer, supprimer puis restaurer, enveloppe personnalisée
  declare d text; cid bigint; pc text; begin
    d := orga.objet_dupliquer(tok, 'element', l->>'id');
    perform orga.ligne_deplacer(tok, d, 'consommables');
    if (select poste from orga.elements where id = d) <> 'consommables' then raise exception 'ECHEC : déplacement'; end if;
    cid := orga.objet_supprimer(tok, 'element', d);
    if not exists (select 1 from orga.historique where evenement_id = ev and quoi = 'suppr' and corbeille_id = cid and qui = 'ZZTestAdmin') then raise exception 'ECHEC : suppression absente de l''historique'; end if;
    if not exists (select 1 from jsonb_array_elements(orga.corbeille_liste(tok, ev)) x where (x->>'id')::bigint = cid) then raise exception 'ECHEC : ligne absente de la corbeille'; end if;
    if exists (select 1 from orga.elements where id = d) then raise exception 'ECHEC : ligne non supprimée'; end if;
    perform orga.objet_restaurer(tok, cid);
    if not exists (select 1 from orga.elements where id = d) then raise exception 'ECHEC : ligne non restaurée'; end if;
    begin perform orga.objet_supprimer(tok, 'poste', 'materiel', ev); raise exception 'ECHEC : enveloppe pleine retirée';
    exception when others then if sqlerrm not like '%enveloppe_non_vide%' then raise; end if; end;
    pc := orga.poste_creer(tok, ev, 'ZZ Décoration');
    if not exists (select 1 from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = pc and x->>'nom' = 'ZZ Décoration') then raise exception 'ECHEC : enveloppe perso absente'; end if;
    perform orga.poste_maj(tok, ev, pc, '{"nom":"ZZ Déco"}');
    cid := orga.objet_supprimer(tok, 'poste', pc, ev);
    perform orga.objet_restaurer(tok, cid);
    if not exists (select 1 from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = pc and x->>'nom' = 'ZZ Déco') then raise exception 'ECHEC : enveloppe perso non restaurée'; end if;
  end; ok := ok + 1;

  -- 9. Suppression : refusée à un non-admin, faite par un admin avec copie en corbeille
  begin perform orga.evenement_supprimer(tok_simple, ev); raise exception 'ECHEC : suppression permise à un non-admin';
  exception when others then if sqlerrm not like '%reserve_admin%' then raise; end if; end; ok := ok + 1;
  if not exists (select 1 from jsonb_array_elements(orga.historique(tok, ev)) x where x->>'quoi' = 'ajout' and x->>'nom' = 'ZZ chaises')
     or not exists (select 1 from orga.historique where evenement_id = ev and quoi = 'deplace' and apres = 'Consommables')
     or not exists (select 1 from orga.historique where evenement_id = ev and quoi = 'modif' and champ = 'paye')
     or not exists (select 1 from orga.historique where evenement_id = ev and type = 'evenement' and champ = 'invites' and avant = '100' and apres = '120')
     or exists (select 1 from orga.historique where evenement_id = ev and type = 'poste' and quoi = 'modif' and champ = 'montant' and apres <> '12345')
    then raise exception 'ECHEC : historique incomplet ou bruité'; end if; ok := ok + 1;
  perform orga.evenement_supprimer(tok, ev);
  if exists (select 1 from orga.evenements where id = ev) or not exists (select 1 from orga.corbeille where evenement_id = ev and donnees ? 'postes') then
    raise exception 'ECHEC : suppression incomplète'; end if; ok := ok + 1;

  declare cid bigint; begin
    select id into cid from orga.corbeille where evenement_id = ev and type = 'evenement' and restaure_le is null order by id desc limit 1;
    perform orga.objet_restaurer(tok, cid);
    if not exists (select 1 from orga.evenements where id = ev) or (select count(*) from orga.postes where evenement_id = ev and not retire) < 7
       or not exists (select 1 from orga.elements where evenement_id = ev and element = 'ZZ chaises') or not exists (select 1 from orga.actions where id = a->>'id')
      then raise exception 'ECHEC : événement mal restauré'; end if;
    perform orga.evenement_supprimer(tok, ev);
  end; ok := ok + 1;
  raise exception 'REGRESSION OK (% vérifications)', ok;
end $$;
