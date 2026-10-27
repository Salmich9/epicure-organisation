-- Bibliothèque staff : fiches (identité, rôles, photo), affectation par événement, notes à la clôture
create table if not exists orga.staff (
  id text primary key,
  prenom text not null, nom text, surnom text,
  cin text, tel text, photo text,
  role text, roles text[] not null default '{}', famille text,
  actif boolean not null default true, note text, source text,
  cree_le timestamptz not null default now(), modifie_le timestamptz not null default now()
);
create table if not exists orga.staff_evt (
  evenement_id text not null, staff_id text not null references orga.staff(id) on delete cascade,
  element_id text, role text, ajoute_par text, ajoute_le timestamptz not null default now(),
  primary key (evenement_id, staff_id)
);
create table if not exists orga.staff_notes (
  evenement_id text not null, staff_id text not null references orga.staff(id) on delete cascade,
  note int not null check (note between 1 and 5), commentaire text, par text, le timestamptz not null default now(),
  primary key (evenement_id, staff_id)
);
alter table orga.staff enable row level security;
alter table orga.staff_evt enable row level security;
alter table orga.staff_notes enable row level security;

-- Import initial des 67 fiches : fait une fois en base (données personnelles, hors dépôt).


create or replace function orga._staff(s orga.staff) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) || jsonb_build_object(
    'moyenne', (select round(avg(n.note)::numeric, 1) from orga.staff_notes n where n.staff_id = s.id),
    'nb_notes', (select count(*) from orga.staff_notes n where n.staff_id = s.id),
    'nb_evt', (select count(*) from orga.staff_evt a where a.staff_id = s.id),
    'dernier', (select max(e.date) from orga.staff_evt a join orga.evenements e on e.id = a.evenement_id where a.staff_id = s.id))
$$;

create or replace function orga.staff_liste(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return coalesce((select jsonb_agg(orga._staff(s) order by s.famille, s.prenom, s.nom) from orga.staff s where s.actif), '[]');
end $$;

create or replace function orga.staff_fiche(p_token uuid, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return (select orga._staff(s) from orga.staff s where s.id = p_id) || jsonb_build_object(
    'historique', coalesce((select jsonb_agg(jsonb_build_object('evt', e.id, 'nom', e.nom, 'date', e.date, 'role', a.role, 'note', n.note) order by e.date desc nulls last)
      from orga.staff_evt a join orga.evenements e on e.id = a.evenement_id
      left join orga.staff_notes n on n.evenement_id = a.evenement_id and n.staff_id = a.staff_id
      where a.staff_id = p_id), '[]'));
end $$;

-- Crée (p_id null) ou modifie une fiche
create or replace function orga.staff_maj(p_token uuid, p_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); v_id text := p_id;
begin
  if v_id is null then
    v_id := 'STF-' || lpad((coalesce((select max(substring(id from 5)::int) from orga.staff), 0) + 1)::text, 3, '0');
    insert into orga.staff (id, prenom, source) values (v_id, coalesce(nullif(trim(p->>'prenom'), ''), 'Sans nom'), 'Ajouté par ' || me);
  end if;
  update orga.staff set
    prenom = case when p ? 'prenom' then coalesce(nullif(trim(p->>'prenom'), ''), prenom) else prenom end,
    nom = case when p ? 'nom' then nullif(trim(p->>'nom'), '') else nom end,
    surnom = case when p ? 'surnom' then nullif(trim(p->>'surnom'), '') else surnom end,
    cin = case when p ? 'cin' then nullif(upper(replace(p->>'cin', ' ', '')), '') else cin end,
    tel = case when p ? 'tel' then nullif(trim(p->>'tel'), '') else tel end,
    photo = case when p ? 'photo' then nullif(p->>'photo', '') else photo end,
    role = case when p ? 'role' then nullif(trim(p->>'role'), '') else role end,
    roles = case when p ? 'roles' then array(select jsonb_array_elements_text(p->'roles')) else roles end,
    famille = case when p ? 'famille' then nullif(p->>'famille', '') else famille end,
    note = case when p ? 'note' then nullif(p->>'note', '') else note end,
    actif = case when p ? 'actif' then (p->>'actif')::boolean else actif end,
    modifie_le = now()
  where id = v_id;
  return orga.staff_fiche(p_token, v_id);
end $$;

-- Staff d'un événement : les postes (éléments de la zone Staff) et les personnes affectées
create or replace function orga.staff_evt_liste(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return jsonb_build_object(
    'postes', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'element', v.element, 'sous_zone', v.sous_zone, 'besoin', v.besoin) order by v.sous_zone, v.element)
       from orga.v_elements v where v.evenement_id = p_evt and v.zone = 'Staff' and coalesce(v.perimetre, '') not in ('Tiers', 'Pas besoin')
       and coalesce(v.sous_zone, '') not in ('Majorations', 'Tenues')), '[]'),
    'affectes', coalesce((select jsonb_agg(jsonb_build_object('staff_id', a.staff_id, 'element_id', a.element_id, 'role', a.role, 'note', n.note))
       from orga.staff_evt a left join orga.staff_notes n on n.evenement_id = a.evenement_id and n.staff_id = a.staff_id where a.evenement_id = p_evt), '[]'));
end $$;

-- Affecte (ou retire, p_retirer) une personne à un événement, sur un poste, avec un rôle propre à l'événement
create or replace function orga.staff_affecter(p_token uuid, p_evt text, p_staff text, p_element text, p_role text, p_retirer boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if p_retirer then
    delete from orga.staff_evt where evenement_id = p_evt and staff_id = p_staff;
  else
    insert into orga.staff_evt (evenement_id, staff_id, element_id, role, ajoute_par) values (p_evt, p_staff, p_element, p_role, me)
    on conflict (evenement_id, staff_id) do update set element_id = excluded.element_id, role = excluded.role;
  end if;
  return orga.staff_evt_liste(p_token, p_evt);
end $$;

create or replace function orga.staff_noter(p_token uuid, p_evt text, p_staff text, p_note int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if p_note is null or p_note = 0 then
    delete from orga.staff_notes where evenement_id = p_evt and staff_id = p_staff;
  else
    insert into orga.staff_notes (evenement_id, staff_id, note, par) values (p_evt, p_staff, p_note, me)
    on conflict (evenement_id, staff_id) do update set note = excluded.note, par = excluded.par, le = now();
  end if;
  return true;
end $$;

revoke all on function orga._staff(orga.staff) from public, anon;
grant execute on function orga.staff_liste(uuid) to anon, authenticated;
grant execute on function orga.staff_fiche(uuid, text) to anon, authenticated;
grant execute on function orga.staff_maj(uuid, text, jsonb) to anon, authenticated;
grant execute on function orga.staff_evt_liste(uuid, text) to anon, authenticated;
grant execute on function orga.staff_affecter(uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function orga.staff_noter(uuid, text, text, int) to anon, authenticated;
