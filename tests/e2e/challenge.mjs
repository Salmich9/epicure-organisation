// v73 · « Challenge-moi » lance l'agent vocal sur l'événement (mode challenge) ; réglages du challenge dans Paramètres › Questions.
// Lancer : npm run build && node tests/e2e/challenge.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { questionsListe } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5203, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

let reg = { actif: true, confirmation: true, jours: [30, 7] }
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_questions_liste: () => questionsListe(), chiffrage_params: () => ({ peut_modifier: true, params: [] }),
  challenge_reglages: b => { if (b.p) reg = { ...reg, ...b.p }; return { reglages: reg, peut_modifier: true } },
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')); localStorage.setItem('orga_onglet', 'budget') })
const appels = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

await voir('aujourdhui', 800); await voir('', 1500)
const bouton = p.locator('.challenge:has-text("Challenge-moi")')
if (!(await bouton.count())) echec('bouton Challenge-moi absent')
await bouton.scrollIntoViewIfNeeded(); await photo('h1-bouton.png')
await bouton.click(); await p.waitForTimeout(900)
if (!(await p.locator('.vq:has-text("Challenge : Mariage Test")').count())) echec('écran challenge')
if (!(await p.locator('.vo-go:has-text("Démarrer")').count())) echec('Démarrer absent')
await photo('h2-challenge.png')
await voir('parametres'); await p.click('.chip:has-text("Questions")'); await p.waitForTimeout(800)
await p.locator('.cf-grp:has-text("CHALLENGE VOCAL")').scrollIntoViewIfNeeded()
if (!(await p.locator('.chip.on:has-text("J−30")').count())) echec('J−30 absent')
await p.fill('.q-j input', '14'); await p.click('.q-j .chip'); await p.waitForTimeout(400)
if (!dernier('challenge_reglages')?.p?.jours?.includes(14)) echec('J−14 pas ajouté')
await photo('h3-reglages.png')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'CHALLENGE OK')
process.exit(ko ? 1 : 0)
