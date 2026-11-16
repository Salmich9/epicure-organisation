// Parcours du bon d'achat espèces : saisie, signature au doigt, bon enregistré et rangé.
// Lancer : npm run build && node tests/e2e/bon.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5198, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const appels = []
const RPC = {
  bon_contexte: b => ({ moi: 'Salmane', enveloppe: b.p_evt ? 5000 : null, evenements: [{ id: 'EVT-T-001', nom: 'Mariage Test', date: '2026-11-20', entite: 'Epicure' }, { id: 'EVT-T-002', nom: 'Séminaire BB', date: '2026-11-28', entite: 'Business Boys' }] }),
  depot_stock: () => ({ articles: [{ id: 'a1', nom: 'Glaçons sac 5 kg', cat: 'Boissons', qte: 12, unite: 'sac' }, { id: 'a2', nom: 'Citrons', cat: 'Fruits', qte: 4, unite: 'kg' }] }),
  depot_referentiels: () => ({ categories: [{ id: 'c1', nom: 'Boissons' }, { id: 'c2', nom: 'Fruits' }], unites: [{ id: 'u1', nom: 'kg' }, { id: 'u2', nom: 'pièce' }] }),
  bon_creer: b => ({ id: 7, num: 'EPI-2026-0001', total: b.p.lignes.reduce((t, l) => t + l.qte * l.prix, 0), pour: 'Mariage Test', reste: 5000 - b.p.lignes.reduce((t, l) => t + l.qte * l.prix, 0) }),
  aujourdhui: () => ({ ...aujourdhui, depot: ['voir', 'acheter'] }), accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
await ctx.route('**/functions/v1/orga-bon', r => { appels.push(['orga-bon', JSON.parse(r.request().postData())]); setTimeout(() => r.fulfill({ status: 200, contentType: 'application/json', body: '{"url":"https://drive.google.com/file/d/x/view"}' }), 400) })
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async nom => { if (captures) await p.screenshot({ path: path.join(captures, nom) }) }

await p.goto(`http://localhost:${port}/#/achat-especes/EVT-T-001`); await p.waitForTimeout(1500)
if (process.env.DBG) await p.screenshot({ path: '/tmp/claude-0/-home-claude/c7e0a1b2-800d-503c-840a-ca05973e88cb/scratchpad/dbg.png' })
if (!(await p.locator('text=Achat en espèces').count())) echec('écran absent')
if (!(await p.locator('.bn-env').count())) echec('enveloppe non montrée')
await p.fill('input[placeholder="Nom du vendeur"]', 'Hassan, souk Bab Doukkala')
// ligne 1 : article du dépôt
await p.click('text=+ Ajouter une ligne'); await p.waitForTimeout(400)
await p.fill('input[placeholder="Chercher dans le dépôt"]', 'gla'); await p.waitForTimeout(200)
await photo('1-recherche.png')
await p.click('text=Glaçons sac 5 kg')
const champs = p.locator('.sheet input[inputmode=decimal], [role=dialog] input[inputmode=decimal]')
await champs.nth(0).fill('10'); await champs.nth(1).fill('15')
await p.getByRole("button", { name: "Ajouter", exact: true }).click(); await p.waitForTimeout(400)
// ligne 2 : nouvel article
await p.click('text=+ Ajouter une ligne'); await p.waitForTimeout(400)
await p.fill('input[placeholder="Chercher dans le dépôt"]', 'Menthe fraîche'); await p.click('text=+ Nouvel article'); await p.waitForTimeout(200)
await p.click('.chip:has-text("Fruits")'); await p.click('.chip:has-text("kg")')
await champs.nth(0).fill('2'); await champs.nth(1).fill('12,5')
await photo('2-ligne-nouvelle.png')
await p.getByRole("button", { name: "Ajouter", exact: true }).click(); await p.waitForTimeout(500)
await photo('3-saisie.png')
const env = await p.locator('.bn-env b').textContent()
if (!/5 000 → 4 825/.test(env.replace(/ /g, ' '))) echec(`enveloppe mal calculée : ${env}`)
await p.click('button:has-text("Faire signer le bon")'); await p.waitForTimeout(500)
if (!(await p.locator('button:has-text("Valider le bon signé")').isDisabled())) echec('validable sans signature')
const zone = await p.locator('canvas').boundingBox()
await p.mouse.move(zone.x + 20, zone.y + zone.height * .7); await p.mouse.down()
for (const [x, y] of [[.15, .3], [.25, .75], [.35, .35], [.45, .7], [.6, .4], [.72, .6], [.9, .45]]) await p.mouse.move(zone.x + zone.width * x, zone.y + zone.height * y, { steps: 6 })
await p.mouse.up(); await p.waitForTimeout(200)
await photo('4-signature.png')
await p.click('button:has-text("Valider le bon signé")'); await p.waitForTimeout(1200)
await photo('5-fait.png')
const creer = appels.find(a => a[0] === 'bon_creer')?.[1]?.p
if (!creer) echec('bon non envoyé')
else {
  if (!creer.signature?.startsWith('data:image/png;base64,')) echec('signature absente')
  if (creer.lignes[0].article_id !== 'a1' || creer.lignes[1].article_id || creer.lignes[1].nom !== 'Menthe fraîche' || creer.lignes[1].prix !== 12.5) echec(`lignes : ${JSON.stringify(creer.lignes)}`)
  if (creer.societe !== 'EPI' || creer.evenement_id !== 'EVT-T-001') echec('société ou événement')
}
if (!appels.some(a => a[0] === 'orga-bon' && a[1].id === 7)) echec('PDF non demandé')
if (!(await p.locator('text=Voir le PDF').count())) echec('lien PDF absent')
if (!(await p.locator('text=4 825 MAD restants').count()) && !(await p.locator('text=4 825 MAD restants'.replace(' ', ' ')).count())) echec('reste enveloppe absent')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'BON OK')
process.exit(ko ? 1 : 0)
