-- Bilan de clôture : prévu / réel, pourquoi, check-list, leçons qui corrigent le catalogue.
-- À coller dans Supabase › SQL Editor (projet Epicure-dev) puis « Run ». Ne touche qu'au schéma orga.
alter table orga.evenements add column if not exists bilan jsonb not null default '{}'::jsonb, add column if not exists cloture_le timestamptz;

create table if not exists orga.lecons (
  id bigserial primary key,
  evenement_id text not null references orga.evenements(id),
  zone text, texte text not null, detail text,
  catalogue_id text, champ text check (champ in ('qte_par_base','prix_achat','prix_location','prix_production')), valeur numeric, avant numeric,
  statut text not null default 'proposee' check (statut in ('proposee','retenue','ignoree')),
  cree_le timestamptz not null default now(), decide_par text, decide_le timestamptz
);
alter table orga.lecons enable row level security;
revoke all on orga.lecons from anon, authenticated;
create index if not exists lecons_evt_idx on orga.lecons (evenement_id);

-- Bilan : pourquoi par zone, cases à cocher (retours, casse, fournisseurs payés)
create or replace function orga.bilan_maj(p_token uuid, p_evt text, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.evenements set bilan = coalesce(bilan, '{}'::jsonb) || p where id = p_evt;
  return (select bilan from orga.evenements where id = p_evt);
end $$;

-- Leçons proposées par le copilote (remplace les propositions encore en attente)
create or replace function orga.lecons_enregistrer(p_token uuid, p_evt text, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); x jsonb; c orga.catalogue; ch text;
begin
  delete from orga.lecons where evenement_id = p_evt and statut = 'proposee';
  for x in select * from jsonb_array_elements(p) loop
    ch := nullif(x->>'champ', '');
    select * into c from orga.catalogue where id = x->>'catalogue_id';
    insert into orga.lecons (evenement_id, zone, texte, detail, catalogue_id, champ, valeur, avant)
    values (p_evt, x->>'zone', x->>'texte', x->>'detail', c.id, case when c.id is not null then ch end, (x->>'valeur')::numeric,
            case ch when 'qte_par_base' then c.qte_par_base when 'prix_achat' then c.prix_achat when 'prix_location' then c.prix_location when 'prix_production' then c.prix_production end);
  end loop;
  return (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]') from orga.lecons l where l.evenement_id = p_evt);
end $$;

-- Retenir une leçon : elle corrige le catalogue (une seule valeur, un seul champ autorisé)
create or replace function orga.lecon_decider(p_token uuid, p_id bigint, p_retenir boolean) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); l orga.lecons;
begin
  select * into l from orga.lecons where id = p_id;
  if l.id is null then raise exception 'lecon_introuvable'; end if;
  if p_retenir and l.catalogue_id is not null and l.champ is not null and l.valeur is not null then
    execute format('update orga.catalogue set %I = $1 where id = $2', l.champ) using l.valeur, l.catalogue_id;
  end if;
  update orga.lecons set statut = case when p_retenir then 'retenue' else 'ignoree' end, decide_par = me, decide_le = now() where id = p_id;
  return (select to_jsonb(x) from orga.lecons x where x.id = p_id);
end $$;

create or replace function orga.bilan_liste(p_token uuid, p_evt text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return jsonb_build_object(
    'lecons', (select coalesce(jsonb_agg(to_jsonb(l) order by l.id), '[]') from orga.lecons l where l.evenement_id = p_evt),
    'encaissements', (select coalesce(sum(montant), 0) from orga.encaissements where evenement_id = p_evt),
    'enveloppes', (select coalesce(jsonb_agg(jsonb_build_object('nom', t.titulaire, 'reste', orga._reste(p_evt, t.titulaire), 'attente',
                      exists (select 1 from orga.mouvements_esp m where m.evenement_id = p_evt and m.titulaire = t.titulaire and m.statut = 'a_confirmer'))), '[]')
                    from (select distinct titulaire from orga.mouvements_esp where evenement_id = p_evt) t),
    'pieces_a_imputer', (select count(*) from orga.pieces where evenement_id = p_evt and facture_id is null and not coalesce(ignoree, false)));
end $$;
grant select on orga.lecons to service_role;

-- Clôturer : l'appli vérifie la check-list ; « quand même » garde la raison dans le bilan
create or replace function orga.evenement_cloturer(p_token uuid, p_evt text, p_raison text) returns boolean language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  update orga.evenements set statut = 'Clôturé', cloture_le = now(),
         bilan = coalesce(bilan, '{}'::jsonb) || jsonb_build_object('cloture_par', me, 'raison', nullif(p_raison, ''))
   where id = p_evt;
  return true;
end $$;

-- Ne plus passer en « Devis envoyé » en retenant le budget (correctif du script précédent)
do $$ declare d text;
begin
  select pg_get_functiondef('orga.budget_retenir(uuid,text,numeric,jsonb,numeric,numeric)'::regprocedure) into d;
  d := regexp_replace(d, ',\s*statut\s*=\s*case when statut in \(''Demande''\) then ''Devis envoyé'' else statut end', '');
  execute d;
end $$;

-- Droits : fonctions publiques pour l'appli, internes (_…) fermées
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'orga' loop
    execute format('revoke all on function %s from public, authenticated', f.sig);
    if left(f.proname, 1) = '_' then execute format('revoke all on function %s from anon', f.sig); else execute format('grant execute on function %s to anon', f.sig); end if;
  end loop;
end $$;

select 'ok' as bilan, (select count(*) from orga.lecons) as lecons,
       position('Devis envoy' in pg_get_functiondef('orga.budget_retenir(uuid,text,numeric,jsonb,numeric,numeric)'::regprocedure)) = 0 as budget_corrige;
