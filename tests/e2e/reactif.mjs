// Gestes instantanés : temps entre le toucher et l'affichage sur un téléphone simulé en 4G
// (écriture 350 ms, rechargement d'un événement 600 ms), double toucher rapide, et retour en arrière si l'envoi échoue.
// Lancer : npm run build && node tests/e2e/reactif.mjs
import { createRequire } from 'node:module'
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const R = path.resolve('.')
const { accueil, donnees: d0 } = await import(R + '/tests/e2e/fixture.mjs')
const { chromium } = createRequire(R + '/package.json')('playwright')
const dist = R + '/dist', port = 5191
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)
const D = JSON.parse(JSON.stringify(d0))
const ECRIT = 350, LIT = 600
let panne = false
const RPC = {
  donnees: () => [LIT, D], accueil: () => [LIT, accueil], depot_liste: () => [LIT, []], bulles_liste: () => [ECRIT, { bulles: [] }],
  action_enregistrer: b => { if (panne) return [ECRIT, { message: 'canceling statement due to statement timeout', code: '57014' }, 500]; const a = D.actions.find(x => x.id === b.p_id); if (b.p.fait !== undefined) a.statut = b.p.fait ? 'Fait' : 'À faire'; return [ECRIT, a] },
  element_revoir: b => { const e = D.elements.find(x => x.id === b.p_id); Object.assign(e, b.p, { revu_le: new Date().toISOString() }); return [ECRIT, e] },
  maj_element: b => { const e = D.elements.find(x => x.id === b.p_id); Object.assign(e, b.p); return [ECRIT, e] },
}
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001') })
await ctx.route('**/rest/v1/rpc/**', async r => { const fn = r.request().url().split('/rpc/')[1]; const [ms, body, st] = RPC[fn] ? RPC[fn](JSON.parse(r.request().postData() || '{}')) : [ECRIT, true]
  await new Promise(z => setTimeout(z, ms)); r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(body) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
const p = await ctx.newPage()
await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForSelector('.pv-sa .pv-ck'); await p.waitForTimeout(1500)
let ko = 0; const echec = m => { ko++; console.log('  ✗', m) }
const coche = () => p.evaluate(() => document.querySelector('.pv-sa .pv-ck')?.classList.contains('on'))
const mesure = async (nom, agir, attendre) => { const t = Date.now(); await agir(); await p.waitForFunction(attendre, null, { polling: 10, timeout: 8000 }); const ms = Date.now() - t
  if (ms > 200) echec(`${nom} : ${ms} ms (attendu < 200 ms)`); else console.log(`  ✓ ${nom} : ${ms} ms`); return ms }
await mesure('Cocher une action', () => p.locator('.pv-sa .pv-ck').first().click(), () => document.querySelector('.pv-sa .pv-ck')?.classList.contains('on'))
await p.waitForTimeout(1500)
await mesure('Décocher', () => p.locator('.pv-sa .pv-ck').first().click(), () => !document.querySelector('.pv-sa .pv-ck')?.classList.contains('on'))
await p.waitForTimeout(1500)
await p.locator('.pv-3').first().click(); await p.waitForTimeout(500)
await mesure('Ligne reçue', () => p.locator('.sheet .chip', { hasText: /^Reçu$/ }).first().click(), () => !!document.querySelector('.pv-rc.ok'))
// Revue : « Valider » passe tout de suite à l'élément suivant
await p.keyboard.press('Escape'); await p.waitForTimeout(800)
await p.goto(`http://localhost:${port}/#/revue/${D.zones.findIndex(z => z.nom === 'Art de table')}`); await p.waitForSelector('.rv-card .nm'); await p.waitForTimeout(1200)
const titre = () => p.evaluate(() => document.querySelector('.rv-card .nm')?.textContent)
const t0 = await titre()
await mesure('Revue : valider et passer au suivant', () => p.locator('button.p', { hasText: 'Valider' }).first().click(), `(document.querySelector('.rv-card .nm')?.textContent || '') !== ${JSON.stringify(t0)}`)
await p.waitForTimeout(1500)
if (!D.elements.find(x => x.zone === 'Art de table')?.revu_le) echec('revue : validation non envoyée'); else console.log('  ✓ revue : validation bien envoyée')
await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForSelector('.pv-sa .pv-ck'); await p.waitForTimeout(1500)
// Double toucher rapide : l'état final est celui du dernier toucher, même après les rechargements
const avant = await coche()
await p.locator('.pv-sa .pv-ck').first().click(); await p.waitForTimeout(80); await p.locator('.pv-sa .pv-ck').first().click()
await p.waitForTimeout(2500)
if ((await coche()) !== avant || (D.actions.find(a => a.id === 'ACT-1')?.statut === 'Fait') !== avant) echec('double toucher : état final faux'); else console.log('  ✓ double toucher : état final juste')
// Panne : la coche s'affiche, puis revient et l'écran le dit
panne = true
await p.locator('.pv-sa .pv-ck').first().click()
const tout = await coche(); await p.waitForTimeout(2000)
const msg = await p.locator('.toast').textContent().catch(() => '')
if (tout === avant || (await coche()) !== avant || !/Pas enregistré/.test(msg || '')) echec(`panne : ${tout} → ${await coche()} « ${msg} »`); else console.log('  ✓ panne : coche annulée et message affiché')
await b.close(); srv.close()
console.log(ko ? `\n${ko} échec(s)` : '\nTout passe'); process.exit(ko ? 1 : 0)
