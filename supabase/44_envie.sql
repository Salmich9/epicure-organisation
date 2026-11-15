-- Lot B (audit 2) : jauge « prêt à … % », mercis, résumé de la journée.

alter table orga.actions add column if not exists mercis jsonb not null default '[]';

-- Prêt = actions cochées + lignes reçues (louer, acheter, produire, rafistoler), sur les enveloppes actives
create or replace function orga._pret(p_evt text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with cles as (select po.cle from orga.postes po where po.evenement_id = p_evt and not po.retire),
  l as (select count(*) total, count(*) filter (where e.reception = 'Reçu') fait from orga.elements e
        where e.evenement_id = p_evt and e.poste in (select cle from cles) and e.mode_ligne in ('louer', 'acheter', 'produire', 'rafistoler')),
  a as (select count(*) total, count(*) filter (where x.statut = 'Fait') fait from orga.actions x
        where x.evenement_id = p_evt and x.poste in (select cle from cles))
  select jsonb_build_object('fait', l.fait + a.fait, 'total', l.total + a.total) from l, a;
$$;
revoke execute on function orga._pret(text) from public, anon, authenticated;

-- La carte d'un événement dans la liste porte sa jauge
do $$
declare def text;
begin
  def := pg_get_functiondef('orga.accueil(uuid)'::regprocedure);
  if def !~ '_pret' then
    execute replace(def, 'declare me text := orga._qui(p_token); r text := orga._role(me); d jsonb := orga._accueil_brut(p_token); ok text[];
begin',
'declare me text := orga._qui(p_token); r text := orga._role(me); d jsonb := orga._accueil_brut(p_token); ok text[];
begin
  d := d || jsonb_build_object(''evenements'', coalesce((select jsonb_agg(x || jsonb_build_object(''pret_fait'', (orga._pret(x->>''id'')->>''fait'')::int, ''pret_total'', (orga._pret(x->>''id'')->>''total'')::int))
                                                          from jsonb_array_elements(d->''evenements'') x), ''[]''));');
  end if;
end $$;

-- Merci : sur une action faite par quelqu'un d'autre, une fois par personne
create or replace function orga.action_merci(p_token uuid, p_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); a orga.actions;
begin
  select * into a from orga.actions where id = p_id;
  if a.id is null then raise exception 'introuvable'; end if;
  if a.statut <> 'Fait' or a.resp is null or a.resp = me then raise exception 'merci_impossible'; end if;
  if not exists (select 1 from jsonb_array_elements(a.mercis) m where m->>'de' = me) then
    update orga.actions set mercis = mercis || jsonb_build_array(jsonb_build_object('de', me, 'le', now())) where id = p_id returning * into a;
  end if;
  return a.mercis;
end $$;

-- Ma journée : ce que j'ai coché, repoussé, les mercis reçus, et l'avancement de mes événements
create or replace function orga.ma_journee(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); j date := (now() at time zone 'Africa/Casablanca')::date;
begin
  return jsonb_build_object(
    'faites', (select count(*) from orga.historique h where h.qui = me and h.quoi = 'coche' and (h.quand at time zone 'Africa/Casablanca')::date = j),
    'repoussees', (select count(*) from orga.historique h where h.qui = me and h.quoi = 'modif' and h.champ = 'quand'
                     and (h.quand at time zone 'Africa/Casablanca')::date = j and coalesce(h.apres, '') > coalesce(h.avant, '')),
    'mercis', coalesce((select jsonb_agg(jsonb_build_object('de', m->>'de', 'quoi', a.quoi) order by m->>'le' desc)
                        from orga.actions a, jsonb_array_elements(a.mercis) m
                        where a.resp = me and (m->>'le')::timestamptz > now() - interval '7 days'), '[]'),
    'evenements', coalesce((select jsonb_agg(x order by x->>'date') from (
        select jsonb_build_object('id', e.id, 'nom', e.nom, 'date', e.date,
          'pret', case when (p->>'total')::int > 0 then round((p->>'fait')::numeric / (p->>'total')::int, 3) else 0 end,
          'gain', case when (p->>'total')::int > 0 then round((select count(*) from orga.historique h where h.evenement_id = e.id and h.quoi = 'coche'
                         and (h.quand at time zone 'Africa/Casablanca')::date = j)::numeric / (p->>'total')::int, 3) else 0 end) x
        from orga.evenements e, lateral (select orga._pret(e.id) p) q
        where e.statut in ('Confirmé', 'En préparation') and (e.date is null or e.date >= j)
          and (exists (select 1 from orga.actions a where a.evenement_id = e.id and a.resp = me)
            or exists (select 1 from orga.postes po where po.evenement_id = e.id and po.resp = me and not po.retire))
          and (p->>'total')::int > 0
        order by e.date nulls last limit 3) s), '[]'));
end $$;

grant execute on function orga.action_merci(uuid, text), orga.ma_journee(uuid) to anon, authenticated;
