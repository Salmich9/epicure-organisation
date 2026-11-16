-- 71 · Chaque réponse agit sur le chiffrage (moteur commun au chiffrage écrit et à l'agent vocal).
--   Nouvelles infos de base : date (glace d'été), heures {debut, fin} (nuit après 2 h, heures sup et 2e repas au-delà de la journée type),
--   nb_bars et comptoir (chef de bar, 2 bartenders minimum, kit bar, comptoir par bar), service [cocktails, verse, shots] et signatures,
--   alcool_client (inventaire), plonge / cuisine / electricite (kits, groupe), fourni [tables, chaises, nappes, vaisselle, verrerie] (poste retiré).
--   Les nouveaux postes sans prix sont à 0 « à régler » : ils apparaissent quand même, avec « prix à régler dans les Paramètres ».
--   Base ancienne (sans ces infos) : même calcul qu'avant, sauf 2 bartenders minimum par bar et la glace d'été si la date tombe de juin à septembre.

alter table orga.chiffrage_params add column if not exists a_regler boolean not null default false;
alter table orga.chiffrage_params add column if not exists fourni_si text;
alter table orga.chiffrage_params add column if not exists min_par_bar numeric;

-- Réglages des postes existants
update orga.chiffrage_params set si = 'cocktails', sous = 'si on sert des cocktails' where cle = 'b_premix';
update orga.chiffrage_params set base = 'bars', sous = '1 par bar' where cle = 's_chef_bar';
update orga.chiffrage_params set min_par_bar = 2, sous = 'au moins 2 par bar' where cle = 's_bartender';
update orga.chiffrage_params set fourni_si = 'vaisselle' where cle = 'x_vaisselle';
update orga.chiffrage_params set fourni_si = 'verrerie' where cle in ('x_verrerie_table', 'b_verrerie');
update orga.chiffrage_params set fourni_si = 'nappes' where cle = 'x_nappage';

-- Nouveaux postes (prix 0 = à régler par Salmane ; aucun prix inventé)
insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, base, valeur, unite, ratio, ratio_unite, si, zone, mode, affichage, actif, ordre, a_regler)
values
 ('b_glace_ete', 'bar', 'Consommables par invité', 'Glace d''été', 'juin à septembre, en plus', 'par_base', 'invites', 4, 'MAD / kg', 2, 'kg par invité', 'ete', 'Bar', 'achat', 'bar', true, 204, false),
 ('b_shots', 'bar', 'Consommables par invité', 'Shots', 'si on sert des shots', 'par_base', 'invites', 0, 'MAD / L', 0.02, 'L par invité', 'shots', 'Bar', 'achat', 'bar', true, 205, true),
 ('b_signature', 'bar', 'Cocktails', 'Création de signature', 'par cocktail signature (4 par défaut)', 'fixe', 'signatures', 0, 'MAD / signature', 1, 'signature', 'cocktails', 'Bar', 'production', 'bar', true, 206, true),
 ('x_kit_bar', 'materiel', 'Bar', 'Kit bar', 'matériel de mixologie, par bar', 'fixe', 'bars', 0, 'MAD / bar', 1, 'bar', 'bar', 'Bar', 'location', 'materiel', true, 525, true),
 ('x_comptoir', 'materiel', 'Bar', 'Comptoir de bar', 'si c''est notre comptoir, par bar', 'fixe', 'bars', 0, 'MAD / bar', 1, 'bar', 'comptoir', 'Bar', 'location', 'materiel', true, 526, true),
 ('s_inventaire', 'staff', 'Bar', 'Inventaire alcool', 'alcool fourni par le client : entrée et sortie', 'fixe', null, 0, 'MAD / jour', 1, 'personne', 'alcool_client', 'Staff', 'production', 'staff', true, 324, true),
 ('x_kit_plonge', 'materiel', 'Cuisine', 'Kit plonge', 'pas de plonge sur place', 'fixe', null, 0, 'MAD', 1, 'forfait', 'plonge_rien', 'Cuisine traiteur', 'location', 'materiel', true, 512, true),
 ('x_kit_cuisine', 'materiel', 'Cuisine', 'Kit cuisine', 'cuisine sur place incomplète', 'fixe', null, 0, 'MAD', 1, 'forfait', 'cuisine_incomplete', 'Cuisine traiteur', 'location', 'materiel', true, 513, true),
 ('x_cuisine_complete', 'materiel', 'Cuisine', 'Cuisine complète', 'rien sur place', 'fixe', null, 0, 'MAD', 1, 'forfait', 'cuisine_rien', 'Cuisine traiteur', 'location', 'materiel', true, 514, true),
 ('x_groupe', 'materiel', 'Technique', 'Groupe électrogène', 'le lieu ne suffit pas en électricité', 'fixe', null, 0, 'MAD', 1, 'forfait', 'groupe_electrogene', 'Lieu technique et admin', 'location', 'materiel', true, 523, true),
 ('s_repas2', 'staff', 'Frais du staff', 'Repas du staff (2e)', 'au-delà de la journée type', 'par_base', 'staff_hors_cuisine', 60, 'MAD / personne', null, null, 'longue', 'Staff', 'achat', 'frais_staff', true, 353, false),
 ('g_nuit', 'staff', 'Horaires', 'Majoration de nuit', 'service après 2 h, sur le staff', 'pct', 'staff_cout', 25, '%', null, null, 'nuit', 'Staff', 'production', 'frais_staff', true, 356, false),
 ('g_heures_sup', 'staff', 'Horaires', 'Heures supplémentaires', 'au-delà de la journée type : cachet ÷ journée × coef', 'heures_sup', 'staff_cout', 1.25, '× l''heure', 8, 'h (journée type)', 'longue', 'Staff', 'production', 'frais_staff', true, 357, false)
on conflict (cle) do nothing;
update orga.chiffrage_params set actif = false, sous = 'remplacé par « Glace d''été » (bar)' where cle = 'q_glace_ete';

-- Durée et heure de fin d'un service : {debut, fin} ou un texte « 19h-2h », « 19:30 à 02:00 »
create or replace function orga._horaires(h jsonb) returns jsonb language plpgsql immutable set search_path = '' as $$
declare t text; m text[]; d numeric; f numeric;
begin
  if h is null or jsonb_typeof(h) = 'null' then return null; end if;
  t := case when jsonb_typeof(h) = 'object' then coalesce(h->>'debut', '') || ' - ' || coalesce(h->>'fin', '') else h #>> '{}' end;
  m := regexp_match(t, '(\d{1,2})\s*(?:[h:.]\s*(\d{2})?)?\D+?(\d{1,2})\s*(?:[h:.]\s*(\d{2})?)?\s*$');
  if m is null then return null; end if;
  d := m[1]::numeric + coalesce(m[2]::numeric, 0) / 60; f := m[3]::numeric + coalesce(m[4]::numeric, 0) / 60;
  if d > 24 or f > 24 then return null; end if;
  return jsonb_build_object('duree', round(((f - d + 24)::numeric % 24), 2), 'fin', f);
end $$;

create or replace function orga._chiffrage_moteur(b jsonb)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare inv numeric := greatest(coalesce(nullif(b->>'invites', '')::numeric, 0), 0);
        m text[] := coalesce(array(select jsonb_array_elements_text(coalesce(b->'moments', '[]'))), '{}');
        al text[] := coalesce(array(select jsonb_array_elements_text(coalesce(b->'alcool', '[]'))), '{}');
        svc text[] := case when jsonb_typeof(b->'service') = 'array' then array(select jsonb_array_elements_text(b->'service')) end;
        fo text[] := case when jsonb_typeof(b->'fourni') = 'array' then array(select jsonb_array_elements_text(b->'fourni')) else '{}' end;
        tr boolean := coalesce((b->>'traiteur')::boolean, false); ba boolean := coalesce((b->>'bar')::boolean, false);
        nbars numeric := greatest(coalesce(nullif(b->>'nb_bars', '')::numeric, 1), 1);
        sig numeric := greatest(coalesce(nullif(b->>'signatures', '')::numeric, 4), 0);
        hr jsonb := orga._horaires(b->'heures'); journee numeric := coalesce((select ratio from orga.chiffrage_params where cle = 'g_heures_sup'), 8);
        fl text[] := array['toujours']; p orga.chiffrage_params; sur jsonb; v numeric; r numeric; nb numeric; bs numeric; px numeric;
        lignes jsonb := '[]'; roles jsonb := '{}'; staff numeric := 0; staff_hc numeric := 0; t_staff numeric := 0;
        t_cout numeric := 0; t_loc numeric := 0; t_mat numeric := 0; i int; pe jsonb; calc text; chaud boolean; mois int;
begin
  fl := fl || m;
  if tr then fl := fl || 'traiteur'::text; end if;
  if ba then fl := fl || 'bar'::text; end if;
  chaud := 'diner_assis' = any(m) or 'buffet' = any(m);
  if chaud then fl := fl || 'repas_chaud'::text; end if;
  if tr and not 'diner_assis' = any(m) then fl := fl || 'service_debout'::text; end if;
  if tr and not chaud then fl := fl || 'cocktail_seul'::text; end if;
  if coalesce((b->>'hors_marrakech')::boolean, false) then fl := fl || 'hors_marrakech'::text; end if;
  if coalesce((b->>'autre_ville')::boolean, false) then fl := fl || 'autre_ville'::text; end if;
  if ba then fl := fl || array(select 'alcool_' || x from unnest(al) x); end if;
  -- Les réponses : ce qu'on sert, l'alcool du client, le comptoir, la saison, les horaires, ce qui manque sur place
  if ba and (svc is null or 'cocktails' = any(svc)) then fl := fl || 'cocktails'::text; end if;
  if ba and 'shots' = any(coalesce(svc, '{}')) then fl := fl || 'shots'::text; end if;
  if ba and coalesce((b->>'alcool_client')::boolean, false) then fl := fl || 'alcool_client'::text; end if;
  if ba and coalesce((b->>'comptoir')::boolean, false) then fl := fl || 'comptoir'::text; end if;
  mois := extract(month from nullif(b->>'date', '')::date);
  if ba and (coalesce((b->>'ete')::boolean, false) or mois between 6 and 9) then fl := fl || 'ete'::text; end if;
  if b->>'plonge' = 'rien' then fl := fl || 'plonge_rien'::text; end if;
  if tr and b->>'cuisine' = 'incomplete' then fl := fl || 'cuisine_incomplete'::text; end if;
  if tr and b->>'cuisine' = 'rien' then fl := fl || 'cuisine_rien'::text; end if;
  if b->>'electricite' = 'groupe' then fl := fl || 'groupe_electrogene'::text; end if;
  if hr is not null and (hr->>'fin')::numeric > 2 and (hr->>'fin')::numeric < 12 then fl := fl || 'nuit'::text; end if;
  if hr is not null and (hr->>'duree')::numeric > journee then fl := fl || 'longue'::text; end if;

  for p in select * from orga.chiffrage_params where actif and calcul <> 'regle' order by ordre loop
    if not p.si = any(fl) then continue; end if;
    if p.seuil is not null and inv < p.seuil then continue; end if;
    -- Fourni par le lieu ou l'agence : visible, sans coût, à confirmer par écrit
    if p.fourni_si is not null and p.fourni_si = any(fo) then
      lignes := lignes || jsonb_build_array(jsonb_build_object('zone', p.zone, 'mode', 'tiers', 'quantite', 1, 'prix', 0, 'element', p.libelle, 'param', p.cle,
        'groupe', p.affichage, 'note', 'fourni par le lieu · à confirmer par écrit', 'fourni', true));
      continue;
    end if;
    sur := coalesce(b #> array['surcharges', p.cle], '{}');
    v := coalesce(nullif(sur->>'valeur', '')::numeric, p.valeur);
    r := coalesce(nullif(sur->>'ratio', '')::numeric, p.ratio);
    bs := case p.base when 'invites' then inv when 'tables' then ceil(inv / 10.0) when 'staff' then staff
               when 'staff_hors_cuisine' then staff_hc when 'cout' then t_cout when 'locations' then t_loc when 'matiere' then t_mat
               when 'bars' then nbars when 'signatures' then sig when 'staff_cout' then t_staff
               else coalesce((roles->>replace(coalesce(p.base, ''), 'role:', ''))::numeric, 0) end;
    nb := case p.calcul when 'par_base' then bs * coalesce(r, 1) when 'un_pour' then case when r > 0 then ceil(bs / r) else 0 end
               when 'fixe' then case when p.base in ('bars', 'signatures') then bs * coalesce(r, 1) else coalesce(r, 1) end
               when 'pct' then 1 when 'heures_sup' then 1 else 0 end;
    if p.min_par_bar is not null and ba then nb := greatest(nb, p.min_par_bar * nbars); end if;
    if b #> array['effectifs', p.cle] is not null then nb := greatest(coalesce((b #>> array['effectifs', p.cle])::numeric, 0), 0); end if;
    px := case when p.calcul = 'pct' then round(bs * v / 100)
               when p.calcul = 'heures_sup' then case when r > 0 and hr is not null then round(bs / r * greatest((hr->>'duree')::numeric - r, 0) * v) else 0 end
               else v end;
    if coalesce(nb, 0) <= 0 then continue; end if;
    if coalesce(px, 0) <= 0 and not p.a_regler then continue; end if;
    calc := case p.calcul
      when 'par_base' then orga._nb(bs) || ' ' || case p.base when 'tables' then 'tables' when 'staff' then 'personnes' when 'staff_hors_cuisine' then 'personnes' else 'invités' end
                           || case when r is not null then ' × ' || orga._nb(r) else '' end || ' × ' || orga._nb(v)
      when 'un_pour' then '1 pour ' || orga._nb(r) || ' ' || coalesce(p.ratio_unite, '') || ' × ' || orga._nb(v)
                          || case when p.min_par_bar is not null and nb = p.min_par_bar * nbars then ' (minimum ' || orga._nb(p.min_par_bar) || ' par bar)' else '' end
      when 'fixe' then orga._nb(nb) || case p.base when 'bars' then ' bar' || case when nb > 1 then 's' else '' end when 'signatures' then ' signature' || case when nb > 1 then 's' else '' end else '' end || ' × ' || orga._nb(v)
      when 'pct' then orga._nb(v) || ' % de ' || orga._nb(bs)
      when 'heures_sup' then orga._nb(greatest((hr->>'duree')::numeric - r, 0)) || ' h au-delà de ' || orga._nb(r) || ' h · ' || orga._nb(bs) || ' ÷ ' || orga._nb(r) || ' × ' || orga._nb(v) end;
    if b #> array['effectifs', p.cle] is not null then calc := orga._nb(nb) || ' choisis × ' || orga._nb(v); end if;
    if p.a_regler and coalesce(px, 0) <= 0 then calc := 'prix à régler dans les Paramètres'; px := 0; end if;

    if p.section = 'staff' and p.calcul in ('un_pour', 'fixe') then
      roles := roles || jsonb_build_object(p.cle, nb);
      staff := staff + nb;
      if p.groupe <> 'Cuisine' then staff_hc := staff_hc + nb; end if;
      for i in 1 .. nb::int loop
        pe := b #> array['personnes', p.cle, (i - 1)::text];
        lignes := lignes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'zone', p.zone, 'mode', p.mode, 'quantite', 1, 'prix', coalesce(nullif(pe->>'prix', '')::numeric, px),
          'element', case when coalesce(pe->>'nom', '') <> '' then p.libelle || ' · ' || (pe->>'nom') else p.libelle || ' ' || i end,
          'param', p.cle, 'groupe', p.affichage, 'rang', i, 'nom', nullif(pe->>'nom', ''), 'staff_id', nullif(pe->>'staff_id', ''), 'note', calc,
          'a_regler', case when p.a_regler and px = 0 then true end)));
        t_cout := t_cout + coalesce(nullif(pe->>'prix', '')::numeric, px);
        t_staff := t_staff + coalesce(nullif(pe->>'prix', '')::numeric, px);
      end loop;
    else
      lignes := lignes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('zone', p.zone, 'mode', p.mode, 'quantite', round(nb, 2), 'prix', px,
        'element', p.libelle, 'param', p.cle, 'groupe', p.affichage, 'note', calc, 'a_regler', case when p.a_regler and px = 0 then true end)));
      t_cout := t_cout + nb * px;
      if p.mode = 'location' then t_loc := t_loc + nb * px; end if;
      if p.section = 'moments' and p.calcul <> 'pct' then t_mat := t_mat + nb * px; end if;
    end if;
  end loop;
  return jsonb_build_object('lignes', lignes, 'staff', staff, 'cout', round(t_cout), 'conditions', to_jsonb(fl));
end $function$;

-- La base par défaut garde la date de l'événement (glace d'été)
do $$ declare d text := pg_get_functiondef('orga._chiffrage_base_defaut(text)'::regprocedure); a text := '''personnes'', ''{}''::jsonb);'; begin
  if d ~ '''date''' then return; end if;
  if position(a in d) = 0 then raise exception '_chiffrage_base_defaut a changé'; end if;
  execute replace(d, a, '''personnes'', ''{}''::jsonb, ''date'', ev.date);');
end $$;

-- Les infos que l'agent vocal transmet en plus
create or replace function orga._base_reponses(p jsonb) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object('date', p->'date', 'nb_bars', p->'nb_bars', 'comptoir', p->'comptoir', 'service', p->'service',
    'signatures', p->'signatures', 'alcool_client', p->'alcool_client', 'plonge', p->'plonge', 'cuisine', p->'cuisine',
    'electricite', p->'electricite', 'fourni', p->'fourni', 'gamme', p->'gamme'))
$$;
do $$ declare d text := pg_get_functiondef('orga.voix_chiffrer(uuid,jsonb)'::regprocedure); a text := '''heures'', p->''heures'');'; c text := '''note'', ''Calculé'; begin
  if d ~ '_base_reponses' then return; end if;
  if position(a in d) = 0 or position(c in d) = 0 then raise exception 'voix_chiffrer a changé'; end if;
  d := replace(d, a, '''heures'', p->''heures'') || orga._base_reponses(p);');
  d := replace(d, c, '''prix_a_confirmer'', (select coalesce(jsonb_agg(distinct l->>''element''), ''[]'') from jsonb_array_elements(e->''lignes'') l where (l->>''a_regler'')::boolean),
    ''fourni_tiers'', (select coalesce(jsonb_agg(l->>''element''), ''[]'') from jsonb_array_elements(e->''lignes'') l where (l->>''fourni'')::boolean),
    ''note'', ''Calculé');
  execute d;
end $$;
revoke execute on function orga._horaires(jsonb), orga._base_reponses(jsonb) from public, anon, authenticated;
