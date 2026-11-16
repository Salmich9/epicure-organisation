-- 70 · Versions du devis : une version est figée chaque fois qu'un devis part chez le client (V1, V2, V3…).
--   On fige ce que voit le client (lignes, total, TVA) et, à côté, le chiffrage interne (lignes, coef, gamme, invités).
--   Entre deux envois, on retouche librement : seul l'envoi crée une version. Marquer envoyé passe l'événement en « Devis envoyé ».

create table if not exists orga.devis_versions (
  id bigserial primary key,
  evenement_id text not null,
  numero int not null,
  envoye_le timestamptz not null default now(),
  par text,
  zoho_numero text,
  presentation text,
  lignes_client jsonb not null default '[]',
  total_ht numeric not null default 0,
  tva numeric,
  invites int, gamme text, coef numeric, cout numeric,
  chiffrage jsonb,
  note text,
  unique (evenement_id, numero)
);
alter table orga.devis_versions enable row level security;

create or replace function orga.devis_versions_liste(p_token uuid, p_evt text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token);
begin
  return (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'numero', v.numero, 'envoye_le', v.envoye_le, 'par', v.par, 'zoho_numero', v.zoho_numero,
      'presentation', v.presentation, 'lignes_client', v.lignes_client, 'total_ht', v.total_ht, 'tva', v.tva, 'invites', v.invites, 'gamme', v.gamme,
      'coef', v.coef, 'cout', v.cout, 'note', v.note) order by v.numero desc), '[]') from orga.devis_versions v where v.evenement_id = p_evt);
end $$;

-- Le devis part chez le client : on fige la version suivante
create or replace function orga.devis_envoyer(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); ev orga.evenements; c orga.chiffrages; k int;
begin
  select * into ev from orga.evenements where id = p_evt;
  if ev.id is null then raise exception 'evenement_introuvable'; end if;
  if coalesce(jsonb_array_length(p->'lignes'), 0) = 0 then raise exception 'manque_obligatoire'; end if;
  select * into c from orga.chiffrages where evenement_id = p_evt;
  select coalesce(max(numero), 0) + 1 into k from orga.devis_versions where evenement_id = p_evt;
  insert into orga.devis_versions (evenement_id, numero, par, zoho_numero, presentation, lignes_client, total_ht, tva, invites, gamme, coef, cout, chiffrage, note)
  values (p_evt, k, me, ev.zoho_devis->>'numero', p->>'presentation', p->'lignes', coalesce((p->>'total')::numeric, 0), (p->>'tva')::numeric,
          ev.invites, ev.gamme, coalesce(c.coef, ev.coef),
          (select round(coalesce(sum((x->>'quantite')::numeric * (x->>'prix')::numeric), 0)) from jsonb_array_elements(coalesce(c.lignes, '[]')) x),
          jsonb_build_object('lignes', c.lignes, 'base', c.base, 'hypotheses', c.hypotheses), nullif(trim(p->>'note'), ''));
  if coalesce(ev.statut, 'Demande') = 'Demande' then update orga.evenements set statut = 'Devis envoyé' where id = p_evt; end if;
  return orga.devis_versions_liste(p_token, p_evt);
end $$;

revoke execute on function orga.devis_versions_liste(uuid, text), orga.devis_envoyer(uuid, text, jsonb) from public;
grant execute on function orga.devis_versions_liste(uuid, text), orga.devis_envoyer(uuid, text, jsonb) to anon, authenticated;
