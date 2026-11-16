-- 72 · Les questions du chiffrage dans les Paramètres (une seule liste pour l'agent vocal et le chiffrage écrit).
--   Chaque question : texte, ordre, allumée, Express ou Complet, quand elle se pose, réponses possibles et défaut.
--   Chaque réponse devient une condition « question:réponse » ; un poste dit « Quand ? » (toujours, bar, plonge:rien…).
--   Les seuils (été, nuit, marge visée, délai court) et les conditions du devis passent aussi en paramètres. Salmane seul modifie.

create table if not exists orga.chiffrage_questions (
  cle text primary key,
  section text not null default 'cadrage',      -- cadrage | bar | traiteur | sur_place | prix
  texte text not null,
  aide text,
  type text not null default 'choix',           -- choix | multi | oui_non | nombre | texte | date | horaires | etape
  choix jsonb not null default '[]',            -- [{cle, libelle}]
  defaut jsonb,
  quand text[] not null default '{}',           -- ex. {prestations:bar} ; « q:a|b » = une des réponses ; toutes les conditions doivent tenir
  express boolean not null default false,
  actif boolean not null default true,
  ordre int not null default 500,
  systeme boolean not null default false,       -- questions dont l'appli a besoin : ni supprimées, ni changées de type
  maj_le timestamptz default now(), maj_par text
);
alter table orga.chiffrage_questions enable row level security;

insert into orga.chiffrage_questions (cle, section, texte, aide, type, choix, defaut, quand, express, ordre, systeme) values
 ('societe', 'cadrage', 'C''est pour Epicure, Business Boys, ou sans facture ?', null, 'choix', '[{"cle":"Epicure","libelle":"Epicure"},{"cle":"Business Boys","libelle":"Business Boys"},{"cle":"Sans facture","libelle":"Sans facture"}]', '"Epicure"', '{}', true, 10, true),
 ('client', 'cadrage', 'Quel client, et y a-t-il une agence ?', 'agence : son nom, sa commission, et à qui part le devis', 'texte', '[]', null, '{}', true, 20, true),
 ('date', 'cadrage', 'Quelle date ?', 'moins de 15 jours : délai court', 'date', '[]', null, '{}', true, 30, true),
 ('lieu', 'cadrage', 'Quel lieu ?', null, 'texte', '[]', null, '{}', true, 40, true),
 ('zone', 'cadrage', 'À Marrakech, hors Marrakech, ou dans une autre ville ?', 'Agafay, Ourika = hors Marrakech', 'choix', '[{"cle":"marrakech","libelle":"Marrakech"},{"cle":"hors_marrakech","libelle":"Hors Marrakech"},{"cle":"autre_ville","libelle":"Autre ville"}]', '"marrakech"', '{}', true, 45, true),
 ('invites', 'cadrage', 'Combien d''invités ?', 'une fourchette : on prend le haut', 'nombre', '[]', null, '{}', true, 50, true),
 ('gamme', 'cadrage', 'Quelle gamme : Classique, Premium ou Prestige ?', 'règle le coef et la gamme d''alcool', 'choix', '[{"cle":"Classique","libelle":"Classique"},{"cle":"Premium","libelle":"Premium"},{"cle":"Prestige","libelle":"Prestige"}]', '"Classique"', '{}', true, 60, true),
 ('heures', 'cadrage', 'Quels horaires, début et fin ?', 'après 2 h : nuit ; au-delà de la journée type : heures sup et 2e repas', 'horaires', '[]', null, '{}', true, 70, true),
 ('prestations', 'cadrage', 'Bar, traiteur, ou les deux ?', null, 'multi', '[{"cle":"bar","libelle":"Bar"},{"cle":"traiteur","libelle":"Traiteur"}]', '["bar","traiteur"]', '{}', true, 80, true),
 ('profil', 'cadrage', 'Type d''événement, thème, profil des invités, enfants, régimes ?', 'noté pour l''organisation, pas chiffré', 'texte', '[]', null, '{}', false, 90, false),
 ('nb_bars', 'bar', 'Combien de bars ?', 'par bar : chef de bar, bartenders minimum, kit bar', 'nombre', '[]', '1', '{prestations:bar}', true, 110, false),
 ('comptoir', 'bar', 'Le comptoir, c''est le nôtre ?', null, 'oui_non', '[]', '"non"', '{prestations:bar}', true, 115, false),
 ('alcool_qui', 'bar', 'L''alcool, c''est nous, le client, ou mixte ?', 'client : inventaire à prévoir', 'choix', '[{"cle":"nous","libelle":"Nous"},{"cle":"client","libelle":"Le client"},{"cle":"mixte","libelle":"Mixte"}]', '"nous"', '{prestations:bar}', true, 120, false),
 ('alcool', 'bar', 'Quels alcools fournit-on ?', null, 'multi', '[{"cle":"cocktails","libelle":"Cocktails"},{"cle":"vins","libelle":"Vins"},{"cle":"spirits","libelle":"Spirits"}]', '[]', '{prestations:bar,alcool_qui:nous|mixte}', true, 125, true),
 ('service', 'bar', 'On sert quoi : cocktails, verse, shots ?', null, 'multi', '[{"cle":"cocktails","libelle":"Cocktails"},{"cle":"verse","libelle":"Verse"},{"cle":"shots","libelle":"Shots"}]', '["cocktails"]', '{prestations:bar}', false, 130, false),
 ('signatures', 'bar', 'Combien de cocktails signature ?', null, 'nombre', '[]', '4', '{prestations:bar,service:cocktails}', false, 135, false),
 ('moments', 'traiteur', 'Quels moments : accueil, cocktail, dîner assis, buffet, desserts, late snack, bar sans alcool ?', 'chaque moment est chiffré à part', 'multi', '[{"cle":"accueil","libelle":"Accueil"},{"cle":"cocktail","libelle":"Cocktail dînatoire"},{"cle":"diner_assis","libelle":"Dîner assis"},{"cle":"buffet","libelle":"Buffet"},{"cle":"desserts","libelle":"Desserts"},{"cle":"late_snack","libelle":"Late snack"},{"cle":"bar_sans_alcool","libelle":"Bar sans alcool"}]', '[]', '{prestations:traiteur}', true, 210, true),
 ('cuisine', 'traiteur', 'La cuisine sur place : équipée, incomplète, ou rien ?', null, 'choix', '[{"cle":"equipee","libelle":"Équipée"},{"cle":"incomplete","libelle":"Incomplète"},{"cle":"rien","libelle":"Rien"}]', '"equipee"', '{prestations:traiteur}', false, 220, false),
 ('plonge', 'sur_place', 'Côté plonge : fournie, un espace vide, ou rien ?', null, 'choix', '[{"cle":"fournie","libelle":"Fournie"},{"cle":"espace","libelle":"Espace vide"},{"cle":"rien","libelle":"Rien"}]', '"fournie"', '{}', false, 310, false),
 ('electricite', 'sur_place', 'L''électricité : le lieu suffit, ou groupe électrogène ?', null, 'choix', '[{"cle":"ok","libelle":"Le lieu suffit"},{"cle":"groupe","libelle":"Groupe électrogène"}]', '"ok"', '{}', false, 320, false),
 ('fourni', 'sur_place', 'Le lieu ou l''agence fournit déjà quoi ?', 'retiré du chiffrage, à confirmer par écrit', 'multi', '[{"cle":"tables","libelle":"Tables"},{"cle":"chaises","libelle":"Chaises"},{"cle":"nappes","libelle":"Nappes"},{"cle":"vaisselle","libelle":"Vaisselle"},{"cle":"verrerie","libelle":"Verrerie"}]', '[]', '{}', true, 330, false),
 ('staff', 'prix', 'Voilà le staff que je compte. Ça te va ?', 'un chiffre changé ne vaut que pour cet événement', 'etape', '[]', null, '{}', true, 410, true),
 ('coef', 'prix', 'Je propose ce prix avec ce coefficient. Tu veux monter ou descendre ?', 'marge visée : voir Règles et seuils', 'etape', '[]', null, '{}', true, 420, true),
 ('apporteur', 'prix', 'Il y a un apporteur d''affaires ? Qui sera sur place ? Encaissement en espèces, virement ou chèque ?', null, 'etape', '[]', null, '{}', true, 430, true),
 ('recap', 'prix', 'Récap, puis je crée l''événement et le devis en brouillon ?', null, 'etape', '[]', null, '{}', true, 440, true)
on conflict (cle) do nothing;

-- Seuils (Paramètres › Marges › Règles et seuils)
insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, si, mode, actif, ordre)
values ('r_ete_debut', 'marges', 'Règles et seuils', 'Été : premier mois', 'glace d''été', 'regle', 6, 'mois', 'toujours', 'achat', true, 640),
       ('r_ete_fin', 'marges', 'Règles et seuils', 'Été : dernier mois', null, 'regle', 9, 'mois', 'toujours', 'achat', true, 641),
       ('r_heure_nuit', 'marges', 'Règles et seuils', 'Nuit : à partir de', 'majoration de nuit', 'regle', 2, 'h', 'toujours', 'achat', true, 642),
       ('r_marge_visee', 'marges', 'Règles et seuils', 'Marge visée', 'en dessous, l''agent alerte', 'regle', 35, '%', 'toujours', 'achat', true, 643),
       ('r_delai_court', 'marges', 'Règles et seuils', 'Délai court', 'en dessous, l''agent alerte', 'regle', 15, 'jours', 'toujours', 'achat', true, 644)
on conflict (cle) do nothing;

-- Conditions du devis (texte libre + validité)
insert into orga.parametres (cle, valeur) values ('devis', jsonb_build_object('validite', 15, 'conditions',
  E'Devis H.T /Le bon pour accord de ce devis moyennant une avance de 50% vient acter la phase de prestation.\nLe solde de 50% est dû à J-7 avant l''événement.\nLorsque le devis est validé, sa totalité est due.\nDevis valable 15 jours.\nZone de 5x5m mise à disposition en back office + arrivée d''eau et éléctricité.'))
on conflict (cle) do nothing;

-- Les postes ajoutés en v71 passent aux conditions « question:réponse »
update orga.chiffrage_params set si = 'service:cocktails' where cle in ('b_premix', 'b_signature') and si = 'cocktails';
update orga.chiffrage_params set si = 'service:shots' where cle = 'b_shots' and si = 'shots';
update orga.chiffrage_params set si = 'alcool_qui:client' where cle = 's_inventaire' and si = 'alcool_client';
update orga.chiffrage_params set si = 'comptoir:oui' where cle = 'x_comptoir' and si = 'comptoir';
update orga.chiffrage_params set si = 'plonge:rien' where cle = 'x_kit_plonge' and si = 'plonge_rien';
update orga.chiffrage_params set si = 'cuisine:incomplete' where cle = 'x_kit_cuisine' and si = 'cuisine_incomplete';
update orga.chiffrage_params set si = 'cuisine:rien' where cle = 'x_cuisine_complete' and si = 'cuisine_rien';
update orga.chiffrage_params set si = 'electricite:groupe' where cle = 'x_groupe' and si = 'groupe_electrogene';

-- Les réponses d'une base : ce qui est dit, sinon l'ancienne forme, sinon le défaut ; une question hors de son « quand » ne compte pas
create or replace function orga._reponses(b jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q orga.chiffrage_questions; r jsonb := '{}'; v jsonb; fl text[] := '{}'; c text; ok boolean; k text; vals text[];
begin
  for q in select * from orga.chiffrage_questions where actif and type <> 'etape' order by ordre loop
    v := b -> q.cle;
    if v is null or jsonb_typeof(v) = 'null' then
      v := case q.cle
        when 'prestations' then case when b ? 'traiteur' or b ? 'bar' then (select coalesce(jsonb_agg(pz.y), '[]') from unnest(array[case when (b->>'bar')::boolean then 'bar' end, case when (b->>'traiteur')::boolean then 'traiteur' end]) as pz(y) where pz.y is not null) end
        when 'zone' then case when (b->>'autre_ville')::boolean then '"autre_ville"' when (b->>'hors_marrakech')::boolean then '"hors_marrakech"' when b ? 'hors_marrakech' then '"marrakech"' end::jsonb
        when 'alcool_qui' then case when (b->>'alcool_client')::boolean then '"client"' end::jsonb
        else null end;
      if v is null then v := q.defaut; end if;
    end if;
    if q.type = 'oui_non' and jsonb_typeof(v) = 'boolean' then v := to_jsonb(case when v::text = 'true' then 'oui' else 'non' end); end if;
    -- quand : toutes les conditions doivent tenir
    ok := true;
    foreach c in array q.quand loop
      k := split_part(c, ':', 1);
      vals := string_to_array(split_part(c, ':', 2), '|');
      if not (r ? k) then ok := false; exit; end if;
      if jsonb_typeof(r->k) = 'array' then
        if not exists (select 1 from jsonb_array_elements_text(r->k) e where e = any(vals)) then ok := false; exit; end if;
      elsif not ((r->>k) = any(vals)) then ok := false; exit; end if;
    end loop;
    if not ok or v is null then continue; end if;
    r := r || jsonb_build_object(q.cle, v);
    if jsonb_typeof(v) = 'array' then fl := fl || array(select q.cle || ':' || e from jsonb_array_elements_text(v) e);
    elsif q.type in ('choix', 'oui_non') then fl := fl || (q.cle || ':' || (v #>> '{}'));
    end if;
  end loop;
  return jsonb_build_object('reponses', r, 'flags', to_jsonb(fl));
end $$;

create or replace function orga._chiffrage_moteur(b jsonb)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare rp jsonb := orga._reponses(b); re jsonb := rp->'reponses';
        inv numeric := greatest(coalesce(nullif(b->>'invites', '')::numeric, 0), 0);
        pr text[] := coalesce(array(select jsonb_array_elements_text(coalesce(re->'prestations', '[]'))), '{}');
        m text[] := coalesce(array(select jsonb_array_elements_text(coalesce(re->'moments', '[]'))), '{}');
        al text[] := coalesce(array(select jsonb_array_elements_text(coalesce(re->'alcool', '[]'))), '{}');
        fo text[] := coalesce(array(select jsonb_array_elements_text(coalesce(re->'fourni', '[]'))), '{}');
        tr boolean := 'traiteur' = any(pr); ba boolean := 'bar' = any(pr);
        nbars numeric := greatest(coalesce(nullif(re->>'nb_bars', '')::numeric, 1), 1);
        sig numeric := greatest(coalesce(nullif(re->>'signatures', '')::numeric, 0), 0);
        hr jsonb := orga._horaires(b->'heures'); journee numeric := coalesce((select ratio from orga.chiffrage_params where cle = 'g_heures_sup'), 8);
        e1 numeric := coalesce(orga._param('r_ete_debut'), 6); e2 numeric := coalesce(orga._param('r_ete_fin'), 9); hn numeric := coalesce(orga._param('r_heure_nuit'), 2);
        fl text[] := array['toujours']; p orga.chiffrage_params; sur jsonb; v numeric; r numeric; nb numeric; bs numeric; px numeric;
        lignes jsonb := '[]'; roles jsonb := '{}'; staff numeric := 0; staff_hc numeric := 0; t_staff numeric := 0;
        t_cout numeric := 0; t_loc numeric := 0; t_mat numeric := 0; i int; pe jsonb; calc text; chaud boolean; mois int;
begin
  if not tr then m := '{}'; end if;
  fl := fl || m;
  if tr then fl := fl || 'traiteur'::text; end if;
  if ba then fl := fl || 'bar'::text; end if;
  chaud := 'diner_assis' = any(m) or 'buffet' = any(m);
  if chaud then fl := fl || 'repas_chaud'::text; end if;
  if tr and not 'diner_assis' = any(m) then fl := fl || 'service_debout'::text; end if;
  if tr and not chaud then fl := fl || 'cocktail_seul'::text; end if;
  if re->>'zone' = 'hors_marrakech' then fl := fl || 'hors_marrakech'::text; end if;
  if re->>'zone' = 'autre_ville' then fl := fl || 'autre_ville'::text; end if;
  if ba then fl := fl || array(select 'alcool_' || x from unnest(al) x); end if;
  fl := fl || array(select jsonb_array_elements_text(rp->'flags'));
  mois := extract(month from nullif(b->>'date', '')::date);
  if ba and (coalesce((b->>'ete')::boolean, false) or (mois is not null and case when e1 <= e2 then mois between e1 and e2 else mois >= e1 or mois <= e2 end)) then fl := fl || 'ete'::text; end if;
  if hr is not null and (hr->>'fin')::numeric > hn and (hr->>'fin')::numeric < 12 then fl := fl || 'nuit'::text; end if;
  if hr is not null and (hr->>'duree')::numeric > journee then fl := fl || 'longue'::text; end if;

  for p in select * from orga.chiffrage_params where actif and calcul <> 'regle' order by ordre loop
    if not p.si = any(fl) then continue; end if;
    if p.seuil is not null and inv < p.seuil then continue; end if;
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
  return jsonb_build_object('lignes', lignes, 'staff', staff, 'cout', round(t_cout), 'conditions', to_jsonb(fl), 'reponses', re);
end $function$;

-- Les conditions possibles d'un poste (pour « Quand ? »), avec leur libellé
create or replace function orga._conditions_postes() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_array(
      jsonb_build_object('cle', 'toujours', 'libelle', 'Toujours'), jsonb_build_object('cle', 'bar', 'libelle', 'Avec un bar'),
      jsonb_build_object('cle', 'traiteur', 'libelle', 'Avec un traiteur'), jsonb_build_object('cle', 'repas_chaud', 'libelle', 'Repas chaud (dîner, buffet)'),
      jsonb_build_object('cle', 'service_debout', 'libelle', 'Service debout (sans dîner assis)'), jsonb_build_object('cle', 'cocktail_seul', 'libelle', 'Cocktail sans repas chaud'),
      jsonb_build_object('cle', 'ete', 'libelle', 'En été (avec un bar)'), jsonb_build_object('cle', 'nuit', 'libelle', 'Service de nuit'),
      jsonb_build_object('cle', 'longue', 'libelle', 'Au-delà de la journée type'))
    || coalesce((select jsonb_agg(jsonb_build_object('cle', q.cle || ':' || (c->>'cle'), 'libelle', q.texte || ' → ' || (c->>'libelle'), 'question', q.cle) order by q.ordre)
                 from orga.chiffrage_questions q, jsonb_array_elements(case when q.type = 'oui_non' then '[{"cle":"oui","libelle":"Oui"},{"cle":"non","libelle":"Non"}]'::jsonb else q.choix end) c
                 where q.actif and q.type in ('choix', 'multi', 'oui_non') and q.cle not in ('prestations')), '[]')
$$;

create or replace function orga.chiffrage_questions_liste(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return jsonb_build_object('peut_modifier', orga._chiffrage_editeur(me), 'conditions', orga._conditions_postes(),
    'devis', (select valeur from orga.parametres where cle = 'devis'),
    'questions', (select coalesce(jsonb_agg(to_jsonb(q) order by q.ordre), '[]') from orga.chiffrage_questions q));
end $$;

-- Créer ou changer une question (Salmane seul) ; une question système garde sa clé et son type
create or replace function orga.chiffrage_question_maj(p_token uuid, p_cle text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); q orga.chiffrage_questions; k text := nullif(trim(coalesce(p_cle, '')), '');
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  if k is null then
    if coalesce(trim(p->>'texte'), '') = '' then raise exception 'manque_obligatoire'; end if;
    k := 'q_' || left(regexp_replace(lower(translate(p->>'texte', 'éèêëàâäîïôöûüçÉÈÀ', 'eeeeaaaiioouucEEA')), '[^a-z0-9]+', '_', 'g'), 30);
    while exists (select 1 from orga.chiffrage_questions where cle = k) loop k := k || '_'; end loop;
    insert into orga.chiffrage_questions (cle, section, texte, type, choix, defaut, quand, express, ordre, maj_par)
    values (k, coalesce(p->>'section', 'cadrage'), trim(p->>'texte'), coalesce(p->>'type', 'oui_non'), coalesce(p->'choix', '[]'), p->'defaut',
            coalesce(array(select jsonb_array_elements_text(p->'quand')), '{}'), coalesce((p->>'express')::boolean, false),
            coalesce((p->>'ordre')::int, (select coalesce(max(ordre), 0) + 10 from orga.chiffrage_questions where section = coalesce(p->>'section', 'cadrage') and type <> 'etape')), me);
  else
    select * into q from orga.chiffrage_questions where cle = k for update;
    if q.cle is null then raise exception 'introuvable'; end if;
    update orga.chiffrage_questions set
      texte = coalesce(nullif(trim(p->>'texte'), ''), texte), aide = case when p ? 'aide' then nullif(trim(p->>'aide'), '') else aide end,
      type = case when systeme or not p ? 'type' then type else p->>'type' end,
      choix = case when p ? 'choix' then p->'choix' else choix end, defaut = case when p ? 'defaut' then p->'defaut' else defaut end,
      quand = case when p ? 'quand' then coalesce(array(select jsonb_array_elements_text(p->'quand')), '{}') else quand end,
      express = coalesce((p->>'express')::boolean, express), actif = case when systeme then true else coalesce((p->>'actif')::boolean, actif) end,
      ordre = coalesce((p->>'ordre')::int, ordre), section = coalesce(p->>'section', section), maj_le = now(), maj_par = me
    where cle = k;
  end if;
  return orga.chiffrage_questions_liste(p_token);
end $$;

-- Réglages d'un poste qui ne sont pas des chiffres : « Quand ? », libellé, minimum par bar, fourni par le lieu
create or replace function orga.chiffrage_poste_regler(p_token uuid, p_cle text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  update orga.chiffrage_params set
    si = coalesce(nullif(p->>'si', ''), si), libelle = coalesce(nullif(trim(p->>'libelle'), ''), libelle),
    sous = case when p ? 'sous' then nullif(trim(p->>'sous'), '') else sous end, unite = coalesce(nullif(trim(p->>'unite'), ''), unite),
    min_par_bar = case when p ? 'min_par_bar' then nullif(p->>'min_par_bar', '')::numeric else min_par_bar end,
    fourni_si = case when p ? 'fourni_si' then nullif(p->>'fourni_si', '') else fourni_si end, maj_le = now(), maj_par = me
  where cle = p_cle;
  if not found then raise exception 'parametre_introuvable'; end if;
  return orga.chiffrage_params(p_token);
end $$;

-- Créer un poste (Salmane seul) : à 0 « à régler » tant qu'il n'a pas de prix
create or replace function orga.chiffrage_poste_creer(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); k text; s text := coalesce(p->>'section', 'materiel');
  z text := case s when 'moments' then 'Menu' when 'staff' then 'Staff' when 'transport' then 'Logistique' when 'bar' then 'Bar' else 'Lieu technique et admin' end;
  aff text := case s when 'moments' then 'moments' when 'staff' then 'staff' when 'transport' then 'transport_marchandises' when 'bar' then 'bar' when 'materiel' then 'materiel' else 'divers' end;
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  if coalesce(trim(p->>'libelle'), '') = '' then raise exception 'manque_obligatoire'; end if;
  k := 'u_' || left(regexp_replace(lower(translate(p->>'libelle', 'éèêëàâäîïôöûüçÉÈÀ', 'eeeeaaaiioouucEEA')), '[^a-z0-9]+', '_', 'g'), 30);
  while exists (select 1 from orga.chiffrage_params where cle = k) loop k := k || '_'; end loop;
  insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, base, valeur, unite, ratio, ratio_unite, si, zone, mode, affichage, actif, ordre, a_regler, maj_par)
  values (k, s, coalesce(nullif(trim(p->>'groupe'), ''), 'Ajoutés'), trim(p->>'libelle'), nullif(trim(p->>'sous'), ''), coalesce(p->>'calcul', 'fixe'),
          case coalesce(p->>'calcul', 'fixe') when 'fixe' then null when 'pct' then 'cout' else 'invites' end,
          coalesce(nullif(p->>'valeur', '')::numeric, 0), coalesce(nullif(trim(p->>'unite'), ''), case coalesce(p->>'calcul', 'fixe') when 'pct' then '%' when 'par_base' then 'MAD / invité' else 'MAD' end),
          case coalesce(p->>'calcul', 'fixe') when 'fixe' then 1 when 'un_pour' then coalesce(nullif(p->>'ratio', '')::numeric, 50) else nullif(p->>'ratio', '')::numeric end,
          case coalesce(p->>'calcul', 'fixe') when 'fixe' then 'forfait' when 'un_pour' then 'invités' else null end,
          coalesce(nullif(p->>'si', ''), 'toujours'), z, case when s = 'staff' then 'production' else coalesce(p->>'mode', 'achat') end, aff, true,
          (select coalesce(max(ordre), 0) + 1 from orga.chiffrage_params where section = s), true, me);
  return orga.chiffrage_params(p_token);
end $$;

create or replace function orga.chiffrage_devis_reglages(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  update orga.parametres set valeur = valeur || jsonb_strip_nulls(jsonb_build_object('conditions', nullif(trim(p->>'conditions'), ''), 'validite', nullif(p->>'validite', '')::numeric)) where cle = 'devis';
  return orga.chiffrage_questions_liste(p_token);
end $$;

-- L'agent vocal : la liste des questions d'un mode, et ses réponses passent telles quelles dans la base
create or replace function orga.voix_questions(p_token uuid, p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return jsonb_build_object('mode', coalesce(p_mode, 'express'),
    'seuils', jsonb_build_object('marge_visee', orga._param('r_marge_visee'), 'delai_court_jours', orga._param('r_delai_court')),
    'questions', (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cle', q.cle, 'question', q.texte, 'aide', q.aide, 'type', q.type,
        'reponses', case when jsonb_array_length(q.choix) > 0 then (select jsonb_agg(c->>'cle') from jsonb_array_elements(q.choix) c) end,
        'defaut', q.defaut, 'quand', case when cardinality(q.quand) > 0 then to_jsonb(q.quand) end)) order by q.ordre), '[]')
      from orga.chiffrage_questions q where q.actif and (q.express or coalesce(p_mode, 'express') <> 'express')));
end $$;

do $$ declare d text := pg_get_functiondef('orga.voix_chiffrer(uuid,jsonb)'::regprocedure); a text := '|| orga._base_reponses(p);'; begin
  if d ~ 'reponses''' then return; end if;
  if position(a in d) = 0 then raise exception 'voix_chiffrer a changé'; end if;
  execute replace(d, a, '|| orga._base_reponses(p) || coalesce(case when jsonb_typeof(p->''reponses'') = ''object'' then p->''reponses'' end, ''{}'');');
end $$;

revoke execute on function orga._reponses(jsonb), orga._conditions_postes() from public, anon, authenticated;
grant execute on function orga.chiffrage_questions_liste(uuid), orga.chiffrage_question_maj(uuid, text, jsonb), orga.chiffrage_poste_regler(uuid, text, jsonb),
  orga.chiffrage_poste_creer(uuid, jsonb), orga.chiffrage_devis_reglages(uuid, jsonb), orga.voix_questions(uuid, text) to anon, authenticated;
