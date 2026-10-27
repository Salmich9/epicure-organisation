-- Cycle de vie de l'événement : prix signé, mode d'encaissement, confirmation, statuts.
-- À coller dans Supabase › SQL Editor (projet Epicure-dev) puis « Run ». Ne touche qu'au schéma orga.
alter table orga.evenements add column if not exists prix_signe numeric, add column if not exists signe_le date, add column if not exists presentation text not null default 'prestation';
update orga.evenements set prix_signe = prix, signe_le = coalesce(signe_le, current_date) where statut in ('Confirmé','En préparation','Réalisé','Clôturé') and prix_signe is null;
alter table orga.encaissements add column if not exists mode text not null default 'Espèces' check (mode in ('Espèces','Virement','Chèque'));
grant update (statut, presentation) on orga.evenements to service_role;

create or replace function orga._chez_salmane(p_evt text) returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce((select sum(montant) from orga.encaissements where evenement_id = p_evt and mode = 'Espèces'), 0)
       - coalesce((select sum(montant) from orga.mouvements_esp where evenement_id = p_evt and type = 'remise' and statut <> 'refuse'), 0)
       + coalesce((select sum(montant) from orga.mouvements_esp where evenement_id = p_evt and type = 'rendu' and statut = 'ok'), 0)
$$;

drop function if exists orga.encaissement_ajouter(uuid, text, numeric, date, text);
create or replace function orga.encaissement_ajouter(p_token uuid, p_evt text, p_montant numeric, p_date date, p_note text, p_mode text default 'Espèces') returns bigint language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); nid bigint;
begin
  insert into orga.encaissements (evenement_id, date, montant, note, par, mode) values (p_evt, coalesce(p_date, current_date), p_montant, nullif(p_note, ''), me, coalesce(p_mode, 'Espèces')) returning id into nid;
  return nid;
end $$;

create or replace function orga.evenement_confirmer(p_token uuid, p_evt text, p_prix numeric, p_avance numeric, p_mode text, p_date date) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if p_prix is null or p_prix <= 0 then raise exception 'prix_invalide'; end if;
  update orga.evenements set prix_signe = p_prix, signe_le = coalesce(p_date, current_date), statut = 'Confirmé', prix = coalesce(prix, p_prix) where id = p_evt;
  if coalesce(p_avance, 0) > 0 then
    insert into orga.encaissements (evenement_id, date, montant, note, par, mode) values (p_evt, coalesce(p_date, current_date), p_avance, 'Avance à la signature', me, coalesce(p_mode, 'Espèces'));
  end if;
  return (select to_jsonb(e) from orga.evenements e where e.id = p_evt);
end $$;

create or replace function orga.evenement_statut(p_token uuid, p_evt text, p_statut text) returns boolean language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if p_statut not in ('Demande','Devis envoyé','Confirmé','Réalisé','Clôturé','Perdu') then raise exception 'statut_inconnu'; end if;
  update orga.evenements set statut = p_statut where id = p_evt; return true;
end $$;

-- Retenir le budget ne change plus le statut : c'est la signature qui confirme
do $$ declare d text;
begin
  select pg_get_functiondef('orga.budget_retenir(uuid,text,numeric,jsonb,numeric,numeric)'::regprocedure) into d;
  d := replace(d, ',
         statut = case when statut in (''Demande'') then ''Devis envoyé'' else statut end', '');
  execute d;
end $$;

-- Droits : l'appli appelle les fonctions publiques, jamais les fonctions internes (_…)
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'orga' loop
    execute format('revoke all on function %s from public, authenticated', f.sig);
    if left(f.proname, 1) = '_' then execute format('revoke all on function %s from anon', f.sig); else execute format('grant execute on function %s to anon', f.sig); end if;
  end loop;
end $$;

select nom, statut, prix_signe from orga.evenements;
