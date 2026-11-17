-- 78 · Timeline générée à la création, d'après le début et la fin de l'événement. Le modèle vit dans Paramètres › Timeline :
--   chaque ligne a son bloc (avant J, jour J équipe, déroulé invités, après), son jour (J−30 à J+5), son accroche (début, fin ou heure fixe)
--   avec un décalage, sa durée, son rôle, « Généré quand » (mêmes conditions que le chiffrage) et « critique ».
--   Les lignes générées sont marquées (modele) ; une ligne bougée à la main est « retouchée » et ne se décale plus.
--   Si la date ou les horaires changent, rien ne bouge seul : l'écran demande « Décaler » ou « Laisser ».

alter table orga.evenements add column if not exists heure_debut text, add column if not exists heure_fin text, add column if not exists timeline jsonb;
alter table orga.planning add column if not exists modele text, add column if not exists retouche boolean not null default false;
alter table orga.deroule add column if not exists modele text, add column if not exists retouche boolean not null default false;

create table if not exists orga.timeline_modele (
  cle text primary key,
  bloc text not null check (bloc in ('avant', 'jourj', 'deroule', 'apres')),
  titre text not null,
  jour int not null default 0 check (jour between -60 and 30),
  ancre text not null default 'debut' check (ancre in ('debut', 'fin', 'fixe', 'aucune')),
  decalage_min int not null default 0,
  heure text check (heure is null or heure ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  duree_min int,
  type text,
  role text,
  quand text[] not null default '{}',
  critique boolean not null default false,
  actif boolean not null default true,
  ordre int not null default 0,
  maj_par text, maj_le timestamptz not null default now()
);
alter table orga.timeline_modele enable row level security;
revoke all on orga.timeline_modele from anon, authenticated;

insert into orga.timeline_modele (cle, bloc, titre, jour, ancre, decalage_min, heure, duree_min, type, role, quand, critique, ordre) values
 ('visite',        'avant',   'Visite technique du lieu',      -15, 'fixe',   0,    '11:00', 60,  'autre',         'coordination', '{}', false, 10),
 ('tasting',       'avant',   'Tasting',                       -10, 'fixe',   0,    '15:00', 90,  'tasting',       'cuisine', '{prestations:traiteur}', true, 20),
 ('menu',          'avant',   'Validation menu et quantités',   -7, 'aucune', 0,    null,    null, 'autre',         'coordination', '{}', false, 30),
 ('commandes',     'avant',   'Commandes fournisseurs',         -5, 'aucune', 0,    null,    null, 'autre',         'achats', '{}', false, 40),
 ('staff',         'avant',   'Confirmation du staff',          -3, 'aucune', 0,    null,    null, 'autre',         'coordination', '{}', false, 50),
 ('premix',        'avant',   'Production des premix',          -2, 'aucune', 0,    null,    null, 'autre',         'bar', '{service:cocktails}', false, 60),
 ('chargement_j1', 'avant',   'Chargement du dépôt',            -1, 'aucune', 0,    null,    null, 'autre',         'production', '{}', false, 70),
 ('brief',         'avant',   'Brief équipe',                   -1, 'fixe',   0,    '18:00', 45,  'briefing',      'coordination', '{}', true, 80),
 ('camion',        'jourj',   'Chargement du camion',            0, 'debut', -360,  null,    45,  'autre',         'production', '{}', false, 110),
 ('depart',        'jourj',   'Départ du dépôt',                 0, 'debut', -300,  null,    null, 'autre',         'production', '{}', false, 120),
 ('montage',       'jourj',   'Montage',                         0, 'debut', -240,  null,    180, 'montage',       'coordination', '{}', true, 130),
 ('mep_cuisine',   'jourj',   'Mise en place cuisine',           0, 'debut', -120,  null,    90,  'autre',         'cuisine', '{prestations:traiteur}', false, 140),
 ('brief_place',   'jourj',   'Briefing sur place',              0, 'debut', -60,   null,    20,  'briefing',      'coordination', '{}', true, 150),
 ('ouverture_bar', 'jourj',   'Ouverture bar',                   0, 'debut', -30,   null,    null, 'ouverture_bar', 'bar', '{prestations:bar}', true, 160),
 ('fermeture_bar', 'jourj',   'Fermeture bar',                   0, 'fin',    0,    null,    null, 'autre',         'bar', '{prestations:bar}', false, 170),
 ('demontage',     'jourj',   'Démontage',                       0, 'fin',    30,   null,    90,  'demontage',     'coordination', '{}', false, 180),
 ('retour',        'jourj',   'Retour dépôt',                    0, 'fin',    120,  null,    null, 'retour_depot',  'production', '{}', false, 190),
 ('d_accueil',     'deroule', 'Accueil',                         0, 'debut',  0,    null,    30,  null, null, '{moments:accueil}', false, 210),
 ('d_cocktail',    'deroule', 'Cocktail dînatoire',              0, 'debut',  0,    null,    90,  null, null, '{moments:cocktail}', false, 220),
 ('d_diner',       'deroule', 'Dîner',                           0, 'debut',  0,    null,    120, null, null, '{moments:diner_assis|buffet}', false, 230),
 ('d_desserts',    'deroule', 'Desserts',                        0, 'debut',  0,    null,    45,  null, null, '{moments:desserts}', false, 240),
 ('d_late',        'deroule', 'Late snack',                      0, 'debut',  0,    null,    30,  null, null, '{moments:late_snack}', false, 250),
 ('inventaire',    'apres',   'Inventaire retour',               1, 'fixe',   0,    '11:00', 90,  'inventaire',    'production', '{}', false, 310),
 ('bilan',         'apres',   'Bilan et pièces',                 2, 'aucune', 0,    null,    null, 'autre',         'coordination', '{}', false, 320),
 ('cloture',       'apres',   'Clôture : solde, pièces, matériel', 5, 'aucune', 0,  null,    null, 'autre',         'coordination', '{}', false, 330)
on conflict (cle) do nothing;

create or replace function orga._hm(t text) returns int language sql immutable set search_path = '' as $$
  select case when trim(t) ~ '^(2[0-3]|[01]?\d)' then
    (substring(trim(t) from '^(2[0-3]|[01]?\d)'))::int * 60 + coalesce(nullif(substring(trim(t) from '^(?:2[0-3]|[01]?\d)\s*[:hH]\s*([0-5]\d)'), '')::int, 0) end
$$;
create or replace function orga._hhmm_min(m int) returns text language sql immutable set search_path = '' as $$
  select lpad((((m % 1440) + 1440) % 1440 / 60)::text, 2, '0') || ':' || lpad((((m % 60) + 60) % 60)::text, 2, '0')
$$;

-- Ce que l'événement répond (devis, sinon ses prestations) : sert à « Généré quand »
create or replace function orga._timeline_reponses(p_evt text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select orga._reponses(coalesce((select c.base from orga.chiffrages c where c.evenement_id = p_evt and c.base is not null), orga._chiffrage_base_defaut(p_evt)))->'reponses'
$$;

create or replace function orga._tient(p_quand text[], r jsonb) returns boolean language plpgsql immutable set search_path = '' as $$
declare c text; k text; vals text[];
begin
  foreach c in array coalesce(p_quand, '{}') loop
    k := split_part(c, ':', 1); vals := string_to_array(split_part(c, ':', 2), '|');
    if not (r ? k) then return false; end if;
    if jsonb_typeof(r->k) = 'array' then
      if not exists (select 1 from jsonb_array_elements_text(r->k) e where e = any(vals)) then return false; end if;
    elsif not ((r->>k) = any(vals)) then return false; end if;
  end loop;
  return true;
end $$;

-- Les lignes calculées pour une date, un début, une fin et des réponses. Une heure après minuit le jour J reste rangée au jour J (comme le planning).
create or replace function orga._timeline_lignes(p_date date, p_debut text, p_fin text, r jsonb, p_equipe jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := orga._hm(p_debut); f int := orga._hm(p_fin); m orga.timeline_modele; t int; out jsonb := '[]'; eq jsonb;
  cur int; dl jsonb := '[]'; tot int := 0; reste int; x jsonb; i int; n int; dt date; h text;
begin
  if p_date is null or d is null or f is null then return '[]'; end if;
  if f <= d then f := f + 1440; end if;
  eq := coalesce((select valeur from orga.parametres where cle = 'equipe_defaut'), '{}') || coalesce(p_equipe, '{}');
  for m in select * from orga.timeline_modele where actif and bloc <> 'deroule' order by ordre loop
    if not orga._tient(m.quand, r) then continue; end if;
    t := case m.ancre when 'debut' then d + m.decalage_min when 'fin' then f + m.decalage_min when 'fixe' then orga._hm(m.heure) end;
    if t is null then dt := p_date + m.jour; h := null;
    elsif m.jour = 0 and t >= 1440 and t < 1440 + 360 then dt := p_date; h := orga._hhmm_min(t);
    else dt := p_date + m.jour + floor(t / 1440.0)::int; h := orga._hhmm_min(t); end if;
    out := out || jsonb_build_object('modele', m.cle, 'bloc', m.bloc, 'titre', m.titre, 'date', dt, 'heure', h, 'duree_min', m.duree_min,
      'type', m.type, 'role', m.role, 'qui', eq->>m.role, 'critique', m.critique);
  end loop;
  -- Le déroulé : les moments retenus, à la suite depuis le début ; le dernier s'étire jusqu'à la fin ; trop longs, ils se resserrent
  select coalesce(jsonb_agg(jsonb_build_object('cle', z.cle, 'titre', z.titre, 'duree', greatest(coalesce(z.duree_min, 30), 5)) order by z.ordre), '[]') into dl
  from orga.timeline_modele z where z.actif and z.bloc = 'deroule' and orga._tient(z.quand, r);
  n := jsonb_array_length(dl);
  if n > 0 then
    tot := (select sum((e->>'duree')::int) from jsonb_array_elements(dl) e);
    cur := d;
    for i in 0 .. n - 1 loop
      x := dl->i;
      reste := case when i = n - 1 then f - cur else round((x->>'duree')::int * least(1.0, (f - d)::numeric / tot)) end;
      out := out || jsonb_build_object('modele', x->>'cle', 'bloc', 'deroule', 'titre', x->>'titre', 'date', p_date, 'heure', orga._hhmm_min(cur), 'fin', orga._hhmm_min(cur + reste), 'duree_min', reste);
      cur := cur + reste;
    end loop;
  end if;
  return out;
end $$;

-- Pose la timeline d'un événement (une seule fois : si des lignes générées existent, rien)
create or replace function orga._timeline_generer(p_evt text, p_qui text) returns int
language plpgsql security definer set search_path = '' as $$
declare ev orga.evenements; l jsonb; x jsonb; n int := 0; o int;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.date is null or ev.heure_debut is null or ev.heure_fin is null then return 0; end if;
  if exists (select 1 from orga.planning where evenement_id = p_evt and modele is not null)
     or exists (select 1 from orga.deroule where evenement_id = p_evt and modele is not null) then return 0; end if;
  l := orga._timeline_lignes(ev.date, ev.heure_debut, ev.heure_fin, orga._timeline_reponses(p_evt), ev.equipe);
  o := coalesce((select max(ordre) from orga.deroule where evenement_id = p_evt), 0);
  for x in select * from jsonb_array_elements(l) loop
    if x->>'bloc' = 'deroule' then
      o := o + 1;
      insert into orga.deroule (evenement_id, ordre, moment, debut, fin, date, modele) values (p_evt, o, x->>'titre', x->>'heure', x->>'fin', (x->>'date')::date, x->>'modele');
    else
      insert into orga.planning (id, evenement_id, date, heure, titre, qui, rappel, source, cree_par, duree_min, type, critique, modele)
      values (orga._next_id('planning', 'PL-'), p_evt, (x->>'date')::date, x->>'heure', x->>'titre', x->>'qui', false, 'timeline', coalesce(p_qui, 'appli'),
              (x->>'duree_min')::int, x->>'type', (x->>'critique')::boolean, x->>'modele');
    end if;
    n := n + 1;
  end loop;
  update orga.evenements set timeline = jsonb_build_object('date', ev.date, 'debut', ev.heure_debut, 'fin', ev.heure_fin, 'le', now()) where id = p_evt;
  return n;
end $$;

-- Une ligne générée bougée à la main devient « retouchée » (un décalage de la timeline la laisse alors à sa place)
create or replace function orga._timeline_retouche() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.modele is null or coalesce(current_setting('orga.timeline', true), '') = 'on' then return new; end if;
  if tg_table_name = 'planning' then
    if new.date is distinct from old.date or new.heure is distinct from old.heure then new.retouche := true; end if;
  else
    if new.debut is distinct from old.debut or new.fin is distinct from old.fin or new.date is distinct from old.date then new.retouche := true; end if;
  end if;
  return new;
end $$;
create or replace trigger t_timeline_retouche before update on orga.planning for each row execute function orga._timeline_retouche();
create or replace trigger t_timeline_retouche before update on orga.deroule for each row execute function orga._timeline_retouche();

-- État pour l'écran Planning : horaires, et ce qu'un décalage changerait
create or replace function orga.timeline_etat(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev orga.evenements; l jsonb; bouge int := 0; ret int := 0;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  if ev.timeline is not null and (ev.timeline->>'date' is distinct from ev.date::text or ev.timeline->>'debut' is distinct from ev.heure_debut or ev.timeline->>'fin' is distinct from ev.heure_fin) then
    l := orga._timeline_lignes(ev.date, ev.heure_debut, ev.heure_fin, orga._timeline_reponses(p_evt), ev.equipe);
    select count(*) filter (where not p.retouche and (p.date::text, coalesce(p.heure, '')) is distinct from (x->>'date', coalesce(x->>'heure', ''))), count(*) filter (where p.retouche)
      into bouge, ret from orga.planning p join jsonb_array_elements(l) x on x->>'modele' = p.modele where p.evenement_id = p_evt;
    bouge := bouge + (select count(*) from orga.deroule dd join jsonb_array_elements(l) x on x->>'modele' = dd.modele
      where dd.evenement_id = p_evt and not dd.retouche and (dd.debut, dd.fin) is distinct from (x->>'heure', x->>'fin'));
  end if;
  return jsonb_build_object('debut', ev.heure_debut, 'fin', ev.heure_fin, 'base', ev.timeline,
    'generees', (select count(*) from orga.planning where evenement_id = p_evt and modele is not null) + (select count(*) from orga.deroule where evenement_id = p_evt and modele is not null),
    'a_decaler', bouge, 'retouchees', ret);
end $$;

-- Générer (événement existant), décaler après un changement, ou laisser tel quel
create or replace function orga.timeline_action(p_token uuid, p_evt text, p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token); ev orga.evenements; l jsonb; x jsonb;   -- l'agent vocal pose aussi la timeline
begin
  if p ? 'debut' or p ? 'fin' then
    update orga.evenements set heure_debut = coalesce(orga._hhmm_min(orga._hm(nullif(p->>'debut', ''))), heure_debut),
      heure_fin = coalesce(orga._hhmm_min(orga._hm(nullif(p->>'fin', ''))), heure_fin) where id = p_evt;
  end if;
  select * into ev from orga.evenements where id = p_evt;
  if p_action = 'generer' then
    perform orga._timeline_generer(p_evt, me);
  elsif p_action = 'decaler' then
    l := orga._timeline_lignes(ev.date, ev.heure_debut, ev.heure_fin, orga._timeline_reponses(p_evt), ev.equipe);
    perform set_config('orga.timeline', 'on', true);
    for x in select * from jsonb_array_elements(l) loop
      update orga.planning set date = (x->>'date')::date, heure = x->>'heure' where evenement_id = p_evt and modele = x->>'modele' and not retouche;
      update orga.deroule set date = (x->>'date')::date, debut = x->>'heure', fin = x->>'fin' where evenement_id = p_evt and modele = x->>'modele' and not retouche;
    end loop;
    perform set_config('orga.timeline', 'off', true);
    update orga.evenements set timeline = coalesce(timeline, '{}') || jsonb_build_object('date', date, 'debut', heure_debut, 'fin', heure_fin, 'le', now()) where id = p_evt;
  elsif p_action = 'laisser' then
    update orga.evenements set timeline = coalesce(timeline, '{}') || jsonb_build_object('date', date, 'debut', heure_debut, 'fin', heure_fin, 'le', now()) where id = p_evt;
  elsif p_action <> 'horaires' then raise exception 'valeur_invalide'; end if;
  return orga.timeline_etat(p_token, p_evt);
end $$;

-- Le modèle, dans les Paramètres (tout le monde de la direction lit, Salmane modifie)
create or replace function orga.timeline_modele_liste(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return jsonb_build_object('peut_modifier', orga._chiffrage_editeur(me), 'equipe', (select valeur from orga.parametres where cle = 'equipe_defaut'),
    'lignes', (select coalesce(jsonb_agg(to_jsonb(m) - 'maj_par' order by m.ordre), '[]') from orga.timeline_modele m));
end $$;

create or replace function orga.timeline_modele_maj(p_token uuid, p_cle text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); k text := nullif(trim(coalesce(p_cle, '')), '');
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  if p ? 'heure' and nullif(p->>'heure', '') is not null and p->>'heure' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'valeur_invalide'; end if;
  if k is null then
    if coalesce(trim(p->>'titre'), '') = '' or coalesce(p->>'bloc', '') not in ('avant', 'jourj', 'deroule', 'apres') then raise exception 'manque_obligatoire'; end if;
    k := 't_' || left(regexp_replace(lower(translate(p->>'titre', 'éèêëàâäîïôöûüçÉÈÀ', 'eeeeaaaiioouucEEA')), '[^a-z0-9]+', '_', 'g'), 30);
    while exists (select 1 from orga.timeline_modele x where x.cle = k) loop k := k || '_'; end loop;
    insert into orga.timeline_modele (cle, bloc, titre, ordre, maj_par) values (k, p->>'bloc', trim(p->>'titre'),
      coalesce((p->>'ordre')::int, (select coalesce(max(x.ordre), 0) + 10 from orga.timeline_modele x where x.bloc = p->>'bloc')), me);
  end if;
  update orga.timeline_modele x set
    titre = coalesce(nullif(trim(p->>'titre'), ''), x.titre),
    bloc = case when p->>'bloc' in ('avant', 'jourj', 'deroule', 'apres') then p->>'bloc' else x.bloc end,
    jour = coalesce((p->>'jour')::int, x.jour),
    ancre = case when p->>'ancre' in ('debut', 'fin', 'fixe', 'aucune') then p->>'ancre' else x.ancre end,
    decalage_min = coalesce((p->>'decalage_min')::int, x.decalage_min),
    heure = case when p ? 'heure' then nullif(p->>'heure', '') else x.heure end,
    duree_min = case when p ? 'duree_min' then nullif(p->>'duree_min', '')::int else x.duree_min end,
    type = case when p ? 'type' then nullif(p->>'type', '') else x.type end,
    role = case when p ? 'role' then nullif(p->>'role', '') else x.role end,
    quand = case when p ? 'quand' then coalesce(array(select jsonb_array_elements_text(p->'quand')), '{}') else x.quand end,
    critique = coalesce((p->>'critique')::boolean, x.critique),
    actif = coalesce((p->>'actif')::boolean, x.actif),
    ordre = coalesce((p->>'ordre')::int, x.ordre),
    maj_par = me, maj_le = now()
  where x.cle = k;
  if not found then raise exception 'introuvable'; end if;
  return orga.timeline_modele_liste(p_token);
end $$;

-- Combien de lignes une création poserait (aperçu de l'écran Nouvel événement)
create or replace function orga.timeline_apercu(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); b jsonb; l jsonb; tr boolean; ba boolean; d date := coalesce((p->>'date')::date, current_date + 30);
begin
  tr := (p->'prestations') ? 'Traiteur'; ba := (p->'prestations') ? 'Bar' or (p->'prestations') ? 'Boissons';
  if not coalesce(tr, false) and not coalesce(ba, false) then tr := true; ba := true; end if;
  b := jsonb_build_object('invites', coalesce((p->>'invites')::int, 0), 'traiteur', tr, 'bar', ba,
    'moments', case when tr then '["cocktail","diner_assis","desserts"]'::jsonb else '[]'::jsonb end, 'hors_marrakech', false);
  l := orga._timeline_lignes(d, p->>'debut', p->>'fin', orga._reponses(b)->'reponses', null);
  return jsonb_build_object('lignes', jsonb_array_length(l),
    'premier', (select min((x->>'date')::date) from jsonb_array_elements(l) x) - d,
    'dernier', (select max((x->>'date')::date) from jsonb_array_elements(l) x) - d);
end $$;

-- La création et la modification prennent le début et la fin ; la création pose la timeline
do $$ declare d text := pg_get_functiondef('orga.evenement_creer(uuid,jsonb)'::regprocedure); begin
  if d ~ 'heure_debut' then return; end if;
  d := replace(d, 'intermediaire, resp, note, cree_par, gamme)', 'intermediaire, resp, note, cree_par, gamme, heure_debut, heure_fin)');
  d := replace(d, $x$then p->>'gamme' end);$x$, $x$then p->>'gamme' end,
          orga._hhmm_min(orga._hm(nullif(p->>'heure_debut', ''))), orga._hhmm_min(orga._hm(nullif(p->>'heure_fin', ''))));
  perform orga._timeline_generer(nid, me);$x$);
  if d !~ '_timeline_generer' or d !~ 'gamme, heure_debut, heure_fin\)' then raise exception 'evenement_creer a changé'; end if;
  execute d;
end $$;

do $$ declare d text := pg_get_functiondef('orga.evenement_maj(uuid,text,jsonb)'::regprocedure); a text := $x$    gamme = case when p ? 'gamme'$x$; begin
  if d ~ 'heure_debut' then return; end if;
  if position(a in d) = 0 then raise exception 'evenement_maj a changé'; end if;
  d := replace(d, a, $x$    heure_debut = case when p ? 'heure_debut' then orga._hhmm_min(orga._hm(nullif(p->>'heure_debut', ''))) else heure_debut end,
    heure_fin = case when p ? 'heure_fin' then orga._hhmm_min(orga._hm(nullif(p->>'heure_fin', ''))) else heure_fin end,
$x$ || a);
  execute d;
end $$;

revoke all on function orga._hm(text), orga._hhmm_min(int), orga._timeline_reponses(text), orga._tient(text[], jsonb), orga._timeline_lignes(date, text, text, jsonb, jsonb),
  orga._timeline_generer(text, text), orga._timeline_retouche() from public, anon, authenticated;
revoke all on function orga.timeline_etat(uuid, text), orga.timeline_action(uuid, text, text, jsonb), orga.timeline_modele_liste(uuid),
  orga.timeline_modele_maj(uuid, text, jsonb), orga.timeline_apercu(uuid, jsonb) from public;
grant execute on function orga.timeline_etat(uuid, text), orga.timeline_action(uuid, text, text, jsonb), orga.timeline_modele_liste(uuid),
  orga.timeline_modele_maj(uuid, text, jsonb), orga.timeline_apercu(uuid, jsonb) to anon, authenticated;
