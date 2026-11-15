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
    and pg_get_functiondef(p.oid) !~ '_qui\(|_bot_ok\(|from orga.liens'
    and p.proname not in ('connexion', '_moment', '_poste_auto', '_postes_def')
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
  begin perform orga.connexion('ZZTestAdmin', '000000'); raise exception 'ECHEC : mauvais code accepté';
  exception when others then if sqlerrm not like '%code_incorrect%' then raise; end if; end; ok := ok + 1;
  begin perform orga._qui(gen_random_uuid()); raise exception 'ECHEC : faux jeton accepté';
  exception when others then if sqlerrm not like '%session_expiree%' then raise; end if; end; ok := ok + 1;
  tok := (orga.connexion('ZZTestAdmin', '135790')->>'token')::uuid;
  tok_simple := (orga.connexion('ZZTestSimple', '135790')->>'token')::uuid; ok := ok + 1;

  -- 4. Un événement créé reçoit ses enveloppes (4 achats + matière si traiteur)
  ev := orga.evenement_creer(tok, '{"nom":"ZZ Test régression","date":"2030-06-01","invites":100,"prestations":["Boissons","Traiteur"],"entite":"Epicure"}')->>'id';
  v := orga._postes_evt(ev);
  if jsonb_array_length(v) < 7 then raise exception 'ECHEC : % enveloppes au lieu de 7', jsonb_array_length(v); end if; ok := ok + 1;
  if (select (x->>'prevu')::numeric from jsonb_array_elements(v) x where x->>'cle' = 'diner') <> 15000 then raise exception 'ECHEC : prévu dîner ≠ 150 × 100'; end if; ok := ok + 1;

  -- 5. Une ligne louée 10 × 20 engage 200 dans Matériel
  l := orga.ligne_ajouter(tok, ev, '{"poste":"materiel","nom":"ZZ chaises","mode":"louer","qte":10,"prix":20}');
  if (select (x->>'engage')::numeric from jsonb_array_elements(orga._postes_evt(ev)) x where x->>'cle' = 'materiel') <> 200 then raise exception 'ECHEC : engagé matériel ≠ 200'; end if; ok := ok + 1;

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

  -- 9. Suppression : refusée à un non-admin, faite par un admin avec copie en corbeille
  begin perform orga.evenement_supprimer(tok_simple, ev); raise exception 'ECHEC : suppression permise à un non-admin';
  exception when others then if sqlerrm not like '%reserve_admin%' then raise; end if; end; ok := ok + 1;
  perform orga.evenement_supprimer(tok, ev);
  if exists (select 1 from orga.evenements where id = ev) or not exists (select 1 from orga.corbeille where evenement_id = ev and donnees ? 'postes') then
    raise exception 'ECHEC : suppression incomplète'; end if; ok := ok + 1;

  raise exception 'REGRESSION OK (% vérifications)', ok;
end $$;
