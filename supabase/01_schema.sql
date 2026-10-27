-- Epicure · Organisation événements
-- Tout est isolé dans le schéma « orga » : rien n'est créé ni modifié dans « public ».
-- Retour arrière complet : drop schema orga cascade;

create schema if not exists orga;

create table orga.zones (
  nom text primary key,
  ordre int not null default 99,
  icone text,
  resp text,
  marge numeric not null default 0,          -- 0.10 = 10 %
  enveloppe numeric,                         -- MAD par invité
  active boolean not null default true,
  note text
);

create table orga.moments (
  nom text primary key,
  ordre int not null default 99,
  style text
);

create table orga.intervenants (
  nom text primary key,
  type text,
  role text,
  tel text,
  zones text,
  email text,
  note text
);

create table orga.catalogue (
  id text primary key,
  zone text,
  sous_zone text,
  element text not null,
  unite text,
  base text,                                 -- Invités, Fixe, Tables, Nb staff, Véhicules, Pièces cocktail
  qte_par_base numeric,
  moments text,
  mode_defaut text,
  prix_achat numeric,
  prix_location numeric,
  prix_production numeric,
  fournisseur text,
  confirmer_j int,
  livrer_j int,
  reutilisable text,
  type_poste text,
  poste_finance text,
  source_prix text,
  origine text
);
create index on orga.catalogue (lower(element));

create table orga.evenements (
  id text primary key,
  nom text not null unique,
  date date,
  lieu text,
  invites int,
  statut text,
  budget numeric,
  prix numeric,
  coef numeric,
  resp text,
  tiers text,
  note text
);

create table orga.deroule (
  id bigint generated always as identity primary key,
  evenement_id text not null references orga.evenements(id) on delete cascade,
  ordre int,
  moment text,
  debut text,
  fin text,
  style text,
  contenu text,
  note text
);

create table orga.elements (
  id text primary key,
  evenement_id text not null references orga.evenements(id) on delete cascade,
  zone text,
  sous_zone text,
  element text not null,
  description text,
  perimetre text default 'À clarifier',
  fourni_par text,
  moments text,
  qte_forcee numeric,
  stock numeric, achat numeric, location numeric, production numeric,
  prix_achat numeric, prix_location numeric, prix_production numeric,
  statut_prix text,
  choix text,
  fournisseur text,
  dispo text,
  engagement text default 'À lancer',
  livraison date,
  reception text,
  manque text,
  resp text,
  prochaine text,
  echeance date,
  note text,
  piece text,
  catalogue_id text,
  article_id uuid,          -- article du dépôt (public.articles), volontairement SANS clé étrangère
  article_nom text,
  modifie_le timestamptz default now(),
  modifie_par text
);
create index on orga.elements (evenement_id);
create index on orga.elements (article_id);

create table orga.actions (
  id text primary key,
  evenement_id text references orga.evenements(id) on delete cascade,
  element_id text,
  quoi text not null,
  resp text,
  echeance date,
  statut text not null default 'À faire',
  reponse text,
  cree_le timestamptz default now(),
  cree_par text,
  note text
);

create table orga.notes (
  id text primary key,
  date timestamptz default now(),
  auteur text,
  evenement_id text references orga.evenements(id) on delete cascade,
  texte text not null,
  placement text,
  statut text not null default 'À valider',
  lien text
);

create table orga.factures (
  id text primary key,
  evenement_id text references orga.evenements(id) on delete cascade,
  date date,
  fournisseur text,
  numero text,
  montant_piece numeric,
  element_id text,
  montant_ventile numeric,
  paye text,
  lien text,
  note text
);

create table orga.paiements (
  id bigint generated always as identity primary key,
  date date,
  fournisseur text,
  evenement_id text,
  montant numeric,
  mode text,
  reference text,
  note text
);

create table orga.listes (
  liste text not null,
  valeur text not null,
  ordre int not null default 0,
  primary key (liste, valeur)
);

-- Accès : codes PIN pour l'équipe, liens personnels pour les responsables
create table orga.membres (
  nom text primary key,
  pin_hash text not null,
  admin boolean not null default true
);
create table orga.sessions (
  token uuid primary key default gen_random_uuid(),
  nom text not null references orga.membres(nom) on delete cascade,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default now() + interval '60 days'
);
create table orga.liens (
  token uuid primary key default gen_random_uuid(),
  nom text not null,
  evenement_id text references orga.evenements(id) on delete cascade,
  cree_le timestamptz not null default now()
);

-- Verrou : aucune table n'est lisible directement par l'API, tout passe par les fonctions ci-dessous.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'orga' loop
    execute format('alter table orga.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema orga from anon, authenticated;
grant usage on schema orga to anon, authenticated;
