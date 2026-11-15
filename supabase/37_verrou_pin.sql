-- Correction n°1 de l'audit : verrouillage du code PIN et vraie déconnexion.
-- 5 essais ratés de suite → compte bloqué 15 minutes. Un bon code remet le compteur à zéro.
-- Un échec renvoie {"erreur": …} au lieu de lever une exception : une exception annulerait aussi le compteur d'essais.
create table if not exists orga.connexion_essais (
  nom text primary key,
  rates int not null default 0,
  bloque_jusqu timestamptz,
  dernier_essai timestamptz not null default now()
);
alter table orga.connexion_essais enable row level security;

create or replace function orga.connexion(p_nom text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m orga.membres; t uuid; e orga.connexion_essais; cle text := lower(trim(coalesce(p_nom, '')));
begin
  select * into e from orga.connexion_essais where nom = cle;
  if e.bloque_jusqu is not null and e.bloque_jusqu > now() then
    return jsonb_build_object('erreur', 'compte_bloque');
  end if;
  select * into m from orga.membres where lower(nom) = cle;
  if m.nom is null or m.pin_hash <> extensions.crypt(p_pin, m.pin_hash) then
    insert into orga.connexion_essais (nom, rates, dernier_essai) values (cle, 1, now())
    on conflict (nom) do update set
      rates = case when orga.connexion_essais.bloque_jusqu is not null and orga.connexion_essais.bloque_jusqu <= now() then 1 else orga.connexion_essais.rates + 1 end,
      bloque_jusqu = case when (case when orga.connexion_essais.bloque_jusqu is not null and orga.connexion_essais.bloque_jusqu <= now() then 1 else orga.connexion_essais.rates + 1 end) >= 5
                          then now() + interval '15 minutes' else null end,
      dernier_essai = now();
    perform pg_sleep(1);
    return jsonb_build_object('erreur', 'code_incorrect');
  end if;
  delete from orga.connexion_essais where nom = cle;
  insert into orga.sessions (nom) values (m.nom) returning token into t;
  return jsonb_build_object('token', t, 'nom', m.nom);
end $$;

-- Se déconnecter annule vraiment la session côté serveur
create or replace function orga.deconnexion(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from orga.sessions where token = p_token;
  return found;
end $$;
grant execute on function orga.deconnexion(uuid) to anon, authenticated;
