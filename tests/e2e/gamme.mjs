// v69 · La demande complète et la gamme : pas de chiffrage sans date, invités, lieu, prestation et gamme ;
// coef = taille × gamme (Classique 1, Premium 1,08, Prestige 1,15), choisir la gamme change le coef et le note au journal.
// Lancer : npm run build && node tests/e2e/gamme.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { questionsListe } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5199, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const PARAMS = [{ cle: 'g_coef_3', section: 'marges', groupe: 'Coefficient de vente', libelle: 'Coef grand', calcul: 'regle', valeur: 2.25, unite: '×', ratio: 349, actif: true },
  { cle: 'g_gamme_premium', section: 'marges', groupe: 'Gamme', libelle: 'Multiplicateur Premium', calcul: 'regle', valeur: 1.08, unite: '×', actif: true },
  { cle: 'g_gamme_prestige', section: 'marges', groupe: 'Gamme', libelle: 'Multiplicateur Prestige', calcul: 'regle', valeur: 1.15, unite: '×', actif: true }]
const LIGNES = [{ param: 'm_diner', groupe: 'moments', zone: 'Menu', element: 'Dîner assis', quantite: 200, prix: 150, mode: 'achat' }]
let ev = { ...donnees.evenements[0], lieu: '', gamme: null }
let avecChiffrage = false
const D = () => ({ ...donnees, evenements: donnees.evenements.map(e => e.id === ev.id ? ev : e) })
const RPC = {
  chiffrage_questions_liste: () => questionsListe(),
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => D(), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_params: () => ({ peut_modifier: true, params: PARAMS }),
  chiffrage_contexte: () => ({ paliers: [{ coef: 2.25, jusqua: 349 }], chiffrage: avecChiffrage ? { lignes: LIGNES, base: { invites: 200 }, coef: 2.25 } : null, catalogue: [], references: [] }),
  chiffrage_calculer: () => ({ lignes: LIGNES, base: { invites: 200 } }), chiffrage_journal_liste: () => [], chiffrage_noter: () => true, chiffrage_enregistrer: () => true,
  evenement_creer: b => ({ ...ev, ...b.p, id: 'EVT-T-001' }),
  evenement_maj: b => { ev = { ...ev, ...b.p }; return ev },
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
const voir = async (route, ms = 1000) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

// 1. Nouvel événement : le bouton dit ce qui manque, la gamme est obligatoire
await voir('aujourdhui', 800); await voir('nouveau', 1000)
if (!(await p.locator('.btn.primary:has-text("Il manque : nom, date, invités, lieu, gamme, horaires")').count())) echec('ce qui manque pas annoncé')
await p.fill('input[placeholder="Mariage Cassandra"]', 'Mariage Norah'); await p.fill('input[type=date]', '2026-12-20'); await p.fill('input[placeholder="250"]', '200')
await p.fill('input[placeholder="Domaine, riad, villa…"]', 'Domaine Rhoul')
await p.locator('input[type=time]').nth(0).fill('19:00'); await p.locator('input[type=time]').nth(1).fill('02:00')
if (!(await p.locator('.btn.primary:has-text("Il manque : gamme")').count())) echec('gamme pas réclamée')
await p.click('.tile:has-text("Premium")'); await p.waitForTimeout(200)
await photo("g1-nouveau.png", true)
await p.click('.btn.primary:has-text("Chiffrer")'); await p.waitForTimeout(800)
if (dernier('evenement_creer')?.p?.gamme !== 'Premium') echec('gamme pas envoyée')

// 2. Événement sans lieu ni gamme, jamais chiffré : on complète avant de chiffrer
appels.length = 0
await voir('chiffrer', 1500)
if (!(await p.locator('h1:has-text("Avant de chiffrer")').count())) echec('pas de garde avant le chiffrage')
if (appels.some(a => a[0] === 'chiffrage_calculer')) echec('chiffré alors qu\'il manque des bases')
await p.fill('input[placeholder="Domaine, riad, villa…"]', 'Riad Fès'); await p.click('.tile:has-text("Prestige")'); await p.waitForTimeout(200)
await photo('g2-avant-de-chiffrer.png')
await p.click('.btn.primary:has-text("Chiffrer")'); await p.waitForTimeout(1500)
const mj = dernier('evenement_maj')
if (!mj || mj.p.gamme !== 'Prestige' || mj.p.lieu !== 'Riad Fès') echec(`compléter : ${JSON.stringify(mj?.p)}`)
if (!appels.some(a => a[0] === 'chiffrage_calculer')) echec('pas chiffré après avoir complété')
if (!(await p.locator('.coef b:has-text("2,59")').count())) echec('coef Prestige 2,25 × 1,15 = 2,59 absent')

// 3. Chiffrage existant : passer en Premium change le coef et le note au journal
ev = { ...ev, gamme: 'Classique', lieu: 'Riad Fès' }; avecChiffrage = true; appels.length = 0
await p.goto('about:blank'); await voir('chiffrer', 1500)
if (!(await p.locator('.coef b:has-text("2,25")').count())) echec('coef Classique')
await p.click('.t-g .chip:has-text("Premium")'); await p.waitForTimeout(900)
if (!(await p.locator('.coef b:has-text("2,43")').count())) echec('coef Premium 2,43 absent')
if (!(await p.locator('.t-l.sous:has-text("taille 2,25 × Premium 1,08")').count())) echec('détail du coef absent')
if (!dernier('chiffrage_noter')?.p_journal?.[0]?.titre?.includes('2,25 → 2,43')) echec('pas noté au journal')
await p.locator('.totaux').scrollIntoViewIfNeeded(); await p.waitForTimeout(300)
await photo('g3-coef.png')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'GAMME OK')
process.exit(ko ? 1 : 0)
