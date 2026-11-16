// v76 · Parts des associés : la carte d'Aujourd'hui (associés seulement), l'écran détaillé, les réglages et versements de Salmane.
// Lancer : npm run build && node tests/e2e/parts.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5204, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const ASS = [{ nom: 'Hamza', court: 'Hamza', pct: 37.5 }, { nom: 'Soufiane Hadni', court: 'Soufiane', pct: 37.5 }, { nom: 'Salmane', court: 'Salmane', pct: 25 }]
const al = (pct, montant, retouche = false) => ({ pct, montant, retouche })
let EV = { id: 'EVT-T-001', nom: 'Mariage Kasbah', date: '2026-11-17', statut: 'Confirmé', especes: true, ht: 354945, cout: 146917, prevu: 142638, depense: 1000, imprevus: 4279, source: 'partiel',
  agence: 60341, agence_pct: 17, imprevus_pct: 3, apporteur: { qui: 'Salmane', montant: 17747 }, operateurs: { qui: [], montant: 17747, a_attribuer: true },
  marge: 112193, marge_pct: 32, allocations: { charite: al(2.5, 2805), reinvest: al(0, 0), dettes: al(0, 0), provision: al(0, 0) }, reste: 109388, epicure: 0,
  parts: { Hamza: 41021, 'Soufiane Hadni': 41021, Salmane: 45094 }, encaisse: 250000 }
const EV2 = { ...EV, id: 'EVT-T-002', nom: 'Gala corporate', date: '2026-09-19', especes: false, source: 'reel', statut: 'Clôturé', ht: 120000, marge: 48000, marge_pct: 40,
  operateurs: { qui: ['Hamza'], montant: 6000, a_attribuer: false }, apporteur: { qui: 'Hamza', montant: 6000 }, parts: { Hamza: 12000, 'Soufiane Hadni': 0, Salmane: 0 }, reste: 46800, epicure: 46800 }
let vers = []
const P = moi => ({ annee: 2026, moi, peut_modifier: moi === 'Salmane', evenements: [EV2, EV],
  associes: ASS.map(a => ({ ...a, gagne: EV.parts[a.nom] + EV2.parts[a.nom], acquis: EV2.parts[a.nom], verse: vers.filter(v => v.associe === a.nom).reduce((s, v) => s + v.montant, 0) })),
  versements: vers })
let qui = 'Salmane', majs = []
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  parts_associes: () => qui === 'Ghali' ? { __err: 'reserve_associes' } : P(qui),
  parts_evt_maj: b => { majs.push(b.p); if (b.p.operateurs) EV = { ...EV, operateurs: { ...EV.operateurs, qui: b.p.operateurs, a_attribuer: !b.p.operateurs.length }, parts: { ...EV.parts, Salmane: 62841 } }; return EV },
  parts_verser: b => { vers = [{ id: 1, associe: b.p.associe, montant: b.p.montant, le: b.p.le, evenement: null, note: b.p.note }]; return P(qui) },
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); const out = RPC[fn] ? RPC[fn](body) : true
  if (out && out.__err) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: out.__err }) })
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const erreurs = []; p.on('pageerror', e => { if (!e.message.includes('localStorage')) erreurs.push(e.message) })
const photo = async nom => { if (captures) await p.screenshot({ path: path.join(captures, nom) }) }
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }

// 1. Ghali (pas associé) : aucune carte
qui = 'Ghali'; await voir('aujourdhui')
if (await p.locator('.pa-carte').count()) echec('la carte s\'affiche pour un non-associé')
await voir('parts'); if (!(await p.locator('text=Réservé aux associés').count())) echec('écran des parts ouvert à un non-associé')

// 2. Salmane : la carte en tête d'Aujourd'hui
qui = 'Salmane'; await voir('aujourdhui')
const carte = p.locator('.pa-carte')
if (!(await carte.count())) echec('carte absente pour un associé')
const tc = await carte.innerText()
if (!tc.includes('Hamza') || !tc.includes('Soufiane') || !tc.includes('53') ) echec(`carte : ${tc}`)
await photo('p1-aujourdhui.png')

// 3. L'écran : trois parts, événements, opérateurs à choisir
await carte.click(); await p.waitForTimeout(900)
if (!(await p.locator('h1:has-text("Parts des associés")').count())) echec('écran des parts absent')
if (!(await p.locator('.pa-alerte:has-text("Opérateurs sur place à choisir")').count())) echec('alerte opérateurs absente')
if (!(await p.locator('.pa-ev:has-text("reste dans Epicure")').count())) echec('virement pas marqué')
await photo('p2-parts.png')

// 4. Le détail d'un événement, et Salmane choisit l'opérateur
await p.click('.pa-ev:has-text("Mariage Kasbah")'); await p.waitForTimeout(600)
await photo('p3-detail.png')
await p.locator('.sheet .chip:has-text("Salmane")').nth(1).click(); await p.waitForTimeout(600)
if (!majs.some(m => JSON.stringify(m.operateurs) === '["Salmane"]')) echec('opérateur pas enregistré')
await p.mouse.click(195, 30); await p.waitForTimeout(500)

// 5. Un versement
await p.click('.pa-plus'); await p.waitForTimeout(500)
await p.click('.sheet .chip:has-text("Hamza")'); await p.fill('.sheet .pa-input[inputmode="numeric"]', '20000')
await photo('p4-verse.png')
await p.click('.sheet .btn.primary'); await p.waitForTimeout(700)
if (!(await p.locator('.pa-v:has-text("Hamza · 20")').count())) echec('versement pas affiché')

// 6. Hamza : il voit tout, sans rien pouvoir modifier
qui = 'Hamza'; await voir('parts')
if (await p.locator('.pa-plus').count()) echec('Hamza peut noter un versement')
await p.click('.pa-ev:has-text("Mariage Kasbah")'); await p.waitForTimeout(600)
if (await p.locator('.sheet .chip').count()) echec('Hamza peut modifier l\'événement')

if (erreurs.length) echec(`erreurs : ${erreurs.join(' | ')}`)
await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'PARTS OK')
process.exit(ko ? 1 : 0)
