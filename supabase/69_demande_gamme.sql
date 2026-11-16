-- 69 · La demande complète et la gamme de l'événement.
--   Pas de chiffrage sans date, invités, lieu, prestations et gamme (contrôlé à l'écran ; la base garde la gamme).
--   Gamme (Classique, Premium, Prestige) = multiplicateur sur le coef de taille : coef = palier × gamme. Classique = 1, rien ne change.
--   Les multiplicateurs sont des paramètres (section Marges), réglables par Salmane.

alter table orga.evenements add column if not exists gamme text;

insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, si, mode, actif, ordre)
values ('g_gamme_premium', 'marges', 'Gamme', 'Multiplicateur Premium', 'sur le coef de taille', 'regle', 1.08, '×', 'toujours', 'achat', true, 630),
       ('g_gamme_prestige', 'marges', 'Gamme', 'Multiplicateur Prestige', 'sur le coef de taille', 'regle', 1.15, '×', 'toujours', 'achat', true, 631)
on conflict (cle) do nothing;

-- Multiplicateur d'une gamme (Classique ou vide = 1)
create or replace function orga._gamme_mult(p_gamme text) returns numeric language sql stable security definer set search_path = '' as $$
  select case p_gamme when 'Premium' then coalesce(orga._param('g_gamme_premium'), 1.08)
                      when 'Prestige' then coalesce(orga._param('g_gamme_prestige'), 1.15) else 1 end
$$;
revoke execute on function orga._gamme_mult(text) from public, anon, authenticated;

create or replace function orga.evenement_creer(p_token uuid, p jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare me text := orga._qui_voix_direction(p_token); nid text; an text := coalesce(to_char((p->>'date')::date, 'YYYY'), to_char(current_date, 'YYYY')); n int;
begin
  select coalesce(max((regexp_match(id, '(\d+)$'))[1]::int), 0) + 1 into n from orga.evenements where id like 'EVT-' || an || '-%';
  nid := 'EVT-' || an || '-' || lpad(n::text, 3, '0');
  insert into orga.evenements (id, nom, date, lieu, invites, statut, client, prestations, format, entite, intermediaire, resp, note, cree_par, gamme)
  values (nid, trim(p->>'nom'), (p->>'date')::date, nullif(p->>'lieu',''), (p->>'invites')::int, 'Demande', nullif(p->>'client',''),
          coalesce(array(select jsonb_array_elements_text(p->'prestations')), '{}'), nullif(p->>'format',''), p->>'entite',
          nullif(p->>'intermediaire',''), me, nullif(p->>'note',''), me, case when p->>'gamme' in ('Classique', 'Premium', 'Prestige') then p->>'gamme' end);
  return (select to_jsonb(e) from orga.evenements e where e.id = nid);
end $function$;

create or replace function orga.evenement_maj(p_token uuid, p_evt text, p jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare me text := orga._qui_voix_direction(p_token);
begin
  update orga.evenements set
    nom = case when p ? 'nom' then coalesce(p->>'nom', nom) else nom end,
    date = case when p ? 'date' then (p->>'date')::date else date end,
    lieu = case when p ? 'lieu' then nullif(p->>'lieu','') else lieu end,
    invites = case when p ? 'invites' then (p->>'invites')::int else invites end,
    statut = case when p ? 'statut' then p->>'statut' else statut end,
    client = case when p ? 'client' then nullif(p->>'client','') else client end,
    prestations = case when p ? 'prestations' then array(select jsonb_array_elements_text(p->'prestations')) else prestations end,
    format = case when p ? 'format' then nullif(p->>'format','') else format end,
    entite = case when p ? 'entite' then p->>'entite' else entite end,
    intermediaire = case when p ? 'intermediaire' then nullif(p->>'intermediaire','') else intermediaire end,
    budget = case when p ? 'budget' then (p->>'budget')::numeric else budget end,
    budget_zones = case when p ? 'budget_zones' then p->'budget_zones' else budget_zones end,
    prix = case when p ? 'prix' then (p->>'prix')::numeric else prix end,
    coef = case when p ? 'coef' then (p->>'coef')::numeric else coef end,
    drive_id = case when p ? 'drive_id' then p->>'drive_id' else drive_id end,
    drive_url = case when p ? 'drive_url' then p->>'drive_url' else drive_url end,
    gamme = case when p ? 'gamme' then (case when p->>'gamme' in ('Classique', 'Premium', 'Prestige') then p->>'gamme' end) else gamme end
  where id = p_evt;
  return (select to_jsonb(e) from orga.evenements e where e.id = p_evt);
end $function$;

-- Chiffrage vocal : la gamme dite multiplie aussi le coef de taille
do $$ declare d text := pg_get_functiondef('orga.voix_chiffrer(uuid,jsonb)'::regprocedure); a text := 'orga._coef_palier(inv))'; begin
  if d ~ '_gamme_mult' then return; end if;
  if position(a in d) = 0 then raise exception 'voix_chiffrer a changé'; end if;
  execute replace(d, a, 'orga._coef_palier(inv) * orga._gamme_mult(p->>''gamme''))');
end $$;
