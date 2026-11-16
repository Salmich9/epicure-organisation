// Parcours des notifications : réglages (direction), mes rappels, fiche d'une tâche ouverte depuis une notif (✓ Fait),
// fiche d'un créneau (type, durée, suppléant, rappel, critique), pastilles sur la timeline, droits de l'équipe.
// Lancer : npm run build && node tests/e2e/notifs.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5199, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const EVT = 'EVT-T-001', CODE = 'TEST3110'
const z = h => `2026-10-31T${h}:00+01:00`
let role = 'direction'
const D = () => ({ ...donnees, role, admin: role === 'direction', evenements: donnees.evenements.map(e => e.id === EVT ? { ...e, code: CODE, lieu: 'Jnan' } : e) })
const PL = [
  { id: 'PL-1', evenement_id: EVT, date: '2026-10-31', heure: '17:30', titre: 'Tasting cocktail', qui: 'Ghali', suppleant: 'Salmane', type: 'tasting', critique: false, fait: false, lieu: 'bar extérieur' },
  { id: 'PL-2', evenement_id: EVT, date: '2026-10-31', heure: '19:00', titre: 'Ouverture du bar', qui: 'Ouadia', type: 'ouverture_bar', critique: true, fait: false },
  { id: 'PL-3', evenement_id: EVT, date: '2026-10-31', heure: '09:00', titre: 'Montage', qui: 'Salima', fait: false },
  { id: 'PL-4', evenement_id: EVT, date: '2026-10-31', heure: '16:00', titre: 'Livraison glace', qui: 'Salmane', fait: true },
]
const RAPPELS = {
  'PL-1': { rappel_at: z('17:15'), quand: z('17:30'), critique: false, fait: false, dest: ['Ghali', 'Salmane'], sans_compte: [], abonnes: ['Salmane'], envoye: z('17:15'), retard: false },
  'PL-2': { rappel_at: z('18:30'), quand: z('19:00'), critique: true, fait: false, dest: ['Ouadia'], sans_compte: [], abonnes: ['Ouadia'], envoye: null, retard: false },
  'PL-3': { rappel_at: '2026-10-30T18:00:00+01:00', quand: z('09:00'), critique: false, fait: false, dest: [], sans_compte: ['Salima'], abonnes: [], envoye: null, retard: false },
}
let cfg = { actif: false, ouvert_equipe: false, testeurs: ['Salmane'], familles: { actions: true, enveloppes: true, pieces: false, jourj: true, timeline: true },
  heures: { debut: 8, fin: 22 }, delais: { defaut: 30, court: 15, types_courts: ['tasting', 'briefing'], matin_avant: '11:00', veille: '18:00' }, critiques: ['ouverture_bar', 'retour_depot'], retard_min: 15, tolerance_min: 10, max_par_passage: 3 }
const REG = () => ({ reglages: cfg, peut_modifier: role === 'direction', abonnes: [{ nom: 'Salmane', appareils: 1 }, { nom: 'Ouadia', appareils: 1 }],
  membres: ['Amina Hadni', 'Driss', 'Ghali', 'Hamza', 'Ouadia', 'Oussama', 'Salmane'],
  derniers: [{ dest: 'Salmane', titre: 'Tasting cocktail dans 15 min', statut: 'envoye', le: z('17:15') }, { dest: 'Ghali', titre: 'Tasting cocktail dans 15 min', statut: 'sans_abonnement', le: z('17:15') }] })
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => ({ ...accueil, role, admin: role === 'direction' }), donnees: () => D(), depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  notifs_reglages: b => { if (b.p) cfg = { ...cfg, ...b.p }; return REG() },
  mes_rappels: () => ({ abonnements: 1, actif: true, pour_moi: true,
    rappels: [{ id: 'PL-1', evt: EVT, titre: 'Tasting cocktail', code: CODE, quand: z('17:30'), rappel_at: z('17:15'), critique: false, suppleant: true },
      { id: 'PL-4b', evt: EVT, titre: 'Retour du stock au dépôt', code: CODE, quand: '2026-11-01T10:00:00+01:00', rappel_at: '2026-10-31T18:00:00+01:00', critique: true, suppleant: false }],
    envoyes: [{ titre: 'Montage bar dans 30 min', le: z('08:30'), statut: 'envoye' }] }),
  rappels_evenement: () => RAPPELS,
  planning_liste: () => ({ evenement: { nom: 'Mariage Test', code: CODE, entite: 'Epicure', lieu: 'Jnan', date: '2026-10-31' }, planning: PL, factures: [] }),
  planning_enregistrer: b => ({ id: b.p_id || 'PL-9', ...b.p }),
}
let ko = 0
const echec = m => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: captures ? 2 : 1 })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001'); localStorage.setItem('orga_seuil', new Date().toLocaleDateString('sv')) })
const appels = [], fonctions = []
await ctx.route('**/rest/v1/rpc/**', r => { const fn = r.request().url().split('/rpc/')[1]; const body = JSON.parse(r.request().postData() || '{}'); appels.push([fn, body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx.route('**/functions/v1/**', r => { const body = JSON.parse(r.request().postData() || '{}'); fonctions.push([r.request().url().split('/v1/')[1], body])
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.action === 'test' ? { ok: true, appareils: 1 } : body.action === 'verifier' ? { actif: true, nouvelles: 2, envoyees: 2 } : {}) }) })
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 900) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

// 1. Accueil : la tuile Notifications (direction)
await voir('accueil', 1200)
if (!(await p.locator('.ac-staff:has-text("Notifications")').count())) echec('tuile Notifications absente')

// 2. Réglages
await voir('notifs', 1200)
if (!(await p.locator('h1:has-text("Notifications")').count())) echec('écran Réglages absent')
await photo('n1-reglages.png', true)
await p.click('.toggle:has-text("Notifications")'); await p.waitForTimeout(300)
if (dernier('notifs_reglages')?.p?.actif !== true) echec(`interrupteur : ${JSON.stringify(dernier('notifs_reglages'))}`)
await p.click('.toggle:has-text("Enveloppes")'); await p.waitForTimeout(300)
const fam = dernier('notifs_reglages')?.p?.familles
if (!fam || fam.enveloppes !== false || fam.timeline !== true) echec(`famille : ${JSON.stringify(fam)}`)
await p.click('button:has-text("Envoyer un test à moi")'); await p.waitForTimeout(400)
if (!fonctions.find(f => f[0] === 'orga-notifs' && f[1].action === 'test')) echec('test pas envoyé')
if (!(await p.locator('text=Envoyée sur 1 appareil').count())) echec('réponse du test pas affichée')
await p.locator('text=Envoyée sur 1 appareil').click().catch(() => {}); await p.waitForTimeout(300)

// 3. Mes rappels
await voir('mes-rappels', 1000)
if ((await p.locator('.cf-l:has-text("Tasting cocktail")').count()) < 1) echec('mes rappels : liste')
if (!(await p.locator('.cf-l:has-text("suppléant")').count())) echec('mes rappels : suppléant')
await photo('n2-mes-rappels.png', true)

// 4. Fiche d'une tâche (toucher la notif) : ✓ Fait
await voir(`tache/${EVT}/PL-1`, 1000)
if (!(await p.locator(`.el-kicker:has-text("${CODE}")`).count())) echec('code de l\'événement absent de la fiche')
await photo('n3-tache.png')
await p.click('button:has-text("✓ Fait")'); await p.waitForTimeout(400)
const f = dernier('planning_enregistrer')
if (!f || f.p_id !== 'PL-1' || f.p.fait !== true) echec(`fait : ${JSON.stringify(f)}`)
if (!(await p.locator('.nt-fait').count())) echec('tâche pas affichée faite')

// Ma part : la cloche mène à Mes rappels
await voir('mapart', 1200)
if (!(await p.locator('.nt-cl').count())) echec('cloche absente de Ma part')
await photo('n0-mapart.png')

// 5. Planning : pastilles et fiche d'un créneau
await voir('planning', 1500)
if (!(await p.locator('.nt-b:has-text("parti")').count())) echec('pastille « parti »')
if (!(await p.locator('.nt-b:has-text("pas de compte")').count())) echec('pastille « pas de compte »')
if (!(await p.locator('.nt-crit').count())) echec('repère critique')
await p.waitForTimeout(2500)
await photo('n4-timeline.png', true)
await p.click('.slot .x:has-text("Tasting cocktail")'); await p.waitForTimeout(600)
if (!(await p.locator(`.sheet .el-kicker:has-text("${CODE}")`).count())) echec('code dans la fiche du créneau')
if (!(await p.locator('.sheet .chip.on:has-text("Auto · 15 min avant")').count())) echec('rappel auto 15 min pour un tasting')
await p.click('.sheet .chip:has-text("1 h 30")')
await p.click('.sheet .chip:has-text("La veille 18 h")')
await p.click('.sheet .toggle:has-text("Tâche critique")'); await p.waitForTimeout(500)
await photo('n5-creneau.png')
await p.click('.sheet button:has-text("Enregistrer")'); await p.waitForTimeout(500)
const e = dernier('planning_enregistrer')
if (!e || e.p_id !== 'PL-1' || e.p.type !== 'tasting' || e.p.duree_min !== 90 || e.p.rappel_mode !== 'veille' || e.p.critique !== true || e.p.suppleant !== 'Salmane') echec(`créneau : ${JSON.stringify(e)}`)

// 6. Équipe : pas de réglages, pas de pastilles direction, jamais de prix dans ces écrans
role = 'equipe'
appels.length = 0
await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('orga_cache:')).forEach(k => localStorage.removeItem(k)))   // la copie gardée était celle de la direction
await voir('planning', 1500); await p.reload(); await p.waitForTimeout(1500)
if (appels.some(a => a[0] === 'rappels_evenement')) echec('l\'équipe lit les rappels de tous')
await voir('notifs', 1000)
await p.click('.toggle:has-text("Notifications")').catch(() => {}); await p.waitForTimeout(300)
if (appels.some(a => a[0] === 'notifs_reglages' && a[1].p)) echec('l\'équipe change les réglages')
await voir('mes-rappels', 1000)
if (/\bMAD\b|prix|marge/i.test(await p.locator('body').innerText())) echec('un montant apparaît dans Mes rappels')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'NOTIFS OK')
process.exit(ko ? 1 : 0)
