-- 66 · Chiffrage protégé : plus rien ne se recalcule tout seul.
--   chiffrage_apercu calcule sans rien écrire (l'appli montre « avant → après », Salmane coche, puis chiffrage_valider enregistre).
--   Les invités enregistrés dans la base du chiffrage ne changent plus en douce : un nouveau nombre d'invités passe par l'aperçu.
--   Blocs gardés à l'ancienne (comparaison avec les paramètres) : base.blocs_manuels, le moteur ne les refait plus.
--   orga.chiffrage_journal : chaque changement (à la main, invités, copilote, comparaison), lu par la direction seulement.

create table if not exists orga.chiffrage_journal (
  id bigserial primary key,
  evenement_id text not null,
  quand timestamptz not null default now(),
  qui text, source text,                 -- main | base | copilote | comparaison | premier
  cle text,                              -- ligne concernée (pour regrouper les retouches d'une même ligne)
  titre text not null, detail text, changements jsonb
);
create index if not exists chiffrage_journal_evt on orga.chiffrage_journal (evenement_id, quand desc);
alter table orga.chiffrage_journal enable row level security;

-- Le calcul, sans rien écrire
create or replace function orga._chiffrage_calc(p_evt text, p_base jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c orga.chiffrages; b jsonb; e jsonb; garde jsonb; ev orga.evenements; moteur jsonb;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  b := orga._chiffrage_base_defaut(p_evt) || coalesce(c.base, '{}') || coalesce(p_base, '{}');
  -- Les invités suivent l'événement seulement à la première fois ; ensuite ils ne changent que si on le demande
  if (c.base is null or not c.base ? 'invites') and (p_base is null or not p_base ? 'invites') then
    b := b || jsonb_build_object('invites', coalesce(ev.invites, (b->>'invites')::numeric, 0));
  end if;
  e := orga._chiffrage_moteur(b);
  moteur := coalesce(e->'lignes', '[]');
  select coalesce(jsonb_agg(l), '[]') into garde from jsonb_array_elements(coalesce(c.lignes, '[]')) l where coalesce(l->>'param', '') = '';
  return jsonb_build_object(
    'lignes', (select coalesce(jsonb_agg(l), '[]') from jsonb_array_elements(moteur) l
               where not coalesce(b->'blocs_manuels', '[]') ? coalesce(l->>'groupe', '')) || garde,
    'moteur', moteur, 'base', b, 'staff', e->'staff', 'paliers', (select valeur from orga.parametres where cle = 'coef_paliers'));
end $$;

-- Enregistre (surcharge, personne, agent vocal) : même calcul, puis écrit
create or replace function orga._chiffrage_refaire(p_evt text, p_base jsonb, p_par text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := orga._chiffrage_calc(p_evt, p_base);
begin
  insert into orga.chiffrages (evenement_id, lignes, base, hypotheses, coef, maj_par)
  values (p_evt, r->'lignes', r->'base', '', null, p_par)
  on conflict (evenement_id) do update set lignes = excluded.lignes, base = excluded.base, maj_le = now(), maj_par = p_par;
  return r - 'moteur';
end $$;

create or replace function orga.chiffrage_apercu(p_token uuid, p_evt text, p_base jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  return orga._chiffrage_calc(p_evt, p_base);
end $$;

-- Écrit ce que Salmane a validé, et le note au journal
create or replace function orga.chiffrage_valider(p_token uuid, p_evt text, p_lignes jsonb, p_base jsonb, p_hyp text, p_journal jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  if jsonb_typeof(p_lignes) <> 'array' then raise exception 'valeur_invalide'; end if;
  insert into orga.chiffrages (evenement_id, lignes, base, hypotheses, maj_par) values (p_evt, p_lignes, p_base, coalesce(p_hyp, ''), me)
  on conflict (evenement_id) do update set lignes = excluded.lignes, base = coalesce(p_base, orga.chiffrages.base),
    hypotheses = coalesce(p_hyp, orga.chiffrages.hypotheses), maj_le = now(), maj_par = me;
  if p_journal is not null and coalesce(p_journal->>'titre', '') <> '' then
    insert into orga.chiffrage_journal (evenement_id, qui, source, titre, detail, changements)
    values (p_evt, me, coalesce(p_journal->>'source', 'main'), left(p_journal->>'titre', 200), left(p_journal->>'detail', 300), p_journal->'changements');
  end if;
  return (select to_jsonb(c) from orga.chiffrages c where c.evenement_id = p_evt);
end $$;

-- Les retouches à la main : notées ligne par ligne ; une même ligne retouchée dans les 5 minutes garde une seule entrée
create or replace function orga._chiffrage_noter(p_evt text, p_qui text, p_journal jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare x jsonb; k bigint;
begin
  for x in select * from jsonb_array_elements(coalesce(p_journal, '[]')) loop
    if coalesce(x->>'titre', '') = '' then continue; end if;
    select id into k from orga.chiffrage_journal where evenement_id = p_evt and qui is not distinct from p_qui and cle = x->>'cle'
      and source = 'main' and quand > now() - interval '5 minutes' order by quand desc limit 1;
    if k is not null and x->>'cle' is not null then
      update orga.chiffrage_journal set titre = left(x->>'titre', 200), detail = left(x->>'detail', 300), quand = now() where id = k;
    else
      insert into orga.chiffrage_journal (evenement_id, qui, source, cle, titre, detail) values (p_evt, p_qui, 'main', x->>'cle', left(x->>'titre', 200), left(x->>'detail', 300));
    end if;
  end loop;
end $$;

-- Retouches à la main notées depuis l'appli (appel à part : l'enregistrement existant ne change pas)
create or replace function orga.chiffrage_noter(p_token uuid, p_evt text, p_journal jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_voix_direction(p_token);
begin
  perform orga._chiffrage_noter(p_evt, me, p_journal);
  return true;
end $$;

-- Le journal du chiffrage : les entrées notées, plus les réglages « cet événement » faits dans la fenêtre d'une ligne
create or replace function orga.chiffrage_journal_liste(p_token uuid, p_evt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return (select coalesce(jsonb_agg(x order by x->>'quand' desc), '[]') from (
    select jsonb_build_object('quand', j.quand, 'qui', j.qui, 'source', j.source, 'titre', j.titre, 'detail', j.detail) x
      from orga.chiffrage_journal j where j.evenement_id = p_evt
    union all
    select jsonb_build_object('quand', h.le, 'qui', h.par, 'source', 'main',
      'titre', p.libelle || case when h.champ = 'ratio' then ' (ratio)' else '' end || ' : ' || coalesce(replace(trim_scale(h.ancien)::text, '.', ','), '?') || ' → ' || coalesce(replace(trim_scale(h.nouveau)::text, '.', ','), '?'),
      'detail', 'réglé pour cet événement') x
      from orga.chiffrage_params_histo h join orga.chiffrage_params p on p.cle = h.cle where h.evenement_id = p_evt and h.portee = 'evenement') t);
end $$;

revoke all on function orga._chiffrage_calc(text, jsonb), orga._chiffrage_noter(text, text, jsonb) from public, anon, authenticated;
grant execute on function orga.chiffrage_apercu(uuid, text, jsonb), orga.chiffrage_valider(uuid, text, jsonb, jsonb, text, jsonb),
  orga.chiffrage_noter(uuid, text, jsonb), orga.chiffrage_journal_liste(uuid, text) to anon, authenticated;
