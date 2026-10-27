-- Délégation par rôle : chaque élément va à un rôle (coordination, production, bar, cuisine, achats),
-- chaque événement dit qui tient chaque rôle. Ce qui est changé à la main (resp_main) ne bouge plus.
alter table orga.elements add column if not exists role text;
alter table orga.elements add column if not exists resp_main boolean not null default false;
alter table orga.evenements add column if not exists equipe jsonb;

insert into orga.parametres (cle, valeur)
values ('equipe_defaut', '{"coordination":"Ghali","production":"Ouadia","bar":"Redouane","cuisine":"Salima","achats":"Amina"}')
on conflict (cle) do update set valeur = excluded.valeur;

insert into orga.intervenants (nom, type, role)
select x.nom, 'Équipe', x.role from (values ('Redouane', 'Responsable bar'), ('Amina', 'Responsable achats')) x(nom, role)
where not exists (select 1 from orga.intervenants i where i.nom = x.nom);
update orga.intervenants set role = 'Coordinateur' where nom = 'Ghali' and coalesce(role, '') = '';
update orga.intervenants set role = 'Responsable production' where nom = 'Ouadia' and coalesce(role, '') = '';
update orga.intervenants set role = 'Responsable cuisine' where nom = 'Salima' and coalesce(role, '') = '';

-- Le rôle d'un élément : tiers et flou → coordination ; à acheter → achats ; sinon son domaine
create or replace function orga._role(p_zone text, p_sous text, p_peri text, p_achat boolean) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_peri in ('Tiers', 'À clarifier') then 'coordination'
    when p_achat then 'achats'
    when p_zone = 'Bar' or p_sous = 'Staff bar' then 'bar'
    when p_zone in ('Menu', 'Cuisine traiteur') or p_sous = 'Staff cuisine' then 'cuisine'
    when p_zone = 'Décoration et ambiance' then 'coordination'
    when p_zone = 'Staff' and p_sous in ('Encadrement', 'Majorations') then 'coordination'
    when p_zone = 'Lieu, technique et admin' and coalesce(p_sous, '') not in ('Énergie et technique', 'Eau', 'Sanitaires', 'Communication', 'Climat et confort', 'Son, lumière et vidéo', '') then 'coordination'
    else 'production' end
$$;

create or replace function orga._equipe(p_evt text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select valeur from orga.parametres where cle = 'equipe_defaut'), '{}'::jsonb)
         || coalesce((select equipe from orga.evenements where id = p_evt), '{}'::jsonb)
$$;

create or replace function orga._el_achat(e orga.elements) returns boolean
language sql stable set search_path = '' as $$
  select case when coalesce(e.stock,0) + coalesce(e.location,0) + coalesce(e.achat,0) + coalesce(e.production,0) > 0
              then coalesce(e.achat,0) > 0 and coalesce(e.achat,0) >= greatest(coalesce(e.stock,0), coalesce(e.location,0), coalesce(e.production,0))
              else coalesce((select c.mode_defaut = 'Achat' from orga.catalogue c where c.id = e.catalogue_id), false) end
$$;

-- À l'ajout : rôle et responsable automatiques. Ensuite : un changement de responsable à la main est retenu ;
-- un changement de zone, de périmètre ou de mode refait le rôle, et le responsable suit s'il est automatique.
create or replace function orga._t_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r text; auto boolean := coalesce(current_setting('orga.auto', true), '') = '1';
begin
  r := orga._role(new.zone, new.sous_zone, new.perimetre, orga._el_achat(new));
  if tg_op = 'INSERT' then
    new.role := r;
    if not new.resp_main then new.resp := coalesce(orga._equipe(new.evenement_id) ->> r, new.resp); end if;
    return new;
  end if;
  if not auto and new.resp is distinct from old.resp then new.resp_main := true; end if;
  if r is distinct from old.role then
    new.role := r;
    if not new.resp_main then new.resp := coalesce(orga._equipe(new.evenement_id) ->> r, new.resp); end if;
  end if;
  return new;
end $$;
drop trigger if exists t_role on orga.elements;
create trigger t_role before insert or update on orga.elements for each row execute function orga._t_role();

-- Rôles existants (rien n'est réattribué : seulement le rôle calculé)
select set_config('orga.auto', '1', true);
update orga.elements e set role = orga._role(e.zone, e.sous_zone, e.perimetre, orga._el_achat(e)), resp_main = (e.resp is not null);

-- Vue : rôle, responsable automatique ou non, mode proposé par la bibliothèque
do $$
declare d text := pg_get_viewdef('orga.v_elements'::regclass);
begin
  if position('resp_main' in d) = 0 then
    d := regexp_replace(d, '\s+FROM r;?\s*$', ',
    (SELECT x.role FROM orga.elements x WHERE x.id = r.id) AS role,
    (SELECT x.resp_main FROM orga.elements x WHERE x.id = r.id) AS resp_main,
    (SELECT c.mode_defaut FROM orga.catalogue c WHERE c.id = r.catalogue_id) AS mode_defaut
   FROM r');
    execute 'create or replace view orga.v_elements as ' || d;
  end if;
end $$;

-- Équipe de l'événement : qui tient chaque rôle et combien d'éléments
create or replace function orga.equipe_liste(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return jsonb_build_object(
    'equipe', orga._equipe(p_evt),
    'defaut', (select valeur from orga.parametres where cle = 'equipe_defaut'),
    'compte', coalesce((select jsonb_object_agg(role, jsonb_build_object('n', n, 'main', m)) from (
       select role, count(*) n, count(*) filter (where resp_main) m from orga.elements
       where evenement_id = p_evt and role is not null and coalesce(perimetre, '') <> 'Pas besoin' group by role) x), '{}'));
end $$;

-- Change la personne d'un rôle : tous les éléments automatiques du rôle suivent
create or replace function orga.equipe_maj(p_token uuid, p_evt text, p_role text, p_nom text, p_defaut boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); v_n int;
begin
  if p_role not in ('coordination', 'production', 'bar', 'cuisine', 'achats') then raise exception 'role_inconnu'; end if;
  update orga.evenements set equipe = coalesce(equipe, '{}'::jsonb) || jsonb_build_object(p_role, nullif(p_nom, '')) where id = p_evt;
  if p_defaut then
    update orga.parametres set valeur = valeur || jsonb_build_object(p_role, nullif(p_nom, '')) where cle = 'equipe_defaut';
  end if;
  perform set_config('orga.auto', '1', true);
  update orga.elements set resp = nullif(p_nom, '')
  where evenement_id = p_evt and role = p_role and not resp_main and resp is distinct from nullif(p_nom, '');
  get diagnostics v_n = row_count;
  perform set_config('orga.auto', '', true);
  return orga.equipe_liste(p_token, p_evt) || jsonb_build_object('deplaces', v_n);
end $$;

-- Remet un élément en automatique (il reprend la personne de son rôle)
create or replace function orga.element_resp_auto(p_token uuid, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  perform set_config('orga.auto', '1', true);
  update orga.elements e set resp_main = false, resp = coalesce(orga._equipe(e.evenement_id) ->> e.role, e.resp) where id = p_id;
  perform set_config('orga.auto', '', true);
  return orga._element(p_id);
end $$;

-- Supprimer un élément (pas s'il porte déjà une facture)
create or replace function orga.element_supprimer(p_token uuid, p_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if exists (select 1 from orga.factures where element_id = p_id) then raise exception 'element_facture'; end if;
  update orga.actions set element_id = null where element_id = p_id;
  delete from orga.elements where id = p_id;
  return true;
end $$;

revoke all on function orga._role(text, text, text, boolean) from public, anon;
revoke all on function orga._equipe(text) from public, anon;
revoke all on function orga._el_achat(orga.elements) from public, anon;
revoke all on function orga._t_role() from public, anon;
grant execute on function orga.equipe_liste(uuid, text) to anon, authenticated;
grant execute on function orga.equipe_maj(uuid, text, text, text, boolean) to anon, authenticated;
grant execute on function orga.element_resp_auto(uuid, text) to anon, authenticated;
grant execute on function orga.element_supprimer(uuid, text) to anon, authenticated;

-- Chaque événement porte son équipe (copie de l'équipe par défaut à la création)
create or replace function orga._t_equipe_evt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.equipe is null then new.equipe := (select valeur from orga.parametres where cle = 'equipe_defaut'); end if;
  return new;
end $$;
drop trigger if exists t_equipe_evt on orga.evenements;
create trigger t_equipe_evt before insert on orga.evenements for each row execute function orga._t_equipe_evt();
update orga.evenements set equipe = (select valeur from orga.parametres where cle = 'equipe_defaut') where equipe is null;
revoke all on function orga._t_equipe_evt() from public, anon;
