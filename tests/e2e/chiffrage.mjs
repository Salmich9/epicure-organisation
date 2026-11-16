// Parcours du chiffrage avec paramètres : écran Paramètres, chiffrage détaillé (moments séparés, staff par personne,
// transports séparés), fenêtre d'une ligne (cet événement / aussi la référence), fenêtre d'une personne.
// Lancer : npm run build && node tests/e2e/chiffrage.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5198, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

// Paramètres (extrait des vraies valeurs de départ)
const P = (cle, section, groupe, libelle, calcul, valeur, unite, ratio = null, ratio_unite = null, extra = {}) =>
  ({ cle, section, groupe, libelle, calcul, valeur, unite, ratio, ratio_unite, base: 'invites', actif: true, nb_modifs: 0, tendance: null, histo: [], ...extra })
const PARAMS = [
  P('m_accueil', 'moments', 'Matière par invité', 'Accueil', 'par_base', 15, 'MAD / invité', null, null, { sous: "boissons d'accueil, petites bouchées" }),
  P('m_cocktail', 'moments', 'Matière par invité', 'Cocktail dînatoire', 'par_base', 5.5, 'MAD / pièce', 7, 'pièces par invité', { nb_modifs: 3, tendance: 8,
    histo: [{ champ: 'valeur', ancien: 5, nouveau: 5.5, portee: 'reference', par: 'Salmane', le: '2026-11-02T10:00:00Z' }, { champ: 'valeur', ancien: 5.5, nouveau: 6, portee: 'evenement', evt_nom: 'Oberoi', par: 'Hamza', le: '2026-10-20T10:00:00Z' }] }),
  P('m_diner', 'moments', 'Matière par invité', 'Dîner assis', 'par_base', 150, 'MAD / invité'),
  P('m_desserts', 'moments', 'Matière par invité', 'Desserts', 'par_base', 30, 'MAD / invité'),
  P('m_late', 'moments', 'Matière par invité', 'Late snack', 'par_base', 40, 'MAD / invité', null, null, { nb_modifs: 1, tendance: -5 }),
  P('s_coordinateur', 'staff', 'Encadrement', 'Coordinateur', 'fixe', 2000, 'MAD / jour', 1, 'personne', { base: null }),
  P('s_chef_rang', 'staff', 'Salle', 'Chef de rang', 'un_pour', 600, 'MAD / jour', 10, 'invités', { sous: 'dîner assis, 1 par table de 10' }),
  P('s_runner', 'staff', 'Salle', 'Runner', 'un_pour', 600, 'MAD / jour', 2, 'chefs de rang', { base: 'role:s_chef_rang' }),
  P('s_bartender', 'staff', 'Bar', 'Bartender', 'un_pour', 600, 'MAD / jour', 50, 'invités'),
  P('s_commis', 'staff', 'Cuisine', 'Commis de cuisine', 'un_pour', 515, 'MAD / jour', 30, 'couverts'),
  P('s_repas', 'staff', 'Frais du staff', 'Repas du staff', 'par_base', 60, 'MAD / personne', null, null, { base: 'staff_hors_cuisine' }),
  P('t_navette', 'transport', 'Transport du personnel', 'Navette staff A/R', 'un_pour', 1050, 'MAD / véhicule', 15, 'personnes', { base: 'staff' }),
  P('t_traiteur', 'transport', 'Transport des marchandises', 'Camion traiteur A/R', 'fixe', 2750, 'MAD', 1, 'trajet', { base: null }),
  P('t_bar', 'transport', 'Transport des marchandises', 'Transport bar A/R', 'fixe', 1200, 'MAD', 1, 'trajet', { base: null }),
  P('x_vaisselle', 'materiel', 'Art de table', 'Location vaisselle', 'par_base', 42.5, 'MAD / couvert'),
  P('b_glace', 'bar', 'Consommables par invité', 'Glace', 'par_base', 4, 'MAD / kg', 1.5, 'kg par invité'),
  P('d_petits_achats', 'marges', 'Imprévus et divers', 'Petits achats', 'pct', 5, '%', null, null, { base: 'cout' }),
  P('g_coef_3', 'marges', 'Coefficient de vente', 'Coef grand', 'regle', 2.25, '×', 349, 'invités au plus'),
]
const L = (param, groupe, zone, element, quantite, prix, note, extra = {}) => ({ param, groupe, zone, element, quantite, prix, note, mode: 'achat', ...extra })
const pers = (param, libelle, nb, prix, note, noms = {}) => Array.from({ length: nb }, (_, i) => L(param, 'staff', 'Staff', noms[i + 1] ? `${libelle} · ${noms[i + 1]}` : `${libelle} ${i + 1}`, 1, prix, note, { rang: i + 1, ...(noms[i + 1] ? { nom: noms[i + 1] } : {}) }))
const lignes = (chefs = 20) => [
  L('m_accueil', 'moments', 'Menu', 'Accueil', 200, 15, '200 invités × 15'),
  L('m_cocktail', 'moments', 'Menu', 'Cocktail dînatoire', 1400, 5.5, '200 invités × 7 × 5,5'),
  L('m_diner', 'moments', 'Menu', 'Dîner assis', 200, 150, '200 invités × 150'),
  L('m_desserts', 'moments', 'Menu', 'Desserts', 200, 30, '200 invités × 30'),
  L('b_glace', 'bar', 'Bar', 'Glace', 300, 4, '200 invités × 1,5 × 4'),
  ...pers('s_coordinateur', 'Coordinateur', 1, 2000, '1 × 2 000'),
  ...pers('s_chef_rang', 'Chef de rang', chefs, 600, `1 pour ${200 / chefs} invités × 600`, { 1: 'Mohamed Bijar' }),
  ...pers('s_runner', 'Runner', Math.ceil(chefs / 2), 600, '1 pour 2 chefs de rang × 600'),
  ...pers('s_bartender', 'Bartender', 4, 600, '1 pour 50 invités × 600'),
  ...pers('s_commis', 'Commis de cuisine', 7, 515, '1 pour 30 couverts × 515'),
  L('s_repas', 'frais_staff', 'Staff', 'Repas du staff', 35, 60, '35 personnes × 60'),
  L('t_navette', 'transport_personnel', 'Logistique', 'Navette staff A/R', 3, 1050, '1 pour 15 personnes × 1 050'),
  L('t_traiteur', 'transport_marchandises', 'Logistique', 'Camion traiteur A/R', 1, 2750, '1 × 2 750'),
  L('t_bar', 'transport_marchandises', 'Logistique', 'Transport bar A/R', 1, 1200, '1 × 1 200'),
  L('x_vaisselle', 'materiel', 'Art de table', 'Location vaisselle', 200, 42.5, '200 invités × 42,5'),
  L('d_petits_achats', 'divers', 'Lieu technique et admin', 'Petits achats', 1, 4200, '5 % de 84 000'),
  { zone: 'Décoration et ambiance', element: 'Centres de table fleuris', mode: 'achat', quantite: 20, prix: 250, note: 'catalogue' },
]
const BASE = { invites: 200, traiteur: true, bar: true, moments: ['accueil', 'cocktail', 'diner_assis', 'desserts'], alcool: [], surcharges: {}, effectifs: {}, personnes: {} }
let peut = true
const Q = (id, cle, libelle, champ, actuel, propose, raison, tendance, points, extra = {}) => ({ id, cle, libelle, champ, ancien: actuel, actuel, propose, raison, tendance, points, statut: 'proposee',
  calcul: champ === 'ratio' ? 'un_pour' : 'par_base', unite: 'MAD', ratio_unite: 'couverts', section: 'moments', groupe: 'Matière par invité', nb_modifs: 3, ...extra })
const PROPS = { peut_modifier: true, propositions: [
  Q(1, 'm_cocktail', 'Cocktail dînatoire', 'valeur', 5.5, 5.9, 'Réel ici 6,1 la pièce (facture Traiteur X)', '3 derniers : 5,5 → 5,8 → 6,1', [5.5, 5.8, 6.1], { unite: 'MAD / pièce', reel: 6.1 }),
  Q(2, 's_commis', 'Commis de cuisine', 'ratio', 30, 25, '8 commis payés pour 200 couverts, 7 prévus', '2e fois de suite', [30, 26, 25], { section: 'staff', groupe: 'Cuisine' }),
  Q(3, 't_navette', 'Navette staff A/R', 'valeur', 1050, 1150, 'Facture Transport Atlas : 1 150 par véhicule', 'stable', [1150, 1150], { unite: 'MAD / véhicule', section: 'transport', groupe: 'Transport du personnel' }),
  { ...Q(4, 'b_glace', 'Glace', 'valeur', 4, 4.5, '', '', []), statut: 'gardee', unite: 'MAD / kg', decide_par: 'Salmane' }] }
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_params: () => ({ peut_modifier: peut, params: PARAMS }),
  chiffrage_param_maj: b => ({ peut_modifier: true, params: PARAMS.map(p => p.cle === b.p_cle ? { ...p, ...b.p, nb_modifs: p.nb_modifs + 1 } : p) }),
  chiffrage_contexte: () => ({ paliers: [{ coef: 2.25, jusqua: 349 }], chiffrage: { lignes: lignes(), base: BASE, coef: 2.25, hypotheses: '' }, catalogue: [], references: [] }),
  chiffrage_calculer: b => ({ lignes: lignes(), base: { ...BASE, ...(b.p_base || {}) } }),
  chiffrage_surcharger: b => ({ lignes: lignes(b.p.ratio ? Math.ceil(200 / b.p.ratio) : 20), base: { ...BASE, surcharges: b.p_reference ? {} : { [b.p_cle]: { ratio: b.p.ratio } } } }),
  chiffrage_personne: () => ({ lignes: lignes(), base: BASE }), chiffrage_enregistrer: () => true,
  bilan_liste: () => ({ pieces_a_imputer: 0, encaissements: 0, enveloppes: [], lecons: [] }),
  propositions_liste: () => PROPS, proposition_decider: b => ({ peut_modifier: true, propositions: PROPS.propositions.map(q => q.id === b.p_id ? { ...q, statut: b.p_decision === 'garder' ? 'gardee' : 'acceptee', valeur_finale: b.p_valeur ?? q.propose, decide_par: 'Salmane' } : q) }),
  staff_liste: () => [{ id: 'S1', prenom: 'Mohamed', nom: 'Bijar' }, { id: 'S2', prenom: 'Youssef', nom: 'Alami' }, { id: 'S3', prenom: 'Karim', nom: 'Idrissi' }],
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
const appels = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 900) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }

// 1. Paramètres
await voir('aujourdhui', 1000)
await voir('parametres', 1200)
if (!(await p.locator('h1:has-text("Paramètres")').count())) echec('écran Paramètres absent')
await photo('c1-parametres.png')
await p.click('.chip:has-text("Staff")'); await p.waitForTimeout(300)
if (!(await p.locator('.cf-l:has-text("Chef de rang")').count())) echec('onglet Staff')
await photo('c2-parametres-staff.png')
await p.click('.chip:has-text("Moments")'); await p.waitForTimeout(300)
await p.click('.cf-l:has-text("Cocktail dînatoire")'); await p.waitForTimeout(500)
await photo('c3-parametre-fenetre.png')
const ins = p.locator('.sheet input[inputmode=decimal]'); await ins.nth(0).fill('6'); await ins.nth(1).fill('8')
await p.click('button:has-text("Enregistrer la référence")'); await p.waitForTimeout(400)
const pm = appels.find(a => a[0] === 'chiffrage_param_maj')?.[1]
if (!pm || pm.p_cle !== 'm_cocktail' || pm.p.valeur !== 6 || pm.p.ratio !== 8) echec(`référence : ${JSON.stringify(pm)}`)

// 2. Chiffrage détaillé
await voir('chiffrer', 1500)
for (const t of ['MOMENTS', 'STAFF · 42 PERSONNES', 'TRANSPORT DU PERSONNEL', 'TRANSPORT DES MARCHANDISES', 'EN PLUS']) if (!(await p.locator(`.cf-grp:has-text("${t}")`).count())) echec(`bloc ${t} absent`)
if (!(await p.locator('.cf-l:has-text("Accueil")').count()) || !(await p.locator('.cf-l:has-text("Cocktail dînatoire")').count())) echec('moments pas séparés')
if (!(await p.locator('.cf-sub:has-text("Chef de rang · Mohamed Bijar")').count())) echec('ligne par personne')
await photo('c4-chiffrage.png', true)
// 3. Fenêtre d'une ligne : ratio des chefs de rang pour cet événement
await p.click('.cf-l:has-text("Chefs de rang")'); await p.waitForTimeout(500)
await p.locator('.sheet input[inputmode=decimal]').first().fill('12'); await p.waitForTimeout(200)
await photo('c5-ligne.png')
await p.click('.sheet button:has-text("Enregistrer")'); await p.waitForTimeout(500)
const su = appels.find(a => a[0] === 'chiffrage_surcharger')?.[1]
if (!su || su.p_cle !== 's_chef_rang' || su.p.ratio !== 12 || su.p_reference) echec(`surcharge : ${JSON.stringify(su)}`)
if (!(await p.locator('.cf-grp:has-text("STAFF · 38 PERSONNES")').count())) echec('effectif recalculé')
// 4. Aussi la référence, sur le cocktail
await p.click('.cf-l:has-text("Cocktail dînatoire")'); await p.waitForTimeout(500)
await p.locator('.sheet input[inputmode=decimal]').last().fill('6'); await p.click('.cf-choix button:has-text("Aussi la référence")'); await p.waitForTimeout(200)
await photo('c6-ligne-reference.png')
await p.click('.sheet button:has-text("Enregistrer")'); await p.waitForTimeout(500)
const su2 = appels.filter(a => a[0] === 'chiffrage_surcharger').pop()?.[1]
if (!su2 || su2.p_cle !== 'm_cocktail' || su2.p.valeur !== 6 || !su2.p_reference) echec(`référence depuis la ligne : ${JSON.stringify(su2)}`)
// 5. Nommer une personne
await p.click('.cf-sub:has-text("Chef de rang 2")'); await p.waitForTimeout(600)
await p.click('.sheet .chip:has-text("Youssef Alami")'); await p.locator('.sheet input[inputmode=decimal]').fill('650')
await photo('c7-personne.png')
await p.click('.sheet button:has-text("Enregistrer")'); await p.waitForTimeout(400)
const pe = appels.find(a => a[0] === 'chiffrage_personne')?.[1]
if (!pe || pe.p_cle !== 's_chef_rang' || pe.p_rang !== 2 || pe.p.nom !== 'Youssef Alami' || pe.p.prix !== 650) echec(`personne : ${JSON.stringify(pe)}`)
// 6. Informations de base : un moment de plus recalcule
await p.click('.cf-base summary'); await p.waitForTimeout(300)
await p.click('.cf-base .chip:has-text("Late snack")'); await p.waitForTimeout(400)
const ca = appels.filter(a => a[0] === 'chiffrage_calculer').pop()?.[1]
if (!ca || !ca.p_base.moments.includes('late_snack')) echec(`base : ${JSON.stringify(ca)}`)
await photo('c8-base.png')
// 7. Hors Salmane : la référence est fermée
peut = false
await p.reload(); await p.waitForTimeout(1500)
await p.click('.cf-l:has-text("Dîner assis")'); await p.waitForTimeout(500)
if (!(await p.locator('.cf-choix button:has-text("Aussi la référence")').isDisabled())) echec('référence ouverte à tous')

// 8. Clôture : nouveaux prix
peut = true
await voir('bilan', 1400)
if (!(await p.locator('.etapes button:has-text("Nouveaux prix")').count())) echec('étape Nouveaux prix absente')
await photo('c9-bilan.png')
await voir('bilan/prix', 1200)
if ((await p.locator('.cf-prop').count()) !== 3) echec('3 propositions à décider')
await photo('c10-nouveaux-prix.png')
await p.locator('.cf-prop').first().locator('button:has-text("Accepter")').click(); await p.waitForTimeout(400)
const de = appels.find(a => a[0] === 'proposition_decider')?.[1]
if (!de || de.p_id !== 1 || de.p_decision !== 'accepter') echec(`accepter : ${JSON.stringify(de)}`)
await p.locator('.cf-prop').first().locator('button:has-text("Modifier")').click(); await p.waitForTimeout(500)
await p.locator('.sheet input[inputmode=decimal]').fill('27')
await photo('c11-modifier.png')
await p.click('.sheet button:has-text("Enregistrer la référence")'); await p.waitForTimeout(400)
const de2 = appels.filter(a => a[0] === 'proposition_decider').pop()?.[1]
if (!de2 || de2.p_id !== 2 || de2.p_decision !== 'modifier' || de2.p_valeur !== 27) echec(`modifier : ${JSON.stringify(de2)}`)

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'CHIFFRAGE OK')
process.exit(ko ? 1 : 0)
