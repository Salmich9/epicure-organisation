-- Lot E (audit 2) : fil sous chaque action et ligne (texte, photo, @mentions), « Pour toi », passer le relais.

create table if not exists orga.fil (
  id bigint generated always as identity primary key,
  evenement_id text not null,
  objet_type text not null check (objet_type in ('action', 'element', 'evenement')),
  objet_id text not null,
  qui text not null,
  texte text,
  photo text,
  mentions text[] not null default '{}',
  cree_le timestamptz not null default now()
);
create index if not exists fil_objet on orga.fil (objet_type, objet_id, cree_le);
create index if not exists fil_evt on orga.fil (evenement_id, cree_le desc);
alter table orga.fil enable row level security;
alter table orga.membres add column if not exists pour_toi_vu timestamptz;

-- L'événement d'un objet, et le droit d'y toucher (direction : tout ; équipe : ses événements)
create or replace function orga._evt_objet(p_type text, p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select case p_type when 'action' then (select a.evenement_id from orga.actions a where a.id = p_id)
                     when 'element' then (select e.evenement_id from orga.elements e where e.id = p_id)
                     when 'evenement' then p_id end;
$$;
create or replace function orga._acces_evt(p_me text, p_evt text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_evt is null then raise exception 'introuvable'; end if;
  if orga._role(p_me) = 'equipe' and not (p_evt = any(orga._evts_equipe(p_me))) then raise exception 'reserve_direction'; end if;
end $$;
revoke execute on function orga._evt_objet(text, text), orga._acces_evt(text, text) from public, anon, authenticated;

create or replace function orga.fil_liste(p_token uuid, p_type text, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev text := orga._evt_objet(p_type, p_id);
begin
  perform orga._acces_evt(me, ev);
  return coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'qui', f.qui, 'texte', f.texte, 'photo', f.photo, 'cree_le', f.cree_le) order by f.cree_le, f.id)
                   from orga.fil f where f.objet_type = p_type and f.objet_id = p_id), '[]');
end $$;

create or replace function orga.fil_ajouter(p_token uuid, p_type text, p_id text, p_texte text, p_photo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev text := orga._evt_objet(p_type, p_id); m text[]; f orga.fil;
begin
  perform orga._acces_evt(me, ev);
  if coalesce(trim(p_texte), '') = '' and p_photo is null then raise exception 'manque_obligatoire'; end if;
  if p_photo is not null and (p_photo !~ '^data:image/(jpeg|png|webp);base64,' or length(p_photo) > 600000) then raise exception 'photo_trop_lourde'; end if;
  -- @Prénom : seulement les noms connus (comptes et équipe)
  select coalesce(array_agg(distinct n.nom), '{}') into m
  from (select nom from orga.membres union select nom from orga.intervenants) n
  where n.nom <> me and position(lower('@' || n.nom) in lower(coalesce(p_texte, ''))) > 0;
  insert into orga.fil (evenement_id, objet_type, objet_id, qui, texte, photo, mentions)
  values (ev, p_type, p_id, me, nullif(trim(p_texte), ''), p_photo, m) returning * into f;
  return jsonb_build_object('id', f.id, 'mentions', f.mentions);
end $$;

-- Pour toi : ce que les autres ont fait qui me concerne, sur 14 jours
create or replace function orga._pour_toi(p_me text) returns table (id text, type text, qui text, texte text, quand timestamptz, evenement_id text, poste text, objet text)
language sql stable security definer set search_path = '' as $$
  with ok as (select e.id from orga.evenements e where orga._role(p_me) <> 'equipe' or e.id = any(orga._evts_equipe(p_me))),
  x as (
    select 'f' || f.id as id, 'mention' as type, f.qui as qui, 't''a mentionné : « ' || left(coalesce(f.texte, 'photo'), 90) || ' »' as texte, f.cree_le as quand, f.evenement_id as evenement_id,
           coalesce(a.poste, el.poste) as poste, coalesce(a.quoi, el.element) as objet
    from orga.fil f left join orga.actions a on f.objet_type = 'action' and a.id = f.objet_id left join orga.elements el on f.objet_type = 'element' and el.id = f.objet_id
    where p_me = any(f.mentions) and f.qui <> p_me
    union all
    select 'g' || f.id, 'message', f.qui, 'a écrit sur « ' || a.quoi || ' » : « ' || left(coalesce(f.texte, 'photo'), 70) || ' »', f.cree_le, f.evenement_id, a.poste, a.quoi
    from orga.fil f join orga.actions a on f.objet_type = 'action' and a.id = f.objet_id
    where a.resp = p_me and f.qui <> p_me and not (p_me = any(f.mentions))
    union all
    select 'h' || h.id, 'confie', h.qui, 't''a confié « ' || h.nom || ' »', h.quand, h.evenement_id, a.poste, h.lieu
    from orga.historique h join orga.actions a on a.id = h.objet_id
    where h.type = 'action' and h.qui <> p_me and ((h.quoi = 'modif' and h.champ = 'resp' and h.apres = p_me) or (h.quoi = 'ajout' and a.resp = p_me))
    union all
    select 'h' || h.id, 'repousse', h.qui, 'a repoussé « ' || h.nom || ' » au ' || to_char(h.apres::date, 'DD/MM'), h.quand, h.evenement_id, a.poste, h.lieu
    from orga.historique h join orga.actions a on a.id = h.objet_id
    where h.type = 'action' and h.quoi = 'modif' and h.champ = 'quand' and a.resp = p_me and h.qui <> p_me and h.apres ~ '^\d{4}-\d\d-\d\d$'
  )
  select x.* from x where x.evenement_id in (select ok.id from ok) and x.quand > now() - interval '14 days'
$$;
revoke execute on function orga._pour_toi(text) from public, anon, authenticated;

create or replace function orga.pour_toi(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); vu timestamptz := (select m.pour_toi_vu from orga.membres m where m.nom = me);
begin
  return jsonb_build_object(
    'non_vus', (select count(*) from orga._pour_toi(me) p where vu is null or p.quand > vu),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'type', p.type, 'qui', p.qui, 'texte', p.texte, 'quand', p.quand, 'evenement_id', p.evenement_id,
                         'evt_nom', e.nom, 'poste', p.poste, 'objet', p.objet, 'nouveau', vu is null or p.quand > vu) order by p.quand desc)
                       from (select * from orga._pour_toi(me) order by quand desc limit 30) p left join orga.evenements e on e.id = p.evenement_id), '[]'));
end $$;

create or replace function orga.pour_toi_vu(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin update orga.membres set pour_toi_vu = now() where nom = me; return true; end $$;

-- Passer le relais : actions en cours et enveloppes d'une personne vers une autre (listes données = Annuler)
create or replace function orga.relais(p_token uuid, p_evt text, p_de text, p_a text, p_mot text, p_actions text[] default null, p_postes text[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); acts text[]; ps text[];
begin
  perform orga._acces_evt(me, p_evt);
  if coalesce(p_de, '') = '' or coalesce(p_a, '') = '' or p_de = p_a then raise exception 'manque_obligatoire'; end if;
  with u as (update orga.actions set resp = p_a where evenement_id = p_evt and resp = p_de and coalesce(statut, '') not in ('Fait', 'Annulé')
             and (p_actions is null or id = any(p_actions)) returning id) select coalesce(array_agg(id), '{}') into acts from u;
  with u as (update orga.postes set resp = p_a where evenement_id = p_evt and resp = p_de and not retire
             and (p_postes is null or cle = any(p_postes)) returning cle) select coalesce(array_agg(cle), '{}') into ps from u;
  if coalesce(trim(p_mot), '') <> '' then
    insert into orga.fil (evenement_id, objet_type, objet_id, qui, texte, mentions) values (p_evt, 'evenement', p_evt, me, 'Relais de ' || p_de || ' à @' || p_a || ' : ' || trim(p_mot), array[p_a]);
  end if;
  return jsonb_build_object('actions', to_jsonb(acts), 'postes', to_jsonb(ps));
end $$;

grant execute on function orga.fil_liste(uuid, text, text), orga.fil_ajouter(uuid, text, text, text, text), orga.pour_toi(uuid), orga.pour_toi_vu(uuid),
  orga.relais(uuid, text, text, text, text, text[], text[]) to anon, authenticated;

-- Les données d'un événement et d'Aujourd'hui portent le nombre de messages par objet, et Ma part sa pastille
create or replace function orga._extras(d jsonb, p_me text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select d || jsonb_build_object(
    'fil', coalesce((select jsonb_object_agg(f.objet_id, f.n) from (select objet_id, count(*) n from orga.fil where evenement_id = d->>'evt' and objet_type <> 'evenement' group by 1) f), '{}'),
    'pour_toi', (select count(*) from orga._pour_toi(p_me) p where (select m.pour_toi_vu from orga.membres m where m.nom = p_me) is null or p.quand > (select m.pour_toi_vu from orga.membres m where m.nom = p_me)));
$$;
revoke execute on function orga._extras(jsonb, text) from public, anon, authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('orga.donnees(uuid, text)'::regprocedure);
  if def !~ '_extras' then
    def := replace(def, 'return orga._terrain(orga._donnees_brut(p_token, p_evt)) || jsonb_build_object(''role''', 'return orga._extras(orga._terrain(orga._donnees_brut(p_token, p_evt)), me) || jsonb_build_object(''role''');
    def := replace(def, 'd := orga._terrain(orga._donnees_brut(p_token, ev));', 'd := orga._extras(orga._terrain(orga._donnees_brut(p_token, ev)), me);');
    execute def;
  end if;
  def := pg_get_functiondef('orga.aujourdhui(uuid)'::regprocedure);
  if def !~ '''fil''' then
    def := replace(def, 'd jsonb := orga._aujourdhui_brut(p_token);', 'd jsonb := orga._aujourdhui_brut(p_token) || jsonb_build_object(''fil'', coalesce((select jsonb_object_agg(f.objet_id, f.n) from (select objet_id, count(*) n from orga.fil where objet_type = ''action'' group by 1) f), ''{}''));');
    execute def;
  end if;
end $$;
