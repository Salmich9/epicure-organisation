-- Audit technique n°7 : journal des erreurs et contrôle de santé quotidien des connecteurs.

create table if not exists orga.journal (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  source text not null,
  message text not null,
  detail jsonb,
  qui text
);
create index if not exists journal_quand on orga.journal (quand desc);
alter table orga.journal enable row level security;

create table if not exists orga.sante (
  id bigint generated always as identity primary key,
  quand timestamptz not null default now(),
  ok boolean not null,
  origine text,
  resultats jsonb not null
);
alter table orga.sante enable row level security;

insert into orga.parametres (cle, valeur) values ('sante', jsonb_build_object('secret', gen_random_uuid()::text)) on conflict (cle) do nothing;

-- L'appli note ses erreurs (30 par personne et par heure au plus, textes coupés)
create or replace function orga.journal_ecrire(p_token uuid, p_source text, p_message text, p_detail jsonb default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui(p_token);
begin
  if (select count(*) from orga.journal j where j.qui = me and j.quand > now() - interval '1 hour') >= 30 then return false; end if;
  insert into orga.journal (source, message, detail, qui)
  values (left(coalesce(p_source, 'app'), 60), left(coalesce(p_message, '?'), 300), case when p_detail is null then null else left(p_detail::text, 2000)::jsonb end, me);
  delete from orga.journal where quand < now() - interval '60 days';
  return true;
exception when invalid_text_representation then
  insert into orga.journal (source, message, qui) values (left(coalesce(p_source, 'app'), 60), left(coalesce(p_message, '?'), 300), me);
  return true;
end $$;

create or replace function orga.sante_autorise(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token);
begin return true; end $$;

-- L'état pour l'écran des admins : dernier contrôle, erreurs récentes regroupées
create or replace function orga.sante_etat(p_token uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_admin(p_token);
begin
  return jsonb_build_object(
    'dernier', (select jsonb_build_object('quand', s.quand, 'ok', s.ok, 'origine', s.origine, 'resultats', s.resultats) from orga.sante s order by s.quand desc limit 1),
    'erreurs_24h', (select count(*) from orga.journal j where j.quand > now() - interval '24 hours'),
    'erreurs', coalesce((select jsonb_agg(x order by x->>'dernier' desc) from (
        select jsonb_build_object('source', j.source, 'message', j.message, 'nb', count(*), 'dernier', max(j.quand), 'qui', array_agg(distinct j.qui) filter (where j.qui is not null)) x
        from orga.journal j where j.quand > now() - interval '7 days' group by j.source, j.message order by max(j.quand) desc limit 40) t), '[]'));
end $$;

grant execute on function orga.journal_ecrire(uuid, text, text, jsonb), orga.sante_autorise(uuid), orga.sante_etat(uuid) to anon, authenticated;

-- Les admins voient une alerte sur l'accueil si le dernier contrôle a trouvé une panne ou si les erreurs s'accumulent
create or replace function orga._sante_resume() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quand', s.quand,
    'pannes', coalesce((select jsonb_agg(r->>'nom') from jsonb_array_elements(s.resultats) r where (r->>'ok') = 'false'), '[]'),
    'erreurs_24h', (select count(*) from orga.journal j where j.quand > now() - interval '24 hours' and j.source not like 'sante:%'))
  from (select * from orga.sante order by quand desc limit 1) s;
$$;
revoke execute on function orga._sante_resume() from public, anon, authenticated;

do $$
declare def text;
begin
  def := pg_get_functiondef('orga.accueil(uuid)'::regprocedure);
  if def !~ '_sante_resume' then
    execute replace(def, '  if r <> ''equipe'' then return d || jsonb_build_object(''role'', r, ''admin'', coalesce((select m.admin from orga.membres m where m.nom = me), false)); end if;',
      '  if r <> ''equipe'' then return d || jsonb_build_object(''role'', r, ''admin'', coalesce((select m.admin from orga.membres m where m.nom = me), false),
    ''sante'', case when coalesce((select m.admin from orga.membres m where m.nom = me), false) then orga._sante_resume() end); end if;');
  end if;
end $$;

-- La fonction de contrôle écrit avec le rôle service
grant select, insert on orga.sante, orga.journal to service_role;

-- Réveil chaque matin (6 h UTC, 7 h à Marrakech) : pg_net appelle orga-sante avec le secret lu au moment même
create extension if not exists pg_net;
create extension if not exists pg_cron;
create or replace function orga._sante_reveil() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://daehifcdzrusxtzhtuxi.supabase.co/functions/v1/orga-sante',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sante', (select p.valeur->>'secret' from orga.parametres p where p.cle = 'sante')),
    body := '{}'::jsonb, timeout_milliseconds := 30000);
$$;
revoke execute on function orga._sante_reveil() from public, anon, authenticated;
select cron.unschedule('orga-sante') where exists (select 1 from cron.job where jobname = 'orga-sante');
select cron.schedule('orga-sante', '0 6 * * *', 'select orga._sante_reveil()');
