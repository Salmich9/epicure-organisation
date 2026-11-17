-- Test v78 : création avec horaires → timeline posée ; ligne retouchée ; changement d'horaires → décalage demandé puis fait.
-- Finit par une erreur volontaire (rien n'est gardé). Attendu (19 h → 2 h, bar + traiteur) : planning=20 deroule=3,
-- montage 15:00, ouverture_bar 18:30, demontage 02:30 au jour J ; après 20 h → 3 h et décalage : montage 14:30 (retouché), ouverture_bar 19:30, demontage 03:30.
do $$
declare ts uuid := gen_random_uuid(); e jsonb; vid text; st jsonb; r text := '';
begin
  insert into orga.sessions (token, nom, expire_le, portee) values (ts, 'Salmane', now() + interval '1 hour', 'complet');
  e := orga.evenement_creer(ts, '{"nom":"TL test","date":"2031-12-20","invites":180,"prestations":["Traiteur","Bar"],"entite":"Epicure","heure_debut":"19h","heure_fin":"2h"}');
  vid := e->>'id';
  r := r || 'debut=' || (e->>'heure_debut') || ' fin=' || (e->>'heure_fin');
  r := r || ' | planning=' || (select count(*) from orga.planning where evenement_id = vid and modele is not null) || ' deroule=' || (select count(*) from orga.deroule where evenement_id = vid and modele is not null);
  r := r || ' | ' || (select string_agg(modele || '@' || date || ' ' || coalesce(heure, '-') || coalesce(' ' || qui, ''), ', ' order by date, heure) from orga.planning where evenement_id = vid and modele in ('tasting','montage','ouverture_bar','demontage','retour','brief','premix'));
  r := r || ' | D: ' || (select string_agg(moment || ' ' || debut || '-' || fin, ', ' order by ordre) from orga.deroule where evenement_id = vid);
  update orga.planning set heure = '14:30' where evenement_id = vid and modele = 'montage';
  perform orga.evenement_maj(ts, vid, '{"heure_debut":"20:00","heure_fin":"03:00"}');
  st := orga.timeline_etat(ts, vid);
  r := r || ' | etat a_decaler=' || (st->>'a_decaler') || ' retouchees=' || (st->>'retouchees');
  st := orga.timeline_action(ts, vid, 'decaler', '{}');
  r := r || ' | apres: ' || (select string_agg(modele || ' ' || heure, ', ' order by heure) from orga.planning where evenement_id = vid and modele in ('montage','ouverture_bar','demontage')) || ' a_decaler=' || (st->>'a_decaler');
  raise exception 'R %', r;
end $$;
