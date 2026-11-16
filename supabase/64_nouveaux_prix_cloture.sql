-- 64 · Nouveaux prix à la clôture : l'IA compare le prévu (paramètres) au réel (pièces) et propose ; Salmane décide une à une.
--   elements.param relie une ligne de la check-list au paramètre qui l'a chiffrée (posé par budget_retenir).
--   orga.chiffrage_propositions garde chaque proposition et la décision (acceptée, modifiée, gardée).

alter table orga.elements add column if not exists param text;

-- Relie les éléments déjà créés à partir d'un chiffrage par paramètres (même zone, même nom)
update orga.elements e set param = l->>'param'
from orga.chiffrages c, jsonb_array_elements(c.lignes) l
where c.evenement_id = e.evenement_id and e.param is null and coalesce(l->>'param', '') <> ''
  and e.zone = l->>'zone' and lower(e.element) = lower(l->>'element');

-- La check-list reprend le paramètre de chaque ligne
do $$ declare d text := pg_get_functiondef('orga.budget_retenir(uuid,text,numeric,jsonb,numeric,numeric)'::regprocedure); begin
  if d !~ 'catalogue_id, description, modifie_par\)' then raise exception 'budget_retenir a changé'; end if;
  d := replace(d, 'catalogue_id, description, modifie_par)', 'catalogue_id, description, modifie_par, param)');
  d := replace(d, $x$'Estimé', 'À lancer', r, c.id, nullif(l->>'note',''), me);$x$, $x$'Estimé', 'À lancer', r, c.id, nullif(l->>'note',''), me, nullif(l->>'param', ''));$x$);
  if d !~ $x$nullif\(l->>'param', ''\)\);$x$ then raise exception 'remplacement raté'; end if;
  execute d;
end $$;

create table if not exists orga.chiffrage_propositions (
  id bigserial primary key,
  evenement_id text not null,
  cle text not null references orga.chiffrage_params(cle) on delete cascade,
  champ text not null default 'valeur',     -- valeur | ratio
  ancien numeric, propose numeric not null, reel numeric,
  raison text, tendance text, points jsonb,  -- points : valeurs des derniers événements (courbe)
  statut text not null default 'proposee',  -- proposee | acceptee | modifiee | gardee
  valeur_finale numeric, decide_par text, decide_le timestamptz, note text,
  cree_le timestamptz not null default now(),
  unique (evenement_id, cle, champ)
);
alter table orga.chiffrage_propositions enable row level security;

-- Ce que l'IA reçoit : poste par poste, le prévu (quantité, prix) et le réel (pièces rangées sur les lignes de ce poste)
create or replace function orga.cloture_donnees(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); c orga.chiffrages;
begin
  select * into c from orga.chiffrages where evenement_id = p_evt;
  return jsonb_build_object(
    'base', c.base,
    'postes', (select coalesce(jsonb_agg(x order by x->>'cle'), '[]') from (
      select jsonb_build_object('cle', l.param, 'libelle', min(p.libelle), 'calcul', min(p.calcul), 'unite', min(p.unite), 'ratio_unite', min(p.ratio_unite),
        'reference', min(p.valeur), 'ratio_reference', min(p.ratio),
        'prevu_qte', sum(l.qte), 'prevu_prix', round(sum(l.qte * l.prix) / nullif(sum(l.qte), 0), 2), 'prevu_total', round(sum(l.qte * l.prix)), 'personnes', count(*) filter (where l.rang),
        'reel_total', (select round(sum(v.facture)) from orga.elements e join orga.v_elements v on v.id = e.id where e.evenement_id = p_evt and e.param = l.param and coalesce(v.facture, 0) > 0),
        'lignes_facturees', (select count(*) from orga.elements e join orga.v_elements v on v.id = e.id where e.evenement_id = p_evt and e.param = l.param and coalesce(v.facture, 0) > 0),
        'lignes', (select count(*) from orga.elements e where e.evenement_id = p_evt and e.param = l.param),
        'histo', (select coalesce(jsonb_agg(jsonb_build_object('champ', h.champ, 'ancien', h.ancien, 'nouveau', h.nouveau, 'portee', h.portee, 'le', h.le::date) order by h.le), '[]')
                  from (select * from orga.chiffrage_params_histo h where h.cle = l.param order by le desc limit 10) h),
        'deja_garde', (select count(*) from orga.chiffrage_propositions q where q.cle = l.param and q.statut = 'gardee')) x
      from (select z->>'param' param, coalesce(nullif(z->>'quantite', '')::numeric, 0) qte, coalesce(nullif(z->>'prix', '')::numeric, 0) prix, z ? 'rang' rang
            from jsonb_array_elements(coalesce(c.lignes, '[]')) z where coalesce(z->>'param', '') <> '') l
      join orga.chiffrage_params p on p.cle = l.param
      group by l.param) t),
    -- Réel des événements passés, par poste : prix unitaire facturé (pour la tendance)
    'passes', (select coalesce(jsonb_agg(y), '[]') from (
      select jsonb_build_object('cle', e.param, 'evt', ev.nom, 'date', ev.date, 'reel', round(sum(v.facture)), 'lignes', count(*)) y
      from orga.elements e join orga.v_elements v on v.id = e.id join orga.evenements ev on ev.id = e.evenement_id
      where e.param is not null and e.evenement_id <> p_evt and coalesce(v.facture, 0) > 0
      group by e.param, ev.nom, ev.date order by ev.date desc limit 120) z));
end $$;

create or replace function orga.propositions_enregistrer(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); x jsonb; k text; a numeric;
begin
  delete from orga.chiffrage_propositions where evenement_id = p_evt and statut = 'proposee';
  for x in select * from jsonb_array_elements(coalesce(p, '[]')) loop
    k := x->>'param';
    if not exists (select 1 from orga.chiffrage_params where cle = k) then continue; end if;
    if coalesce(nullif(x->>'propose', '')::numeric, 0) <= 0 then continue; end if;
    a := (select case when coalesce(x->>'champ', 'valeur') = 'ratio' then ratio else valeur end from orga.chiffrage_params where cle = k);
    if a = (x->>'propose')::numeric then continue; end if;
    insert into orga.chiffrage_propositions (evenement_id, cle, champ, ancien, propose, reel, raison, tendance, points)
    values (p_evt, k, case when x->>'champ' = 'ratio' then 'ratio' else 'valeur' end, a, (x->>'propose')::numeric, nullif(x->>'reel', '')::numeric,
            left(x->>'raison', 300), left(x->>'tendance', 200), case when jsonb_typeof(x->'points') = 'array' then x->'points' end)
    on conflict (evenement_id, cle, champ) do nothing;
  end loop;
  return orga.propositions_liste(p_token, p_evt);
end $$;

create or replace function orga.propositions_liste(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return jsonb_build_object('peut_modifier', orga._chiffrage_editeur(me), 'propositions', (
    select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('libelle', p.libelle, 'unite', p.unite, 'ratio_unite', p.ratio_unite, 'calcul', p.calcul,
             'section', p.section, 'groupe', p.groupe, 'actuel', case when q.champ = 'ratio' then p.ratio else p.valeur end, 'nb_modifs', (select count(*) from orga.chiffrage_params_histo h where h.cle = q.cle))
           order by q.statut <> 'proposee', q.id), '[]')
    from orga.chiffrage_propositions q join orga.chiffrage_params p on p.cle = q.cle where q.evenement_id = p_evt));
end $$;

-- Décision : accepter (valeur proposée), modifier (ta valeur), garder (rien ne change, noté pour ne pas reproposer)
create or replace function orga.proposition_decider(p_token uuid, p_id bigint, p_decision text, p_valeur numeric, p_raison text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); q orga.chiffrage_propositions; v numeric;
begin
  if not orga._chiffrage_editeur(me) then raise exception 'reserve_editeur_parametres'; end if;
  select * into q from orga.chiffrage_propositions where id = p_id for update;
  if q.id is null then raise exception 'introuvable'; end if;
  if q.statut <> 'proposee' then raise exception 'deja_traitee'; end if;
  if p_decision = 'garder' then
    update orga.chiffrage_propositions set statut = 'gardee', decide_par = me, decide_le = now(), note = nullif(p_raison, '') where id = p_id;
  else
    v := case when p_decision = 'modifier' then p_valeur else q.propose end;
    if v is null or v <= 0 then raise exception 'valeur_invalide'; end if;
    perform orga._param_changer(q.cle, jsonb_build_object(q.champ, v), 'cloture', q.evenement_id, me,
      coalesce(nullif(p_raison, ''), q.raison));
    update orga.chiffrage_propositions set statut = case when p_decision = 'modifier' and v <> q.propose then 'modifiee' else 'acceptee' end,
      valeur_finale = v, decide_par = me, decide_le = now(), note = nullif(p_raison, '') where id = p_id;
  end if;
  return orga.propositions_liste(p_token, q.evenement_id);
end $$;

grant execute on function orga.cloture_donnees(uuid, text), orga.propositions_enregistrer(uuid, text, jsonb), orga.propositions_liste(uuid, text),
  orga.proposition_decider(uuid, bigint, text, numeric, text) to anon, authenticated;
