// v67 · Enveloppes par responsable : valider le budget (responsables modifiables), mon enveloppe (reste, moments, achats, « pas à moi »),
// tableau de la direction (dérive, dépassement, pièces rangées par l'IA à vérifier), Ma part, et l'équipe ne voit que SON enveloppe.
// Lancer : npm run build && node tests/e2e/enveloppes.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5196, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const EVT = 'EVT-T-001'
let role = 'direction', valide = null
const A = (date, fournisseur, montant, extra = {}) => ({ date, fournisseur, montant, element: 'Viande', piece: Math.round(montant), ...extra })
const ENV = () => [
  { grp: 'matiere', nom: 'Cuisine · coût matière', resp: 'Salima', compte: true, prevu: 9000, engage: 9600, reel: 4700, envoye: 9000,
    detail: [{ nom: 'Cocktail', prevu: 2000, reel: 1400 }, { nom: 'Dîner', prevu: 6000, reel: 3300 }, { nom: 'Desserts', prevu: 1000, reel: 0 }],
    achats: [A('2026-11-14', 'Boucherie Atlas', 2100, { ia: true, a_verifier: true, type: 'CHEQUE' }), A('2026-11-13', 'Marché central', 1400, { source: 'bon', element: 'Cocktail' }), A('2026-11-12', 'Metro', 1200, { type: 'TICKET CB' })] },
  { grp: 'bar', nom: 'Bar', resp: 'Zaouia', compte: false, prevu: 6500, engage: 2000, reel: 2000, envoye: 6500, achats: [] },
  { grp: 'materiel', nom: 'Matériel et art de table', resp: 'Ouadia', compte: true, prevu: 12000, engage: 12450, reel: 12450, envoye: 12000, achats: [] },
  { grp: 'staff', nom: 'Staff', resp: '', compte: false, prevu: 21600, engage: 13250, reel: 13250, achats: [] },
]
const D = () => ({ ...donnees, role, admin: role === 'direction', moi: role === 'direction' ? 'Salmane' : 'Salima',
  evenements: donnees.evenements.map(e => e.id === EVT ? { ...e, code: 'TEST3110', budget_valide_le: valide } : e) })
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => D(), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  enveloppes_evt: () => ({ valide_le: valide, enveloppes: ENV(), membres: ['Amina Hadni', 'Ghali', 'Ouadia', 'Salima', 'Salmane'],
    a_verifier: [{ piece: 2100, fournisseur: 'Boucherie Atlas', montant: 2100, element: 'Viande', element_id: 'EL-4', zone: 'Menu' }] }),
  budget_valider: b => { valide = '2026-11-16T18:00:00Z'; return RPC.enveloppes_evt(b) },
  mon_enveloppe: () => ({ evenement: { id: EVT, nom: 'Mariage Test', code: 'TEST3110', entite: 'Epicure' }, enveloppes: [ENV()[0]] }),
  mes_enveloppes: () => [{ evt: EVT, evt_nom: 'Mariage Test', code: 'TEST3110', grp: 'matiere', nom: 'Cuisine · coût matière', prevu: 9000, reel: 4700 }],
  piece_verifier: () => true, piece_signaler: () => true, piece_imputer: () => ({ facture_id: 'FAC-1' }),
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
const voir = async (route, ms = 1200) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

// 1. Onglet budget de l'événement : le bouton « Valider le budget »
await voir('aujourdhui', 800); await voir('', 1500)
if (!(await p.locator('.ve-cta:has-text("Valider le budget")').count())) echec('bouton Valider le budget absent')
// 2. Valider le budget : responsable modifiable, puis envoi
await p.click('.ve-cta'); await p.waitForTimeout(900)
if (!(await p.locator('h1:has-text("Valider le budget")').count())) echec('écran Valider le budget')
if (!(await p.locator('.ve-det:has-text("Cocktail 2")').count())) echec('détail par moment absent')
if (!(await p.locator('.ve-warn').count())) echec('« pas de compte » absent pour Zaouia')
await p.locator('.pv-env:has-text("Staff") .ve-resp').click(); await p.waitForTimeout(400)
await p.locator('.sheet button:has-text("Ghali")').first().click(); await p.waitForTimeout(300)
await photo('e1-valider.png', true)
await p.click('.btn.primary:has-text("Valider")'); await p.waitForTimeout(800)
const bv = dernier('budget_valider')
if (!bv || bv.p_resp.staff !== 'Ghali' || bv.p_resp.matiere !== 'Salima') echec(`valider : ${JSON.stringify(bv?.p_resp)}`)
// 3. Tableau de la direction
if (!(await p.locator('h1:has-text("Enveloppes")').count())) echec('tableau des enveloppes après validation')
if (!(await p.locator('.ve-derive:has-text("Cuisine")').count())) echec('dérive cuisine absente')
if (!(await p.locator('.ve-sub.r:has-text("+450")').count())) echec('dépassement matériel absent')
if (!(await p.locator('.aa-l:has-text("Boucherie Atlas")').count())) echec('pièce à vérifier absente')
await photo('e4-direction.png', true)
await p.locator('.aa-l:has-text("Boucherie Atlas") .chip.on').click(); await p.waitForTimeout(400)
if (dernier('piece_verifier')?.p_id !== 2100) echec('vérifier la pièce')

// 4. Responsable (équipe) : Ma part, puis son enveloppe
role = 'equipe'; appels.length = 0
await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('orga_cache:')).forEach(k => localStorage.removeItem(k)))
await voir('mapart', 1500)
if (!(await p.locator('.pv-st:has-text("MES ENVELOPPES")').count())) echec('Mes enveloppes absent de Ma part')
await photo('e0-mapart.png')
await p.click('.pv-env:has-text("Cuisine")'); await p.waitForTimeout(900)
if (!(await p.locator('.ve-big .r:has-text("4")').count())) echec('reste absent')
if (!(await p.locator('.aa-l:has-text("Dîner")').count())) echec('détail par moment absent (équipe)')
if (!(await p.locator('.ve-ia').count())) echec('« rangé par l\'IA » absent')
if (!(await p.locator('.aa-pill:has-text("espèces")').count())) echec('mode espèces absent')
const txt = await p.locator('body').innerText()
if (/marge|prix de vente|Zaouia|Matériel et art/i.test(txt)) echec('l\'équipe voit autre chose que son enveloppe')
await photo('e2-mon-enveloppe.png', true)
await p.click('.aa-l:has-text("Metro")'); await p.waitForTimeout(500)
await p.fill('.sheet input', 'c\'est pour le bar'); await p.click('.sheet button:has-text("Ce n\'est pas à moi")'); await p.waitForTimeout(400)
const sg = dernier('piece_signaler')
if (!sg || sg.p_raison !== 'c\'est pour le bar') echec(`signaler : ${JSON.stringify(sg)}`)
if (appels.some(a => a[0] === 'enveloppes_evt')) echec('l\'équipe lit le tableau de la direction')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'ENVELOPPES OK')
process.exit(ko ? 1 : 0)
