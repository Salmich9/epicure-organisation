-- Fusion du dépôt, étape 2 : le pont. L'appli Événements lit et écrit le stock d'epicure-app (schéma public)
-- en réutilisant ses propres fonctions (coût moyen, journal, mouvements immuables) : rien n'est recopié ni déplacé.
-- Autorisé par Salmane le 16/11 (« je t'autorise à écrire dans la base d'épicure-app pour la fusion »).

-- 1. Chaque compte de l'appli est relié à un compte du dépôt (créé au besoin, sans code utilisable)
alter table orga.membres add column if not exists depot_user uuid references public.users(id);
update orga.membres m set depot_user = u.id from public.users u
where m.depot_user is null and u.active and (
  (m.nom = 'Salmane' and btrim(u.full_name) = 'Salmane') or (m.nom = 'Hamza' and btrim(u.full_name) = 'Hamza Hadni') or
  (m.nom = 'Ghali' and btrim(u.full_name) like 'Ghali%') or (m.nom = 'Ouadia' and btrim(u.full_name) like 'Ouadia%'));

create table if not exists orga.depot_pont (nom text primary key references orga.membres(nom) on delete cascade, jeton uuid not null, expire timestamptz not null);
alter table orga.depot_pont enable row level security;
revoke all on orga.depot_pont from anon, authenticated;

-- 2. Agir au dépôt au nom de quelqu'un : vérifie le droit, puis ouvre (ou reprend) sa session dépôt pour cet appel
create or replace function orga._depot_comme(p_me text, p_droit text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d text[] := orga._droits_depot(p_me); u uuid; t uuid;
begin
  if d is null or not (p_droit = any(d)) then raise exception 'reserve_depot'; end if;
  select m.depot_user into u from orga.membres m where m.nom = p_me;
  if u is null or not exists (select 1 from public.users x where x.id = u and x.active) then
    insert into public.users (full_name, pin_hash, role_id, active)
    values (p_me, extensions.crypt(gen_random_uuid()::text || clock_timestamp()::text, extensions.gen_salt('bf')), (select r.id from public.roles r where r.name = 'utilisateur'), true)
    returning id into u;
    update orga.membres set depot_user = u where nom = p_me;
  end if;
  select p.jeton into t from orga.depot_pont p join public.depot_sessions s on s.token = p.jeton and s.user_id = u and s.expire_le > now() + interval '1 day' where p.nom = p_me;
  if t is null then
    insert into public.depot_sessions (user_id) values (u) returning token into t;
    insert into orga.depot_pont (nom, jeton, expire) values (p_me, t, now() + interval '59 days')
      on conflict (nom) do update set jeton = excluded.jeton, expire = excluded.expire;
  end if;
  perform set_config('request.headers', json_build_object('x-depot-session', t)::text, true);
  return u;
end $$;
revoke execute on function orga._depot_comme(text, text) from public, anon, authenticated;

-- 3. Lire le stock (prix et valeurs seulement pour la direction)
create or replace function orga.depot_stock(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'voir'); prix boolean := 'prix' = any(orga._droits_depot(me));
begin
  return jsonb_build_object('prix', prix, 'articles', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.article_id, 'nom', v.article, 'cat', v.categorie, 'cat_id', v.categorie_id, 'cat_ordre', v.categorie_ordre, 'unite', v.unite, 'nature', v.nature,
      'qte', v.quantite, 'seuil', v.seuil_alerte, 'alerte', v.en_alerte, 'a_commander', v.a_commander, 'photo', v.photo_url,
      'cout', case when prix then v.cout_moyen end, 'valeur', case when prix then v.valeur end, 'dernier_prix', case when prix then v.dernier_prix end)
      order by v.categorie_ordre, v.article) from public.v_depot v), '[]'),
    'valeur', case when prix then (select round(sum(v.valeur), 2) from public.v_depot v) end,
    'inventaire', (select max(i.date) from public.inventories i where i.status = 'valide'));
end $$;

-- Fiche d'un article : ses mouvements et ses achats
create or replace function orga.depot_article(p_token uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'voir'); prix boolean := 'prix' = any(orga._droits_depot(me));
begin
  if not exists (select 1 from public.articles a where a.id = p_id) then raise exception 'article_introuvable'; end if;
  return jsonb_build_object(
    'mouvements', coalesce((select jsonb_agg(x order by x->>'quand' desc) from (select jsonb_build_object('id', s.id, 'type', s.type, 'qte', s.quantity, 'quand', s.created_at,
        'qui', btrim(us.full_name), 'ref', s.reference_type, 'evt', ev.name, 'note', s.note, 'cout', case when prix then s.unit_cost end) x
      from public.stock_movements s left join public.users us on us.id = s.created_by left join public.events ev on s.reference_type = 'event' and ev.id = s.reference_id
      where s.article_id = p_id order by s.created_at desc limit 60) t), '[]'),
    'achats', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'date', p.date, 'qte', p.quantity, 'fournisseur', f.name, 'annule', p.annule_at is not null,
        'prix', case when prix then p.unit_price end, 'total', case when prix then p.total_price end) order by p.date desc, p.created_at desc)
      from public.purchases p left join public.suppliers f on f.id = p.supplier_id where p.article_id = p_id), '[]'));
end $$;

-- Listes de référence : catégories, unités, fournisseurs, motifs d'écart
create or replace function orga.depot_referentiels(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'voir');
begin
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nom', c.name) order by c.sort_order, c.name) from public.categories c where c.active), '[]'),
    'unites', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nom', x.name, 'abr', x.abbreviation) order by x.name) from public.units x where x.active), '[]'),
    'fournisseurs', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.name) order by f.name) from public.suppliers f where f.active), '[]'),
    'motifs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'nom', m.name, 'perte', m.perte_reelle) order by m.sort_order) from public.motifs_ecart m where m.active), '[]'));
end $$;

-- 4. Enregistrer un achat (fonction du dépôt : coût moyen, mouvement, journal)
create or replace function orga.depot_achat(p_token uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'acheter'); r json; prix boolean := 'prix' = any(orga._droits_depot(me));
begin
  r := public.enregistrer_achat(u, (p->>'qte')::numeric, (p->>'prix')::numeric, nullif(p->>'article_id', '')::uuid, nullif(p->>'fournisseur_id', '')::uuid,
         coalesce(nullif(p->>'date', '')::date, current_date), nullif(p->>'note', ''), nullif(p->>'nom', ''), nullif(p->>'cat_id', '')::uuid, nullif(p->>'unite_id', '')::uuid,
         coalesce(nullif(p->>'nature', ''), 'consommable'));
  return case when prix then r::jsonb else (r::jsonb - 'cout_moyen' - 'valeur_stock') end;
end $$;

-- Annuler un achat : celui qui l'a saisi, ou qui gère le catalogue
create or replace function orga.depot_achat_annuler(p_token uuid, p_id uuid, p_motif text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'acheter');
begin
  if not ('gerer' = any(orga._droits_depot(me))) and not exists (select 1 from public.purchases p where p.id = p_id and p.created_by = u) then raise exception 'reserve_depot'; end if;
  return public.annuler_achat(p_id, u, coalesce(nullif(trim(p_motif), ''), 'annulé depuis l''appli'))::jsonb;
end $$;

-- 5. Inventaire : liste, création, comptage, validation
create or replace function orga.depot_inventaires(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'inventaire'); prix boolean := 'prix' = any(orga._droits_depot(me));
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'libelle', i.label, 'date', i.date, 'statut', i.status, 'responsable', i.responsible_name,
      'par', btrim(us.full_name), 'lignes', (select count(*) from public.inventory_lines l where l.inventory_id = i.id), 'valeur', case when prix then i.total_value end) order by i.date desc, i.created_at desc)
    from public.inventories i left join public.users us on us.id = i.created_by), '[]');
end $$;

create or replace function orga.depot_inventaire_creer(p_token uuid, p_libelle text, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'inventaire'); i uuid;
begin
  if coalesce(trim(p_libelle), '') = '' then raise exception 'manque_obligatoire'; end if;
  insert into public.inventories (label, date, created_by, status) values (trim(p_libelle), coalesce(p_date, current_date), u, 'brouillon') returning id into i;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values ('inventory', i, 'create', u, jsonb_build_object('label', trim(p_libelle), 'date', coalesce(p_date, current_date), 'via', 'appli evenements'));
  return i;
end $$;

create or replace function orga.depot_inventaire(p_token uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'inventaire');
begin
  return (select jsonb_build_object('id', i.id, 'libelle', i.label, 'date', i.date, 'statut', i.status, 'responsable', i.responsible_name,
    'comptes', coalesce((select jsonb_object_agg(l.article_id, l.counted_qty) from public.inventory_lines l where l.inventory_id = i.id), '{}'))
    from public.inventories i where i.id = p_id);
end $$;

create or replace function orga.depot_inventaire_compter(p_token uuid, p_id uuid, p_article uuid, p_qte numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'inventaire');
begin
  if (select i.status from public.inventories i where i.id = p_id) is distinct from 'brouillon' then raise exception 'introuvable'; end if;
  if p_qte is null then delete from public.inventory_lines where inventory_id = p_id and article_id = p_article; return true; end if;
  if p_qte < 0 then raise exception 'montant_invalide'; end if;
  insert into public.inventory_lines (inventory_id, article_id, counted_qty, unit_price)
  values (p_id, p_article, p_qte, (select coalesce(a.last_purchase_price, 0) from public.articles a where a.id = p_article))
  on conflict (inventory_id, article_id) do update set counted_qty = excluded.counted_qty;
  return true;
end $$;

create or replace function orga.depot_inventaire_valider(p_token uuid, p_id uuid, p_responsable text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'inventaire');
begin
  return public.validate_inventory(p_id, coalesce(nullif(trim(p_responsable), ''), me), u)::jsonb;
end $$;

grant execute on function orga.depot_stock(uuid), orga.depot_article(uuid, uuid), orga.depot_referentiels(uuid), orga.depot_achat(uuid, jsonb),
  orga.depot_achat_annuler(uuid, uuid, text), orga.depot_inventaires(uuid), orga.depot_inventaire_creer(uuid, text, date), orga.depot_inventaire(uuid, uuid),
  orga.depot_inventaire_compter(uuid, uuid, uuid, numeric), orga.depot_inventaire_valider(uuid, uuid, text) to anon, authenticated;
