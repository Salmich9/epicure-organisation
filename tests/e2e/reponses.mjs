// v71 · Chaque réponse agit : infos de base (bars, service, horaires, sur place, fourni par le lieu) proposées en avant → après,
// postes « à régler » et « fourni » visibles dans le chiffrage et dans les Paramètres.
// Lancer : npm run build && node tests/e2e/reponses.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { questionsListe } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5201, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const P = (cle, section, groupe, libelle, calcul, valeur, unite, extra = {}) => ({ cle, section, groupe, libelle, calcul, valeur, unite, ratio: null, actif: true, nb_modifs: 0, histo: [], ...extra })
const PARAMS = [P('x_vaisselle', 'materiel', 'Art de table', 'Location vaisselle', 'par_base', 42.5, 'MAD / couvert'), P('x_kit_bar', 'materiel', 'Bar', 'Kit bar', 'fixe', 0, 'MAD / bar', { a_regler: true }),
  P('x_groupe', 'materiel', 'Technique', 'Groupe électrogène', 'fixe', 0, 'MAD', { a_regler: true }), P('b_glace', 'bar', 'Consommables par invité', 'Glace', 'par_base', 4, 'MAD / kg')]
const L = (param, groupe, zone, element, quantite, prix, note, extra = {}) => ({ param, groupe, zone, element, quantite, prix, note, mode: 'achat', ...extra })
const lignes = (fourni = false) => [L('b_glace', 'bar', 'Bar', 'Glace', 300, 4, '120 invités × 2,5 × 4'),
  L('x_kit_bar', 'materiel', 'Bar', 'Kit bar', 2, 0, 'prix à régler dans les Paramètres', { a_regler: true }),
  fourni ? L('x_vaisselle', 'materiel', 'Art de table', 'Location vaisselle', 1, 0, 'fourni par le lieu · à confirmer par écrit', { fourni: true, mode: 'tiers' }) : L('x_vaisselle', 'materiel', 'Art de table', 'Location vaisselle', 120, 42.5, '120 invités × 42,5')]
const BASE = { invites: 120, traiteur: true, bar: true, moments: ['diner_assis'], alcool: [], nb_bars: 2, service: ['cocktails'], heures: { debut: '19:00', fin: '02:30' } }
const RPC = {
  chiffrage_questions_liste: () => questionsListe(),
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_params: () => ({ peut_modifier: true, params: PARAMS }),
  chiffrage_contexte: () => ({ paliers: [{ coef: 2.25, jusqua: 349 }], chiffrage: { lignes: lignes(), base: BASE, coef: 2.25 }, catalogue: [], references: [] }),
  chiffrage_apercu: b => ({ lignes: lignes((b.p_base?.fourni || []).includes('vaisselle')), base: { ...BASE, ...(b.p_base || {}) }, moteur: lignes() }),
  chiffrage_valider: b => ({ lignes: b.p_lignes, base: b.p_base }), chiffrage_journal_liste: () => [], chiffrage_noter: () => true, chiffrage_enregistrer: () => true,
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
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

await voir('aujourdhui', 800); await voir('chiffrer', 1500)
if (!(await p.locator('.cf-l:has-text("Kit bar") .cf-ar').count())) echec('« à régler » absent du chiffrage')
await p.click('.cf-base summary'); await p.waitForTimeout(400)
if (!(await p.locator('.cf-base .chip.on:has-text("2")').count())) echec('2 bars pas affichés')
if ((await p.locator('.cf-base input[type=time]').first().inputValue()) !== '19:00') echec('horaires pas affichés')
await photo('r1-infos.png', true)
await p.click('.cf-base .chip:has-text("Vaisselle")'); await p.waitForTimeout(900)
if (!dernier('chiffrage_apercu')?.p_base?.fourni?.includes('vaisselle')) echec('fourni pas envoyé')
if (!(await p.locator('text=Fourni par le lieu changé').count())) echec('avant → après absent')
await photo('r2-avant-apres.png')
await p.click('.btn.primary'); await p.waitForTimeout(900)
if (!(await p.locator('.cf-l:has-text("Location vaisselle") .cf-fo').count())) echec('« fourni » absent après validation')
await p.click('.cf-base summary').catch(() => {}); await p.waitForTimeout(200)
await p.locator('.cf-l:has-text("Location vaisselle")').scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
await photo('r3-detail.png')
await voir('parametres', 1000); await p.click('.chip:has-text("Matériel")'); await p.waitForTimeout(400)
if (!(await p.locator('.cf-l:has-text("Groupe électrogène") .cf-ar').count())) echec('« à régler » absent des Paramètres')
await photo('r4-parametres.png')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'REPONSES OK')
process.exit(ko ? 1 : 0)
