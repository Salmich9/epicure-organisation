-- 81 · Le coût qui bouge : après la signature, le cadrage fait bouger le coût, jamais le prix signé.
--   Déclencheurs : une réponse propre au cadrage qui compte dans un poste (« Compté quand ? ») ou une correction d'une réponse « Repris du devis ».
--   Pas les invités (ils passent par l'aperçu du chiffrage, v66), ni la gamme, ni la société (elles ne changent pas le coût).
--   Seules les lignes que la réponse touche sont recalculées ; un prix changé dans les Paramètres entre-temps ne se glisse pas ailleurs.
--   Ce qui est réglé à la main (ligne 🔒, bloc gardé, enveloppe corrigée) est gardé et signalé.
--   Les réponses vont aussi dans la base du chiffrage (les valeurs du devis restent dans base._avant_cadrage pour « Repris du devis »).
--   Salmane est prévenu (famille « enveloppes ») après r_cout_calme minutes sans nouvelle réponse : une séance de cadrage = un message.
--   « Ton enveloppe change » attend le même calme. Avant la signature, rien ne change.

alter table orga.chiffrages add column if not exists cout_annonce_le timestamptz;   -- dernier message « coût » envoyé à Salmane

insert into orga.chiffrage_params (cle, section, groupe, libelle, sous, calcul, valeur, unite, si, mode, actif, ordre) values
 ('r_cout_calme', 'marges', 'Coût après signature', 'Prévenir après', 'minutes sans nouvelle réponse au cadrage', 'regle', 10, 'min', 'toujours', 'achat', true, 670)
on conflict (cle) do nothing;

-- Les réponses du cadrage qui peuvent changer le coût : choix, plusieurs choix, oui ou non, nombre ; sans « ? » ni vide
create or replace function orga._cadrage_net(p_j jsonb) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(zq.cle, p_j -> zq.cle), '{}') from orga.chiffrage_questions zq
  where zq.actif and zq.type in ('choix', 'multi', 'oui_non', 'nombre') and zq.cle not in ('invites', 'gamme', 'societe')
    and coalesce(p_j, '{}') ? zq.cle and jsonb_typeof(p_j -> zq.cle) <> 'null' and (p_j ->> zq.cle) <> '?' and (p_j ->> zq.cle) <> ''
$$;

-- Titre court et libellé d'une réponse (pour le journal et la notification)
create or replace function orga._q_titre(p_cle text) returns text language sql stable security definer set search_path = '' as $$
  select case p_cle when 'zone' then 'Zone' when 'prestations' then 'Prestations' when 'alcool_qui' then 'Qui fournit l''alcool'
    else coalesce((select split_part(regexp_replace(regexp_replace(zq.texte, '\s*[?…]\s*$', ''), ' :.*$', ''), ', ', 1)
                   from orga.chiffrage_questions zq where zq.cle = p_cle), p_cle) end
$$;
create or replace function orga._q_choix(p_cle text, p_x text) returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select zc->>'libelle' from orga.chiffrage_questions zq,
      jsonb_array_elements(case when zq.type = 'oui_non' then '[{"cle":"oui","libelle":"Oui"},{"cle":"non","libelle":"Non"},{"cle":"true","libelle":"Oui"},{"cle":"false","libelle":"Non"}]'::jsonb else zq.choix end) zc
    where zq.cle = p_cle and zc->>'cle' = p_x limit 1), p_x)
$$;
create or replace function orga._q_libelle(p_cle text, p_v jsonb) returns text language sql stable security definer set search_path = '' as $$
  select case when p_v is null or jsonb_typeof(p_v) = 'null' then null
    when jsonb_typeof(p_v) = 'array' then case when jsonb_array_length(p_v) = 0 then 'aucun'
      else (select string_agg(orga._q_choix(p_cle, ze), ', ' order by zo) from jsonb_array_elements_text(p_v) with ordinality zt(ze, zo)) end
    else orga._q_choix(p_cle, p_v #>> '{}') end
$$;

-- Le calcul du moteur pour une base donnée (comme _chiffrage_calc : défauts, puis la base ; invités de l'événement si la base n'en a pas)
create or replace function orga._cadrage_moteur(p_evt text, p_base jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_ev orga.evenements; v_b jsonb;
begin
  select * into v_ev from orga.evenements where id = p_evt;
  v_b := orga._chiffrage_base_defaut(p_evt) || coalesce(p_base, '{}');
  if not coalesce(p_base, '{}') ? 'invites' then v_b := v_b || jsonb_build_object('invites', coalesce(v_ev.invites, (v_b->>'invites')::numeric, 0)); end if;
  return jsonb_build_object('lignes', coalesce(orga._chiffrage_moteur(v_b)->'lignes', '[]'), 'reponses', orga._reponses(v_b)->'reponses');
end $$;

-- Montant d'une liste de lignes
create or replace function orga._lignes_total(p_l jsonb) returns numeric language sql immutable set search_path = '' as $$
  select coalesce(sum(coalesce(nullif(zl->>'quantite', '')::numeric, 0) * coalesce(nullif(zl->>'prix', '')::numeric, 0)), 0)
  from jsonb_array_elements(coalesce(p_l, '[]')) zl
$$;

-- Le cœur : une réponse du cadrage change après signature → seules les lignes touchées bougent, le reste ne bouge pas
create or replace function orga._cadrage_cout(p_evt text, p_ancien jsonb, p_nouveau jsonb, p_qui text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_ev orga.evenements; v_c orga.chiffrages; v_an jsonb; v_nv jsonb; v_cles text[] := '{}'; v_k text;
        v_b0 jsonb; v_b1 jsonb; v_av jsonb; v_ma jsonb; v_mb jsonb; v_xa jsonb; v_xb jsonb; v_manuels jsonb;
        v_reps jsonb := '[]'; v_lg jsonb := '[]'; v_nl jsonb; v_app text[] := '{}'; v_faits text[] := '{}';
        v_r record; v_lk jsonb; v_pk text; v_garde boolean; v_cur numeric; v_nom text; v_regler boolean; v_cav numeric; v_cap numeric;
begin
  select * into v_ev from orga.evenements where id = p_evt;
  if v_ev.id is null or coalesce(v_ev.prix_signe, 0) <= 0 or coalesce(v_ev.statut, '') in ('Clôturé', 'Perdu', 'Annulé') then return null; end if;
  select * into v_c from orga.chiffrages where evenement_id = p_evt for update;
  if v_c.evenement_id is null or jsonb_array_length(coalesce(v_c.lignes, '[]')) = 0 then return null; end if;

  v_an := orga._cadrage_net(p_ancien); v_nv := orga._cadrage_net(p_nouveau);
  select coalesce(array_agg(zk order by zq.ordre), '{}') into v_cles
  from (select jsonb_object_keys(v_an || v_nv) zk) zz join orga.chiffrage_questions zq on zq.cle = zz.zk
  where (v_an -> zz.zk) is distinct from (v_nv -> zz.zk);
  if cardinality(v_cles) = 0 then return null; end if;

  -- La base du chiffrage reçoit les réponses ; les valeurs d'avant le cadrage sont gardées une fois pour toutes
  v_b0 := coalesce(v_c.base, '{}');
  v_av := coalesce(v_b0->'_avant_cadrage', '{}');
  v_b1 := v_b0;
  foreach v_k in array v_cles loop
    if not v_av ? v_k then v_av := v_av || jsonb_build_object(v_k, coalesce(v_b0->v_k, 'null'::jsonb)); end if;
    if v_nv ? v_k then v_b1 := v_b1 || jsonb_build_object(v_k, v_nv->v_k);
    elsif jsonb_typeof(v_av->v_k) = 'null' then v_b1 := v_b1 - v_k;
    else v_b1 := v_b1 || jsonb_build_object(v_k, v_av->v_k); end if;
  end loop;
  v_b1 := v_b1 || jsonb_build_object('_avant_cadrage', v_av);

  v_ma := orga._cadrage_moteur(p_evt, v_b0); v_mb := orga._cadrage_moteur(p_evt, v_b1);
  v_xa := v_ma->'lignes'; v_xb := v_mb->'lignes';
  foreach v_k in array v_cles loop
    if (v_ma->'reponses'->v_k) is distinct from (v_mb->'reponses'->v_k) then
      v_reps := v_reps || jsonb_build_array(jsonb_build_object('cle', v_k, 'titre', orga._q_titre(v_k),
        'avant', orga._q_libelle(v_k, v_ma->'reponses'->v_k), 'apres', orga._q_libelle(v_k, v_mb->'reponses'->v_k)));
    end if;
  end loop;
  v_manuels := case when jsonb_typeof(v_b0->'blocs_manuels') = 'array' then v_b0->'blocs_manuels' else '[]' end;

  -- Ligne par ligne de paramètre : ce que la réponse change
  for v_r in
    with za as (select zl->>'param' pk, orga._lignes_total(jsonb_agg(zl)) tt, count(*) nn, min(zl->>'groupe') gg
                from jsonb_array_elements(v_xa) zl where coalesce(zl->>'param', '') <> '' group by 1),
         zb as (select zl->>'param' pk, orga._lignes_total(jsonb_agg(zl)) tt, count(*) nn, min(zl->>'groupe') gg
                from jsonb_array_elements(v_xb) zl where coalesce(zl->>'param', '') <> '' group by 1)
    select coalesce(zb.pk, za.pk) pk, coalesce(za.tt, 0) ta, coalesce(zb.tt, 0) tb, coalesce(zb.nn, 0) nb, coalesce(zb.gg, za.gg, 'divers') gg
    from za full join zb on za.pk = zb.pk
    where za.pk is null or zb.pk is null or abs(za.tt - zb.tt) >= 0.5 or za.nn <> zb.nn
  loop
    v_pk := v_r.pk;
    v_nom := coalesce((select zp.libelle from orga.chiffrage_params zp where zp.cle = v_pk), v_pk);
    v_regler := coalesce((select zp.a_regler from orga.chiffrage_params zp where zp.cle = v_pk), false) and v_r.nb > 0;
    v_garde := v_manuels ? v_r.gg
      or exists (select 1 from jsonb_array_elements(v_c.lignes) zl where zl->>'param' = v_pk and coalesce((zl->>'verrou')::boolean, false))
      or coalesce(v_b0 #>> array['surcharges', v_pk], '') not in ('', 'false', '0')
      or coalesce(jsonb_typeof(v_b0 #> array['effectifs', v_pk]), 'null') <> 'null'
      or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(v_b0 #> array['personnes', v_pk]) = 'array' then v_b0 #> array['personnes', v_pk] else '[]' end) zp
                 where coalesce(zp->>'nom', '') <> '' or coalesce(zp->>'prix', '') <> '');
    if v_garde then
      v_lg := v_lg || jsonb_build_array(jsonb_build_object('param', v_pk, 'nom', v_nom, 'delta', round(v_r.tb - v_r.ta), 'garde', true));
    else
      v_app := v_app || v_pk;
      v_cur := orga._lignes_total(coalesce((select jsonb_agg(zl) from jsonb_array_elements(v_c.lignes) zl where zl->>'param' = v_pk), '[]'));
      if round(v_r.tb - v_cur) <> 0 or v_regler then
        v_lg := v_lg || jsonb_build_array(jsonb_build_object('param', v_pk, 'nom', v_nom, 'delta', round(v_r.tb - v_cur), 'a_regler', v_regler));
      end if;
    end if;
  end loop;

  -- Le nouveau chiffrage : les lignes touchées prennent le nouveau calcul à leur place, les autres ne bougent pas
  v_nl := v_c.lignes;
  if cardinality(v_app) > 0 then
    v_nl := '[]';
    for v_lk in select zl from jsonb_array_elements(v_c.lignes) with ordinality zt(zl, zo) order by zo loop
      v_pk := coalesce(v_lk->>'param', '');
      if v_pk <> '' and v_pk = any(v_app) then
        if not v_pk = any(v_faits) then
          v_nl := v_nl || coalesce((select jsonb_agg(zl order by zo) from jsonb_array_elements(v_xb) with ordinality zt(zl, zo) where zl->>'param' = v_pk), '[]');
          v_faits := v_faits || v_pk;
        end if;
      else
        v_nl := v_nl || jsonb_build_array(v_lk);
      end if;
    end loop;
    foreach v_pk in array v_app loop
      if not v_pk = any(v_faits) then
        v_nl := v_nl || coalesce((select jsonb_agg(zl order by zo) from jsonb_array_elements(v_xb) with ordinality zt(zl, zo) where zl->>'param' = v_pk), '[]');
      end if;
    end loop;

    -- Une enveloppe corrigée à la main ne suit pas : on le dit
    for v_r in
      select zpo.nom, sum(zz.sg * coalesce(nullif(zz.ln->>'quantite', '')::numeric, 0) * coalesce(nullif(zz.ln->>'prix', '')::numeric, 0)) dd
      from (select -1 sg, zl ln from jsonb_array_elements(v_c.lignes) zl where zl->>'param' = any(v_app)
            union all select 1, zl from jsonb_array_elements(v_xb) zl where zl->>'param' = any(v_app)) zz
      join orga.postes zpo on zpo.evenement_id = p_evt and not zpo.retire and zpo.source = 'manuel'
        and zpo.cle = orga._poste_auto(zz.ln->>'zone', zz.ln->>'element',
              case zz.ln->>'mode' when 'location' then 'louer' when 'achat' then 'acheter' when 'stock' then 'prelever' end,
              case when zz.ln->>'mode' = 'achat' then 1 end, case when zz.ln->>'mode' = 'location' then 1 end)
      group by zpo.nom
    loop
      if round(v_r.dd) <> 0 then
        v_lg := v_lg || jsonb_build_array(jsonb_build_object('nom', 'Enveloppe ' || lower(v_r.nom), 'delta', round(v_r.dd), 'garde', true, 'enveloppe', true));
      end if;
    end loop;
  end if;

  v_cav := orga._lignes_total(v_c.lignes); v_cap := orga._lignes_total(v_nl);
  update orga.chiffrages set lignes = v_nl, base = v_b1, maj_le = now(), maj_par = p_qui where evenement_id = p_evt;

  if jsonb_array_length(v_lg) > 0 then
    insert into orga.chiffrage_journal (evenement_id, qui, source, titre, detail, changements)
    values (p_evt, p_qui, 'cadrage',
      left('Cadrage · ' || coalesce((select string_agg(zr->>'titre' || ' : ' || coalesce(zr->>'avant' || ' → ', '') || coalesce(zr->>'apres', '?'), ' · ')
                                     from jsonb_array_elements(v_reps) zr), 'réponse changée'), 200),
      left((select string_agg(case when (zg->>'garde')::boolean then '🔒 ' else '' end || (zg->>'nom')
             || case when (zg->>'delta')::numeric = 0 and coalesce((zg->>'a_regler')::boolean, false) then ''
                     else ' ' || case when (zg->>'delta')::numeric >= 0 then '+' else '−' end || orga._mt(abs((zg->>'delta')::numeric)) end
             || case when (zg->>'a_regler')::boolean then ' (prix à régler)' else '' end, ' · ') from jsonb_array_elements(v_lg) zg), 300),
      jsonb_build_object('cout_avant', round(v_cav), 'cout_apres', round(v_cap), 'prix_signe', v_ev.prix_signe, 'lignes', v_lg, 'reponses', v_reps));
  end if;
  return jsonb_build_object('cles', to_jsonb(v_cles), 'appliques', to_jsonb(v_app), 'cout_avant', round(v_cav), 'cout_apres', round(v_cap), 'lignes', v_lg, 'reponses', v_reps);
end $$;

-- Le cadrage enregistre, puis le coût suit ; si le calcul échoue, la réponse reste enregistrée et l'erreur va au journal
create or replace function orga.cadrage_maj(p_token uuid, p_evt text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare me text := orga._qui_direction(p_token); v_ancien jsonb;
begin
  select cadrage->'affine' into v_ancien from orga.evenements where id = p_evt for update;
  update orga.evenements set
    cadrage = coalesce(cadrage, '{}'::jsonb) || p,
    prestations = case when jsonb_typeof(p #> '{reponses,prestations}') = 'array'
                       then array(select jsonb_array_elements_text(p #> '{reponses,prestations}')) else prestations end
  where id = p_evt;
  if p ? 'affine' then
    begin
      perform orga._cadrage_cout(p_evt, v_ancien, p->'affine', me);
    exception when others then
      insert into orga.journal (source, message, detail, qui) values ('cadrage-cout', left(sqlerrm, 300), jsonb_build_object('evt', p_evt), me);
    end;
  end if;
  return (select cadrage from orga.evenements where id = p_evt);
end $$;

-- « Repris du devis » montre ce que le devis a dit, même après une correction (sinon « corrigé » disparaîtrait)
do $$ declare d text := pg_get_functiondef('orga.cadrage_contexte(uuid,text)'::regprocedure); begin
  if d ~ '_avant_cadrage' then return; end if;
  d := replace(d, 'select c.base into b from orga.chiffrages c where c.evenement_id = p_evt;',
                  'select c.base || coalesce(c.base->''_avant_cadrage'', ''{}'') into b from orga.chiffrages c where c.evenement_id = p_evt;');
  if d !~ '_avant_cadrage' then raise exception 'cadrage_contexte a changé'; end if;
  execute d;
end $$;

-- Le message à Salmane : une séance de cadrage, un message, avec la marge avant → après
create or replace function orga._notifs_cout(p_now timestamptz) returns int
language plpgsql security definer set search_path = '' as $$
declare v_ev record; v_attente interval := make_interval(mins => greatest(coalesce(orga._param('r_cout_calme'), 10), 0)::int);
        v_av numeric; v_ap numeric; v_pr numeric; v_reps text; v_lig text; v_garde text; v_regler text; v_titre text; v_corps text; n int := 0; k int;
begin
  for v_ev in
    select e.id, e.code, e.prix_signe, ch.cout_annonce_le
    from orga.evenements e join orga.chiffrages ch on ch.evenement_id = e.id
    where coalesce(e.prix_signe, 0) > 0 and coalesce(e.statut, '') not in ('Clôturé', 'Perdu', 'Annulé')
      and exists (select 1 from orga.chiffrage_journal cj where cj.evenement_id = e.id and cj.source = 'cadrage' and cj.quand > coalesce(ch.cout_annonce_le, '-infinity'))
      and not exists (select 1 from orga.chiffrage_journal cj where cj.evenement_id = e.id and cj.source = 'cadrage' and cj.quand > p_now - v_attente)
  loop
    select (array_agg((cj.changements->>'cout_avant')::numeric order by cj.quand, cj.id))[1],
           (array_agg((cj.changements->>'cout_apres')::numeric order by cj.quand desc, cj.id desc))[1]
      into v_av, v_ap
    from orga.chiffrage_journal cj where cj.evenement_id = v_ev.id and cj.source = 'cadrage' and cj.quand > coalesce(v_ev.cout_annonce_le, '-infinity');
    -- Les réponses : la première valeur d'avant, la dernière d'après
    select string_agg(zx.titre || ' : ' || coalesce(zx.av || ' → ', '') || coalesce(zx.ap, '?'), ' · ' order by zx.premier) into v_reps
    from (select zr->>'cle' cle, min(zr->>'titre') titre, min(cj.quand) premier,
                 (array_agg(zr->>'avant' order by cj.quand, cj.id))[1] av, (array_agg(zr->>'apres' order by cj.quand desc, cj.id desc))[1] ap
          from orga.chiffrage_journal cj, jsonb_array_elements(coalesce(cj.changements->'reponses', '[]')) zr
          where cj.evenement_id = v_ev.id and cj.source = 'cadrage' and cj.quand > coalesce(v_ev.cout_annonce_le, '-infinity')
          group by zr->>'cle') zx
    where zx.av is distinct from zx.ap;
    -- Les lignes : le total net de la séance
    select string_agg(zy.nom || ' ' || case when zy.dd >= 0 then '+' else '−' end || orga._mt(abs(zy.dd)), ' · ' order by abs(zy.dd) desc) into v_lig
    from (select zg->>'nom' nom, sum((zg->>'delta')::numeric) dd
          from orga.chiffrage_journal cj, jsonb_array_elements(coalesce(cj.changements->'lignes', '[]')) zg
          where cj.evenement_id = v_ev.id and cj.source = 'cadrage' and cj.quand > coalesce(v_ev.cout_annonce_le, '-infinity')
            and not coalesce((zg->>'garde')::boolean, false)
          group by zg->>'nom') zy
    where round(zy.dd) <> 0;
    select string_agg('🔒 ' || zy.nom || case when zy.nom like 'Enveloppe %' then ' gardée' else ' gardé' end || ' (le cadrage disait ' || case when zy.dd >= 0 then '+' else '−' end || orga._mt(abs(zy.dd)) || ')', E'\n') into v_garde
    from (select zg->>'nom' nom, sum((zg->>'delta')::numeric) dd
          from orga.chiffrage_journal cj, jsonb_array_elements(coalesce(cj.changements->'lignes', '[]')) zg
          where cj.evenement_id = v_ev.id and cj.source = 'cadrage' and cj.quand > coalesce(v_ev.cout_annonce_le, '-infinity')
            and coalesce((zg->>'garde')::boolean, false)
          group by zg->>'nom') zy
    where round(zy.dd) <> 0;
    select string_agg(distinct zg->>'nom', ', ') || ' : prix à régler' into v_regler
    from orga.chiffrage_journal cj, jsonb_array_elements(coalesce(cj.changements->'lignes', '[]')) zg
    where cj.evenement_id = v_ev.id and cj.source = 'cadrage' and cj.quand > coalesce(v_ev.cout_annonce_le, '-infinity')
      and coalesce((zg->>'a_regler')::boolean, false);

    update orga.chiffrages set cout_annonce_le = p_now where evenement_id = v_ev.id;
    if round(coalesce(v_ap, 0)) = round(coalesce(v_av, 0)) and v_garde is null and v_regler is null then continue; end if;
    if not orga._dest_ok('Salmane') then continue; end if;

    v_pr := v_ev.prix_signe;
    v_titre := case when v_ap > v_av then 'Coût en hausse' when v_ap < v_av then 'Coût en baisse' else 'Coût à vérifier' end;
    v_corps := concat_ws(E'\n',
      concat_ws(' · ', v_ev.code, case when round(v_ap) <> round(v_av) then case when v_ap > v_av then '+' else '−' end || orga._mt(abs(v_ap - v_av))
        || ' · marge ' || round((v_pr - v_av) / v_pr * 100) || ' % → ' || round((v_pr - v_ap) / v_pr * 100) || ' %' end),
      v_reps, v_lig, v_garde, v_regler, 'Touche : voir les enveloppes');
    insert into orga.alertes_envoyees (cle, dest, famille, titre, corps, url, tag, montant)
    values ('CT|' || v_ev.id || '|' || to_char(p_now, 'YYYYMMDDHH24MI'), 'Salmane', 'enveloppes', v_titre, v_corps,
            '/#/enveloppes-evt/' || v_ev.id, 'C' || v_ev.id, round(v_ap))
    on conflict (cle) do nothing;
    get diagnostics k = row_count; n := n + k;
  end loop;
  return n;
end $$;

-- « Ton enveloppe change » attend la fin de la séance de cadrage (même calme)
do $$ declare d text := pg_get_functiondef('orga._notifs_enveloppes(timestamptz)'::regprocedure); begin
  if d ~ 'v_attente' then return; end if;
  d := replace(d, 'declare ev record; g record;', 'declare v_attente boolean; ev record; g record;');
  d := replace(d, '    for g in select * from orga._env_groupes(ev.id) loop',
'    v_attente := exists (select 1 from orga.chiffrage_journal cj where cj.evenement_id = ev.id and cj.source = ''cadrage''
      and cj.quand > p_now - make_interval(mins => greatest(coalesce(orga._param(''r_cout_calme''), 10), 0)::int));
    for g in select * from orga._env_groupes(ev.id) loop');
  d := replace(d, 'if g.envoye is not null and round(g.envoye) <> round(g.prevu) then', 'if g.envoye is not null and round(g.envoye) <> round(g.prevu) and not v_attente then');
  if (length(d) - length(replace(d, 'and not v_attente then', ''))) / length('and not v_attente then') <> 2 or d !~ 'v_attente := exists' or d !~ 'declare v_attente boolean' then
    raise exception '_notifs_enveloppes a changé';
  end if;
  execute d;
end $$;

-- Le passage appelle le message « coût » avec les enveloppes (même famille)
do $$ declare d text := pg_get_functiondef('orga._notifs_passage(timestamptz)'::regprocedure); begin
  if d ~ '_notifs_cout' then return; end if;
  d := replace(d, '  if coalesce((f->>''enveloppes'')::boolean, true) then n := n + orga._notifs_enveloppes(p_now); end if;',
                  '  if coalesce((f->>''enveloppes'')::boolean, true) then n := n + orga._notifs_enveloppes(p_now); end if;
  if coalesce((f->>''enveloppes'')::boolean, true) then n := n + orga._notifs_cout(p_now); end if;');
  if d !~ '_notifs_cout' then raise exception '_notifs_passage a changé'; end if;
  execute d;
end $$;

revoke all on function orga._cadrage_net(jsonb), orga._q_titre(text), orga._q_choix(text, text), orga._q_libelle(text, jsonb),
  orga._cadrage_moteur(text, jsonb), orga._lignes_total(jsonb), orga._cadrage_cout(text, jsonb, jsonb, text), orga._notifs_cout(timestamptz)
  from public, anon, authenticated;
revoke all on function orga.cadrage_maj(uuid, text, jsonb) from public;
grant execute on function orga.cadrage_maj(uuid, text, jsonb) to anon, authenticated;
