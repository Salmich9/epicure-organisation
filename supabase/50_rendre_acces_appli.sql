-- 15/11 : la migration « revoke_anon_orga_functions » (autre session, 17:17 UTC) a retiré à la clé publique l'accès
-- à toutes les fonctions de l'appli Organisation (et le droit par défaut PUBLIC) : l'appli ne chargeait plus rien (401).
-- Accès rendu à la demande de Salmane à toutes les fonctions publiques ; les fonctions internes (« _… ») restent fermées.
-- Chaque fonction ouverte vérifie la session ou le secret du bot (test de régression n°1) ; le test n°12 garde l'accès de l'appli.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'orga' and p.prokind = 'f' and p.proname !~ '^_' and p.prorettype <> 'trigger'::regtype loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
