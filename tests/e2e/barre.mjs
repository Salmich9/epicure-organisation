// v79 · La barre du bas reste collée en bas : seule la zone de l'appli défile, jamais la page ; après un champ, la page se recale.
// Lancer : npm run build && node tests/e2e/barre.mjs [dossier-captures]
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium, devices } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5206, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)
const RPC = { aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  sante: () => ({ services: [], erreurs: Array.from({ length: 30 }, (_, i) => ({ message: `Erreur ${i}`, source: 'test', n: 1, dernier: '2026-11-16T10:00:00Z' })) }) }
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ ...devices['iPhone 13'] })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn]() : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const H = 664  // hauteur de l'écran iPhone 13 dans Playwright
const basBarre = () => p.evaluate(() => Math.round(document.querySelector('.tabs').getBoundingClientRect().bottom))
const hauteur = () => p.evaluate(() => innerHeight)

for (const route of ['parametres', 'planning', 'aujourdhui']) {
  await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(1200)
  const h = await hauteur()
  // la page n'a rien à faire défiler (seule .app défile) : c'est ce qui empêche iOS de faire remonter la barre
  const st = await p.evaluate(() => ({ haut: document.documentElement.scrollHeight, h: innerHeight, pos: getComputedStyle(document.querySelector('.app')).position, ov: getComputedStyle(document.querySelector('.app')).overflowY, corps: getComputedStyle(document.body).overflow }))
  if (st.haut > st.h + 1 || st.pos !== 'fixed' || st.ov !== 'auto' || st.corps !== 'hidden') echec(`${route} : la page peut encore défiler ${JSON.stringify(st)}`)
  // l'appli défile, la page jamais (un long contenu pour le vérifier)
  await p.evaluate(() => { const d = document.createElement('div'); d.style.height = '3000px'; document.querySelector('.app').appendChild(d) })
  await p.mouse.move(195, 400); await p.mouse.wheel(0, 2000); await p.waitForTimeout(300)
  if (await p.evaluate(() => scrollY) !== 0) echec(`${route} : la page a défilé`)
  if (await basBarre() !== h) echec(`${route} : barre à ${await basBarre()} au lieu de ${h}`)
  if (!(await p.evaluate(() => document.querySelector('.app').scrollTop > 0))) echec('la zone de l\'appli ne défile pas')
  // un clavier qui laisse la page décalée : elle se recale en quittant le champ
  await p.evaluate(() => { scrollTo(0, 300); dispatchEvent(new FocusEvent('focusout')) }); await p.waitForTimeout(200)
  if (await p.evaluate(() => scrollY) !== 0) echec(`${route} : page pas recalée`)
  if (await basBarre() !== h) echec(`${route} : barre décalée après le clavier`)
}
if (captures) await p.screenshot({ path: path.join(captures, 'b1-bas.png') })
await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'BARRE OK')
process.exit(ko ? 1 : 0)
