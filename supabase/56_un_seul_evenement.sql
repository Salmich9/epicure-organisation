-- Fusion, étape 3 : un seul événement.
-- 1. Un événement de l'appli est relié à son événement du dépôt (créé à la première sortie).
-- 2. Le terrain fait bouger le stock : « chargé » = sortie du dépôt, « revenu » = retour, « cassés » = écart motivé « Casse ».
--    Les corrections passent par des mouvements inverses (le journal du dépôt ne se modifie pas).
-- 3. Import des 5 vrais événements du dépôt (les sorties vers le Baromètre / ZamaZama et les tests restent dans l'historique du dépôt).
-- (migration orga_56_un_seul_evenement)

alter table orga.evenements add column if not exists depot_event uuid unique references public.events(id);

-- La personne côté dépôt, sans exiger de droit dépôt (le terrain est ouvert à l'équipe de l'événement)
create or replace function orga._depot_user(p_me text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  select m.depot_user into u from orga.membres m where m.nom = p_me;
  if u is null or not exists (select 1 from public.users x where x.id = u and x.active) then
    insert into public.users (full_name, pin_hash, role_id, active)
    values (p_me, extensions.crypt(gen_random_uuid()::text || clock_timestamp()::text, extensions.gen_salt('bf')), (select r.id from public.roles r where r.name = 'utilisateur'), true)
    returning id into u;
    update orga.membres set depot_user = u where nom = p_me;
  end if;
  return u;
end $$;

-- L'événement du dépôt d'un événement de l'appli (créé au besoin)
create or replace function orga._depot_evt(p_evt text, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d uuid;
begin
  select depot_event into d from orga.evenements where id = p_evt;
  if d is null then
    insert into public.events (name, date, venue, status, created_by)
    select e.nom, coalesce(e.date, current_date), e.lieu, 'en_cours', p_user from orga.evenements e where e.id = p_evt returning id into d;
    update orga.evenements set depot_event = d where id = p_evt;
  end if;
  return d;
end $$;
revoke execute on function orga._depot_user(text), orga._depot_evt(text, uuid) from public, anon, authenticated;

create or replace function orga.ligne_terrain(p_token uuid, p_id text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); av record; ap record; u uuid; d uuid; dc numeric; dr numeric; mc uuid;
begin
  select * into av from orga.elements where id = p_id;
  if not found then raise exception 'introuvable'; end if;
  update orga.elements set
    charge = case when p ? 'charge' then nullif(p->>'charge', '')::numeric else charge end,
    charge_le = case when p ? 'charge' then now() else charge_le end,
    revenu = case when p ? 'revenu' then nullif(p->>'revenu', '')::numeric else revenu end,
    casse = case when p ? 'casse' then nullif(p->>'casse', '')::numeric else casse end,
    retour_le = case when p ? 'revenu' then case when p->>'revenu' is null then null else now() end else retour_le end,
    modifie_le = now(), modifie_par = me
  where id = p_id returning * into ap;
  -- Une ligne reliée à un article du dépôt fait bouger le stock
  if ap.article_id is not null and exists (select 1 from public.articles a where a.id = ap.article_id) then
    dc := coalesce(ap.charge, 0) - coalesce(av.charge, 0);
    dr := coalesce(ap.revenu, 0) - coalesce(av.revenu, 0);
    if dc <> 0 or dr <> 0 or coalesce(ap.casse, 0) <> coalesce(av.casse, 0) then
      u := orga._depot_user(me); d := orga._depot_evt(ap.evenement_id, u);
      if dc > 0 then insert into public.stock_movements (article_id, type, quantity, reference_type, reference_id, created_by) values (ap.article_id, 'prelevement', -dc, 'event', d, u);
      elsif dc < 0 then insert into public.stock_movements (article_id, type, quantity, reference_type, reference_id, note, created_by) values (ap.article_id, 'retour', -dc, 'event', d, 'correction du chargement', u); end if;
      if dr > 0 then insert into public.stock_movements (article_id, type, quantity, reference_type, reference_id, created_by) values (ap.article_id, 'retour', dr, 'event', d, u);
      elsif dr < 0 then insert into public.stock_movements (article_id, type, quantity, reference_type, reference_id, note, created_by) values (ap.article_id, 'prelevement', dr, 'event', d, 'correction du retour', u); end if;
      if coalesce(ap.casse, 0) <> coalesce(av.casse, 0) then
        select id into mc from public.motifs_ecart where name = 'Casse';
        delete from public.ecarts_motifs where event_id = d and article_id = ap.article_id and motif_id = mc;
        if coalesce(ap.casse, 0) > 0 then insert into public.ecarts_motifs (event_id, article_id, motif_id, quantite, created_by) values (d, ap.article_id, mc, ap.casse, u); end if;
      end if;
    end if;
  end if;
  return jsonb_build_object('charge', ap.charge, 'revenu', ap.revenu, 'casse', ap.casse);
end $$;
grant execute on function orga.ligne_terrain(uuid, text, jsonb) to anon, authenticated;

-- Import des 5 vrais événements du dépôt
do $$
declare pe record; nid text; an text; k int; l record; eid text; mc uuid := (select id from public.motifs_ecart where name = 'Casse');
begin
  for pe in select * from public.events where name ~* '^(18 septembre 35 pax|Jnan Romi 400 pax|Scarabeo Camp 26 sept|Événements 24/10/26|Oberoi)\s*$'
                and not exists (select 1 from orga.evenements x where x.depot_event = events.id) order by date loop
    an := to_char(pe.date, 'YYYY');
    select coalesce(max((regexp_match(id, '(\d+)$'))[1]::int), 0) + 1 into k from orga.evenements where id like 'EVT-' || an || '-%';
    nid := 'EVT-' || an || '-' || lpad(k::text, 3, '0');
    insert into orga.evenements (id, nom, date, lieu, invites, statut, entite, resp, cree_par, note, depot_event, cloture_le)
    values (nid, trim(pe.name), pe.date, nullif(trim(coalesce(pe.venue, '')), ''), (regexp_match(pe.name, '(\d+)\s*pax'))[1]::int,
            case when pe.status = 'cloture' then 'Clôturé' else 'Confirmé' end, 'Epicure', 'Salmane', 'Salmane',
            'Repris de l''appli du dépôt', pe.id, case when pe.status = 'cloture' then pe.updated_at end);
    for l in select s.article_id, a.name, a.type,
                    -sum(s.quantity) filter (where s.type = 'prelevement') sorti, coalesce(sum(s.quantity) filter (where s.type = 'retour'), 0) revenu,
                    min(s.created_at) filter (where s.type = 'prelevement') le_charge, max(s.created_at) filter (where s.type = 'retour') le_retour
             from public.stock_movements s join public.articles a on a.id = s.article_id
             where s.reference_type = 'event' and s.reference_id = pe.id group by 1, 2, 3 having sum(s.quantity) filter (where s.type = 'prelevement') < 0 order by 2 loop
      eid := orga._next_id('elements', 'EL-');
      insert into orga.elements (id, evenement_id, zone, element, perimetre, engagement, modifie_par, poste, mode_ligne, qte_forcee, stock,
                                 article_id, article_nom, charge, charge_le, revenu, retour_le, casse)
      values (eid, nid, case when l.type = 'consommable' then 'Lieu, technique et admin' else 'Art de table' end, l.name, 'À notre charge', 'Fait', 'Salmane',
              case when l.type = 'consommable' then 'consommables' else 'materiel' end, 'prelever', l.sorti, l.sorti,
              l.article_id, l.name, l.sorti, l.le_charge,
              case when pe.status = 'cloture' then l.revenu end, case when pe.status = 'cloture' then l.le_retour end,
              case when pe.status = 'cloture' then (select sum(m.quantite) from public.ecarts_motifs m where m.event_id = pe.id and m.article_id = l.article_id and m.motif_id = mc) end);
    end loop;
  end loop;
end $$;

-- 56b. Un événement repris ne bouge plus le stock que depuis l'appli Événements (pas de double comptage avec l'ancienne appli)
--      (migration orga_56b_evenement_repris_verrou)
create or replace function public._mvt_evt_repris() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reference_type = 'event' and coalesce(current_setting('epicure.depuis_orga', true), 'off') <> 'on'
     and exists (select 1 from orga.evenements e where e.depot_event = new.reference_id) then
    raise exception 'Cet événement se gère maintenant dans l''appli Événements (chargement et retour).' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists mvt_evt_repris on public.stock_movements;
create trigger mvt_evt_repris before insert on public.stock_movements for each row execute function public._mvt_evt_repris();
-- et dans orga.ligne_terrain, juste après orga._depot_evt : perform set_config('epicure.depuis_orga', 'on', true);
