// v66 · Chiffrage protégé : invités changés = bandeau puis avant → après (rien d'écrit avant validation), lignes réglées à la main 🔒 décochées,
// copilote en proposition, retouche à la main notée au journal, historique, chiffrage d'avant les paramètres comparé bloc par bloc.
// Lancer : npm run build && node tests/e2e/protege.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { questionsListe } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5197, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const L = (param, groupe, zone, element, quantite, prix, note, extra = {}) => ({ param, groupe, zone, element, quantite, prix, note, mode: 'achat', ...extra })
const pers = (nb) => Array.from({ length: nb }, (_, i) => L('s_chef_rang', 'staff', 'Staff', `Chef de rang ${i + 1}`, 1, 600, `1 pour 10 invités × 600`, { rang: i + 1 }))
const moteur = inv => [
  L('m_diner', 'moments', 'Menu', 'Dîner assis', inv, 150, `${inv} invités × 150`),
  L('m_cocktail', 'moments', 'Menu', 'Cocktail dînatoire', inv * 7, 6, `${inv} invités × 7 × 6`),
  L('m_desserts', 'moments', 'Menu', 'Desserts', inv, 30, `${inv} invités × 30`),
  ...pers(Math.ceil(inv / 10)),
  L('t_traiteur', 'transport_marchandises', 'Logistique', 'Camion traiteur A/R', 1, 2750, '1 × 2 750'),
]
const extra = { zone: 'Lieu technique et admin', element: 'Caution loueur', quantite: 1, prix: 3000, uid: 'x1', mode: 'achat' }
const BASE = { invites: 150, traiteur: true, bar: false, moments: ['cocktail', 'diner_assis', 'desserts'], alcool: [], surcharges: { m_cocktail: { valeur: 6 } }, effectifs: {}, personnes: {} }
const ANCIEN = [{ zone: 'Menu', element: 'Dîner', quantite: 150, prix: 140 }, { zone: 'Staff', element: 'Serveurs', quantite: 12, prix: 500 },
  { zone: 'Logistique', element: 'Camion', quantite: 1, prix: 2500 }, { zone: 'Décoration et ambiance', element: 'Fleurs', quantite: 15, prix: 250 }]
let mode = 'invites'
const D = () => ({ ...donnees, evenements: donnees.evenements.map(e => e.id === 'EVT-T-001' ? { ...e, invites: 180, nom: 'Norah et François' } : e) })
const RPC = {
  chiffrage_questions_liste: () => questionsListe(),
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => D(), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_params: () => ({ peut_modifier: true, params: [] }),
  chiffrage_contexte: () => ({ paliers: [{ coef: 2.25, jusqua: 349 }], catalogue: [], references: [],
    chiffrage: mode === 'ancien' ? { lignes: ANCIEN, base: null, coef: 2.25, hypotheses: '' } : { lignes: [...moteur(150), extra], base: BASE, coef: 2.25, hypotheses: '' } }),
  chiffrage_apercu: b => mode === 'ancien' ? { lignes: [...moteur(150), ...ANCIEN], moteur: moteur(150), base: { ...BASE, surcharges: {} } }
    : { lignes: [...moteur(n(b.p_base?.invites) || 150), extra], moteur: moteur(n(b.p_base?.invites) || 150), base: { ...BASE, ...(b.p_base || {}) } },
  chiffrage_valider: b => ({ lignes: b.p_lignes, base: b.p_base }), chiffrage_enregistrer: () => true, chiffrage_noter: () => true,
  chiffrage_journal_liste: () => [
    { quand: '2026-11-16T17:42:00Z', qui: 'Salmane', source: 'base', titre: 'Invités 150 → 180', detail: '3 acceptés, 1 gardé 🔒' },
    { quand: '2026-11-16T17:40:00Z', qui: 'Salmane', source: 'main', titre: 'Caution loueur : 3 000 → 3 500' },
    { quand: '2026-11-16T15:31:00Z', qui: 'Salmane', source: 'main', titre: 'Cocktail dînatoire : 5,5 → 6', detail: 'réglé pour cet événement' },
    { quand: '2026-11-15T22:41:00Z', qui: 'Salmane', source: 'copilote', titre: 'Copilote : ajoute la caution', detail: '1 accepté' }],
}
function n(v) { return Number(v) || 0 }
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
const appels = [], fonctions = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => { const body = JSON.parse(r.request().postData() || '{}'); fonctions.push(body)
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.mode === 'chiffrer' && body.apercu
    ? { lignes: [...moteur(180), { ...extra, uid: undefined, prix: 4000 }, { zone: 'Lieu technique et admin', element: 'Nettoyage', quantite: 1, prix: 800 }], base: BASE, hypotheses: 'Caution réévaluée, nettoyage ajouté', apercu: true } : {}) }) })
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 1200) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const ecrits = () => appels.filter(a => ['chiffrage_valider', 'chiffrage_enregistrer', 'chiffrage_calculer', 'chiffrage_surcharger'].includes(a[0]))

// 1. Invités changés (150 → 180) : un bandeau, rien d'écrit
await voir('aujourdhui', 800)
await voir('chiffrer', 1800)
if (!(await p.locator('.aa-ban:has-text("à valider")').count())) echec('bandeau des changements à valider absent')
if (ecrits().length) echec(`écrit à l'ouverture : ${ecrits().map(a => a[0])}`)
await photo('v1-bandeau.png')
// 2. Avant → après : le cocktail réglé à la main est verrouillé et décoché
await p.click('.aa-ban button:has-text("Voir avant → après")'); await p.waitForTimeout(600)
if (!(await p.locator('h1:has-text("Avant → après")').count())) echec('écran avant → après')
const cocktail = p.locator('.aa-l:has-text("Cocktail dînatoire")')
if (await cocktail.locator('.aa-ck.on').count()) echec('cocktail 🔒 coché')
if (!(await p.locator('.aa-l:has-text("Dîner assis") .aa-ck.on').count())) echec('dîner pas coché')
if (!(await p.locator('.aa-l:has-text("Chef de rang")').count())) echec('chefs de rang regroupés absents')
if (await p.locator('.aa-l:has-text("Caution loueur")').count()) echec('ligne inchangée montrée')
await photo('v2-avant-apres.png', true)
await p.click('.btn.primary:has-text("Valider")'); await p.waitForTimeout(600)
const va = appels.filter(a => a[0] === 'chiffrage_valider').pop()?.[1]
if (!va) echec('pas de validation')
else {
  if (va.p_lignes.find(l => l.param === 'm_diner')?.quantite !== 180) echec('dîner pas passé à 180')
  const ck = va.p_lignes.find(l => l.param === 'm_cocktail')
  if (ck?.quantite !== 1050 || !ck.verrou) echec(`cocktail : ${JSON.stringify(ck)}`)
  if (va.p_base?.invites !== 180) echec('base pas passée à 180')
  if (!/acceptés?, 1 gardé/.test(va.p_journal?.detail || '')) echec(`journal : ${JSON.stringify(va.p_journal)}`)
}
if (await p.locator('.aa-ban:has-text("à valider")').count()) echec('bandeau resté après validation')

// 3. Retouche à la main : 🔒 et notée au journal
await p.locator('.cz-top').first().click(); await p.waitForTimeout(400)
const prix = p.locator('.cl-chiffres input').nth(1); await prix.fill('3500'); await p.waitForTimeout(1800)
if (!(await p.locator('.cl-lk').count())) echec('pas de 🔒 sur la ligne retouchée')
const no = appels.find(a => a[0] === 'chiffrage_noter')?.[1]
if (!no || !no.p_journal?.[0]?.titre?.replace(/\s/g, ' ').includes('3 000 → 3 500')) echec(`noter : ${JSON.stringify(no)}`)
await photo('v3-retouche.png')

// 4. Copilote : il propose, il n'écrit pas
const avantCop = ecrits().length
await p.fill('.consigne input', 'réévalue la caution et ajoute le nettoyage'); await p.click('.consigne .chip:has-text("Ajuster")'); await p.waitForTimeout(800)
if (!fonctions.some(f => f.mode === 'chiffrer' && f.apercu)) echec('copilote pas en aperçu')
if (ecrits().length !== avantCop) echec('le copilote a écrit')
if (!(await p.locator('.aa-l:has-text("Nettoyage")').count())) echec('ajout du copilote absent')
if (!(await p.locator('.aa-l:has-text("Caution loueur") .aa-ck:not(.on)').count())) echec('caution retouchée à la main cochée')
await photo('v4-copilote.png')
await p.click('button:has-text("Annuler")'); await p.waitForTimeout(400)
if (ecrits().length !== avantCop) echec('Annuler a écrit')

// 5. Historique
await p.click('.chip:has-text("Historique")'); await p.waitForTimeout(700)
if ((await p.locator('.aa-h').count()) !== 4) echec('historique')
await photo('v5-historique.png')

// 6. Chiffrage d'avant les paramètres : comparer bloc par bloc
mode = 'ancien'
await voir('aujourdhui', 600); await voir('chiffrer', 1600)
if (!(await p.locator('button:has-text("Comparer avec les paramètres")').count())) echec('bouton Comparer absent')
if (await p.locator('button:has-text("Refaire avec les paramètres")').count()) echec('ancien bouton encore là')
await p.click('button:has-text("Comparer avec les paramètres")'); await p.waitForTimeout(700)
if (!(await p.locator('.aa-l:has-text("Fleurs")').count()) && !(await p.locator('.aa-l:has-text("toujours gardé")').count())) echec('en plus absent')
await p.locator('.aa-l:has-text("Staff") .chip:has-text("Prendre")').click(); await p.waitForTimeout(300)
await photo('v6-comparer.png')
await p.click('.btn.primary:has-text("Valider")'); await p.waitForTimeout(600)
const vc = appels.filter(a => a[0] === 'chiffrage_valider').pop()?.[1]
if (!vc || !vc.p_lignes.some(l => l.param === 's_chef_rang') || vc.p_lignes.some(l => l.element === 'Serveurs') || !vc.p_lignes.some(l => l.element === 'Dîner') || !vc.p_lignes.some(l => l.element === 'Fleurs')) echec('composition après comparaison')
if (!vc?.p_base?.blocs_manuels?.includes('moments') || vc.p_base.blocs_manuels.includes('staff')) echec(`blocs manuels : ${JSON.stringify(vc?.p_base?.blocs_manuels)}`)

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'PROTEGE OK')
process.exit(ko ? 1 : 0)
