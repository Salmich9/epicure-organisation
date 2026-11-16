-- 65 · Notifications push : rappels de timeline, mes actions, enveloppes, jour J.
--   Réglages dans orga.parametres (clé 'notifs', interrupteur coupé par défaut, testeurs = Salmane seul au départ).
--   orga.push_abonnements : un téléphone abonné par ligne (RLS fermée, tout passe par la fonction serveur orga-notifs).
--   orga.alertes_envoyees : le journal de ce qui est parti (une alerte dite une fois, redite si le montant monte de 10 %).
--   Les heures sont calculées ici, en Africa/Casablanca, jamais sur le téléphone.

alter table orga.planning add column if not exists duree_min int;
alter table orga.planning add column if not exists suppleant text;
alter table orga.planning add column if not exists type text;
alter table orga.planning add column if not exists critique boolean not null default false;
alter table orga.planning add column if not exists rappel_mode text;        -- null = auto ; '15' | '30' | '60' minutes ; 'veille'
alter table orga.evenements add column if not exists code text;

insert into orga.parametres (cle, valeur) values ('notifs', jsonb_build_object(
  'actif', false, 'ouvert_equipe', false, 'testeurs', jsonb_build_array('Salmane'),
  'familles', jsonb_build_object('actions', true, 'enveloppes', true, 'pieces', false, 'jourj', true, 'timeline', true),
  'heures', jsonb_build_object('debut', 8, 'fin', 22),
  'delais', jsonb_build_object('defaut', 30, 'court', 15, 'types_courts', jsonb_build_array('tasting', 'briefing'), 'matin_avant', '11:00', 'veille', '18:00'),
  'critiques', jsonb_build_array('ouverture_bar', 'retour_depot'),
  'retard_min', 15, 'tolerance_min', 10, 'max_par_passage', 3))
on conflict (cle) do nothing;
insert into orga.parametres (cle, valeur) values ('notifs_secret', to_jsonb(encode(gen_random_bytes(24), 'hex'))) on conflict (cle) do nothing;
insert into orga.parametres (cle, valeur) values ('notifs_verrou', 'null'::jsonb) on conflict (cle) do nothing;

create table if not exists orga.push_abonnements (
  id bigserial primary key,
  nom text not null,                 -- membre de l'appli
  endpoint text not null unique,
  p256dh text not null, auth text not null,
  appareil text, cree_le timestamptz not null default now(), vu_le timestamptz not null default now()
);
alter table orga.push_abonnements enable row level security;

create table if not exists orga.alertes_envoyees (
  cle text primary key,              -- R|tâche|personne, L|…, C|…, K|…, AC|action, ED|evt|porteur…
  dest text not null, famille text not null,
  titre text, corps text, url text, tag text,
  planning_id text, heure_ref timestamptz, montant numeric,
  statut text not null default 'a_envoyer',   -- a_envoyer | envoye | sans_abonnement | echec
  cree_le timestamptz not null default now(), envoye_le timestamptz
);
create index if not exists alertes_envoyees_dest on orga.alertes_envoyees (dest, cree_le desc);
alter table orga.alertes_envoyees enable row level security;

-- Titre de notification : 28 caractères au plus
create or replace function orga._court(t text, n int) returns text language sql immutable set search_path = '' as $$
  select case when length(coalesce(t, '')) <= n then coalesce(t, '') else rtrim(left(t, n - 1)) || '…' end
$$;

-- Code court d'un événement : premier mot distinctif + jour et mois (AHMED3110)
create or replace function orga._code_evt(p_nom text, p_date date) returns text language sql immutable set search_path = '' as $$
  select upper(left(coalesce((select w from regexp_split_to_table(regexp_replace(translate(coalesce(p_nom, ''), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC'), '[^A-Za-z0-9 ]', ' ', 'g'), '\s+') w
                          where length(w) > 2 and lower(w) not in ('mariage', 'soiree', 'evenement', 'evenements', 'anniversaire', 'diner', 'cocktail', 'pax', 'des', 'les', 'et', 'pour', 'chez')
                            and w !~ '^\d+$' limit 1), 'EVT'), 8)) || coalesce(to_char(p_date, 'DDMM'), '')
$$;
create or replace function orga._t_code_evt() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.code is null or new.code = '' or (tg_op = 'UPDATE' and old.code = orga._code_evt(old.nom, old.date) and (new.nom is distinct from old.nom or new.date is distinct from old.date)) then
    new.code := orga._code_evt(new.nom, new.date);
  end if;
  return new;
end $$;
drop trigger if exists t_code_evt on orga.evenements;
create trigger t_code_evt before insert or update of nom, date, code on orga.evenements for each row execute function orga._t_code_evt();
update orga.evenements set code = orga._code_evt(nom, date) where code is null;

-- Le membre de l'appli derrière un prénom écrit dans une tâche (« Amina » → « Amina Hadni » s'il n'y a qu'une Amina)
create or replace function orga._membre_de(p_nom text) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select m.nom from orga.membres m where lower(m.nom) = lower(trim(p_nom))),
                  (select min(m.nom) from orga.membres m where lower(split_part(m.nom, ' ', 1)) = lower(split_part(trim(p_nom), ' ', 1))
                   having count(*) = 1))
  where coalesce(trim(p_nom), '') <> ''
$$;

create or replace function orga._notifs_cfg() returns jsonb language sql stable security definer set search_path = '' as $$
  select valeur from orga.parametres where cle = 'notifs'
$$;

-- Les tâches de timeline datées, avec leur heure réelle et l'heure de leur rappel
create or replace function orga._taches_timeline(p_de date, p_a date) returns table (
  id text, evenement_id text, titre text, type text, qui text, suppleant text, critique boolean, lieu text, fait boolean,
  quand timestamptz, rappel_at timestamptz, code text, entite text, evt_date date, coord text, evt_lieu text)
language sql stable security definer set search_path = '' as $$
  with c as (select orga._notifs_cfg() v),
  t as (
    select p.*, e.code, e.entite, e.date evt_date, e.lieu evt_lieu,
           coalesce(orga._membre_de(e.equipe->>'coordination'), 'Salmane') coord,
           (((p.date + left(p.heure, 5)::time) + case when p.date = e.date and left(p.heure, 5) < '06:00' then interval '1 day' else interval '0' end)
             at time zone 'Africa/Casablanca') quand
    from orga.planning p join orga.evenements e on e.id = p.evenement_id
    where p.heure ~ '^([01]\d|2[0-3]):[0-5]\d' and p.date between p_de and p_a
      and coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé'))
  select t.id, t.evenement_id, t.titre, lower(t.type), t.qui, t.suppleant,
         t.critique or coalesce((c.v->'critiques') ? lower(coalesce(t.type, '')), false), t.lieu, coalesce(t.fait, false), t.quand,
         case
           when t.rappel_mode ~ '^\d+$' then t.quand - make_interval(mins => t.rappel_mode::int)
           when t.rappel_mode = 'veille'
             or (t.rappel_mode is null and not coalesce((c.v #> '{delais,types_courts}') ? lower(coalesce(t.type, '')), false)
                 and (t.quand at time zone 'Africa/Casablanca')::time < coalesce(c.v #>> '{delais,matin_avant}', '11:00')::time)
             then (((t.quand at time zone 'Africa/Casablanca')::date - 1) + coalesce(c.v #>> '{delais,veille}', '18:00')::time) at time zone 'Africa/Casablanca'
           when coalesce((c.v #> '{delais,types_courts}') ? lower(coalesce(t.type, '')), false)
             then t.quand - make_interval(mins => coalesce((c.v #>> '{delais,court}')::int, 15))
           else t.quand - make_interval(mins => coalesce((c.v #>> '{delais,defaut}')::int, 30)) end,
         t.code, t.entite, t.evt_date, t.coord, t.evt_lieu
  from t, c
$$;

-- Qui reçoit : le responsable et son suppléant, seulement s'ils ont un compte ; pendant l'essai, seulement les testeurs
create or replace function orga._dest_ok(p_nom text) returns boolean language sql stable security definer set search_path = '' as $$
  select p_nom is not null and (coalesce((orga._notifs_cfg()->>'ouvert_equipe')::boolean, false) or coalesce((orga._notifs_cfg()->'testeurs') ? p_nom, false))
$$;

create or replace function orga._societe(p_entite text) returns text language sql immutable set search_path = '' as $$
  select case when p_entite = 'Business Boys' then 'Business Boys' else 'Epicure' end
$$;

create or replace function orga._hhmm(t timestamptz) returns text language sql immutable set search_path = '' as $$
  select replace(to_char(t at time zone 'Africa/Casablanca', 'HH24 h MI'), ' h 00', ' h')
$$;

-- Un passage (chaque minute) : décide ce qui part et le note au journal. L'envoi est fait par la fonction serveur.
create or replace function orga._notifs_passage(p_now timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare c jsonb := orga._notifs_cfg(); f jsonb := c->'familles'; loc timestamp := p_now at time zone 'Africa/Casablanca';
        calme boolean; tol interval := make_interval(mins => coalesce((c->>'tolerance_min')::int, 10));
        ret interval := make_interval(mins => coalesce((c->>'retard_min')::int, 15)); n int := 0; x record; d text; k int;
begin
  calme := extract(hour from loc) < coalesce((c #>> '{heures,debut}')::int, 8) or extract(hour from loc) >= coalesce((c #>> '{heures,fin}')::int, 22);

  -- Ma timeline : rappel, changement, en retard, critique pas cochée
  if coalesce((f->>'timeline')::boolean, true) then
    for x in select * from orga._taches_timeline(loc::date - 2, loc::date + 2) t loop
      -- hors de la veille au lendemain de l'événement, les heures calmes s'appliquent
      if calme and not (x.quand at time zone 'Africa/Casablanca')::date between x.evt_date - 1 and x.evt_date + 1 then continue; end if;
      for d in select distinct m from unnest(array[orga._membre_de(x.qui), orga._membre_de(x.suppleant)]) m where orga._dest_ok(m) loop
        if not x.fait and p_now >= x.rappel_at and p_now < x.rappel_at + tol and p_now < x.quand then
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, planning_id, heure_ref)
          values ('R|' || x.id || '|' || d, d, 'timeline',
            orga._court(x.titre, 28 - length(case when x.quand - p_now < interval '3 hours' then ' dans ' || ceil(extract(epoch from x.quand - p_now) / 60)::int || ' min' else ' à ' || orga._hhmm(x.quand) end))
              || case when x.quand - p_now < interval '3 hours' then ' dans ' || ceil(extract(epoch from x.quand - p_now) / 60)::int || ' min' else ' à ' || orga._hhmm(x.quand) end,
            concat_ws(' · ', x.code, coalesce(x.lieu, x.evt_lieu), orga._societe(x.entite)) || E'\nTouche : ouvrir la tâche',
            '/#/tache/' || x.evenement_id || '/' || x.id, 'T' || x.id, x.id, x.quand)
          on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end if;
        -- heure changée après le rappel : une seule notif de changement
        if not x.fait and p_now < x.quand and exists (select 1 from orga.alertes_envoyees a where a.cle = 'R|' || x.id || '|' || d and a.heure_ref <> x.quand) then
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, planning_id, heure_ref)
          values ('C|' || x.id || '|' || d, d, 'timeline', orga._court('Changement : ' || x.titre, 28),
            'Passé à ' || orga._hhmm(x.quand) || E'\n' || concat_ws(' · ', x.code, orga._societe(x.entite)) || E'\nTouche : ouvrir la tâche',
            '/#/tache/' || x.evenement_id || '/' || x.id, 'T' || x.id, x.id, x.quand)
          on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end if;
      end loop;
      -- en retard : une seule fois, au responsable, au suppléant et au coordinateur
      if not x.fait and p_now >= x.quand + ret and p_now < x.quand + ret + interval '1 hour' then
        for d in select distinct m from unnest(array[orga._membre_de(x.qui), orga._membre_de(x.suppleant), x.coord]) m where orga._dest_ok(m) loop
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, planning_id, heure_ref)
          values ('L|' || x.id || '|' || d, d, 'timeline', orga._court('En retard : ' || x.titre, 28),
            concat_ws(' · ', x.code, 'prévu à ' || orga._hhmm(x.quand), coalesce(orga._membre_de(x.qui), x.qui)) || E'\nTouche : ouvrir la tâche',
            '/#/tache/' || x.evenement_id || '/' || x.id, 'T' || x.id, x.id, x.quand)
          on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end loop;
      end if;
      -- tâche critique pas cochée à l'heure : le coordinateur est prévenu (même si la notif du responsable n'est pas arrivée)
      if x.critique and not x.fait and p_now >= x.quand and p_now < x.quand + ret and orga._dest_ok(x.coord) then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, planning_id, heure_ref)
        values ('K|' || x.id || '|' || x.coord, x.coord, 'timeline', orga._court('Pas cochée : ' || x.titre, 28),
          concat_ws(' · ', x.code, coalesce(orga._membre_de(x.qui), x.qui, 'sans responsable'), 'critique') || E'\nTouche : ouvrir la tâche',
          '/#/tache/' || x.evenement_id || '/' || x.id, 'T' || x.id, x.id, x.quand)
        on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    end loop;
    -- tâche retirée, réaffectée ou supprimée après son rappel : une seule notif à l'ancien responsable
    for x in select a.cle, a.dest, a.planning_id, a.titre, p.id pid, p.qui, p.suppleant, p.titre ptitre, e.code, e.entite
             from orga.alertes_envoyees a left join orga.planning p on p.id = a.planning_id left join orga.evenements e on e.id = p.evenement_id
             where a.cle like 'R|%' and a.heure_ref > p_now and orga._dest_ok(a.dest)
               and (p.id is null or a.dest is distinct from orga._membre_de(p.qui) and a.dest is distinct from orga._membre_de(p.suppleant)) loop
      insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, planning_id)
      values ('C|' || x.planning_id || '|' || x.dest, x.dest, 'timeline',
        orga._court(case when x.pid is null then 'Annulé : ' else 'Plus pour toi : ' end || coalesce(x.ptitre, regexp_replace(x.titre, ' (dans|à) .*$', '')), 28),
        concat_ws(' · ', x.code, case when x.pid is not null then 'confié à ' || coalesce(orga._membre_de(x.qui), x.qui, 'personne') end, orga._societe(x.entite)), '/#/aujourdhui', 'T' || x.planning_id, x.planning_id)
      on conflict (cle) do nothing;
      get diagnostics k = row_count; n := n + k;
    end loop;
  end if;

  if calme then return n; end if;

  -- Mes actions : confiée, échéance demain, en retard
  if coalesce((f->>'actions')::boolean, true) then
    for x in select a.*, e.code, e.entite, orga._membre_de(a.resp) m from orga.actions a join orga.evenements e on e.id = a.evenement_id
             where coalesce(a.statut, '') not in ('Fait', 'Annulé') and orga._dest_ok(orga._membre_de(a.resp)) loop
      if x.cree_le > p_now - interval '30 minutes' and x.m is distinct from orga._membre_de(x.cree_par) then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('AC|' || x.id, x.m, 'actions', orga._court('Action pour toi : ' || x.quoi, 28),
          concat_ws(' · ', x.code, 'par ' || x.cree_par, case when x.echeance is not null then 'pour le ' || to_char(x.echeance, 'DD/MM') end) || E'\nTouche : ouvrir',
          '/#/mapart', 'A' || x.id) on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
      if x.echeance = loc::date + 1 and extract(hour from loc) >= 9 then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('AD|' || x.id, x.m, 'actions', orga._court('Demain : ' || x.quoi, 28),
          concat_ws(' · ', x.code, orga._societe(x.entite)) || E'\nTouche : ouvrir', '/#/mapart', 'A' || x.id) on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
      if x.echeance < loc::date and extract(hour from loc) >= 9 then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('AR|' || x.id, x.m, 'actions', orga._court('En retard : ' || x.quoi, 28),
          concat_ws(' · ', x.code, 'prévu le ' || to_char(x.echeance, 'DD/MM')) || E'\nTouche : ouvrir', '/#/mapart', 'A' || x.id) on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    end loop;
  end if;

  -- Enveloppes : dépassement (on doit au porteur) et reste à rendre après l'événement ; le montant de SA propre enveloppe seulement.
  -- « À confirmer » reste sur Telegram (le bot le fait déjà, avec ses boutons) : un seul canal.
  if coalesce((f->>'enveloppes')::boolean, true) then
    for x in select t.evenement_id, t.titulaire, orga._membre_de(t.titulaire) m, orga._reste(t.evenement_id, t.titulaire) reste, e.code, e.entite, e.date
             from (select distinct evenement_id, titulaire from orga.mouvements_esp) t join orga.evenements e on e.id = t.evenement_id
             where coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé') loop
      if not orga._dest_ok(x.m) then continue; end if;
      if x.reste < 0 then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
        values ('ED|' || x.evenement_id || '|' || x.m, x.m, 'enveloppes', 'Enveloppe dépassée',
          concat_ws(' · ', x.code, round(-x.reste) || ' MAD avancés par toi') || E'\nTouche : voir mon enveloppe', '/#/achat-especes/' || x.evenement_id, 'E' || x.evenement_id, -x.reste)
        on conflict (cle) do update set titre = excluded.titre, corps = excluded.corps, montant = excluded.montant, statut = 'a_envoyer', cree_le = now()
          where orga.alertes_envoyees.montant * 1.1 <= excluded.montant;
        get diagnostics k = row_count; n := n + k;
      elsif x.reste > 0 and x.date < loc::date then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
        values ('ER|' || x.evenement_id || '|' || x.m, x.m, 'enveloppes', 'Enveloppe à rendre',
          concat_ws(' · ', x.code, round(x.reste) || ' MAD à rendre') || E'\nTouche : voir mon enveloppe', '/#/achat-especes/' || x.evenement_id, 'E' || x.evenement_id, x.reste)
        on conflict (cle) do update set titre = excluded.titre, corps = excluded.corps, montant = excluded.montant, statut = 'a_envoyer', cree_le = now()
          where orga.alertes_envoyees.montant * 1.1 <= excluded.montant;
        get diagnostics k = row_count; n := n + k;
      end if;
    end loop;
  end if;

  -- Jour J : le matin, chacun reçoit ses tâches du jour ; le coordinateur, le total et le staff affecté
  if coalesce((f->>'jourj')::boolean, true) and extract(hour from loc) >= 8 then
    for x in select e.id, e.code, e.entite, e.lieu, coalesce(orga._membre_de(e.equipe->>'coordination'), 'Salmane') coord,
                    (select count(*) from orga.planning p where p.evenement_id = e.id) nb, (select count(*) from orga.staff_evt s where s.evenement_id = e.id) staff
             from orga.evenements e where e.date = loc::date and coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé') loop
      for d in select distinct m from (select orga._membre_de(p.qui) m from orga.planning p where p.evenement_id = x.id
                                       union select orga._membre_de(p.suppleant) from orga.planning p where p.evenement_id = x.id) z where orga._dest_ok(m) and m <> x.coord loop
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('JJ|' || x.id || '|' || d, d, 'jourj', orga._court('Jour J : ' || (select count(*) from orga.planning p where p.evenement_id = x.id
                  and (orga._membre_de(p.qui) = d or orga._membre_de(p.suppleant) = d)) || ' tâches pour toi', 28),
          concat_ws(' · ', x.code, x.lieu, orga._societe(x.entite)) || E'\nTouche : voir le jour J', '/#/jourj', 'J' || x.id) on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end loop;
      if orga._dest_ok(x.coord) then
        insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
        values ('JJ|' || x.id || '|' || x.coord, x.coord, 'jourj', orga._court('Jour J : ' || x.code, 28),
          concat_ws(' · ', x.nb || ' tâches', x.staff || ' au staff', x.lieu, orga._societe(x.entite)) || E'\nTouche : voir le jour J', '/#/jourj', 'J' || x.id) on conflict (cle) do nothing;
        get diagnostics k = row_count; n := n + k;
      end if;
    end loop;
  end if;
  return n;
end $$;

-- Verrou : un passage ne chevauche pas le suivant (2 minutes au plus)
create or replace function orga._notifs_verrou(p_prendre boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not p_prendre then update orga.parametres set valeur = 'null' where cle = 'notifs_verrou'; return true; end if;
  update orga.parametres set valeur = to_jsonb(now()) where cle = 'notifs_verrou'
    and (valeur = 'null'::jsonb or (valeur #>> '{}')::timestamptz < now() - interval '2 minutes');
  return found;
end $$;

-- Réveil chaque minute par la base (pg_cron) : appelle la fonction serveur avec le secret
create or replace function orga._notifs_reveil() returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://daehifcdzrusxtzhtuxi.supabase.co/functions/v1/orga-notifs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select p.valeur #>> '{}' from orga.parametres p where p.cle = 'notifs_secret')),
    body := '{"action":"passage"}'::jsonb,
    timeout_milliseconds := 55000);
$$;

-- Appelés par la fonction serveur seulement (clé service)
create or replace function orga._notifs_a_envoyer() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('cle', a.cle, 'dest', a.dest, 'titre', a.titre, 'corps', a.corps, 'url', a.url, 'tag', a.tag, 'famille', a.famille,
    'abonnements', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)), '[]') from orga.push_abonnements s where s.nom = a.dest))
    order by a.cree_le), '[]')
  from orga.alertes_envoyees a where a.statut = 'a_envoyer' and a.cree_le > now() - interval '1 hour'
$$;
create or replace function orga._notifs_marquer(p jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p->'faits', '[]')) loop
    update orga.alertes_envoyees set statut = x->>'statut', envoye_le = now() where cle = x->>'cle';
  end loop;
  delete from orga.push_abonnements where id in (select (jsonb_array_elements_text(coalesce(p->'morts', '[]')))::bigint);
  update orga.push_abonnements set vu_le = now() where id in (select (jsonb_array_elements_text(coalesce(p->'vivants', '[]')))::bigint);
end $$;

-- Depuis l'appli
create or replace function orga.push_abonner(p_token uuid, p jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if coalesce(p->>'endpoint', '') !~ '^https://' or coalesce(p #>> '{keys,p256dh}', '') = '' or coalesce(p #>> '{keys,auth}', '') = '' then raise exception 'valeur_invalide'; end if;
  insert into orga.push_abonnements (nom, endpoint, p256dh, auth, appareil) values (me, p->>'endpoint', p #>> '{keys,p256dh}', p #>> '{keys,auth}', left(p->>'appareil', 80))
  on conflict (endpoint) do update set nom = me, p256dh = excluded.p256dh, auth = excluded.auth, appareil = excluded.appareil, vu_le = now();
  return true;
end $$;
create or replace function orga.push_desabonner(p_token uuid, p_endpoint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  delete from orga.push_abonnements where nom = me and (endpoint = p_endpoint or p_endpoint is null);
  return true;
end $$;

-- Mes prochains rappels (chacun ne voit que les siens)
create or replace function orga.mes_rappels(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); loc date := (now() at time zone 'Africa/Casablanca')::date;
begin
  return jsonb_build_object('abonnements', (select count(*) from orga.push_abonnements where nom = me),
    'actif', coalesce((orga._notifs_cfg()->>'actif')::boolean, false), 'pour_moi', orga._dest_ok(me),
    'rappels', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'evt', t.evenement_id, 'titre', t.titre, 'code', t.code, 'quand', t.quand, 'rappel_at', t.rappel_at,
                 'critique', t.critique, 'suppleant', orga._membre_de(t.suppleant) = me) order by t.rappel_at), '[]')
                from orga._taches_timeline(loc - 1, loc + 7) t
                where not t.fait and t.quand > now() and me in (orga._membre_de(t.qui), orga._membre_de(t.suppleant))),
    'envoyes', (select coalesce(jsonb_agg(jsonb_build_object('titre', a.titre, 'le', coalesce(a.envoye_le, a.cree_le), 'statut', a.statut) order by a.cree_le desc), '[]')
                from (select * from orga.alertes_envoyees where dest = me order by cree_le desc limit 10) a));
end $$;

-- La timeline d'un événement vue par la direction : qui sera rappelé, quand, et si c'est parti
create or replace function orga.rappels_evenement(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return (select coalesce(jsonb_object_agg(t.id, jsonb_build_object('rappel_at', t.rappel_at, 'quand', t.quand, 'critique', t.critique, 'fait', t.fait,
      'dest', (select coalesce(jsonb_agg(m), '[]') from unnest(array[orga._membre_de(t.qui), orga._membre_de(t.suppleant)]) m where m is not null),
      'sans_compte', (select coalesce(jsonb_agg(n), '[]') from unnest(array[t.qui, t.suppleant]) n where coalesce(n, '') <> '' and orga._membre_de(n) is null),
      'abonnes', (select coalesce(jsonb_agg(distinct s.nom), '[]') from orga.push_abonnements s where s.nom in (orga._membre_de(t.qui), orga._membre_de(t.suppleant))),
      'envoye', (select max(a.envoye_le) from orga.alertes_envoyees a where a.planning_id = t.id and a.cle like 'R|%' and a.statut = 'envoye'),
      'retard', exists (select 1 from orga.alertes_envoyees a where a.planning_id = t.id and a.cle like 'L|%'))), '{}')
    from orga.evenements e cross join lateral orga._taches_timeline(coalesce(e.date, current_date) - 30, coalesce(e.date, current_date) + 10) t
    where e.id = p_evt and t.evenement_id = p_evt);
end $$;

-- Réglages (direction pour voir, admin pour changer)
create or replace function orga.notifs_reglages(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); adm boolean := coalesce((select admin from orga.membres where nom = me), false);
begin
  if p is not null then
    if not adm then raise exception 'reserve_admin'; end if;
    update orga.parametres set valeur = valeur || (p - 'secret') where cle = 'notifs';
  end if;
  return jsonb_build_object('reglages', orga._notifs_cfg(), 'peut_modifier', adm,
    'abonnes', (select coalesce(jsonb_agg(jsonb_build_object('nom', nom, 'appareils', n)), '[]') from (select nom, count(*) n from orga.push_abonnements group by nom) s),
    'membres', (select coalesce(jsonb_agg(nom order by nom), '[]') from orga.membres),
    'derniers', (select coalesce(jsonb_agg(jsonb_build_object('dest', a.dest, 'titre', a.titre, 'statut', a.statut, 'le', a.cree_le) order by a.cree_le desc), '[]')
                 from (select * from orga.alertes_envoyees order by cree_le desc limit 15) a));
end $$;

-- Le planning garde les nouveaux champs d'une tâche
do $$ declare d text := pg_get_functiondef('orga.planning_enregistrer(uuid,text,text,jsonb)'::regprocedure); begin
  d := replace(d, $x$insert into orga.planning (id, evenement_id, date, heure, titre, qui, lieu, note, rappel, source, cree_par)$x$,
                  $x$insert into orga.planning (id, evenement_id, date, heure, titre, qui, lieu, note, rappel, source, cree_par, duree_min, suppleant, type, critique, rappel_mode)$x$);
  d := replace(d, $x$coalesce((p->>'rappel')::boolean, false), coalesce(p->>'source','manuel'), me);$x$,
                  $x$coalesce((p->>'rappel')::boolean, false), coalesce(p->>'source','manuel'), me,
            nullif(p->>'duree_min','')::int, nullif(p->>'suppleant',''), nullif(p->>'type',''), coalesce((p->>'critique')::boolean, false), nullif(p->>'rappel_mode',''));$x$);
  d := replace(d, $x$      fait   = case when p ? 'fait'   then (p->>'fait')::boolean else fait end$x$,
                  $x$      fait   = case when p ? 'fait'   then (p->>'fait')::boolean else fait end,
      duree_min = case when p ? 'duree_min' then nullif(p->>'duree_min','')::int else duree_min end,
      suppleant = case when p ? 'suppleant' then nullif(p->>'suppleant','') else suppleant end,
      type      = case when p ? 'type' then nullif(p->>'type','') else type end,
      critique  = case when p ? 'critique' then coalesce((p->>'critique')::boolean, false) else critique end,
      rappel_mode = case when p ? 'rappel_mode' then nullif(p->>'rappel_mode','') else rappel_mode end$x$);
  if d !~ 'rappel_mode = case' or d !~ 'duree_min, suppleant, type, critique, rappel_mode\)' then raise exception 'planning_enregistrer a changé'; end if;
  execute d;
end $$;

revoke all on function orga._notifs_passage(timestamptz), orga._notifs_verrou(boolean), orga._notifs_reveil(), orga._notifs_a_envoyer(), orga._notifs_marquer(jsonb),
  orga._taches_timeline(date, date), orga._dest_ok(text), orga._membre_de(text), orga._notifs_cfg() from public, anon, authenticated;
grant execute on function orga._notifs_passage(timestamptz), orga._notifs_verrou(boolean), orga._notifs_a_envoyer(), orga._notifs_marquer(jsonb) to service_role;
grant execute on function orga.push_abonner(uuid, jsonb), orga.push_desabonner(uuid, text), orga.mes_rappels(uuid), orga.rappels_evenement(uuid, text),
  orga.notifs_reglages(uuid, jsonb) to anon, authenticated;

-- Chaque minute ; le passage ne fait rien tant que l'interrupteur est sur Arrêt
select cron.schedule('orga-notifs', '* * * * *', 'select orga._notifs_reveil()');

-- Test : une notif à soi-même, mise au journal comme les autres (part au passage qui suit, tout de suite)
create or replace function orga._notifs_test(p_nom text) returns text language plpgsql security definer set search_path = '' as $$
declare k text := 'TEST|' || p_nom || '|' || extract(epoch from now())::bigint;
begin
  insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
  values (k, p_nom, 'test', 'Test des notifications', 'Si tu lis ceci, ton téléphone est bien abonné.' || E'\nTouche : ouvrir mes rappels', '/#/mes-rappels', 'test');
  return k;
end $$;
revoke all on function orga._notifs_test(text) from public, anon, authenticated;
grant execute on function orga._notifs_test(text) to service_role;
