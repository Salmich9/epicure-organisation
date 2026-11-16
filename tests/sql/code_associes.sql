-- Test v77 : un administrateur non associé ne refait pas le code d'un associé. Finit par une erreur volontaire (rien n'est gardé).
-- Attendu : « Ghali refusé pour Hamza=t · Ghali ok pour Aziz=t · Salmane ok pour Soufiane=t ».
do $$
declare ts uuid := gen_random_uuid(); tg uuid := gen_random_uuid(); b1 boolean; b2 boolean; b3 boolean;
begin
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet'), (tg, 'Ghali', now() + interval '1 hour', 'complet');
  begin perform orga.compte_nouveau_code(tg, 'Hamza'); b1 := false; exception when others then b1 := sqlerrm = 'reserve_associes'; end;
  begin perform orga.compte_nouveau_code(tg, 'Aziz'); b2 := true; exception when others then b2 := false; end;
  begin perform orga.compte_nouveau_code(ts, 'Soufiane Hadni'); b3 := true; exception when others then b3 := false; end;
  raise exception 'RESULTATS Ghali refusé pour Hamza=% · Ghali ok pour Aziz=% · Salmane ok pour Soufiane=%', b1, b2, b3;
end $$;
