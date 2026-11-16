-- Une facture ou un BL déposé au bot devient une proposition d'entrée au stock, validée en un geste (bot ou appli).
--   BL      : quantités ; prix du BL s'il y en a, sinon dernier prix payé (prix provisoire, corrigé par la facture).
--   Facture : prix ; elle corrige d'abord les BL provisoires du même fournisseur et du même article, le reste entre au stock.
--   Événement : la marchandise entre au dépôt et une ligne de l'événement la réserve (à prélever au chargement).
-- (migration orga_62_stock_depuis_pieces)

create table if not exists orga.pieces_stock (
  id bigint generated always as identity primary key,
  cree_le timestamptz not null default now(),
  source text not null default 'bot',
  depose_par text,
  telegram bigint,
  evenement_id text references orga.evenements(id) on delete set null,
  societe text,
  type text not null check (type in ('BL', 'FACTURE')),
  fournisseur text,
  supplier_id uuid references public.suppliers(id),
  numero text,
  date date,
  lignes jsonb not null default '[]',
  statut text not null default 'proposee' check (statut in ('proposee', 'validee', 'refusee')),
  drive_url text,
  bot_piece bigint,
  valide_par text,
  valide_le timestamptz,
  resultat jsonb
);
alter table orga.pieces_stock enable row level security;
revoke all on orga.pieces_stock from anon, authenticated;

-- Les achats entrés au prix provisoire d'un BL, en attente du prix de la facture
create table if not exists orga.achats_provisoires (
  purchase_id uuid primary key references public.purchases(id),
  article_id uuid not null, supplier_id uuid, qte numeric not null, prix numeric not null,
  piece_id bigint references orga.pieces_stock(id), facture_piece bigint references orga.pieces_stock(id), facture_le timestamptz
);
alter table orga.achats_provisoires enable row level security;
revoke all on orga.achats_provisoires from anon, authenticated;

-- Agir au dépôt au nom d'un membre, sans exiger de droit (le bot a déjà vérifié qui dépose)
create or replace function orga._depot_agir(p_nom text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_nom text := coalesce((select m.nom from orga.membres m where m.nom = p_nom), 'Salmane'); u uuid; t uuid;
begin
  perform set_config('epicure.depuis_orga', 'on', true);
  u := orga._depot_user(v_nom);
  select p.jeton into t from orga.depot_pont p join public.depot_sessions s on s.token = p.jeton and s.user_id = u and s.expire_le > now() + interval '1 day' where p.nom = v_nom;
  if t is null then
    insert into public.depot_sessions (user_id) values (u) returning token into t;
    insert into orga.depot_pont (nom, jeton, expire) values (v_nom, t, now() + interval '59 days')
      on conflict (nom) do update set jeton = excluded.jeton, expire = excluded.expire;
  end if;
  perform set_config('request.headers', json_build_object('x-depot-session', t)::text, true);
  return u;
end $$;
revoke execute on function orga._depot_agir(text) from public, anon, authenticated;

-- Le cœur : appliquer une proposition au stock
create or replace function orga._piece_stock_appliquer(p_id bigint, p_qui text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare ps orga.pieces_stock; u uuid; l jsonb; i int := 0; art uuid; q numeric; px numeric; reste numeric; pr record; r json; a public.articles;
  entres int := 0; corriges int := 0; nouveaux int := 0; reserves int := 0; ignores int := 0; eid text; stock_tot numeric; v_note text;
begin
  select * into ps from orga.pieces_stock where id = p_id for update;
  if not found then raise exception 'piece_introuvable'; end if;
  if ps.statut <> 'proposee' then raise exception 'deja_traitee'; end if;
  u := orga._depot_agir(p_qui);
  v_note := ps.type || coalesce(' n° ' || ps.numero, '') || coalesce(' · ' || ps.fournisseur, '') || coalesce(' · ' || (select e.nom from orga.evenements e where e.id = ps.evenement_id), ' · réassort');
  for l in select * from jsonb_array_elements(ps.lignes) loop
    i := i + 1;
    q := nullif(l->>'qte', '')::numeric; px := nullif(l->>'prix', '')::numeric; art := nullif(l->>'article_id', '')::uuid;
    if coalesce((l->>'ignorer')::boolean, false) or q is null or q <= 0 then ignores := ignores + 1; continue; end if;
    if art is null then
      if nullif(l->'nouveau'->>'nom', '') is null or nullif(l->'nouveau'->>'cat_id', '') is null or nullif(l->'nouveau'->>'unite_id', '') is null then
        raise exception 'ligne_sans_article:%', i;
      end if;
      select id into art from public.articles where lower(name) = lower(trim(l->'nouveau'->>'nom')) and active limit 1;
      if art is null then
        insert into public.articles (name, category_id, unit_id, type, active)
        values (trim(l->'nouveau'->>'nom'), (l->'nouveau'->>'cat_id')::uuid, (l->'nouveau'->>'unite_id')::uuid, coalesce(nullif(l->'nouveau'->>'nature', ''), 'consommable'), true) returning id into art;
        nouveaux := nouveaux + 1;
      end if;
    end if;
    select * into a from public.articles where id = art;
    reste := q;
    if ps.type = 'FACTURE' and px is not null then
      -- d'abord corriger les BL provisoires du même fournisseur et du même article, les plus anciens d'abord
      for pr in select * from orga.achats_provisoires x where x.article_id = art and x.facture_le is null
                  and (ps.supplier_id is null or x.supplier_id is not distinct from ps.supplier_id)
                  order by (select pu.created_at from public.purchases pu where pu.id = x.purchase_id) loop
        exit when reste <= 0;
        if pr.prix <> px then
          select coalesce(sum(quantity), 0) into stock_tot from public.stock_movements where article_id = art;
          update public.articles set average_cost = case when stock_tot > 0 then round(((coalesce(average_cost, 0) * stock_tot) + pr.qte * (px - pr.prix)) / stock_tot, 4) else px end,
                                     last_purchase_price = px, updated_at = now() where id = art;
          update public.purchases set unit_price = px,
                 note = coalesce(note, '') || ' · prix de la facture' || coalesce(' n° ' || ps.numero, '') || ' (au BL : ' || pr.prix || ')' where id = pr.purchase_id;
        end if;
        update orga.achats_provisoires set facture_piece = ps.id, facture_le = now(), prix = px where purchase_id = pr.purchase_id;
        reste := reste - pr.qte; corriges := corriges + 1;
      end loop;
    end if;
    if reste > 0 then
      if px is null then px := coalesce(a.last_purchase_price, 0); end if;
      r := public.enregistrer_achat(u, reste, px, art, ps.supplier_id, coalesce(ps.date, current_date), v_note, null, null, null, a.type);
      if ps.type = 'BL' then
        insert into orga.achats_provisoires (purchase_id, article_id, supplier_id, qte, prix, piece_id) values ((r->>'purchase_id')::uuid, art, ps.supplier_id, reste, px, ps.id);
      end if;
      entres := entres + 1;
      -- événement : la marchandise est réservée par une ligne de l'événement (à prélever au chargement)
      if ps.evenement_id is not null then
        select e.id into eid from orga.elements e where e.evenement_id = ps.evenement_id and e.article_id = art and e.mode_ligne = 'prelever' limit 1;
        if eid is null then
          eid := orga._next_id('elements', 'EL-');
          insert into orga.elements (id, evenement_id, zone, element, perimetre, engagement, modifie_par, poste, mode_ligne, qte_forcee, stock, article_id, article_nom, prix_achat, note)
          values (eid, ps.evenement_id, case when a.type = 'consommable' then 'Lieu, technique et admin' else 'Art de table' end, a.name, 'À notre charge', 'Fait', p_qui,
                  case when a.type = 'consommable' then 'consommables' else 'materiel' end, 'prelever', reste, reste, art, a.name, px, 'Acheté : ' || v_note);
        else
          update orga.elements set stock = coalesce(stock, 0) + reste, qte_forcee = coalesce(qte_forcee, 0) + reste, modifie_le = now(), modifie_par = p_qui where id = eid;
        end if;
        reserves := reserves + 1;
      end if;
    end if;
  end loop;
  update orga.pieces_stock set statut = 'validee', valide_par = p_qui, valide_le = now(),
    resultat = jsonb_build_object('entres', entres, 'corriges', corriges, 'nouveaux', nouveaux, 'reserves', reserves, 'ignores', ignores) where id = p_id;
  insert into public.audit_log (entity, entity_id, action, actor, payload) values ('piece_stock', null, 'validee', u, jsonb_build_object('piece', p_id, 'qui', p_qui));
  return (select resultat from orga.pieces_stock where id = p_id);
end $$;
revoke execute on function orga._piece_stock_appliquer(bigint, text) from public, anon, authenticated;

-- ---------- Bot (secret du bot) ----------
create or replace function orga.bot_depot_catalogue(p_secret text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform orga._bot_ok(p_secret);
  return jsonb_build_object(
    'articles', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'nom', a.name, 'unite', un.abbreviation, 'cat', c.name) order by a.name)
      from public.articles a left join public.units un on un.id = a.unit_id left join public.categories c on c.id = a.category_id where a.active), '[]'),
    'fournisseurs', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nom', f.name) order by f.name) from public.suppliers f where f.active), '[]'));
end $$;

create or replace function orga.bot_depot_proposer(p_secret text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare nid bigint; sup uuid := nullif(p->>'supplier_id', '')::uuid;
begin
  perform orga._bot_ok(p_secret);
  if sup is null and nullif(trim(p->>'fournisseur'), '') is not null then
    select id into sup from public.suppliers where active and lower(name) = lower(trim(p->>'fournisseur')) limit 1;
  end if;
  insert into orga.pieces_stock (source, depose_par, telegram, evenement_id, societe, type, fournisseur, supplier_id, numero, date, lignes, drive_url, bot_piece)
  values ('bot', p->>'depose_par', nullif(p->>'telegram', '')::bigint, nullif(p->>'evenement_id', ''), p->>'societe', upper(coalesce(p->>'type', 'FACTURE')),
          nullif(trim(p->>'fournisseur'), ''), sup, nullif(p->>'numero', ''), nullif(p->>'date', '')::date, coalesce(p->'lignes', '[]'), p->>'drive_url', nullif(p->>'bot_piece', '')::bigint)
  returning id into nid;
  return jsonb_build_object('id', nid);
end $$;

-- Valider depuis le bot : le déposant (lié par son Telegram à un porteur / membre) ou Salmane
create or replace function orga.bot_depot_valider(p_secret text, p_id bigint, p_telegram bigint, p_refuser boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare qui text := coalesce((select po.nom from orga.porteurs po where po.telegram = p_telegram limit 1), 'Salmane');
begin
  perform orga._bot_ok(p_secret);
  if p_refuser then
    update orga.pieces_stock set statut = 'refusee', valide_par = qui, valide_le = now() where id = p_id and statut = 'proposee';
    return jsonb_build_object('refusee', found);
  end if;
  return orga._piece_stock_appliquer(p_id, qui);
end $$;
grant execute on function orga.bot_depot_catalogue(text), orga.bot_depot_proposer(text, jsonb), orga.bot_depot_valider(text, bigint, bigint, boolean) to anon, authenticated;

-- ---------- Appli : la direction voit, corrige, valide ou refuse ----------
create or replace function orga.depot_pieces(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'prix');
begin
  return coalesce((select jsonb_agg(to_jsonb(x) || jsonb_build_object('evt_nom', e.nom) order by (x.statut = 'proposee') desc, x.cree_le desc)
    from (select * from orga.pieces_stock order by cree_le desc limit 60) x left join orga.evenements e on e.id = x.evenement_id), '[]');
end $$;

create or replace function orga.depot_piece_maj(p_token uuid, p_id bigint, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'prix');
begin
  update orga.pieces_stock set lignes = coalesce(p->'lignes', lignes), type = coalesce(upper(nullif(p->>'type', '')), type),
         supplier_id = case when p ? 'supplier_id' then nullif(p->>'supplier_id', '')::uuid else supplier_id end
  where id = p_id and statut = 'proposee';
  if not found then raise exception 'deja_traitee'; end if;
  return jsonb_build_object('id', p_id);
end $$;

create or replace function orga.depot_piece_valider(p_token uuid, p_id bigint, p_refuser boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); u uuid := orga._depot_comme(me, 'prix');
begin
  if p_refuser then
    update orga.pieces_stock set statut = 'refusee', valide_par = me, valide_le = now() where id = p_id and statut = 'proposee';
    if not found then raise exception 'deja_traitee'; end if;
    return jsonb_build_object('refusee', true);
  end if;
  return orga._piece_stock_appliquer(p_id, me);
end $$;
grant execute on function orga.depot_pieces(uuid), orga.depot_piece_maj(uuid, bigint, jsonb), orga.depot_piece_valider(uuid, bigint, boolean) to anon, authenticated;
