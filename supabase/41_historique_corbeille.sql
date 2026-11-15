-- Chantier 3 (suite) : historique des changements par événement, corbeille 30 jours, événement entier restaurable.
-- Qui a fait quoi : _qui / _qui_voix posent le nom dans la transaction (orga.qui) ; les déclencheurs le lisent.
-- Seuls les gestes d'une personne connectée sont tracés (pas les recalculs automatiques ni les robots).

create table if not exists orga.historique (
  id bigint generated always as identity primary key,
  evenement_id text not null,
  quand timestamptz not null default now(),
  qui text not null,
  quoi text not null,          -- ajout | modif | deplace | coche | suppr | restaure
  type text not null,          -- element | action | poste | evenement
  objet_id text,
  nom text,
  champ text,
  avant text,
  apres text,
  lieu text,
  corbeille_id bigint
);
create index if not exists historique_evt on orga.historique (evenement_id, quand desc);
alter table orga.historique enable row level security;

-- Le nom de la personne connectée suit toute la transaction
do $$
declare def text;
begin
  foreach def in array array[pg_get_functiondef('orga._qui'::regproc), pg_get_functiondef('orga._qui_voix'::regproc)] loop
    if def !~ 'orga\.qui' then
      execute replace(def, '  return v;', '  perform set_config(''orga.qui'', v, true);
  return v;');
    end if;
  end loop;
end $$;

create or replace function orga._hist_log(p_evt text, p_type text, p_id text, p_nom text, p_quoi text, p_champ text default null, p_avant text default null, p_apres text default null, p_lieu text default null)
returns void language sql security definer set search_path = '' as $$
  insert into orga.historique (evenement_id, qui, quoi, type, objet_id, nom, champ, avant, apres, lieu)
  values (p_evt, coalesce(nullif(current_setting('orga.qui', true), ''), '?'), p_quoi, p_type, p_id, p_nom, p_champ, p_avant, p_apres, p_lieu);
$$;
revoke execute on function orga._hist_log(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;

create or replace function orga._t_hist() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  nw jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb; ty text; ev text; nm text; li text; c record; qa numeric; qn numeric;
  restaure boolean := coalesce(current_setting('orga.restaure', true), '') = '1';
  nom_poste text;
begin
  if nullif(current_setting('orga.qui', true), '') is null or coalesce(current_setting('orga.silence', true), '') = '1' or pg_trigger_depth() > 1 then return null; end if;
  r := coalesce(nw, o);
  ty := case tg_table_name when 'elements' then 'element' when 'actions' then 'action' when 'postes' then 'poste' else 'evenement' end;
  ev := case when ty = 'evenement' then r->>'id' else r->>'evenement_id' end;
  nm := r->>(case ty when 'element' then 'element' when 'action' then 'quoi' else 'nom' end);
  if ty in ('element', 'action') then select po.nom into li from orga.postes po where po.evenement_id = ev and po.cle = r->>'poste'; end if;

  if tg_op = 'INSERT' then perform orga._hist_log(ev, ty, r->>'id', nm, case when restaure then 'restaure' else 'ajout' end, null, null, null, li); return null; end if;
  if tg_op = 'DELETE' then perform orga._hist_log(ev, ty, r->>'id', nm, 'suppr', null, null, null, li); return null; end if;

  -- Une enveloppe retirée ou remise
  if ty = 'poste' and (o->>'retire') is distinct from (nw->>'retire') then
    perform orga._hist_log(ev, ty, r->>'cle', nm, case when (nw->>'retire')::boolean then 'suppr' else 'restaure' end); return null;
  end if;

  for c in select * from (values
      ('element', 'element', 'nom'), ('element', 'poste', 'deplace'), ('element', 'qte_forcee', 'qte'), ('element', 'mode_ligne', 'mode'), ('element', 'resp', 'resp'),
      ('element', 'fournisseur', 'fournisseur'), ('element', 'prix_achat', 'prix'), ('element', 'prix_location', 'prix'), ('element', 'prix_production', 'prix'),
      ('action', 'quoi', 'nom'), ('action', 'cout', 'cout'), ('action', 'resp', 'resp'), ('action', 'echeance', 'quand'), ('action', 'statut', 'statut'),
      ('action', 'paye', 'paye'), ('action', 'poste', 'deplace'),
      ('poste', 'nom', 'nom'), ('poste', 'montant', 'montant'), ('poste', 'prix_couvert', 'prix'), ('poste', 'resp', 'resp'),
      ('evenement', 'nom', 'nom'), ('evenement', 'date', 'date'), ('evenement', 'invites', 'invites'), ('evenement', 'statut', 'statut'),
      ('evenement', 'lieu', 'lieu'), ('evenement', 'client', 'client'), ('evenement', 'entite', 'entite')
    ) m(t, col, champ) where m.t = ty and (o->m.col) is distinct from (nw->m.col)
  loop
    if c.champ = 'deplace' then
      select po.nom into nom_poste from orga.postes po where po.evenement_id = ev and po.cle = o->>'poste';
      perform orga._hist_log(ev, ty, r->>'id', nm, 'deplace', null, coalesce(nom_poste, 'Sans enveloppe'), coalesce(li, 'Sans enveloppe'), li);
    elsif c.champ = 'statut' and ty = 'action' and nw->>'statut' = 'Fait' then
      perform orga._hist_log(ev, ty, r->>'id', nm, 'coche', null, null, null, li);
    elsif c.champ = 'nom' then
      perform orga._hist_log(ev, ty, coalesce(r->>'id', r->>'cle'), nw->>c.col, 'modif', 'nom', o->>c.col, nw->>c.col, li);
    else
      perform orga._hist_log(ev, ty, coalesce(r->>'id', r->>'cle'), nm, 'modif', c.champ, o->>c.col, nw->>c.col, li);
    end if;
  end loop;

  -- Quantité d'une ligne : somme prélevé + loué + acheté + produit
  if ty = 'element' then
    qa := coalesce((o->>'stock')::numeric, 0) + coalesce((o->>'location')::numeric, 0) + coalesce((o->>'achat')::numeric, 0) + coalesce((o->>'production')::numeric, 0);
    qn := coalesce((nw->>'stock')::numeric, 0) + coalesce((nw->>'location')::numeric, 0) + coalesce((nw->>'achat')::numeric, 0) + coalesce((nw->>'production')::numeric, 0);
    if qa <> qn then perform orga._hist_log(ev, ty, r->>'id', nm, 'modif', 'qte', qa::text, qn::text, li); end if;
  end if;
  return null;
end $$;

drop trigger if exists t_hist on orga.elements;
drop trigger if exists t_hist on orga.actions;
drop trigger if exists t_hist on orga.postes;
drop trigger if exists t_hist on orga.evenements;
create trigger t_hist after insert or update or delete on orga.elements for each row execute function orga._t_hist();
create trigger t_hist after insert or update or delete on orga.actions for each row execute function orga._t_hist();
create trigger t_hist after update on orga.postes for each row execute function orga._t_hist();
create trigger t_hist after insert or update or delete on orga.evenements for each row execute function orga._t_hist();

-- Une suppression dans l'historique pointe vers sa copie en corbeille (pour « Remettre »)
create or replace function orga._t_corb_hist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update orga.historique h set corbeille_id = new.id
  where h.id = (select h2.id from orga.historique h2 where h2.quoi = 'suppr' and h2.corbeille_id is null and h2.type = new.type
                  and h2.evenement_id = new.evenement_id and (new.type = 'evenement' or h2.objet_id = new.objet_id)
                order by h2.quand desc, h2.id desc limit 1);
  return null;
end $$;
drop trigger if exists t_corb_hist on orga.corbeille;
create trigger t_corb_hist after insert on orga.corbeille for each row execute function orga._t_corb_hist();

-- Supprimer un événement : son contenu part sans bruit dans l'historique, seule la suppression de l'événement est notée
do $$
declare def text;
begin
  def := pg_get_functiondef('orga.evenement_supprimer'::regproc);
  if def !~ 'orga\.silence' then
    def := replace(def, '  delete from orga.factures where evenement_id = p_evt;', '  perform set_config(''orga.silence'', ''1'', true);
  delete from orga.factures where evenement_id = p_evt;');
    def := replace(def, '  delete from orga.evenements where id = p_evt;', '  perform set_config(''orga.silence'', '''', true);
  delete from orga.evenements where id = p_evt;');
    execute def;
  end if;
end $$;

-- Appliquer un chiffrage crée des dizaines de lignes d'un coup : pas de bruit dans l'historique
do $$
declare def text;
begin
  def := pg_get_functiondef('orga.budget_retenir'::regproc);
  if def !~ 'orga\.silence' and def ~ E'\nbegin\n' then
    execute regexp_replace(def, E'\nbegin\n', E'\nbegin\n  perform set_config(''orga.silence'', ''1'', true);\n');
  end if;
end $$;

-- Remettre : une ligne, une action, une enveloppe ou un événement entier
create or replace function orga.objet_restaurer(p_token uuid, p_corbeille bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token); c orga.corbeille; t text;
begin
  select * into c from orga.corbeille where id = p_corbeille and restaure_le is null;
  if c.id is null then raise exception 'introuvable'; end if;
  perform set_config('orga.restaure', '1', true);
  if c.type = 'element' then
    insert into orga.elements select * from jsonb_populate_record(null::orga.elements, c.donnees->'ligne');
    update orga.actions set element_id = c.objet_id where id in (select jsonb_array_elements_text(c.donnees->'actions'));
  elsif c.type = 'action' then
    insert into orga.actions select * from jsonb_populate_record(null::orga.actions, c.donnees->'ligne');
  elsif c.type = 'poste' then
    update orga.postes set retire = false where evenement_id = c.evenement_id and cle = c.objet_id;
  elsif c.type = 'evenement' then
    if exists (select 1 from orga.evenements where id = c.evenement_id) then raise exception 'deja_present'; end if;
    perform set_config('orga.silence', '1', true);
    insert into orga.evenements overriding system value select * from jsonb_populate_recordset(null::orga.evenements, c.donnees->'evenements');
    delete from orga.postes where evenement_id = c.evenement_id;   -- recréées par le déclencheur, remplacées par la copie
    for t in select k from jsonb_object_keys(c.donnees) k
             order by case k when 'evenements' then 0 when 'elements' then 1 when 'actions' then 2 else 3 end loop
      continue when t = 'evenements' or to_regclass('orga.' || quote_ident(t)) is null;
      execute format('insert into orga.%I overriding system value select * from jsonb_populate_recordset(null::orga.%I, $1) on conflict do nothing', t, t) using c.donnees->t;
    end loop;
    perform set_config('orga.silence', '', true);
    perform orga._hist_log(c.evenement_id, 'evenement', c.evenement_id, c.nom, 'restaure');
  else raise exception 'type_inconnu'; end if;
  perform set_config('orga.restaure', '', true);
  update orga.corbeille set restaure_le = now() where id = p_corbeille;
  return true;
end $$;

-- La corbeille : 30 jours, puis effacement
create or replace function orga.corbeille_liste(p_token uuid, p_evt text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  delete from orga.corbeille where coalesce(restaure_le, supprime_le) < now() - interval '30 days';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'type', c.type, 'nom', c.nom, 'supprime_par', c.supprime_par, 'supprime_le', c.supprime_le,
      'jours_restants', greatest(0, 30 - floor(extract(epoch from now() - c.supprime_le) / 86400))::int,
      'evt_nom', e.nom,
      'lieu', case when c.type = 'evenement' then concat_ws(' · ', to_char((c.donnees->'evenements'->0->>'date')::date, 'DD/MM'),
                                                          nullif(c.donnees->'evenements'->0->>'invites', '') || ' invités')
                   when c.type in ('element', 'action') then (select po.nom from orga.postes po where po.evenement_id = c.evenement_id and po.cle = c.donnees->'ligne'->>'poste') end
    ) order by c.supprime_le desc)
    from orga.corbeille c left join orga.evenements e on e.id = c.evenement_id
    where c.restaure_le is null
      and (p_evt is null or (c.evenement_id = p_evt and c.type <> 'evenement'))
      and (c.type = 'evenement' or e.id is not null)), '[]');
end $$;

-- L'historique d'un événement
create or replace function orga.historique(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', h.id, 'quand', h.quand, 'qui', h.qui, 'quoi', h.quoi, 'type', h.type, 'nom', h.nom,
      'champ', h.champ, 'avant', h.avant, 'apres', h.apres, 'lieu', h.lieu, 'corbeille_id', h.corbeille_id,
      'restaure', exists (select 1 from orga.corbeille c where c.id = h.corbeille_id and c.restaure_le is not null)
                  or not exists (select 1 from orga.corbeille c where c.id = h.corbeille_id)) order by h.quand desc, h.id desc)
    from (select * from orga.historique where evenement_id = p_evt order by quand desc, id desc limit 300) h), '[]');
end $$;

grant execute on function orga.corbeille_liste(uuid, text), orga.historique(uuid, text), orga.objet_restaurer(uuid, bigint) to anon, authenticated;
