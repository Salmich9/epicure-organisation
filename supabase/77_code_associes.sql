-- 77 · Le code de connexion d'un associé ne peut être refait que par un associé (lui-même ou un autre associé), jamais par un autre administrateur :
--   sinon un administrateur pourrait se donner un code pour le compte d'un associé et voir les parts.
do $$ declare d text := pg_get_functiondef('orga.compte_nouveau_code(uuid,text)'::regprocedure);
  a text := 'c text := orga._code6();' || E'\nbegin\n';
begin
  if d ~ 'reserve_associes' then return; end if;
  if position(a in d) = 0 then raise exception 'compte_nouveau_code a changé'; end if;
  execute replace(d, a, a || $x$  if exists (select 1 from jsonb_array_elements((select valeur->'liste' from orga.parametres where cle = 'associes')) s where s->>'nom' = p_nom)
     and not exists (select 1 from jsonb_array_elements((select valeur->'liste' from orga.parametres where cle = 'associes')) s where s->>'nom' = me) then
    raise exception 'reserve_associes';
  end if;
$x$);
end $$;
