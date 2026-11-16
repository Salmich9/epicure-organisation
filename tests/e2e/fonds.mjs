// Maquettes de fond d'écran : mêmes écrans, couleurs essayées (node tests/e2e/fonds.mjs dossier)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')
const dist = path.resolve('dist'), port = 5201, out = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)
const RPC = { aujourdhui: () => ({ ...aujourdhui, depot: ['voir', 'acheter', 'inventaire', 'gerer', 'prix'] }), accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }), depot_pieces: () => [], depot_historique: () => ({ lignes: [] }),
  depot_stock: () => ({ prix: true, valeur: 266929, inventaire: '2026-09-10', articles: [['Verre à vin Bordeaux', 420, 300], ['Flûte à champagne', 180, 250], ['Seau à glace inox', 24, null], ['Shaker Boston', 12, 10]].map(([nom, qte, seuil], i) => ({ id: 'a' + i, nom, qte, seuil, unite: 'pce', cat: 'Bar & verrerie', cat_id: 'c1', cat_ordre: 1, alerte: seuil != null && qte < seuil, a_commander: seuil != null && qte < seuil ? seuil - qte : 0 })) }) }
const FONDS = {
  actuel: '',
  A: ':root{--bg:#D9F2E6;--surface2:#C9EADB;--line:#C2E3D3}',
  B: ':root{--bg:#F6E3CF;--surface2:#EFD6BC;--line:#EAD3BB}',
  C: 'html,body{background:linear-gradient(165deg,#C9EEE2 0%,#E8F1E3 45%,#FBE6D2 100%) fixed!important}:root{--bg:#EAF3EA;--surface2:#E3EEE4;--line:#D5E4DA}.app{background:transparent}.tabs{background:rgba(255,255,255,.82)!important;backdrop-filter:blur(14px)}',
}
const b = await chromium.launch()
for (const [k, css] of Object.entries(FONDS)) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'light' })
  await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
  await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn]() : true) }) })
  await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"bulles":[]}' }))
  await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
  const p = await ctx.newPage()
  for (const [i, route] of [['1', 'aujourdhui'], ['2', ''], ['3', 'depot']]) {
    await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(1300)
    if (css) await p.addStyleTag({ content: css })
    await p.waitForTimeout(200); await p.screenshot({ path: path.join(out, `${k}-${i}.png`) })
  }
  await ctx.close()
}
await b.close(); srv.close(); console.log('FONDS OK')
