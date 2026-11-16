// v68 · Espèces de l'événement : Paramètres › Espèces, lancer (montants ajustés), Amina choisit le fournisseur, Salmane valide,
// réception avec écart, remise à chacun, confirmation dans Ma part, bon « payé par » la caisse.
// Lancer : npm run build && node tests/e2e/especes.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5197, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const EVT = 'EVT-T-001'
let role = 'direction'
let reglages = { categories: ['staff', 'commissions', 'repas_transport', 'petits_achats'], fournisseurs: [{ nom: 'Fournisseur A', taux: 5 }, { nom: 'Fournisseur B', taux: 6 }], taux: 5, responsable: 'Amina Hadni' }
const PROP = [{ cat: 'staff', nom: 'Staff (extras)', montant: 21600, dest: 'Ghali' }, { cat: 'commissions', nom: 'Commissions', montant: 9000, dest: 'Salmane', note: 'apporteur 5 %, opérateurs 5 %' },
  { cat: 'repas_transport', nom: 'Repas et transport du staff', montant: 3200, dest: 'Ghali' }, { cat: 'petits_achats', nom: 'Petits achats', montant: 1500, dest: 'Salima' }]
const MEMBRES = ['Amina Hadni', 'Ghali', 'Hamza', 'Salima', 'Salmane']
let relais = []
const besoin = l => l.reduce((s, x) => s + x.montant, 0)
const EV = { id: EVT, nom: 'Mariage Test', code: 'TEST3110', entite: 'Epicure' }
const vueEvt = () => ({ reglages, proposition: PROP, relais: [...relais].reverse(), evenement: EV, membres: MEMBRES, peut_valider: role === 'direction' })
const r0 = () => relais[relais.length - 1]
const reste = () => n(r0().recu) - r0().remises.filter(m => m.statut !== 'refuse').reduce((s, m) => s + m.montant, 0)
const n = v => Number(v || 0)
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, depot_liste: () => [],
  donnees: () => ({ ...donnees, role, admin: role === 'direction', moi: role === 'direction' ? 'Salmane' : 'Amina Hadni', evenements: donnees.evenements.map(e => e.id === EVT ? { ...e, code: 'TEST3110' } : e) }),
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }), mes_enveloppes: () => [],
  chiffrage_params: () => ({ peut_modifier: true, params: [] }),
  especes_reglages: b => { if (b.p) reglages = { ...reglages, ...b.p }; return { reglages, peut_modifier: true, membres: MEMBRES } },
  especes_evt: () => vueEvt(),
  especes_lancer: b => { const bb = besoin(b.p_lignes); relais.push({ id: 7, statut: 'a_preparer', lignes: b.p_lignes, besoin: bb, taux: 5, commission: Math.round(bb * .05), virement: bb + Math.round(bb * .05), responsable: 'Amina Hadni', demande_par: 'Salmane', demande_le: '2026-11-16T10:00:00Z', remises: [] }); return vueEvt() },
  especes_relais_voir: () => ({ ...r0(), reste: r0().recu ? reste() : 0, evenement: EV, fournisseurs: reglages.fournisseurs, membres: MEMBRES }),
  especes_preparer: b => { const f = reglages.fournisseurs.find(x => x.nom === b.p_fournisseur); Object.assign(r0(), { fournisseur: f.nom, taux: f.taux, commission: Math.round(r0().besoin * f.taux / 100), virement: r0().besoin + Math.round(r0().besoin * f.taux / 100), statut: 'a_valider' }); return vueEvt() },
  especes_valider: b => { Object.assign(r0(), b.p_ok ? { statut: 'valide', valide_par: 'Salmane', valide_le: '2026-11-16T12:00:00Z' } : { statut: 'refuse', raison: b.p_raison }); return vueEvt() },
  especes_recu: b => { Object.assign(r0(), { statut: 'recu', recu: b.p_montant, recu_le: '2026-11-17T09:00:00Z', ecart: r0().besoin - b.p_montant, ecart_regle: false }); return vueEvt() },
  especes_remettre: b => { r0().remises.push({ id: 100 + r0().remises.length, dest: b.p_dest, montant: b.p_montant, statut: 'a_confirmer' }); return vueEvt() },
  especes_ecart_regler: () => { r0().ecart_regle = true; return vueEvt() },
  mes_especes: () => ({ taches: [], a_confirmer: [{ id: 100, montant: 24800, par: 'Amina Hadni', evt: 'Mariage Test', code: 'TEST3110' }] }),
  especes_confirmer: () => true,
  bon_contexte: b => ({ moi: 'Salmane', enveloppe: b.p_evt ? 4000 : null, evenements: [{ id: EVT, nom: 'Mariage Test', date: '2026-11-20', entite: 'Epicure' }] }),
  depot_referentiels: () => ({ categories: [], unites: [] }),
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
const vider = () => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('orga_cache:')).forEach(k => localStorage.removeItem(k)))

// 1. Paramètres › Espèces
await voir('aujourdhui', 800); await voir('parametres', 1200)
await p.click('.chip:has-text("Espèces")'); await p.waitForTimeout(600)
if (!(await p.locator('.aa-l:has-text("Fournisseur B") .es-taux:has-text("6")').count())) echec('fournisseurs relais absents')
await photo('s1-parametres.png', true)
await p.click('.chip:has-text("Petits achats")'); await p.waitForTimeout(300)
if (dernier('especes_reglages')?.p?.categories?.includes('petits_achats')) echec('catégorie pas retirée')
await p.click('.chip:has-text("Petits achats")'); await p.waitForTimeout(300)

// 2. Budget de l'événement → Espèces : ajuster, lancer
await voir('', 1500)
if (!(await p.locator('.ve-cta:has-text("Espèces de l\'événement")').count())) echec('bouton Espèces absent')
await p.click('.ve-cta:has-text("Espèces")'); await p.waitForTimeout(900)
if (!(await p.locator('.aa-l:has-text("Virement à faire") .v:has-text("37")').count())) echec('virement 37 065 absent')
await p.click('.aa-l:has-text("Petits achats")'); await p.waitForTimeout(400)
await p.fill('.sheet .cf-in input', '1000'); await p.click('.sheet .btn.primary'); await p.waitForTimeout(300)
await photo('s2-lancer.png', true)
await p.click('.btn.primary:has-text("Lancer chez Amina")'); await p.waitForTimeout(700)
const la = dernier('especes_lancer')
if (!la || besoin(la.p_lignes) !== 34800) echec(`lancer : ${la && besoin(la.p_lignes)}`)

// 3. Amina choisit le fournisseur
role = 'equipe'; await vider()
await voir('especes-relais/7', 1200)
await p.click('.aa-l:has-text("Fournisseur A")'); await p.click('.btn.primary:has-text("Envoyer")'); await p.waitForTimeout(600)
if (dernier('especes_preparer')?.p_fournisseur !== 'Fournisseur A') echec('préparer')
// 4. Salmane valide
role = 'direction'; await vider()
await voir(`especes-evt/${EVT}`, 1200)
await photo('s3-valider.png', true)
await p.click('.btn.primary:has-text("Valider le virement")'); await p.waitForTimeout(600)
if (dernier('especes_valider')?.p_ok !== true) echec('valider')
// 5. Amina reçoit 34 300 : écart de 500
role = 'equipe'; await vider()
await voir('especes-relais/7', 1200)
await p.fill('.es-gros', '34300'); await p.waitForTimeout(300)
if (!(await p.locator('.es-alerte:has-text("Il manque 500")').count())) echec('écart pas annoncé')
await photo('s4-recu.png', true)
await p.click('.btn.primary:has-text("Confirmer la réception")'); await p.waitForTimeout(800)
if (dernier('especes_recu')?.p_montant !== 34300) echec('reçu')
// 6. Remettre à Ghali
await p.click('.aa-l:has-text("Ghali") .es-mini'); await p.waitForTimeout(400)
await p.click('.sheet .btn.primary'); await p.waitForTimeout(800)
const rm = dernier('especes_remettre')
if (!rm || rm.p_dest !== 'Ghali' || rm.p_montant !== 24800) echec(`remettre : ${JSON.stringify(rm)}`)
await photo('s5-remettre.png', true)
// 7. Salmane voit l'écart, le règle
role = 'direction'; await vider()
await voir(`especes-evt/${EVT}`, 1200)
if (!(await p.locator('.es-alerte:has-text("Il manque 500")').count())) echec('écart pas visible chez Salmane')
await p.click('.es-alerte .chip'); await p.waitForTimeout(500)
if (!appels.some(a => a[0] === 'especes_ecart_regler')) echec('écart réglé')
// 8. Ghali confirme dans Ma part
await voir('mapart', 1500)
if (!(await p.locator('.pv-st:has-text("ESPÈCES À CONFIRMER")').count())) echec('à confirmer absent de Ma part')
await photo('s6-mapart.png')
await p.click('.chip:has-text("J\'ai reçu")'); await p.waitForTimeout(400)
if (dernier('especes_confirmer')?.p_ok !== true) echec('confirmer')
// 9. Bon payé par la caisse
await voir(`achat-especes/${EVT}`, 1200)
if (!(await p.locator('.chip:has-text("Enveloppe de l\'événement")').count())) echec('Payé par absent')
await p.click('.chip:has-text("Caisse Business Boys")'); await p.waitForTimeout(300)
await photo('s7-bon.png')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'ESPECES OK')
process.exit(ko ? 1 : 0)
