-- Supprimer un événement et tout ce qui s'y rattache (admins seulement).
-- Une copie complète part dans orga.corbeille : on peut le restaurer à la main si besoin.
create table if not exists orga.corbeille (
  id bigserial primary key, evenement_id text not null, nom text, supprime_par text, supprime_le timestamptz not null default now(), donnees jsonb not null
);
alter table orga.corbeille enable row level security;

create or replace function orga.evenement_supprimer(p_token uuid, p_evt text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); t text; snap jsonb := '{}'; lignes jsonb; v_nom text;
begin
  if not coalesce((select m.admin from orga.membres m where m.nom = me), false) then raise exception 'reserve_admin'; end if;
  select e.nom, to_jsonb(e) into v_nom, lignes from orga.evenements e where e.id = p_evt;
  if v_nom is null then raise exception 'evenement_introuvable'; end if;
  snap := jsonb_build_object('evenements', jsonb_build_array(lignes));
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'orga' and c.column_name = 'evenement_id' and c.table_name not like 'sauv%' and c.table_name <> 'corbeille' loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]'') from orga.%I x where evenement_id = $1', t) into lignes using p_evt;
    if jsonb_array_length(lignes) > 0 then snap := snap || jsonb_build_object(t, lignes); end if;
  end loop;
  insert into orga.corbeille (evenement_id, nom, supprime_par, donnees) values (p_evt, v_nom, me, snap);
  -- d'abord ce qui pointe vers les éléments, puis le reste
  delete from orga.factures where evenement_id = p_evt;
  delete from orga.actions where evenement_id = p_evt;
  delete from orga.staff_evt where evenement_id = p_evt;
  for t in select c.table_name from information_schema.columns c join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
           where c.table_schema = 'orga' and c.column_name = 'evenement_id' and c.table_name not like 'sauv%' and c.table_name not in ('corbeille', 'elements') loop
    execute format('delete from orga.%I where evenement_id = $1', t) using p_evt;
  end loop;
  delete from orga.elements where evenement_id = p_evt;
  delete from orga.evenements where id = p_evt;
  return true;
end $$;
grant execute on function orga.evenement_supprimer(uuid, text) to anon, authenticated;
