-- 67 · Enveloppes par responsable : « Valider le budget » envoie à chacun SON enveloppe ; chaque achat la fait baisser.
--   Une enveloppe = un poste, sauf la matière : tous les moments d'un même responsable forment « Cuisine · coût matière » (détail par moment).
--   Réel = pièces rangées sur les lignes du poste + actions payées (même calcul que les enveloppes existantes).
--   Notifications (famille « enveloppes ») : chaque achat (reste et %), 80 %, dépassement (avec le coordinateur), enveloppe changée, dérive.
--   L'IA range les pièces seule (orga-imputer, chaque 5 minutes) ; elles restent « à vérifier » pour la direction ; le responsable peut dire « pas à moi ».

alter table orga.evenements add column if not exists budget_valide_le timestamptz;
alter table orga.evenements add column if not exists budget_valide_par text;
alter table orga.postes add column if not exists envoye numeric;          -- montant annoncé au responsable (pour dire « 9 000 → 10 500 »)
alter table orga.pieces add column if not exists a_verifier boolean not null default false;
alter table orga.pieces add column if not exists signalee text;           -- « pas à moi » : la raison du responsable

create or replace function orga._mt(v numeric) returns text language sql immutable set search_path = '' as $$
  select replace(to_char(round(coalesce(v, 0)), 'FM999G999G999'), ',', ' ')
$$;

-- Les enveloppes d'un événement, regroupées par responsable
create or replace function orga._env_groupes(p_evt text) returns table (grp text, nom text, resp text, prevu numeric, engage numeric, reel numeric, envoye numeric,
  lignes jsonb, actions jsonb, detail jsonb, cles text[])
language sql stable security definer set search_path = '' as $$
  with p as (select x, case when x->>'type' = 'matiere' then 'matiere' else x->>'cle' end g from jsonb_array_elements(orga._postes_evt(p_evt)) x)
  select p.g, case when p.g = 'matiere' then 'Cuisine · coût matière' else min(p.x->>'nom') end, p.x->>'resp',
    sum((p.x->>'prevu')::numeric), sum((p.x->>'engage')::numeric), sum((p.x->>'reel')::numeric),
    (select sum(po.envoye) from orga.postes po where po.evenement_id = p_evt and po.cle = any(array_agg(p.x->>'cle'))),
    coalesce((select jsonb_agg(e) from jsonb_array_elements(jsonb_agg(p.x->'lignes')) a, jsonb_array_elements(a) e), '[]'),
    coalesce((select jsonb_agg(e) from jsonb_array_elements(jsonb_agg(p.x->'actions')) a, jsonb_array_elements(a) e), '[]'),
    case when p.g = 'matiere' then jsonb_agg(jsonb_build_object('nom', p.x->>'nom', 'prevu', (p.x->>'prevu')::numeric, 'reel', (p.x->>'reel')::numeric)) end,
    array_agg(p.x->>'cle')
  from p group by p.g, p.x->>'resp'
$$;

-- Les achats d'une enveloppe : pièces rangées sur ses lignes, puis actions payées
create or replace function orga._env_achats(p_evt text, p_lignes jsonb, p_actions jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'date' desc), '[]') from (
    select jsonb_build_object('date', f.date, 'fournisseur', f.fournisseur, 'montant', f.montant_ventile, 'element', e.element, 'facture', f.id,
      'piece', pc.id, 'source', pc.source, 'type', pc.type, 'ia', pc.impute_par = 'IA', 'a_verifier', coalesce(pc.a_verifier, false), 'signalee', pc.signalee, 'lien', f.lien) x
    from orga.factures f left join orga.elements e on e.id = f.element_id left join orga.pieces pc on pc.facture_id = f.id
    where f.evenement_id = p_evt and p_lignes ? f.element_id
    union all
    select jsonb_build_object('date', a.echeance, 'fournisseur', a.quoi, 'montant', a.cout, 'action', a.id, 'source', 'action')
    from orga.actions a where a.evenement_id = p_evt and p_actions ? a.id and a.paye and coalesce(a.cout, 0) > 0) t
$$;

-- Quand une pièce est rangée par l'IA : comme piece_imputer, mais signée « IA » et à vérifier
create or replace function orga._piece_ranger(p_id bigint, p_element text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare p orga.pieces; fid text;
begin
  select * into p from orga.pieces where id = p_id for update;
  if p.id is null or p.facture_id is not null or coalesce(p.ignoree, false) then return false; end if;
  if not exists (select 1 from orga.elements where id = p_element and evenement_id = p.evenement_id) then return false; end if;
  fid := orga._next_id('factures', 'FAC-');
  insert into orga.factures (id, evenement_id, date, fournisseur, montant_piece, element_id, montant_ventile, lien, note)
  values (fid, p.evenement_id, coalesce(p.date_piece, p.cree_le::date), p.fournisseur, p.montant, p_element, p.montant, p.drive_url,
          'Rangée par l''IA · ' || coalesce(p.depose_par, '?'));
  update orga.pieces set facture_id = fid, ignoree = false, impute_par = 'IA', impute_le = now(), a_verifier = true where id = p_id;
  return true;
end $$;

-- Les pièces à ranger (pour l'IA) : événement, lignes possibles
create or replace function orga._pieces_a_ranger() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('evt', e.id, 'pieces', (
      select jsonb_agg(jsonb_build_object('id', p.id, 'fournisseur', p.fournisseur, 'type', p.type, 'montant', p.montant, 'par', p.depose_par))
      from orga.pieces p where p.evenement_id = e.id and p.facture_id is null and not coalesce(p.ignoree, false) and p.cree_le < now() - interval '1 minute'),
    'elements', (select jsonb_agg(jsonb_build_object('id', v.id, 'zone', v.zone, 'element', v.element, 'fournisseur', x.fournisseur, 'poste', x.poste, 'cout', round(v.cout)))
      from orga.v_elements v join orga.elements x on x.id = v.id where v.evenement_id = e.id))), '[]')
  from orga.evenements e
  where coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé')
    and exists (select 1 from orga.pieces p where p.evenement_id = e.id and p.facture_id is null and not coalesce(p.ignoree, false) and p.cree_le < now() - interval '1 minute')
    and exists (select 1 from orga.elements x where x.evenement_id = e.id)
$$;

-- Valider le budget : les responsables (modifiables) et le montant annoncé ; les notifications partent au passage qui suit
create or replace function orga.budget_valider(p_token uuid, p_evt text, p_resp jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); k text;
begin
  for k in select jsonb_object_keys(coalesce(p_resp, '{}')) loop
    if k = 'matiere' then update orga.postes set resp = nullif(p_resp->>k, '') where evenement_id = p_evt and type = 'matiere' and not retire;
    else update orga.postes set resp = nullif(p_resp->>k, '') where evenement_id = p_evt and cle = k; end if;
  end loop;
  update orga.evenements set budget_valide_le = now(), budget_valide_par = me where id = p_evt;
  update orga.postes po set envoye = (x->>'prevu')::numeric
    from jsonb_array_elements(orga._postes_evt(p_evt)) x where po.evenement_id = p_evt and po.cle = x->>'cle';
  return orga.enveloppes_evt(p_token, p_evt);
end $$;

-- Vue de la direction : toutes les enveloppes, achats, pièces à vérifier
create or replace function orga.enveloppes_evt(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return jsonb_build_object(
    'valide_le', (select budget_valide_le from orga.evenements where id = p_evt),
    'enveloppes', (select coalesce(jsonb_agg(jsonb_build_object('grp', g.grp, 'nom', g.nom, 'resp', g.resp, 'compte', orga._membre_de(g.resp) is not null,
        'prevu', g.prevu, 'engage', g.engage, 'reel', g.reel, 'envoye', g.envoye, 'detail', g.detail, 'achats', orga._env_achats(p_evt, g.lignes, g.actions))
        order by g.grp = 'matiere' desc, g.nom), '[]') from orga._env_groupes(p_evt) g),
    'a_verifier', (select coalesce(jsonb_agg(jsonb_build_object('piece', p.id, 'fournisseur', p.fournisseur, 'montant', p.montant, 'element', e.element, 'element_id', e.id,
        'zone', e.zone, 'signalee', p.signalee) order by p.impute_le desc), '[]')
      from orga.pieces p join orga.factures f on f.id = p.facture_id left join orga.elements e on e.id = f.element_id where p.evenement_id = p_evt and p.a_verifier),
    'membres', (select coalesce(jsonb_agg(nom order by nom), '[]') from orga.membres));
end $$;

-- Vue d'un responsable : seulement SES enveloppes (jamais un prix de vente ni une marge)
create or replace function orga.mon_enveloppe(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); dir boolean := orga._role(me) <> 'equipe';
begin
  return jsonb_build_object('evenement', (select jsonb_build_object('id', e.id, 'nom', e.nom, 'code', e.code, 'entite', e.entite, 'date', e.date, 'valide_le', e.budget_valide_le) from orga.evenements e where e.id = p_evt),
    'enveloppes', (select coalesce(jsonb_agg(jsonb_build_object('grp', g.grp, 'nom', g.nom, 'resp', g.resp, 'prevu', g.prevu, 'reel', g.reel, 'detail', g.detail,
        'achats', orga._env_achats(p_evt, g.lignes, g.actions)) order by g.grp = 'matiere' desc, g.nom), '[]')
      from orga._env_groupes(p_evt) g where orga._membre_de(g.resp) = me or (dir and g.resp is not null)));
end $$;

-- Mes enveloppes, tous événements (pour Ma part)
create or replace function orga.mes_enveloppes(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('evt', e.id, 'evt_nom', e.nom, 'code', e.code, 'date', e.date, 'grp', g.grp, 'nom', g.nom, 'prevu', g.prevu, 'reel', g.reel)
      order by e.date, g.nom), '[]')
    from orga.evenements e cross join lateral orga._env_groupes(e.id) g
    where e.budget_valide_le is not null and coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé') and orga._membre_de(g.resp) = me);
end $$;

-- La direction confirme le rangement de l'IA ; le responsable signale une pièce qui n'est pas à lui
create or replace function orga.piece_verifier(p_token uuid, p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  update orga.pieces set a_verifier = false, signalee = null where id = p_id;
  return found;
end $$;
create or replace function orga.piece_signaler(p_token uuid, p_id bigint, p_raison text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); p orga.pieces; ev orga.evenements; coord text;
begin
  select * into p from orga.pieces where id = p_id;
  if p.id is null then raise exception 'piece_introuvable'; end if;
  update orga.pieces set a_verifier = true, signalee = coalesce(nullif(trim(p_raison), ''), 'pas à ' || me) where id = p_id;
  select * into ev from orga.evenements where id = p.evenement_id;
  coord := coalesce(orga._membre_de(ev.equipe->>'coordination'), 'Salmane');
  if orga._dest_ok(coord) then
    insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
    values ('SG|' || p_id || '|' || coord, coord, 'enveloppes', orga._court('Pièce à reranger', 28),
      concat_ws(' · ', ev.code, coalesce(p.fournisseur, '?') || ' ' || orga._mt(p.montant), me || ' : pas à moi') || E'\nTouche : voir les enveloppes',
      '/#/enveloppes-evt/' || ev.id, 'P' || p_id) on conflict (cle) do nothing;
  end if;
  return true;
end $$;

-- La pièce rangée à la main (déplacée) n'est plus à vérifier
do $$ declare d text := pg_get_functiondef('orga.piece_imputer(uuid,bigint,text)'::regprocedure); begin
  if d ~ 'a_verifier = false' then return; end if;
  d := replace(d, 'update orga.pieces set facture_id = fid, ignoree = false, impute_par = me, impute_le = now() where id = p_id;',
                  'update orga.pieces set facture_id = fid, ignoree = false, impute_par = me, impute_le = now(), a_verifier = false, signalee = null where id = p_id;');
  if d !~ 'a_verifier = false' then raise exception 'piece_imputer a changé'; end if;
  execute d;
end $$;

-- Les notifications d'enveloppes (appelées par le passage, hors heures calmes)
create or replace function orga._notifs_enveloppes(p_now timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare ev record; g record; f record; d text; m text; coord text; n int := 0; k int; court text; pct int;
begin
  for ev in select * from orga.evenements e where e.budget_valide_le is not null and coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé') loop
    coord := coalesce(orga._membre_de(ev.equipe->>'coordination'), 'Salmane');
    for g in select * from orga._env_groupes(ev.id) loop
      m := orga._membre_de(g.resp);
      court := case when g.grp = 'matiere' then 'cuisine' else lower(g.nom) end;
      pct := case when g.prevu > 0 then floor(g.reel / g.prevu * 100) else 0 end;
      if orga._dest_ok(m) and g.prevu > 0 then
        -- chaque achat rangé après la validation du budget
        for f in select fa.id, fa.montant_ventile from orga.factures fa join orga.pieces pc on pc.facture_id = fa.id
                 where fa.evenement_id = ev.id and g.lignes ? fa.element_id and pc.impute_le > ev.budget_valide_le loop
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
          values ('AA|' || f.id || '|' || m, m, 'enveloppes', orga._court('Achat ' || orga._mt(f.montant_ventile) || ' · ' || court, 28),
            concat_ws(' · ', ev.code, 'reste ' || orga._mt(g.prevu - g.reel) || ' sur ' || orga._mt(g.prevu) || ' (' || pct || ' %)') || E'\nTouche : voir mon enveloppe',
            '/#/mon-enveloppe/' || ev.id, 'E' || ev.id || g.grp, f.montant_ventile) on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end loop;
        -- 80 %
        if g.reel >= g.prevu * 0.8 and g.reel <= g.prevu then
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
          values ('S80|' || ev.id || '|' || g.grp || '|' || m, m, 'enveloppes', orga._court(initcap(court) || ' à ' || pct || ' %', 28),
            concat_ws(' · ', ev.code, 'reste ' || orga._mt(g.prevu - g.reel) || ' sur ' || orga._mt(g.prevu)) || E'\nTouche : voir mon enveloppe',
            '/#/mon-enveloppe/' || ev.id, 'E' || ev.id || g.grp) on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end if;
        -- enveloppe changée depuis l'annonce
        if g.envoye is not null and round(g.envoye) <> round(g.prevu) then
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag)
          values ('CH|' || ev.id || '|' || g.grp || '|' || m || '|' || round(g.prevu), m, 'enveloppes', 'Ton enveloppe change',
            concat_ws(' · ', ev.code, court || ' ' || orga._mt(g.envoye) || ' → ' || orga._mt(g.prevu)) || E'\nTouche : voir mon enveloppe',
            '/#/mon-enveloppe/' || ev.id, 'E' || ev.id || g.grp) on conflict (cle) do nothing;
          get diagnostics k = row_count; n := n + k;
        end if;
      end if;
      if g.envoye is not null and round(g.envoye) <> round(g.prevu) then
        update orga.postes po set envoye = (x->>'prevu')::numeric from jsonb_array_elements(orga._postes_evt(ev.id)) x
          where po.evenement_id = ev.id and po.cle = x->>'cle' and po.cle = any(g.cles);
      end if;
      -- dépassement (le responsable et le coordinateur) ; redit si ça monte de 10 %
      if g.prevu > 0 and g.reel > g.prevu then
        for d in select distinct z from unnest(array[m, coord]) z where orga._dest_ok(z) loop
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
          values ('S100|' || ev.id || '|' || g.grp || '|' || d, d, 'enveloppes', 'Enveloppe dépassée',
            concat_ws(' · ', ev.code, court || ' ' || orga._mt(g.reel) || ' sur ' || orga._mt(g.prevu) || ' (+' || orga._mt(g.reel - g.prevu) || ')') || E'\nTouche : voir ' || case when d = m then 'mon enveloppe' else 'les enveloppes' end,
            case when d = m then '/#/mon-enveloppe/' || ev.id else '/#/enveloppes-evt/' || ev.id end, 'E' || ev.id || g.grp, g.reel)
          on conflict (cle) do update set corps = excluded.corps, montant = excluded.montant, statut = 'a_envoyer', cree_le = now()
            where orga.alertes_envoyees.montant * 1.1 <= excluded.montant;
          get diagnostics k = row_count; n := n + k;
        end loop;
      -- dérive : ce qui est engagé dépasse l'enveloppe de plus de 5 % avant même les factures
      elsif g.prevu > 0 and g.engage > g.prevu * 1.05 then
        for d in select distinct z from unnest(array[m, coord]) z where orga._dest_ok(z) loop
          insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
          values ('DV|' || ev.id || '|' || g.grp || '|' || d, d, 'enveloppes', orga._court(initcap(court) || ' dérive', 28),
            concat_ws(' · ', ev.code, 'engagé ' || orga._mt(g.engage) || ' pour ' || orga._mt(g.prevu) || ' (+' || round((g.engage / g.prevu - 1) * 100) || ' %)') || E'\nTouche : voir les pistes',
            case when d = m then '/#/mon-enveloppe/' || ev.id else '/#/enveloppes-evt/' || ev.id end, 'E' || ev.id || g.grp, g.engage)
          on conflict (cle) do update set corps = excluded.corps, montant = excluded.montant, statut = 'a_envoyer', cree_le = now()
            where orga.alertes_envoyees.montant * 1.1 <= excluded.montant;
          get diagnostics k = row_count; n := n + k;
        end loop;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- Le passage appelle les enveloppes (si la famille est allumée), après les heures calmes
do $$ declare d text := pg_get_functiondef('orga._notifs_passage(timestamptz)'::regprocedure); begin
  if d ~ '_notifs_enveloppes' then return; end if;
  d := replace(d, '  if calme then return n; end if;', '  if calme then return n; end if;
  if coalesce((f->>''enveloppes'')::boolean, true) then n := n + orga._notifs_enveloppes(p_now); end if;');
  if d !~ '_notifs_enveloppes' then raise exception '_notifs_passage a changé'; end if;
  execute d;
end $$;

-- Réveil du rangement par l'IA (toutes les 5 minutes)
create or replace function orga._ranger_reveil() returns bigint language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://daehifcdzrusxtzhtuxi.supabase.co/functions/v1/orga-imputer',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select p.valeur #>> '{}' from orga.parametres p where p.cle = 'notifs_secret')),
    body := '{"action":"ranger"}'::jsonb, timeout_milliseconds := 55000)
  where exists (select 1 from orga.pieces p where p.facture_id is null and not coalesce(p.ignoree, false) and p.cree_le < now() - interval '1 minute' and p.cree_le > now() - interval '30 days');
$$;

revoke all on function orga._env_groupes(text), orga._env_achats(text, jsonb, jsonb), orga._piece_ranger(bigint, text), orga._pieces_a_ranger(),
  orga._notifs_enveloppes(timestamptz), orga._ranger_reveil() from public, anon, authenticated;
grant execute on function orga._piece_ranger(bigint, text), orga._pieces_a_ranger() to service_role;
grant execute on function orga.budget_valider(uuid, text, jsonb), orga.enveloppes_evt(uuid, text), orga.mon_enveloppe(uuid, text), orga.mes_enveloppes(uuid),
  orga.piece_verifier(uuid, bigint), orga.piece_signaler(uuid, bigint, text) to anon, authenticated;

select cron.schedule('orga-ranger', '*/5 * * * *', 'select orga._ranger_reveil()');
