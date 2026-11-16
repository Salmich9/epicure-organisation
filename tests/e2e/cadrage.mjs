// v74 · Le cadrage affine : ce que le devis a dit est repris (pas reposé, corrigeable), le défaut revient pré-choisi,
// puis les questions du cadrage (Paramètres › Questions, partie organisation). Fin : les enveloppes se posent.
// Lancer : npm run build && node tests/e2e/cadrage.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { QUESTIONS } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5203, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const ORGA = [
  { cle: 'emplacement', section: 'organisation', texte: 'Où ça se passe ?', type: 'choix', choix: [{ cle: 'interieur', libelle: 'Intérieur' }, { cle: 'exterieur', libelle: 'Extérieur' }, { cle: 'les_deux', libelle: 'Les deux' }], quand: [], actif: true, ordre: 510 },
  { cle: 'sol', section: 'organisation', texte: 'Le sol côté service ?', type: 'choix', choix: [{ cle: 'dur', libelle: 'Dur' }, { cle: 'gazon', libelle: 'Gazon' }, { cle: 'sable', libelle: 'Sable ou terre' }], quand: ['emplacement:exterieur|les_deux'], actif: true, ordre: 520 },
  { cle: 'theme', section: 'organisation', texte: 'Un thème, une ambiance ?', aide: 'ex : bohème chic, blanc et or', type: 'texte', choix: [], quand: [], actif: true, ordre: 550 },
]
const QS = [...QUESTIONS.filter(q => q.cle !== 'profil' && q.type !== 'etape'), ...ORGA]
// Le devis a tout dit sauf la cuisine (au défaut) ; l'organisation reste à faire
const BASE = { invites: 200, gamme: 'Premium', zone: 'marrakech', societe: 'Epicure', prestations: ['bar', 'traiteur'], nb_bars: 2, comptoir: 'non', alcool_qui: 'nous', alcool: ['cocktails'],
  service: ['cocktails'], signatures: 4, moments: ['cocktail', 'diner_assis'], plonge: 'rien', electricite: 'ok', fourni: ['tables'] }
let affine = {}
const ev = { ...donnees.evenements[0], cadrage: null }
const D = () => ({ ...donnees, evenements: donnees.evenements.map(e => e.id === ev.id ? ev : e) })
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => D(), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  cadrage_contexte: () => ({ a_chiffrage: true, base: BASE, affine, questions: QS }),
  cadrage_maj: b => { if (b.p.affine) affine = b.p.affine; ev.cadrage = { ...(ev.cadrage || {}), ...b.p }; return ev.cadrage },
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
const erreurs = []; p.on('pageerror', e => { if (!e.message.includes('localStorage')) erreurs.push(e.message) })
const photo = async nom => { if (captures) await p.screenshot({ path: path.join(captures, nom) }) }
const voir = async (route, ms = 1000) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const texte = async () => p.locator('.cd').innerText()

// 1. Accueil : ce que le devis a dit n'est pas reposé
await voir('aujourdhui', 800); await voir('cadrage', 1200)
let t = await texte()
if (!t.includes('3 questions pour affiner')) echec(`nombre de questions faux : ${t.slice(0, 80)}`)
if (!/Repris du devis\s*1[0-9]/.test(t)) echec('repris du devis absent')
await photo('c1-accueil.png')
await p.click('.cd-rep-t'); await p.waitForTimeout(300)
t = await texte()
if (!t.includes('Combien de bars') || !t.includes('Côté plonge')) echec('lignes reprises absentes')
await photo('c2-repris.png')

// 2. Corriger une ligne reprise : la plonge
await p.click('.cd-rep-l:has-text("plonge")'); await p.waitForTimeout(400)
if (!(await p.locator('.cd-top:has-text("Correction")').count())) echec('écran de correction absent')
await p.click('.cd-opts button:has-text("Fournie")'); await p.waitForTimeout(600)
if (affine.plonge !== 'fournie') echec('correction pas enregistrée')
if (!(await p.locator('.cd-rep-l:has-text("plonge") em:has-text("corrigé")').count())) echec('correction pas marquée')
await photo('c3-corrige.png')

// 3. Affiner : la cuisine laissée au défaut revient pré-choisie
await p.click('.cd-pied .p:has-text("Affiner")'); await p.waitForTimeout(500)
t = await texte()
if (!t.includes('La cuisine sur place') || !t.includes('Proposé')) echec('défaut pas proposé')
if (!(await p.locator('.cd-opts button.on:has-text("Équipée")').count())) echec('défaut pas pré-choisi')
await photo('c4-propose.png')
await p.click('.cd-pied .p:has-text("C’est ça")'); await p.waitForTimeout(500)
if (affine.cuisine !== 'equipee') echec('proposition pas confirmée')

// 4. Les questions du cadrage : extérieur ouvre le sol
await p.click('.cd-opts button:has-text("Extérieur")'); await p.waitForTimeout(600)
t = await texte()
if (!t.includes('Le sol côté service')) echec('le sol ne suit pas l\'extérieur')
await photo('c5-sol.png')
await p.click('.cd-opts button:has-text("Gazon")'); await p.waitForTimeout(600)
await p.fill('.cd-txt', 'Bohème chic'); await photo('c6-theme.png')
await p.click('.cd-pied .p:has-text("Poser les enveloppes")'); await p.waitForTimeout(1200)
const fin = appels.filter(a => a[0] === 'cadrage_maj').pop()?.[1]?.p
if (!fin?.fait_le || fin.affine?.theme !== 'Bohème chic' || fin.affine?.sol !== 'gazon') echec(`fin du cadrage mal enregistrée : ${JSON.stringify(fin)}`)
if (appels.some(a => a[0] === 'cadrage_maj' && a[1].p.reponses)) echec('les anciennes réponses ont été touchées')
if (!(await p.locator('.cd-bt:has-text("enveloppes posées")').count())) echec('écran de fin absent')

// 5. Reprendre : un cadrage commencé reprend à la première question sans réponse
affine = { plonge: 'fournie', cuisine: 'equipee' }; ev.cadrage = { affine }
await voir('cadrage', 1200)
await p.click('.cd-pied .p:has-text("Reprendre")'); await p.waitForTimeout(500)
if (!(await texte()).includes('Où ça se passe')) echec('reprise pas à la bonne question')

if (erreurs.length) echec(`erreurs : ${erreurs.join(' | ')}`)
await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'CADRAGE OK')
process.exit(ko ? 1 : 0)
