// v70 · Versions du devis : « Envoyé au client » fige V1, V2… ; l'écart depuis la dernière version est annoncé ; une version se relit ligne par ligne.
// Lancer : npm run build && node tests/e2e/versions.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5200, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

let apercu = { lignes: [{ nom: 'Traiteur', description: 'cocktail, dîner, desserts', montant: 180000 }, { nom: 'Bar', description: 'open bar 5 h', montant: 60000 }], total: 240000, tva: 20 }
let versions = []
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => ({ ...donnees, evenements: donnees.evenements.map(e => e.id === 'EVT-T-001' ? { ...e, statut: 'Devis envoyé', prix_signe: null, gamme: 'Premium' } : e) }), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  devis_versions_liste: () => versions,
  devis_envoyer: b => { versions = [{ id: versions.length + 1, numero: versions.length + 1, envoye_le: '2026-11-16T18:00:00Z', par: 'Salmane', lignes_client: b.p.lignes, total_ht: b.p.total, tva: b.p.tva, invites: 200, gamme: 'Premium', coef: 2.43, note: b.p.note || null }, ...versions]; return versions },
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
const appels = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().url().includes('orga-zoho') ? apercu : {}) }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

await voir('aujourdhui', 800); await voir('devis')
await p.click('.btn:has-text("figer V1")'); await p.waitForTimeout(400)
await p.click('.sheet .btn.primary'); await p.waitForTimeout(700)
if (dernier('devis_envoyer')?.p?.total !== 240000) echec('V1 pas figée')
if (!(await p.locator('.btn:has-text("V1 est à jour")').count())) echec('V1 pas annoncée à jour')
// Le client passe à 250 invités : le chiffrage change, puis V2
apercu = { lignes: [{ nom: 'Traiteur', description: 'cocktail, dîner, desserts', montant: 225000 }, { nom: 'Bar', description: 'open bar 5 h', montant: 60000 }, { nom: 'Late snack', description: '', montant: 12000 }], total: 297000, tva: 20 }
await voir('devis')
if (!(await p.locator('.dv-ecart:has-text("+57")').count())) echec('écart depuis V1 absent')
await p.click('.btn:has-text("figer V2")'); await p.waitForTimeout(400)
await p.fill('.sheet input', '250 invités, late snack'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(700)
if (dernier('devis_envoyer')?.p?.note !== '250 invités, late snack') echec('note de V2')
if ((await p.locator('.aa-l:has-text("V2 · dernière")').count()) !== 1 || !(await p.locator('.aa-l:has-text("V1")').count())) echec('liste des versions')
await p.waitForTimeout(3500); await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(300)
await photo('v1-versions.png')
await p.click('.aa-l:has-text("V2")'); await p.waitForTimeout(500)
if (!(await p.locator('.sheet .dv-up:has-text("+45")').count()) || !(await p.locator('.sheet .dv-up:has-text("nouveau")').count())) echec('écarts ligne par ligne')
await photo('v2-version.png')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'VERSIONS OK')
process.exit(ko ? 1 : 0)
