-- Ménage de la bibliothèque (28/10/2026, validé par Salmane) : paquets remplacés par le détail, quasi-doublons fusionnés, hors métier retiré.
-- Déjà appliqué en base. Sauvegardes : orga.sauv_catalogue_20261028, orga.sauv_elements_20261028.
do $$
declare pl jsonb := '{"MERGE": {"CAT-0091": "CAT-0532", "CAT-0418": "CAT-0532", "CAT-0174": "CAT-0098", "CAT-0410": "CAT-0494", "CAT-0421": "CAT-0420", "CAT-0337": "CAT-0070", "CAT-0356": "CAT-0077", "CAT-0605": "CAT-0077", "CAT-0013": "CAT-0389", "CAT-0043": "CAT-0655", "CAT-0901": "CAT-0319", "CAT-0895": "CAT-0323", "CAT-0896": "CAT-0341", "CAT-0322": "CAT-0856", "CAT-0318": "CAT-0317", "CAT-0390": "CAT-0334", "CAT-0355": "CAT-0900", "CAT-0393": "CAT-0148", "CAT-0345": "CAT-0417", "CAT-0906": "CAT-0344", "CAT-0382": "CAT-0324", "CAT-0263": "CAT-0289", "CAT-0834": "CAT-0262", "CAT-0291": "CAT-0262", "CAT-0836": "CAT-0262", "CAT-0835": "CAT-0262", "CAT-0290": "CAT-0264", "CAT-0813": "CAT-0261", "CAT-0837": "CAT-0261", "CAT-0286": "CAT-0256", "CAT-0299": "CAT-0253", "CAT-0818": "CAT-0249", "CAT-0819": "CAT-0249", "CAT-0820": "CAT-0249", "CAT-0821": "CAT-0249", "CAT-0822": "CAT-0249", "CAT-0300": "CAT-0247", "CAT-0304": "CAT-0251", "CAT-0252": "CAT-0278", "CAT-0296": "CAT-0267", "CAT-0297": "CAT-0267", "CAT-0298": "CAT-0268", "CAT-0269": "CAT-0268", "CAT-0306": "CAT-0271", "CAT-0307": "CAT-0271", "CAT-0848": "CAT-0272", "CAT-0238": "CAT-0203"}, "RENAME": {"CAT-0420": "Assiette creuse / bol à harira", "CAT-0262": "Serveur (buffet, plateaux, accueil)", "CAT-0256": "Aide barman / barback", "CAT-0089": "Premix cocktails (batch maison)", "CAT-0655": "Pièces sucrées / mignardises", "CAT-0417": "Rallonges, multiprises et éclairage back-office", "CAT-0344": "Groupe électrogène", "CAT-0249": "Chef de partie", "CAT-0389": "Dégustation client (tasting)", "CAT-0077": "Bouteille de gaz (recharge)"}, "SOUSZONE": {"CAT-0417": "Énergie et technique"}, "PAQ": {"CAT-0090": ["CAT-0121", "CAT-0122", "CAT-0123"], "CAT-0092": ["CAT-0538", "CAT-0539"], "CAT-0126": ["CAT-0553", "CAT-0554", "CAT-0555"], "CAT-0093": ["CAT-0109", "CAT-0110", "CAT-0111", "CAT-0112", "CAT-0113"], "CAT-0095": ["CAT-0109", "CAT-0110", "CAT-0111", "CAT-0112", "CAT-0113"], "CAT-0094": ["CAT-0115", "CAT-0116", "CAT-0117"], "CAT-0096": ["CAT-0119"], "CAT-0104": ["CAT-0492", "CAT-0493", "CAT-0494", "CAT-0497"], "CAT-0105": ["CAT-0503", "CAT-0504", "CAT-0505", "CAT-0506", "CAT-0507", "CAT-0508", "CAT-0509", "CAT-0513"], "CAT-0131": ["CAT-0503", "CAT-0504", "CAT-0505", "CAT-0506", "CAT-0507", "CAT-0508", "CAT-0509", "CAT-0513"], "CAT-0102": ["CAT-0492", "CAT-0493", "CAT-0494", "CAT-0497"], "CAT-0419": ["CAT-0492", "CAT-0493", "CAT-0494", "CAT-0497"], "CAT-0149": ["CAT-0476"], "CAT-0053": ["CAT-0062", "CAT-0596"], "CAT-0064": ["CAT-0614", "CAT-0615", "CAT-0619", "CAT-0620"], "CAT-0311": ["CAT-0314", "CAT-0315"], "CAT-0312": ["CAT-0315"], "CAT-0332": ["CAT-0271"], "CAT-0333": ["CAT-0271"], "CAT-0001": ["CAT-0045"], "CAT-0002": ["CAT-0658", "CAT-0659", "CAT-0662", "CAT-0664", "CAT-0684"], "CAT-0005": ["CAT-0120", "CAT-0551"], "CAT-0006": ["CAT-0650", "CAT-0651", "CAT-0652", "CAT-0654"], "CAT-0008": ["CAT-0685", "CAT-0686", "CAT-0691"], "CAT-0012": ["CAT-0125"], "CAT-0003": [], "CAT-0010": ["CAT-0689"], "CAT-0144": [], "CAT-0145": [], "CAT-0151": [], "CAT-0152": [], "CAT-0153": [], "CAT-0154": ["CAT-0413", "CAT-0416"], "CAT-0155": [], "CAT-0051": [], "CAT-0052": ["CAT-0643", "CAT-0644", "CAT-0632"], "CAT-0065": [], "CAT-0106": [], "CAT-0107": [], "CAT-0108": [], "CAT-0014": [], "CAT-0066": [], "CAT-0067": [], "CAT-0068": [], "CAT-0150": [], "CAT-0359": [], "CAT-0139": [], "CAT-0140": [], "CAT-0141": [], "CAT-0142": [], "CAT-0143": [], "CAT-0573": [], "CAT-0574": [], "CAT-0575": [], "CAT-0576": [], "CAT-0577": [], "CAT-0040": [], "CAT-0041": [], "CAT-0042": []}, "HORS_IDS": ["CAT-0015", "CAT-0016", "CAT-0017", "CAT-0018", "CAT-0019", "CAT-0020", "CAT-0021", "CAT-0022", "CAT-0023", "CAT-0024", "CAT-0025", "CAT-0026", "CAT-0027", "CAT-0028", "CAT-0029", "CAT-0030", "CAT-0031", "CAT-0162", "CAT-0163", "CAT-0164", "CAT-0165", "CAT-0166", "CAT-0170", "CAT-0171", "CAT-0172", "CAT-0173", "CAT-0175", "CAT-0176", "CAT-0178", "CAT-0182", "CAT-0183", "CAT-0185", "CAT-0187", "CAT-0188", "CAT-0189", "CAT-0190", "CAT-0191", "CAT-0265", "CAT-0266", "CAT-0273", "CAT-0293", "CAT-0294", "CAT-0295", "CAT-0303", "CAT-0305", "CAT-0325", "CAT-0326", "CAT-0327", "CAT-0346", "CAT-0347", "CAT-0348", "CAT-0349", "CAT-0357", "CAT-0358", "CAT-0360", "CAT-0361", "CAT-0362", "CAT-0363", "CAT-0364", "CAT-0365", "CAT-0366", "CAT-0367", "CAT-0368", "CAT-0369", "CAT-0370", "CAT-0371", "CAT-0372", "CAT-0373", "CAT-0374", "CAT-0375", "CAT-0376", "CAT-0377", "CAT-0378", "CAT-0383", "CAT-0384", "CAT-0385", "CAT-0386", "CAT-0387", "CAT-0388", "CAT-0391", "CAT-0392", "CAT-0713", "CAT-0714", "CAT-0715", "CAT-0719", "CAT-0725", "CAT-0726", "CAT-0727", "CAT-0730", "CAT-0731", "CAT-0732", "CAT-0733", "CAT-0740", "CAT-0741", "CAT-0742", "CAT-0743", "CAT-0744", "CAT-0745", "CAT-0746", "CAT-0747", "CAT-0749", "CAT-0750", "CAT-0751", "CAT-0752", "CAT-0753", "CAT-0817", "CAT-0838", "CAT-0839", "CAT-0843", "CAT-0844", "CAT-0845", "CAT-0846", "CAT-0849", "CAT-0871", "CAT-0872", "CAT-0914", "CAT-0915", "CAT-0916", "CAT-0917", "CAT-0918", "CAT-0919", "CAT-0920", "CAT-0924", "CAT-0925", "CAT-0926", "CAT-0927", "CAT-0928", "CAT-0929", "CAT-0930", "CAT-0931", "CAT-0933", "CAT-0934", "CAT-0937", "CAT-0938", "CAT-0939", "CAT-0940", "CAT-0941", "CAT-0943", "CAT-0944", "CAT-0945", "CAT-0946", "CAT-0948", "CAT-0949"], "DECO_GARDE": ["CAT-0192", "CAT-0195", "CAT-0202", "CAT-0203", "CAT-0205", "CAT-0206"]}'::jsonb; tok uuid := gen_random_uuid(); k text; v jsonb; d text; e record; el jsonb; prem text; cible record; rb text; th text; n_paq int := 0; n_add int := 0; n_fus int := 0; vt text;
begin
  insert into orga.sessions (token, nom) values (tok, 'Salmane');
  -- nouveaux articles de détail
  rb := (orga.catalogue_creer(tok, jsonb_build_object('element','Boisson énergisante (Red Bull)','zone','Bar','sous_zone','Softs et mixers','mode','Achat','unite','canette'), null))->>'id';
  th := (orga.catalogue_creer(tok, jsonb_build_object('element','Thé à la menthe et infusions','zone','Bar','sous_zone','Sans alcool','mode','Achat','unite','service'), null))->>'id';
  pl := jsonb_set(pl, '{PAQ,CAT-0092}', (pl->'PAQ'->'CAT-0092') || to_jsonb(rb));
  pl := jsonb_set(pl, '{PAQ,CAT-0012}', (pl->'PAQ'->'CAT-0012') || to_jsonb(th));
  -- 1. paquets : remplacés par le détail sur chaque événement
  for k, v in select * from jsonb_each(pl->'PAQ') loop
    for e in select * from orga.elements where catalogue_id = k loop
      for d in select jsonb_array_elements_text(v) loop
        select id into prem from orga.elements where evenement_id = e.evenement_id and catalogue_id = d limit 1;
        if not found then
          el := orga.element_depuis_catalogue(tok, e.evenement_id, d);
          update orga.elements set perimetre = e.perimetre, fourni_par = e.fourni_par where id = el->>'id';
          n_add := n_add + 1;
        end if;
      end loop;
      prem := null;
      select id into prem from orga.elements where evenement_id = e.evenement_id and catalogue_id = (v->>0) limit 1;
      if prem is not null then
        update orga.factures set element_id = prem where element_id = e.id;
        update orga.actions set element_id = prem where element_id = e.id;
        update orga.staff_evt set element_id = prem where element_id = e.id;
        delete from orga.elements where id = e.id;
      elsif not exists (select 1 from orga.factures where element_id = e.id) then
        update orga.actions set element_id = null where element_id = e.id;
        update orga.staff_evt set element_id = null where element_id = e.id;
        delete from orga.elements where id = e.id;
      else update orga.elements set catalogue_id = null where id = e.id;
      end if;
      n_paq := n_paq + 1;
    end loop;
    update orga.lecons set catalogue_id = null where catalogue_id = k;
    delete from orga.catalogue where id = k;
  end loop;
  -- 2. fusions
  for k, v in select * from jsonb_each(pl->'MERGE') loop
    select * into cible from orga.catalogue where id = v#>>'{}';
    for e in select * from orga.elements where catalogue_id = k loop
      prem := null;
      select id into prem from orga.elements where evenement_id = e.evenement_id and catalogue_id = cible.id limit 1;
      if prem is not null then
        update orga.factures set element_id = prem where element_id = e.id;
        update orga.actions set element_id = prem where element_id = e.id;
        update orga.staff_evt set element_id = prem where element_id = e.id;
        delete from orga.elements where id = e.id;
      else update orga.elements set catalogue_id = cible.id, element = cible.element where id = e.id;
      end if;
    end loop;
    update orga.lecons set catalogue_id = cible.id where catalogue_id = k;
    delete from orga.catalogue where id = k;
    n_fus := n_fus + 1;
  end loop;
  -- 3. noms et sous-familles
  for k, vt in select * from jsonb_each_text(pl->'RENAME') loop
    update orga.catalogue set element = vt where id = k;
    update orga.elements set element = vt where catalogue_id = k;
  end loop;
  for k, vt in select * from jsonb_each_text(pl->'SOUSZONE') loop update orga.catalogue set sous_zone = vt where id = k; end loop;
  -- 4. hors métier : retirés de la bibliothèque, ce qui est déjà coché reste sur l'événement
  update orga.elements set catalogue_id = null where catalogue_id in (select jsonb_array_elements_text(pl->'HORS_IDS'))
     or catalogue_id in (select id from orga.catalogue where zone = 'Décoration et ambiance' and id not in (select jsonb_array_elements_text(pl->'DECO_GARDE')));
  update orga.lecons set catalogue_id = null where catalogue_id in (select jsonb_array_elements_text(pl->'HORS_IDS'));
  delete from orga.catalogue where id in (select jsonb_array_elements_text(pl->'HORS_IDS'))
     or (zone = 'Décoration et ambiance' and id not in (select jsonb_array_elements_text(pl->'DECO_GARDE')));
  delete from orga.sessions where token = tok;
  raise notice 'paquets % ajouts % fusions %', n_paq, n_add, n_fus;
end $$;
select zone, count(*) from orga.catalogue group by 1 order by 1;