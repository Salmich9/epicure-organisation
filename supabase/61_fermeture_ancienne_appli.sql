-- Fusion, étape 7 : l'ancienne appli du dépôt est fermée (son adresse renvoie vers l'appli Epicure, onglet Dépôt).
-- Ses fonctions ne sont plus appelables avec la clé publique ; la nouvelle appli les appelle de l'intérieur (fonctions orga),
-- donc rien ne change pour elle. Ses sessions ouvertes sont closes. Aucune donnée n'est effacée.
-- (migration orga_61_fermeture_ancienne_appli)
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('verify_pin', 'set_user_pin', 'enregistrer_achat', 'annuler_achat', 'annuler_prelevement', 'corriger_motif_ecart',
             'validate_event_returns', 'validate_inventory', 'get_dashboard_stats', 'depot_session_ok', 'depot_deconnexion', 'recalculate_average_cost') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop; end $$;
update public.depot_sessions set expire_le = now() where expire_le > now() and token not in (select jeton from orga.depot_pont);
