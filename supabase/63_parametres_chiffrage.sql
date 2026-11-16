-- 63 · Paramètres de chiffrage : une seule source pour le copilote écrit et l'agent vocal.
--   orga.chiffrage_params : chaque coût et ratio (valeur, ratio, base de calcul, condition) ; Salmane seul modifie.
--   orga.chiffrage_params_histo : chaque changement (référence, événement, clôture) pour suivre la tendance.
--   orga._chiffrage_moteur(base) : calcul ligne par ligne (moments séparés, staff une ligne par personne,
--   transport du personnel séparé de celui des marchandises…). chiffrages.base garde les informations de base
--   de l'événement, ses surcharges (« cet événement seulement »), les effectifs forcés et les noms du staff.
--   Les anciens réglages (regles.imprevus_pct, regles.tva, coef_paliers, postes_defaut.matiere) suivent les paramètres.

create table if not exists orga.chiffrage_params (
  cle text primary key,
  section text not null,          -- moments | staff | transport | bar | materiel | marges (onglet de l'écran)
  groupe text not null,           -- intercalaire dans l'onglet
  libelle text not null,
  sous text,                      -- précision courte sous le nom
  calcul text not null,           -- par_base | un_pour | fixe | pct | regle
  base text,                      -- invites | tables | staff | staff_hors_cuisine | cout | locations | matiere | role:<cle>
  valeur numeric not null default 0,
  unite text not null default 'MAD',
  ratio numeric,                  -- par_base : quantité par base ; un_pour : 1 pour N ; fixe : nombre
  ratio_unite text,
  si text not null default 'toujours',
  seuil numeric,                  -- invités minimum
  zone text,                      -- zone de la ligne (check-list)
  mode text not null default 'achat',
  affichage text,                 -- bloc du chiffrage détaillé
  actif boolean not null default true,
  ordre int not null default 0,
  maj_le timestamptz not null default now(),
  maj_par text
);
alter table orga.chiffrage_params enable row level security;

create table if not exists orga.chiffrage_params_histo (
  id bigserial primary key,
  cle text not null references orga.chiffrage_params(cle) on delete cascade,
  champ text not null,            -- valeur | ratio | actif
  ancien numeric, nouveau numeric,
  portee text not null,           -- reference | evenement | cloture
  evenement_id text,
  raison text,
  par text, le timestamptz not null default now()
);
create index if not exists chiffrage_params_histo_cle on orga.chiffrage_params_histo (cle, le);
alter table orga.chiffrage_params_histo enable row level security;

alter table orga.chiffrages add column if not exists base jsonb;

insert into orga.parametres (cle, valeur) values ('chiffrage_editeurs', '["Salmane"]') on conflict (cle) do nothing;

-- Valeurs de départ : classeur « Agent · Référentiel », Bar · Paramètres, Traiteur · Paramètres et règles de l'agent vocal
insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, base, valeur, unite, ratio, ratio_unite, si, seuil, zone, mode, affichage, actif, ordre) values
 ('m_accueil',      'moments','Matière par invité','Accueil','boissons d''accueil, petites bouchées','par_base','invites',15,'MAD / invité',null,null,'accueil',null,'Menu','achat','moments',true,101),
 ('m_cocktail',     'moments','Matière par invité','Cocktail dînatoire','prix de la pièce × pièces par invité','par_base','invites',5.5,'MAD / pièce',7,'pièces par invité','cocktail',null,'Menu','achat','moments',true,102),
 ('m_diner',        'moments','Matière par invité','Dîner assis','entrée, plat, dessert à l''assiette','par_base','invites',150,'MAD / invité',null,null,'diner_assis',null,'Menu','achat','moments',true,103),
 ('m_buffet',       'moments','Matière par invité','Buffet et stations','plats chauds et froids','par_base','invites',100,'MAD / invité',null,null,'buffet',null,'Menu','achat','moments',true,104),
 ('m_desserts',     'moments','Matière par invité','Desserts','mignardises, buffet de desserts','par_base','invites',30,'MAD / invité',null,null,'desserts',null,'Menu','achat','moments',true,105),
 ('m_late',         'moments','Matière par invité','Late snack','après minuit','par_base','invites',40,'MAD / invité',null,null,'late_snack',null,'Menu','achat','moments',true,106),
 ('m_sans_alcool',  'moments','Matière par invité','Bar sans alcool','mocktails, softs','par_base','invites',40,'MAD / invité',null,null,'bar_sans_alcool',null,'Bar','achat','moments',true,107),
 ('m_pertes',       'moments','Règles','Pertes et surproduction','sur la matière des moments','pct','matiere',10,'%',null,null,'traiteur',null,'Menu','achat','moments',true,110),

 ('b_premix',       'bar','Consommables par invité','Premix et garnish',null,'par_base','invites',7,'MAD / invité',null,null,'bar',null,'Bar','production','bar',true,201),
 ('b_softs',        'bar','Consommables par invité','Softs et eaux',null,'par_base','invites',12,'MAD / invité',null,null,'bar',null,'Bar','achat','bar',true,202),
 ('b_glace',        'bar','Consommables par invité','Glace','prix du kg × kg par invité','par_base','invites',4,'MAD / kg',1.5,'kg par invité','bar',null,'Bar','achat','bar',true,203),
 ('b_alcool_cocktails','bar','Alcool (si nous le fournissons)','Alcool cocktails',null,'par_base','invites',40,'MAD / invité',null,null,'alcool_cocktails',null,'Bar','achat','bar',true,211),
 ('b_alcool_vins',  'bar','Alcool (si nous le fournissons)','Vins',null,'par_base','invites',40,'MAD / invité',null,null,'alcool_vins',null,'Bar','achat','bar',true,212),
 ('b_alcool_spirits','bar','Alcool (si nous le fournissons)','Spirits',null,'par_base','invites',75,'MAD / invité',null,null,'alcool_spirits',null,'Bar','achat','bar',true,213),
 ('b_verrerie',     'bar','Matériel','Location verrerie bar',null,'par_base','invites',6,'MAD / invité',null,null,'bar',null,'Bar','location','bar',true,221),

 ('s_coordinateur', 'staff','Encadrement','Coordinateur',null,'fixe',null,2000,'MAD / jour',1,'personne','toujours',null,'Staff','production','staff',true,301),
 ('s_maitre_hotel', 'staff','Salle','Maître d''hôtel',null,'un_pour','invites',1200,'MAD / jour',150,'invités','traiteur',null,'Staff','production','staff',true,311),
 ('s_chef_rang',    'staff','Salle','Chef de rang','dîner assis, 1 par table de 10','un_pour','invites',600,'MAD / jour',10,'invités','diner_assis',null,'Staff','production','staff',true,312),
 ('s_serveur',      'staff','Salle','Serveur','buffet ou cocktail','un_pour','invites',600,'MAD / jour',20,'invités','service_debout',null,'Staff','production','staff',true,313),
 ('s_runner',       'staff','Salle','Runner',null,'un_pour','role:s_chef_rang',600,'MAD / jour',2,'chefs de rang','diner_assis',null,'Staff','production','staff',true,314),
 ('s_chef_bar',     'staff','Bar','Chef de bar',null,'fixe',null,1500,'MAD / jour',1,'personne','bar',null,'Staff','production','staff',true,321),
 ('s_bartender',    'staff','Bar','Bartender',null,'un_pour','invites',600,'MAD / jour',50,'invités','bar',null,'Staff','production','staff',true,322),
 ('s_aide_barman',  'staff','Bar','Aide barman','éteint : à allumer si tu veux l''ajouter','un_pour','role:s_bartender',600,'MAD / jour',2,'bartenders','bar',null,'Staff','production','staff',false,323),
 ('s_chef_cuisine', 'staff','Cuisine','Chef de cuisine',null,'fixe',null,2150,'MAD / jour',1,'personne','traiteur',null,'Staff','production','staff',true,331),
 ('s_commis',       'staff','Cuisine','Commis de cuisine','repas chaud (dîner, buffet)','un_pour','invites',515,'MAD / jour',30,'couverts','repas_chaud',null,'Staff','production','staff',true,332),
 ('s_commis_froid', 'staff','Cuisine','Commis cuisine froide','cocktail ou late snack seul','un_pour','invites',515,'MAD / jour',50,'invités','cocktail_seul',null,'Staff','production','staff',true,333),
 ('s_plongeur',     'staff','Cuisine','Plongeur',null,'un_pour','invites',515,'MAD / jour',50,'invités','traiteur',null,'Staff','production','staff',true,334),
 ('s_manut',        'staff','Logistique','Manutentionnaire',null,'un_pour','invites',300,'MAD / jour',50,'invités','toujours',null,'Staff','production','staff',true,341),
 ('s_coursier',     'staff','Logistique','Coursier',null,'fixe',null,600,'MAD / jour',1,'personne','toujours',null,'Staff','production','staff',true,342),
 ('s_repas',        'staff','Frais du staff','Repas du staff','par personne, hors cuisine (déjà compris)','par_base','staff_hors_cuisine',60,'MAD / personne',null,null,'toujours',null,'Staff','achat','frais_staff',true,351),
 ('s_pressing',     'staff','Frais du staff','Tenues et pressing','par personne','par_base','staff',10,'MAD / personne',null,null,'toujours',null,'Staff','production','frais_staff',true,352),

 ('t_navette',      'transport','Transport du personnel','Navette staff A/R','prix du véhicule, 1 pour N personnes','un_pour','staff',1050,'MAD / véhicule',15,'personnes','toujours',null,'Logistique','production','transport_personnel',true,401),
 ('t_autre_ville',  'transport','Transport du personnel','Déplacement autre ville','défraiement, hébergement compris','fixe',null,10000,'MAD',1,'forfait','autre_ville',null,'Logistique','production','transport_personnel',true,402),
 ('t_traiteur',     'transport','Transport des marchandises','Camion traiteur A/R','froid inclus, Marrakech','fixe',null,2750,'MAD',1,'trajet','traiteur',null,'Logistique','production','transport_marchandises',true,411),
 ('t_bar',          'transport','Transport des marchandises','Transport bar A/R','Marrakech','fixe',null,1200,'MAD',1,'trajet','bar',null,'Logistique','production','transport_marchandises',true,412),
 ('t_hors',         'transport','Transport des marchandises','Supplément hors Marrakech','Agafay, Ourika…','fixe',null,2000,'MAD',1,'forfait','hors_marrakech',null,'Logistique','production','transport_marchandises',true,413),

 ('x_vaisselle',    'materiel','Art de table','Location vaisselle','par couvert, repas chaud','par_base','invites',42.5,'MAD / couvert',null,null,'repas_chaud',null,'Art de table','location','materiel',true,501),
 ('x_verrerie_table','materiel','Art de table','Verrerie de table','dîner assis','par_base','invites',8,'MAD / invité',null,null,'diner_assis',null,'Art de table','location','materiel',true,502),
 ('x_nappage',      'materiel','Art de table','Nappage','par table de 10, dîner assis','par_base','tables',60,'MAD / table',null,null,'diner_assis',null,'Art de table','location','materiel',true,503),
 ('x_cuisson',      'materiel','Cuisine','Matériel de cuisson mobile','réchauds, chauffe-plats','fixe',null,800,'MAD',1,'forfait','traiteur',null,'Cuisine traiteur','location','materiel',true,511),
 ('x_talkies',      'materiel','Technique','Talkies','à partir du seuil d''invités','fixe',null,70,'MAD / talkie',5,'talkies','toujours',100,'Lieu technique et admin','location','materiel',true,521),
 ('x_impression',   'materiel','Technique','Menus, cartes, étiquettes',null,'fixe',null,225,'MAD',1,'forfait','toujours',null,'Lieu technique et admin','production','materiel',true,522),

 ('d_casse',        'marges','Imprévus et divers','Casse et pertes de matériel','sur les locations','pct','locations',3,'%',null,null,'toujours',null,'Art de table','achat','divers',true,601),
 ('d_petits_achats','marges','Imprévus et divers','Petits achats','jetables, sacs, film, gaz : sur le coût','pct','cout',5,'%',null,null,'toujours',null,'Lieu technique et admin','achat','divers',true,602),
 ('g_imprevus',     'marges','Imprévus et divers','Imprévus','ajoutés au coût, hors lignes','regle',null,5,'%',null,null,'toujours',null,null,'achat',null,true,610),
 ('g_coef_1',       'marges','Coefficient de vente','Coef petit événement',null,'regle',null,2.6,'×',99,'invités au plus','toujours',null,null,'achat',null,true,621),
 ('g_coef_2',       'marges','Coefficient de vente','Coef moyen',null,'regle',null,2.4,'×',199,'invités au plus','toujours',null,null,'achat',null,true,622),
 ('g_coef_3',       'marges','Coefficient de vente','Coef grand',null,'regle',null,2.25,'×',349,'invités au plus','toujours',null,null,'achat',null,true,623),
 ('g_coef_4',       'marges','Coefficient de vente','Coef très grand','au-delà','regle',null,2.15,'×',null,null,'toujours',null,null,'achat',null,true,624),
 ('g_apporteur',    'marges','Commissions et partage','Apporteur d''affaires','sur le prix HT','regle',null,5,'%',null,null,'toujours',null,null,'achat',null,true,631),
 ('g_operateurs',   'marges','Commissions et partage','Opérateurs sur place','sur le prix HT, partagé','regle',null,5,'%',null,null,'toujours',null,null,'achat',null,true,632),
 ('g_agence',       'marges','Commissions et partage','Agence (par défaut)','sur le prix HT, si agence','regle',null,10,'%',null,null,'toujours',null,null,'achat',null,true,633),
 ('g_charite',      'marges','Commissions et partage','Charité','sur la marge nette','regle',null,2.5,'%',null,null,'toujours',null,null,'achat',null,true,634),
 ('g_part_hamza',   'marges','Commissions et partage','Part Hamza','espèces, sur le reste','regle',null,37.5,'%',null,null,'toujours',null,null,'achat',null,true,641),
 ('g_part_soufiane','marges','Commissions et partage','Part Soufiane','espèces, sur le reste','regle',null,37.5,'%',null,null,'toujours',null,null,'achat',null,true,642),
 ('g_part_salmane', 'marges','Commissions et partage','Part Salmane','espèces, sur le reste','regle',null,25,'%',null,null,'toujours',null,null,'achat',null,true,643),
 ('g_tva_epicure',  'marges','TVA','TVA Epicure',null,'regle',null,20,'%',null,null,'toujours',null,null,'achat',null,true,651),
 ('g_tva_bb',       'marges','TVA','TVA Business Boys',null,'regle',null,10,'%',null,null,'toujours',null,null,'achat',null,true,652)
on conflict (cle) do nothing;

-- Nombre lisible : 1 050 ; 5,5
create or replace function orga._nb(x numeric) returns text language sql immutable set search_path = '' as $$
  select case when x is null then '?' when x = trunc(x) then replace(trim(to_char(x, 'FM999G999G999')), ',', ' ')
              else replace(replace(trim(to_char(round(x, 2), 'FM999G999G990D99')), ',', ' '), '.', ',') end
$$;

-- Valeur d'un paramètre (règles)
create or replace function orga._param(p_cle text) returns numeric language sql stable security definer set search_path = '' as $$
  select valeur from orga.chiffrage_params where cle = p_cle
$$;

-- Informations de base par défaut d'un événement
create or replace function orga._chiffrage_base_defaut(p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare ev orga.evenements; m text[] := '{}'; repas jsonb; tr boolean; ba boolean;
begin
  select * into ev from orga.evenements where id = p_evt;
  tr := 'Traiteur' = any(coalesce(ev.prestations, '{}'));
  ba := 'Bar' = any(coalesce(ev.prestations, '{}')) or 'Boissons' = any(coalesce(ev.prestations, '{}'));
  if not tr and not ba then tr := true; ba := true; end if;
  if tr then
    repas := ev.cadrage #> '{reponses,repas}';
    if jsonb_typeof(repas) = 'array' then
      if repas ? 'Accueil' then m := m || 'accueil'::text; end if;
      if repas ? 'Cocktail dînatoire' then m := m || 'cocktail'::text; end if;
      if repas ? 'Dîner assis' then m := m || 'diner_assis'::text; end if;
      if repas ? 'Buffet' or repas ? 'Brunch' then m := m || 'buffet'::text; end if;
      if repas ? 'Late snack' then m := m || 'late_snack'::text; end if;
    end if;
    if coalesce(array_length(m, 1), 0) = 0 then
      m := case when ev.format ilike '%cocktail%' then array['cocktail']
                when ev.format ilike '%buffet%' then array['cocktail','buffet']
                else array['cocktail','diner_assis'] end;
    end if;
    if 'diner_assis' = any(m) or 'buffet' = any(m) then m := m || 'desserts'::text; end if;
  end if;
  return jsonb_build_object('invites', coalesce(ev.invites, 0), 'traiteur', tr, 'bar', ba, 'moments', to_jsonb(m),
    'alcool', '[]'::jsonb, 'hors_marrakech', false, 'autre_ville', false, 'surcharges', '{}'::jsonb, 'effectifs', '{}'::jsonb, 'personnes', '{}'::jsonb);
end $$;

-- Le moteur : les informations de base → les lignes, une par moment, une par personne du staff, une par poste
create or replace function orga._chiffrage_moteur(b jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare inv numeric := greatest(coalesce(nullif(b->>'invites', '')::numeric, 0), 0);
        m text[] := coalesce(array(select jsonb_array_elements_text(coalesce(b->'moments', '[]'))), '{}');
        al text[] := coalesce(array(select jsonb_array_elements_text(coalesce(b->'alcool', '[]'))), '{}');
        tr boolean := coalesce((b->>'traiteur')::boolean, false); ba boolean := coalesce((b->>'bar')::boolean, false);
        fl text[] := array['toujours']; p orga.chiffrage_params; sur jsonb; v numeric; r numeric; nb numeric; bs numeric; px numeric;
        lignes jsonb := '[]'; roles jsonb := '{}'; staff numeric := 0; staff_hc numeric := 0;
        t_cout numeric := 0; t_loc numeric := 0; t_mat numeric := 0; i int; pe jsonb; calc text; chaud boolean;
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

  for p in select * from orga.chiffrage_params where actif and calcul <> 'regle' order by ordre loop
    if not p.si = any(fl) then continue; end if;
    if p.seuil is not null and inv < p.seuil then continue; end if;
    sur := coalesce(b #> array['surcharges', p.cle], '{}');
    v := coalesce(nullif(sur->>'valeur', '')::numeric, p.valeur);
    r := coalesce(nullif(sur->>'ratio', '')::numeric, p.ratio);
    bs := case p.base when 'invites' then inv when 'tables' then ceil(inv / 10.0) when 'staff' then staff
               when 'staff_hors_cuisine' then staff_hc when 'cout' then t_cout when 'locations' then t_loc when 'matiere' then t_mat
               else coalesce((roles->>replace(coalesce(p.base, ''), 'role:', ''))::numeric, 0) end;
    nb := case p.calcul when 'par_base' then bs * coalesce(r, 1) when 'un_pour' then case when r > 0 then ceil(bs / r) else 0 end
               when 'fixe' then coalesce(r, 1) when 'pct' then 1 else 0 end;
    if b #> array['effectifs', p.cle] is not null then nb := greatest(coalesce((b #>> array['effectifs', p.cle])::numeric, 0), 0); end if;
    px := case when p.calcul = 'pct' then round(bs * v / 100) else v end;
    if coalesce(nb, 0) <= 0 or coalesce(px, 0) <= 0 then continue; end if;
    calc := case p.calcul
      when 'par_base' then orga._nb(bs) || ' ' || case p.base when 'tables' then 'tables' when 'staff' then 'personnes' when 'staff_hors_cuisine' then 'personnes' else 'invités' end
                           || case when r is not null then ' × ' || orga._nb(r) else '' end || ' × ' || orga._nb(v)
      when 'un_pour' then '1 pour ' || orga._nb(r) || ' ' || coalesce(p.ratio_unite, '') || ' × ' || orga._nb(v)
      when 'fixe' then orga._nb(nb) || ' × ' || orga._nb(v)
      when 'pct' then orga._nb(v) || ' % de ' || orga._nb(bs) end;
    if b #> array['effectifs', p.cle] is not null then calc := orga._nb(nb) || ' choisis × ' || orga._nb(v); end if;

    if p.section = 'staff' and p.calcul in ('un_pour', 'fixe') then
      roles := roles || jsonb_build_object(p.cle, nb);
      staff := staff + nb;
      if p.groupe <> 'Cuisine' then staff_hc := staff_hc + nb; end if;
      for i in 1 .. nb::int loop
        pe := b #> array['personnes', p.cle, (i - 1)::text];
        lignes := lignes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'zone', p.zone, 'mode', p.mode, 'quantite', 1, 'prix', coalesce(nullif(pe->>'prix', '')::numeric, v),
          'element', case when coalesce(pe->>'nom', '') <> '' then p.libelle || ' · ' || (pe->>'nom') else p.libelle || ' ' || i end,
          'param', p.cle, 'groupe', p.affichage, 'rang', i, 'nom', nullif(pe->>'nom', ''), 'staff_id', nullif(pe->>'staff_id', ''), 'note', calc)));
        t_cout := t_cout + coalesce(nullif(pe->>'prix', '')::numeric, v);
      end loop;
    else
      lignes := lignes || jsonb_build_array(jsonb_build_object('zone', p.zone, 'mode', p.mode, 'quantite', round(nb, 2), 'prix', px,
        'element', p.libelle, 'param', p.cle, 'groupe', p.affichage, 'note', calc));
      t_cout := t_cout + nb * px;
      if p.mode = 'location' then t_loc := t_loc + nb * px; end if;
      if p.section = 'moments' and p.calcul <> 'pct' then t_mat := t_mat + nb * px; end if;
    end if;
  end loop;
  return jsonb_build_object('lignes', lignes, 'staff', staff, 'cout', round(t_cout), 'conditions', to_jsonb(fl));
end $$;

-- Coef du palier
create or replace function orga._coef_palier(p_inv numeric) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select valeur from orga.chiffrage_params where cle like 'g_coef_%' and (ratio is null or coalesce(p_inv, 0) <= ratio)
                   order by ratio nulls last limit 1), 2.4)
$$;

-- Enregistre la base et refait les lignes du moteur ; les lignes ajoutées à la main ou par l'IA (sans paramètre) restent
create or replace function orga._chiffrage_refaire(p_evt text, p_base jsonb, p_par text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c orga.chiffrages; b jsonb; e jsonb; garde jsonb; ev orga.evenements;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  b := orga._chiffrage_base_defaut(p_evt) || coalesce(c.base, '{}') || coalesce(p_base, '{}');
  if p_base is null or not p_base ? 'invites' then b := b || jsonb_build_object('invites', coalesce(ev.invites, (b->>'invites')::numeric, 0)); end if;
  e := orga._chiffrage_moteur(b);
  select coalesce(jsonb_agg(l), '[]') into garde from jsonb_array_elements(coalesce(c.lignes, '[]')) l where coalesce(l->>'param', '') = '';
  insert into orga.chiffrages (evenement_id, lignes, base, hypotheses, coef, maj_par)
  values (p_evt, (e->'lignes') || garde, b, '', null, p_par)
  on conflict (evenement_id) do update set lignes = excluded.lignes, base = excluded.base, maj_le = now(), maj_par = p_par;
  return jsonb_build_object('lignes', (e->'lignes') || garde, 'base', b, 'staff', e->'staff', 'paliers', (select valeur from orga.parametres where cle = 'coef_paliers'));
end $$;

create or replace function orga.chiffrage_calculer(p_token uuid, p_evt text, p_base jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return orga._chiffrage_refaire(p_evt, p_base, me);
end $$;

create or replace function orga._chiffrage_editeur(p_nom text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select valeur from orga.parametres where cle = 'chiffrage_editeurs') ? p_nom, false)
$$;

-- Change une référence (écran Paramètres ou « Aussi la référence ») : Salmane seul ; chaque champ changé est noté
create or replace function orga._param_changer(p_cle text, p jsonb, p_portee text, p_evt text, p_par text, p_raison text) returns void
language plpgsql security definer set search_path = '' as $$
declare x orga.chiffrage_params; nv numeric; nr numeric; na boolean;
begin
  select * into x from orga.chiffrage_params where cle = p_cle for update;
  if x.cle is null then raise exception 'parametre_introuvable'; end if;
  if p ? 'valeur' then nv := nullif(p->>'valeur', '')::numeric;
    if nv is null or nv < 0 then raise exception 'valeur_invalide'; end if;
    if nv is distinct from x.valeur then
      insert into orga.chiffrage_params_histo (cle, champ, ancien, nouveau, portee, evenement_id, raison, par) values (p_cle, 'valeur', x.valeur, nv, p_portee, p_evt, p_raison, p_par);
      update orga.chiffrage_params set valeur = nv where cle = p_cle;
    end if;
  end if;
  if p ? 'ratio' then nr := nullif(p->>'ratio', '')::numeric;
    if nr is not null and nr < 0 then raise exception 'valeur_invalide'; end if;
    if x.calcul = 'un_pour' and coalesce(nr, 0) <= 0 then raise exception 'valeur_invalide'; end if;
    if nr is distinct from x.ratio then
      insert into orga.chiffrage_params_histo (cle, champ, ancien, nouveau, portee, evenement_id, raison, par) values (p_cle, 'ratio', x.ratio, nr, p_portee, p_evt, p_raison, p_par);
      update orga.chiffrage_params set ratio = nr where cle = p_cle;
    end if;
  end if;
  if p ? 'actif' then na := (p->>'actif')::boolean;
    if na is distinct from x.actif then
      insert into orga.chiffrage_params_histo (cle, champ, ancien, nouveau, portee, evenement_id, raison, par) values (p_cle, 'actif', x.actif::int, na::int, p_portee, p_evt, p_raison, p_par);
      update orga.chiffrage_params set actif = na where cle = p_cle;
    end if;
  end if;
  update orga.chiffrage_params set maj_le = now(), maj_par = p_par where cle = p_cle;
end $$;

create or replace function orga.chiffrage_param_maj(p_token uuid, p_cle text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  perform orga._param_changer(p_cle, p, 'reference', null, me, nullif(p->>'raison', ''));
  return orga.chiffrage_params(p_token);
end $$;

-- Depuis un chiffrage : « Cet événement seulement » (surcharge) ou « Aussi la référence »
create or replace function orga.chiffrage_surcharger(p_token uuid, p_evt text, p_cle text, p jsonb, p_reference boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token); c orga.chiffrages; b jsonb; x orga.chiffrage_params; s jsonb := '{}';
begin
  select * into x from orga.chiffrage_params where cle = p_cle;
  if x.cle is null then raise exception 'parametre_introuvable'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  b := coalesce(c.base, orga._chiffrage_base_defaut(p_evt));
  if p_reference then
    me := orga._qui_direction(p_token);   -- une référence ne change jamais depuis l'agent vocal
    if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
    perform orga._param_changer(p_cle, p - 'effectif', 'reference', p_evt, me, null);
    b := jsonb_set(b, '{surcharges}', coalesce(b->'surcharges', '{}') - p_cle);
  else
    if p ? 'valeur' and nullif(p->>'valeur', '')::numeric is distinct from x.valeur then
      s := s || jsonb_build_object('valeur', (p->>'valeur')::numeric);
      insert into orga.chiffrage_params_histo (cle, champ, ancien, nouveau, portee, evenement_id, par) values (p_cle, 'valeur', x.valeur, (p->>'valeur')::numeric, 'evenement', p_evt, me);
    end if;
    if p ? 'ratio' and nullif(p->>'ratio', '')::numeric is distinct from x.ratio then
      if x.calcul = 'un_pour' and coalesce(nullif(p->>'ratio', '')::numeric, 0) <= 0 then raise exception 'valeur_invalide'; end if;
      s := s || jsonb_build_object('ratio', nullif(p->>'ratio', '')::numeric);
      insert into orga.chiffrage_params_histo (cle, champ, ancien, nouveau, portee, evenement_id, par) values (p_cle, 'ratio', x.ratio, nullif(p->>'ratio', '')::numeric, 'evenement', p_evt, me);
    end if;
    if s = '{}' then b := jsonb_set(b, '{surcharges}', coalesce(b->'surcharges', '{}') - p_cle);
    else b := jsonb_set(b, '{surcharges}', coalesce(b->'surcharges', '{}') || jsonb_build_object(p_cle, s)); end if;
  end if;
  -- Effectif choisi à la main (staff) : vaut pour cet événement
  if p ? 'effectif' then
    b := jsonb_set(b, '{effectifs}', case when nullif(p->>'effectif', '') is null then coalesce(b->'effectifs', '{}') - p_cle
                                           else coalesce(b->'effectifs', '{}') || jsonb_build_object(p_cle, (p->>'effectif')::numeric) end);
  end if;
  return orga._chiffrage_refaire(p_evt, b, me);
end $$;

-- Nom et tarif réel d'une personne du staff (« Chef de rang 2 » → « Chef de rang · Mohamed »)
create or replace function orga.chiffrage_personne(p_token uuid, p_evt text, p_cle text, p_rang int, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); c orga.chiffrages; b jsonb; arr jsonb;
begin
  if p_rang < 1 or p_rang > 300 then raise exception 'valeur_invalide'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  b := coalesce(c.base, orga._chiffrage_base_defaut(p_evt));
  arr := coalesce(b #> array['personnes', p_cle], '[]');
  while jsonb_array_length(arr) < p_rang loop arr := arr || '{}'::jsonb; end loop;
  arr := jsonb_set(arr, array[(p_rang - 1)::text], jsonb_strip_nulls(jsonb_build_object('nom', nullif(p->>'nom', ''), 'staff_id', nullif(p->>'staff_id', ''),
                                                                                         'prix', nullif(p->>'prix', '')::numeric)));
  b := jsonb_set(b, '{personnes}', coalesce(b->'personnes', '{}') || jsonb_build_object(p_cle, arr));
  return orga._chiffrage_refaire(p_evt, b, me);
end $$;

-- L'écran Paramètres : tout, avec l'historique et la tendance de chaque paramètre
create or replace function orga.chiffrage_params(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return jsonb_build_object('peut_modifier', orga._chiffrage_editeur(me), 'params', (
    select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object(
      'nb_modifs', (select count(*) from orga.chiffrage_params_histo h where h.cle = x.cle),
      'tendance', (select case when h.ancien > 0 then round((x.valeur - h.ancien) / h.ancien * 100) end
                   from orga.chiffrage_params_histo h where h.cle = x.cle and h.champ = 'valeur' and h.portee in ('reference', 'cloture') order by h.le limit 1),
      'tendance_evt', (select round(avg(h.nouveau)::numeric, 2) from (select nouveau from orga.chiffrage_params_histo h2 where h2.cle = x.cle and h2.champ = 'valeur' and h2.portee = 'evenement' order by le desc limit 5) h),
      'histo', (select coalesce(jsonb_agg(jsonb_build_object('champ', h.champ, 'ancien', h.ancien, 'nouveau', h.nouveau, 'portee', h.portee, 'evt', h.evenement_id,
                  'evt_nom', (select nom from orga.evenements e where e.id = h.evenement_id), 'par', h.par, 'le', h.le) order by h.le desc), '[]')
                from (select * from orga.chiffrage_params_histo h where h.cle = x.cle order by le desc limit 8) h)
    ) order by x.ordre), '[]') from orga.chiffrage_params x));
end $$;

-- Les anciens réglages suivent les paramètres (enveloppes, coef, TVA, imprévus de l'écran de chiffrage)
create or replace function orga._t_params_sync() returns trigger language plpgsql security definer set search_path = '' as $$
declare r jsonb; d jsonb;
begin
  select valeur into r from orga.parametres where cle = 'regles';
  r := coalesce(r, '{}') || jsonb_build_object('imprevus_pct', orga._param('g_imprevus'),
         'tva', coalesce(r->'tva', '{}') || jsonb_build_object('Epicure', orga._param('g_tva_epicure'), 'Business Boys', orga._param('g_tva_bb')));
  update orga.parametres set valeur = r where cle = 'regles';
  update orga.parametres set valeur = (select jsonb_agg(jsonb_build_object('coef', valeur, 'jusqua', coalesce(ratio, 100000)) order by coalesce(ratio, 100000))
                                       from orga.chiffrage_params where cle like 'g_coef_%') where cle = 'coef_paliers';
  select valeur into d from orga.parametres where cle = 'postes_defaut';
  if d is not null then
    d := jsonb_set(d, '{matiere}', coalesce(d->'matiere', '{}') || jsonb_build_object(
      'accueil', orga._param('m_accueil'), 'cocktail', (select valeur * coalesce(ratio, 1) from orga.chiffrage_params where cle = 'm_cocktail'),
      'diner', orga._param('m_diner'), 'desserts', orga._param('m_desserts'), 'late_snack', orga._param('m_late')));
    update orga.parametres set valeur = d where cle = 'postes_defaut';
  end if;
  return null;
end $$;
drop trigger if exists t_params_sync on orga.chiffrage_params;
create trigger t_params_sync after update on orga.chiffrage_params for each statement execute function orga._t_params_sync();

-- Agent vocal : même moteur, même paramètres. Le dernier calcul de l'appel sert à créer l'événement.
create table if not exists orga.voix_chiffrages (token uuid primary key, base jsonb not null, resultat jsonb, le timestamptz not null default now());
alter table orga.voix_chiffrages enable row level security;

create or replace function orga.voix_chiffrer(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token); b jsonb; e jsonb; inv numeric := coalesce(nullif(p->>'pax', '')::numeric, 0);
        cout numeric; imp numeric; coef numeric; ht numeric; tva numeric; ag numeric; app numeric; op numeric; marge numeric; ch numeric; reste numeric;
        fmt text := coalesce(p->>'format', 'Bar + traiteur'); grp jsonb;
begin
  if inv <= 0 then raise exception 'invites_manquants'; end if;
  b := jsonb_build_object('invites', inv, 'traiteur', fmt <> 'Bar seul', 'bar', fmt <> 'Traiteur seul',
    'moments', coalesce(p->'moments', '[]'), 'alcool', coalesce(p->'alcool', '[]'),
    'hors_marrakech', coalesce((p->>'hors_marrakech')::boolean, false), 'autre_ville', coalesce((p->>'autre_ville')::boolean, false),
    'surcharges', coalesce(p->'surcharges', '{}'), 'effectifs', coalesce(p->'effectifs', '{}'), 'personnes', '{}'::jsonb,
    'extras', coalesce(p->'extras', '[]'), 'heures', p->'heures');
  e := orga._chiffrage_moteur(b);
  cout := (select coalesce(sum((l->>'quantite')::numeric * (l->>'prix')::numeric), 0) from jsonb_array_elements(e->'lignes') l)
        + (select coalesce(sum(nullif(x->>'cout', '')::numeric), 0) from jsonb_array_elements(b->'extras') x);
  imp := round(cout * orga._param('g_imprevus') / 100);
  coef := coalesce(nullif(p->>'coef', '')::numeric, orga._coef_palier(inv));
  ht := round((cout + imp) * coef);
  tva := case when p->>'societe' = 'Business Boys' then orga._param('g_tva_bb') when p->>'societe' = 'Sans facture' then 0 else orga._param('g_tva_epicure') end;
  ag := round(ht * coalesce(nullif(p->>'agence_pct', '')::numeric, 0));
  app := case when coalesce(p->>'apporteur', 'oui') = 'non' then 0 else round(ht * orga._param('g_apporteur') / 100) end;
  op := case when jsonb_array_length(coalesce(p->'operateurs', '[]')) > 0 then round(ht * orga._param('g_operateurs') / 100) else 0 end;
  marge := ht - ag - app - op - cout - imp;
  ch := greatest(round(marge * orga._param('g_charite') / 100), 0);
  reste := marge - ch;
  select coalesce(jsonb_agg(jsonb_build_object('bloc', g, 'total', t, 'detail', d)
           order by array_position(array['moments','bar','staff','frais_staff','transport_personnel','transport_marchandises','materiel','divers'], g)), '[]') into grp
  from (select g, round(sum(t)) t, jsonb_agg(txt order by o) d from (
          select l->>'groupe' g, l->>'param' k, min(ord) o, sum((l->>'quantite')::numeric * (l->>'prix')::numeric) t,
                 case when count(*) > 1 or bool_or(l ? 'rang') then min(regexp_replace(l->>'element', ' \d+$', '')) || ' × ' || count(*) || ' (' || min(l->>'note') || ')'
                      else min(l->>'element') || ' : ' || min(l->>'note') end
                 || ' = ' || orga._nb(round(sum((l->>'quantite')::numeric * (l->>'prix')::numeric))) txt
          from jsonb_array_elements(e->'lignes') with ordinality as q(l, ord) group by 1, 2) z1 group by g) z;
  insert into orga.voix_chiffrages (token, base, resultat) values (p_token, b, jsonb_build_object('cout', cout, 'prix_ht', ht, 'coef', coef))
  on conflict (token) do update set base = excluded.base, resultat = excluded.resultat, le = now();
  return jsonb_build_object('ok', true, 'blocs', grp, 'staff', e->'staff',
    'effectifs', (select jsonb_object_agg(k, n) from (select l->>'param' k, count(*) n from jsonb_array_elements(e->'lignes') l where l ? 'rang' group by 1) z),
    'cout_total', cout, 'imprevus', imp, 'coef', coef, 'prix_ht', ht, 'prix_par_invite', round(ht / inv), 'tva_pct', tva, 'prix_ttc', round(ht * (1 + tva / 100)),
    'commission_agence', ag, 'commission_apporteur', app, 'commission_operateurs', op, 'marge_nette', marge, 'marge_pct', case when ht > 0 then round(marge / ht * 100) end,
    'charite', ch, 'reste', reste,
    'parts', case when p->>'mode_encaissement' = 'Espèces' then jsonb_build_object('Hamza', round(reste * orga._param('g_part_hamza') / 100),
                  'Soufiane', round(reste * orga._param('g_part_soufiane') / 100), 'Salmane', round(reste * orga._param('g_part_salmane') / 100)) end,
    'note', 'Calculé avec les paramètres de l''appli : ne recalcule rien toi-même.');
end $$;

-- À la création par l'agent vocal : le chiffrage de l'événement part de la même base que l'appel
create or replace function orga.chiffrage_depuis_voix(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token); v orga.voix_chiffrages; b jsonb; r jsonb; x jsonb;
begin
  select * into v from orga.voix_chiffrages where token = p_token;
  if v.token is null then return orga._chiffrage_refaire(p_evt, null, me); end if;
  b := v.base - 'extras';
  r := orga._chiffrage_refaire(p_evt, b, me);
  -- Les postes ajoutés à l'oral (add-ons) deviennent des lignes sans paramètre
  for x in select * from jsonb_array_elements(coalesce(v.base->'extras', '[]')) loop
    if nullif(x->>'cout', '')::numeric > 0 then
      update orga.chiffrages set lignes = lignes || jsonb_build_array(jsonb_build_object('zone', 'Lieu technique et admin', 'element', coalesce(x->>'libelle', 'Ajout'),
        'mode', 'achat', 'quantite', 1, 'prix', (x->>'cout')::numeric, 'note', 'Ajouté à l''oral')) where evenement_id = p_evt;
    end if;
  end loop;
  update orga.chiffrages set coef = (v.resultat->>'coef')::numeric where evenement_id = p_evt;
  return r;
end $$;

-- Texte des paramètres pour les consignes de l'IA (copilote et agent vocal)
create or replace function orga.chiffrage_params_texte(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return (select string_agg(format('%s · %s : %s %s%s%s', groupe, libelle, orga._nb(valeur), unite,
            case when ratio is not null then ', ' || case calcul when 'un_pour' then '1 pour ' || orga._nb(ratio) else orga._nb(ratio) end || ' ' || coalesce(ratio_unite, '') else '' end,
            case when not actif then ' (éteint)' else '' end), E'\n' order by ordre) from orga.chiffrage_params);
end $$;

revoke all on function orga._chiffrage_moteur(jsonb), orga._chiffrage_refaire(text, jsonb, text), orga._param_changer(text, jsonb, text, text, text, text),
  orga._chiffrage_base_defaut(text), orga._param(text), orga._coef_palier(numeric), orga._chiffrage_editeur(text), orga._nb(numeric) from public, anon, authenticated;
grant execute on function orga.chiffrage_calculer(uuid, text, jsonb), orga.chiffrage_param_maj(uuid, text, jsonb), orga.chiffrage_surcharger(uuid, text, text, jsonb, boolean),
  orga.chiffrage_personne(uuid, text, text, int, jsonb), orga.chiffrage_params(uuid), orga.voix_chiffrer(uuid, jsonb), orga.chiffrage_depuis_voix(uuid, text),
  orga.chiffrage_params_texte(uuid) to anon, authenticated;

-- Premier passage : les anciens réglages prennent les valeurs des paramètres
update orga.chiffrage_params set maj_le = maj_le where cle = 'g_imprevus';

-- Quantités repères (check-list du copilote), elles aussi modifiables dans Paramètres
insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, ratio, ratio_unite, ordre) values
 ('q_glace_ete','bar','Quantités repères','Glace en été','juin à septembre','regle',2,'kg / invité',null,null,231),
 ('q_premix','bar','Quantités repères','Premix cocktails',null,'regle',0.4,'L / invité',null,null,232),
 ('q_shots','bar','Quantités repères','Shots','1 litre pour N invités','regle',1,'L',50,'invités',233),
 ('q_eau','bar','Quantités repères','Eau','bouteilles par invité','regle',0.6,'bouteille / invité',null,null,234),
 ('q_verres','bar','Quantités repères','Verres en rotation',null,'regle',3,'verres / invité',null,null,235)
on conflict (cle) do nothing;
