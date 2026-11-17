// v78 · Timeline : le modèle dans Paramètres › Timeline, les horaires à la création, le planning généré et le décalage demandé.
// Lancer : npm run build && node tests/e2e/timeline.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { QUESTIONS, questionsListe } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5205, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const L = (cle, bloc, titre, jour, ancre, decalage_min, heure, role, quand = [], critique = false, duree_min = null, ordre = 0) => ({ cle, bloc, titre, jour, ancre, decalage_min, heure, role, quand, critique, duree_min, ordre, actif: true, type: 'autre' })
let MOD = [L('visite', 'avant', 'Visite technique du lieu', -15, 'fixe', 0, '11:00', 'coordination', [], false, 60, 10), L('tasting', 'avant', 'Tasting', -10, 'fixe', 0, '15:00', 'cuisine', ['prestations:traiteur'], true, 90, 20),
  L('commandes', 'avant', 'Commandes fournisseurs', -5, 'aucune', 0, null, 'achats', [], false, null, 40), L('brief', 'avant', 'Brief équipe', -1, 'fixe', 0, '18:00', 'coordination', [], true, 45, 80),
  L('montage', 'jourj', 'Montage', 0, 'debut', -240, null, 'coordination', [], true, 180, 130), L('ouverture_bar', 'jourj', 'Ouverture bar', 0, 'debut', -30, null, 'bar', ['prestations:bar'], true, null, 160),
  L('demontage', 'jourj', 'Démontage', 0, 'fin', 30, null, 'coordination', [], false, 90, 180), L('d_cocktail', 'deroule', 'Cocktail dînatoire', 0, 'debut', 0, null, null, ['moments:cocktail'], false, 90, 220),
  L('inventaire', 'apres', 'Inventaire retour', 1, 'fixe', 0, '11:00', 'production', [], false, 90, 310)]
const majs = []
const ev0 = donnees.evenements[0]
const PL = [{ id: 'PL-1', evenement_id: ev0.id, date: ev0.date, heure: '15:00', titre: 'Montage', qui: 'Ghali', modele: 'montage', retouche: false, critique: true, fait: false },
  { id: 'PL-2', evenement_id: ev0.id, date: ev0.date, heure: '18:30', titre: 'Ouverture bar', qui: 'Redouane', modele: 'ouverture_bar', retouche: false, critique: true, fait: false },
  { id: 'PL-3', evenement_id: ev0.id, date: ev0.date, heure: '14:00', titre: 'Livraison tentes', qui: 'Ghali', modele: null, fait: false }]
let etat = { debut: '20:00', fin: '03:00', base: { date: ev0.date, debut: '19:00', fin: '02:00' }, generees: 9, a_decaler: 7, retouchees: 1 }
const actions = []
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_params_liste: () => ({ params: [], peut_modifier: true }), chiffrage_questions_liste: () => questionsListe(),
  timeline_modele_liste: () => ({ peut_modifier: true, equipe: { coordination: 'Ghali', bar: 'Redouane' }, lignes: MOD }),
  timeline_modele_maj: b => { majs.push([b.p_cle, b.p]); if (b.p_cle) MOD = MOD.map(m => m.cle === b.p_cle ? { ...m, ...b.p } : m); return { peut_modifier: true, lignes: MOD } },
  timeline_apercu: () => ({ lignes: 22, premier: -15, dernier: 5 }),
  evenement_creer: b => ({ ...ev0, id: 'EVT-NEW', ...b.p }),
  planning_liste: () => ({ planning: PL, factures: [] }), rappels_evenement: () => ({}),
  timeline_etat: () => etat, timeline_action: b => { actions.push(b.p_action); etat = { ...etat, a_decaler: 0, base: { ...etat.base, debut: '20:00', fin: '03:00' } }; return etat },
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
const appels = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ creneaux: [] }) }))
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const erreurs = []; p.on('pageerror', e => { if (!e.message.includes('localStorage')) erreurs.push(e.message) })
const photo = async nom => { if (captures) await p.screenshot({ path: path.join(captures, nom) }) }
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }

// 1. Paramètres › Timeline : les quatre blocs
await voir('parametres')
await p.click('.chip:has-text("Timeline")'); await p.waitForTimeout(700)
for (const t of ['AVANT LE JOUR J', 'JOUR J · ÉQUIPE', 'DÉROULÉ · INVITÉS', 'APRÈS']) if (!(await p.locator(`.cf-grp:has-text("${t}")`).count())) echec(`bloc ${t} absent`)
if (!(await p.locator('.tl-l:has-text("Ouverture bar") .j:has-text("début −30 min")').count())) echec('accroche début −30 absente')
await photo('t1-parametres.png')

// 2. Modifier une ligne : intitulé, jour, accroche, décalage, rôle, condition
await p.click('.tl-l:has-text("Ouverture bar")'); await p.waitForTimeout(500)
if (!(await p.locator('.tl-ex:has-text("J · 18 h 30")').count())) echec('aperçu 19 h → 18 h 30 faux')
await p.locator('.sheet .tl-step').nth(1).locator('button').first().click(); await p.waitForTimeout(150)
if (!(await p.locator('.tl-ex:has-text("J · 18 h 15")').count())) echec('décalage −15 pas appliqué à l\'aperçu')
await p.fill('.sheet .tl-in', 'Ouverture du bar')
await photo('t2-ligne.png')
await p.click('.sheet .btn.primary'); await p.waitForTimeout(500)
const m = majs.pop()
if (!m || m[0] !== 'ouverture_bar' || m[1].titre !== 'Ouverture du bar' || m[1].decalage_min !== -45) echec(`modification : ${JSON.stringify(m)}`)
// une ligne éteinte, une nouvelle ligne
await p.click('.tl-add >> nth=0'); await p.waitForTimeout(400)
await p.fill('.sheet .tl-in', 'Appel au client'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(400)
const nv = majs.pop()
if (!nv || nv[0] !== null || nv[1].bloc !== 'avant' || nv[1].titre !== 'Appel au client') echec(`nouvelle ligne : ${JSON.stringify(nv)}`)

// 3. Création : début et fin obligatoires, aperçu de la timeline
await voir('nouveau')
if (!(await p.locator('.btn.primary:has-text("horaires")').count())) echec('horaires pas réclamés')
await p.fill('input[placeholder="Mariage Cassandra"]', 'Mariage Leïla et Karim'); await p.fill('input[type=date]', '2026-12-20'); await p.fill('input[placeholder="250"]', '180')
await p.locator('input[type=time]').nth(0).fill('19:00'); await p.locator('input[type=time]').nth(1).fill('02:00')
await p.fill('input[placeholder="Domaine, riad, villa…"]', 'Kasbah Dif'); await p.click('.tile:has-text("Premium")'); await p.waitForTimeout(600)
if (!(await p.locator('.tl-ap:has-text("22 lignes de timeline")').count())) echec('aperçu de la timeline absent')
await photo('t3-creation.png')
await p.click('.btn.primary:has-text("Chiffrer")'); await p.waitForTimeout(800)
const cr = appels.filter(a => a[0] === 'evenement_creer').pop()?.[1]?.p
if (cr?.heure_debut !== '19:00' || cr?.heure_fin !== '02:00') echec(`horaires pas envoyés : ${JSON.stringify(cr)}`)

// 4. Planning : lignes « auto », bandeau de décalage, puis Décaler
await voir('planning', 1500)
await p.click('.chip:has-text("J-30 à J+5")'); await p.waitForTimeout(400)
if (!(await p.locator('.tl-auto').count())) echec('pastille auto absente')
if (!(await p.locator('.tl-ban:has-text("Décaler 7 lignes")').count())) echec('bandeau de décalage absent')
await photo('t4-planning.png')
await p.click('.tl-ban .chip:has-text("Décaler")'); await p.waitForTimeout(800)
if (actions.pop() !== 'decaler') echec('décalage pas demandé')
if (await p.locator('.tl-ban').count()) echec('bandeau resté après décalage')

if (erreurs.length) echec(`erreurs : ${erreurs.join(' | ')}`)
await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'TIMELINE OK')
process.exit(ko ? 1 : 0)
