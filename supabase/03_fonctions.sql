-- Fonctions d'accès (les seules portes d'entrée de l'appli). Toutes dans le schéma orga.

create or replace function orga._qui(p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select s.nom into v from orga.sessions s where s.token = p_token and s.expire_le > now();
  if v is null then raise exception 'session_expiree'; end if;
  return v;
end $$;

create or replace function orga._next_id(p_table text, p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  execute format('select coalesce(max((regexp_match(id, ''(\d+)$''))[1]::int), 0) from orga.%I where id like %L', p_table, p_prefix || '%') into n;
  return p_prefix || lpad((n + 1)::text, 4, '0');
end $$;

create or replace function orga._element(p_id text) returns jsonb
language sql security definer set search_path = '' as $$
  select to_jsonb(v) from orga.v_elements v where v.id = p_id;
$$;

-- Connexion avec un code PIN
create or replace function orga.connexion(p_nom text, p_pin text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m orga.membres; t uuid;
begin
  select * into m from orga.membres where lower(nom) = lower(trim(p_nom));
  if m.nom is null or m.pin_hash <> extensions.crypt(p_pin, m.pin_hash) then
    perform pg_sleep(1);
    raise exception 'code_incorrect';
  end if;
  insert into orga.sessions (nom) values (m.nom) returning token into t;
  return jsonb_build_object('token', t, 'nom', m.nom);
end $$;

create or replace function orga.changer_pin(p_token uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if length(p_pin) < 4 then raise exception 'code_trop_court'; end if;
  update orga.membres set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')) where nom = me;
  return true;
end $$;

-- Tout ce dont l'appli a besoin pour un événement
create or replace function orga.donnees(p_token uuid, p_evt text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); ev text; res jsonb;
begin
  ev := p_evt;
  if ev is null then
    select id into ev from orga.evenements where date >= current_date order by date limit 1;
    if ev is null then select id into ev from orga.evenements order by date desc nulls last limit 1; end if;
  end if;
  select jsonb_build_object(
    'moi', me,
    'aujourdhui', current_date,
    'evt', ev,
    'evenements', (select coalesce(jsonb_agg(to_jsonb(e) order by e.date nulls last), '[]') from orga.evenements e),
    'zones', (select coalesce(jsonb_agg(to_jsonb(z) order by z.ordre), '[]') from orga.zones z where z.active),
    'listes', (select coalesce(jsonb_object_agg(l.liste, l.vals), '{}') from (select liste, jsonb_agg(valeur order by ordre) vals from orga.listes group by liste) l),
    'intervenants', (select coalesce(jsonb_agg(jsonb_build_object('nom', i.nom, 'type', i.type, 'tel', i.tel) order by i.nom), '[]') from orga.intervenants i),
    'elements', (select coalesce(jsonb_agg(to_jsonb(v) order by v.zone, v.sous_zone, v.id), '[]') from orga.v_elements v where v.evenement_id = ev),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.echeance nulls last), '[]') from orga.actions a where a.evenement_id = ev),
    'notes', (select coalesce(jsonb_agg(to_jsonb(n) order by n.date desc), '[]') from orga.notes n where n.evenement_id = ev or n.evenement_id is null),
    'deroule', (select coalesce(jsonb_agg(to_jsonb(d) order by d.ordre), '[]') from orga.deroule d where d.evenement_id = ev),
    'depot', (select coalesce(jsonb_agg(jsonb_build_object('id', s.article_id, 'nom', s.name, 'qte', s.quantity, 'photo', s.photo_url, 'cat', c.name) order by s.name), '[]')
              from public.current_stock s left join public.categories c on c.id = s.category_id where s.active),
    'reserve', (select coalesce(jsonb_object_agg(x.article_id, x.q), '{}') from (
                  select el.article_id, sum(coalesce(el.stock,0)) q from orga.elements el
                  join orga.evenements e2 on e2.id = el.evenement_id
                  where el.article_id is not null and el.evenement_id <> ev and coalesce(e2.date, current_date) >= current_date
                  group by el.article_id) x)
  ) into res;
  return res;
end $$;

-- Mise à jour d'un élément : seuls les champs envoyés changent
create or replace function orga.maj_element(p_token uuid, p_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.elements set
    zone        = case when p ? 'zone'        then p->>'zone' else zone end,
    sous_zone   = case when p ? 'sous_zone'   then p->>'sous_zone' else sous_zone end,
    element     = case when p ? 'element'     then coalesce(p->>'element', element) else element end,
    description = case when p ? 'description' then p->>'description' else description end,
    perimetre   = case when p ? 'perimetre'   then p->>'perimetre' else perimetre end,
    fourni_par  = case when p ? 'fourni_par'  then p->>'fourni_par' else fourni_par end,
    moments     = case when p ? 'moments'     then p->>'moments' else moments end,
    qte_forcee  = case when p ? 'qte_forcee'  then (p->>'qte_forcee')::numeric else qte_forcee end,
    stock       = case when p ? 'stock'       then (p->>'stock')::numeric else stock end,
    achat       = case when p ? 'achat'       then (p->>'achat')::numeric else achat end,
    location    = case when p ? 'location'    then (p->>'location')::numeric else location end,
    production  = case when p ? 'production'  then (p->>'production')::numeric else production end,
    prix_achat  = case when p ? 'prix_achat'  then (p->>'prix_achat')::numeric else prix_achat end,
    prix_location   = case when p ? 'prix_location'   then (p->>'prix_location')::numeric else prix_location end,
    prix_production = case when p ? 'prix_production' then (p->>'prix_production')::numeric else prix_production end,
    statut_prix = case when p ? 'statut_prix' then p->>'statut_prix' else statut_prix end,
    choix       = case when p ? 'choix'       then p->>'choix' else choix end,
    fournisseur = case when p ? 'fournisseur' then p->>'fournisseur' else fournisseur end,
    dispo       = case when p ? 'dispo'       then p->>'dispo' else dispo end,
    engagement  = case when p ? 'engagement'  then p->>'engagement' else engagement end,
    livraison   = case when p ? 'livraison'   then (p->>'livraison')::date else livraison end,
    reception   = case when p ? 'reception'   then p->>'reception' else reception end,
    manque      = case when p ? 'manque'      then p->>'manque' else manque end,
    resp        = case when p ? 'resp'        then p->>'resp' else resp end,
    prochaine   = case when p ? 'prochaine'   then p->>'prochaine' else prochaine end,
    echeance    = case when p ? 'echeance'    then (p->>'echeance')::date else echeance end,
    note        = case when p ? 'note'        then p->>'note' else note end,
    piece       = case when p ? 'piece'       then p->>'piece' else piece end,
    article_id  = case when p ? 'article_id'  then (p->>'article_id')::uuid else article_id end,
    article_nom = case when p ? 'article_nom' then p->>'article_nom' else article_nom end,
    modifie_le = now(), modifie_par = me
  where id = p_id;
  if not found then raise exception 'element_introuvable'; end if;
  return orga._element(p_id);
end $$;

-- Ajout d'un élément : reprend le catalogue, sinon l'y ajoute
create or replace function orga.ajout_element(p_token uuid, p_evt text, p_zone text, p_nom text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); c orga.catalogue; nid text; r text;
begin
  select * into c from orga.catalogue
   where lower(regexp_replace(element, '[^[:alnum:]]', '', 'g')) = lower(regexp_replace(p_nom, '[^[:alnum:]]', '', 'g'))
   limit 1;
  if c.id is null then
    c.id := orga._next_id('catalogue', 'CAT-');
    insert into orga.catalogue (id, zone, element, unite, base, qte_par_base, source_prix, origine)
    values (c.id, p_zone, trim(p_nom), 'pièce', 'Fixe', 1, 'À estimer', 'Ajouté depuis l''appli par ' || me);
    c.element := trim(p_nom);
  end if;
  select resp into r from orga.zones where nom = p_zone;
  nid := orga._next_id('elements', 'EL-');
  insert into orga.elements (id, evenement_id, zone, sous_zone, element, perimetre, moments, prix_achat, prix_location, prix_production,
                             statut_prix, engagement, resp, catalogue_id, modifie_par)
  values (nid, p_evt, p_zone, c.sous_zone, c.element, 'À notre charge', c.moments, c.prix_achat, c.prix_location, c.prix_production,
          case when coalesce(c.prix_achat, c.prix_location, c.prix_production) is not null then 'Estimé' end, 'À lancer', r, c.id, me);
  return orga._element(nid);
end $$;

-- Actions
create or replace function orga.ajout_action(p_token uuid, p_evt text, p_element text, p_quoi text, p_resp text, p_echeance date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid text := orga._next_id('actions', 'ACT-');
begin
  insert into orga.actions (id, evenement_id, element_id, quoi, resp, echeance, cree_par)
  values (nid, p_evt, p_element, p_quoi, p_resp, p_echeance, me);
  return (select to_jsonb(a) from orga.actions a where a.id = nid);
end $$;

create or replace function orga.maj_action(p_token uuid, p_id text, p_statut text, p_reponse text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.actions set statut = coalesce(p_statut, statut), reponse = coalesce(p_reponse, reponse) where id = p_id;
  return found;
end $$;

-- Notes
create or replace function orga.ajout_note(p_token uuid, p_evt text, p_texte text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid text := orga._next_id('notes', 'NOTE-');
begin
  insert into orga.notes (id, auteur, evenement_id, texte) values (nid, me, p_evt, p_texte);
  return (select to_jsonb(n) from orga.notes n where n.id = nid);
end $$;

create or replace function orga.maj_note(p_token uuid, p_id text, p_statut text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.notes set statut = p_statut where id = p_id;
  return found;
end $$;

create or replace function orga.maj_invites(p_token uuid, p_evt text, p_n int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.evenements set invites = p_n where id = p_evt;
  return found;
end $$;

-- Lien personnel pour un responsable (sans compte)
create or replace function orga.lien_responsable(p_token uuid, p_nom text, p_evt text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); t uuid;
begin
  select token into t from orga.liens where nom = p_nom and evenement_id = p_evt;
  if t is null then insert into orga.liens (nom, evenement_id) values (p_nom, p_evt) returning token into t; end if;
  return t;
end $$;

create or replace function orga.liste_responsable(p_lien uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l orga.liens;
begin
  select * into l from orga.liens where token = p_lien;
  if l.token is null then raise exception 'lien_invalide'; end if;
  return jsonb_build_object(
    'nom', l.nom,
    'aujourdhui', current_date,
    'evenement', (select to_jsonb(e) from orga.evenements e where e.id = l.evenement_id),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.echeance nulls last), '[]') from orga.actions a
                where a.evenement_id = l.evenement_id and a.resp = l.nom and a.statut <> 'Annulé'),
    'elements', (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'element', v.element, 'zone', v.zone, 'besoin', v.besoin,
                   'prochaine', v.prochaine, 'echeance', v.echeance, 'reception', v.reception, 'manque', v.manque, 'etat', v.etat) order by v.zone, v.id), '[]')
                 from orga.v_elements v where v.evenement_id = l.evenement_id and v.resp = l.nom and v.etat not in ('tiers','non_concerne')));
end $$;

create or replace function orga.resp_action(p_lien uuid, p_id text, p_statut text, p_reponse text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l orga.liens;
begin
  select * into l from orga.liens where token = p_lien;
  if l.token is null then raise exception 'lien_invalide'; end if;
  update orga.actions set statut = coalesce(p_statut, statut), reponse = coalesce(p_reponse, reponse)
   where id = p_id and resp = l.nom and evenement_id = l.evenement_id;
  return found;
end $$;

create or replace function orga.resp_reception(p_lien uuid, p_id text, p_reception text, p_manque text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare l orga.liens;
begin
  select * into l from orga.liens where token = p_lien;
  if l.token is null then raise exception 'lien_invalide'; end if;
  if p_reception in ('Partiel', 'Non reçu') and coalesce(trim(p_manque), '') = '' then raise exception 'manque_obligatoire'; end if;
  update orga.elements set reception = p_reception, manque = p_manque, modifie_le = now(), modifie_par = l.nom
   where id = p_id and resp = l.nom and evenement_id = l.evenement_id;
  return found;
end $$;

-- Droits : l'appli (clé publique) ne peut appeler QUE ces fonctions-là.
revoke all on all functions in schema orga from public, anon, authenticated;
grant execute on function
  orga.connexion(text, text), orga.changer_pin(uuid, text), orga.donnees(uuid, text),
  orga.maj_element(uuid, text, jsonb), orga.ajout_element(uuid, text, text, text),
  orga.ajout_action(uuid, text, text, text, text, date), orga.maj_action(uuid, text, text, text),
  orga.ajout_note(uuid, text, text), orga.maj_note(uuid, text, text), orga.maj_invites(uuid, text, int),
  orga.lien_responsable(uuid, text, text), orga.liste_responsable(uuid),
  orga.resp_action(uuid, text, text, text), orga.resp_reception(uuid, text, text, text)
to anon;
