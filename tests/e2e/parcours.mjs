// Test de non-régression des écrans : chaque route s'affiche sans plantage, et les parcours clés marchent.
// Lancer : npm run build && npm run test:e2e   (Playwright + Chromium, données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5197
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const appels = []
const RPC = {
  donnees: () => donnees, aujourdhui: () => aujourdhui, accueil: () => accueil,
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }),
  catalogue_liste: () => [{ id: 'CAT-1', element: 'Chafing dish', zone: 'Cuisine traiteur', prix_location: 120 }],
  staff_liste: () => [], staff_evt_liste: () => ({ postes: [], affectes: [] }), planning_liste: () => ({ planning: [] }),
  bilan_liste: () => ({ lecons: [], encaissements: [], enveloppes: [], pieces_a_imputer: [] }), especes_liste: () => ({ mouvements: [], porteurs: [], encaissements: [], soldes: [] }),
  equipe_liste: () => ({ equipe: donnees.equipe_evt, defaut: donnees.equipe_evt, compte: {} }), chiffrage_contexte: () => ({ catalogue: [], references: [], chiffrage: null }),
  action_enregistrer: b => ({ id: 'ACT-NEW', ...b.p }),
  connexion: b => (b.p_pin === '111111' ? { token: '00000000-0000-0000-0000-000000000000', nom: 'Salmane' } : { erreur: b.p_pin === '999999' ? 'compte_bloque' : 'code_incorrect' }),
  deconnexion: () => true, objet_supprimer: () => 77, objet_restaurer: () => true, objet_dupliquer: () => 'EL-9', ligne_deplacer: () => ({}), session_voix: () => '11111111-1111-1111-1111-111111111111', session_voix_fin: () => true,
}
const ROUTES = [
  ['aujourdhui', "Aujourd'hui"], ['mapart', 'Ma part'], ['accueil', 'Mariage Test'], ['', 'Mariage Test'],
  ['poste/materiel', 'Matériel et équipement'], ['poste/diner', 'Dîner'], ['cadrage', ''], ['menu', 'Menu'], ['equipe', ''],
  ['revue', ''], ['biblio', ''], ['staff', 'Staff'], ['notes', ''], ['planning', ''], ['bilan', ''], ['especes', ''], ['pieces', ''], ['nouveau', ''], ['chiffrer', ''], ['devis', ''], ['voix', 'Démarrer'],
]
let ko = 0
const echec = (m) => { ko++; console.log('  ✗', m) }
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addInitScript(() => { localStorage.setItem('orga_token', '00000000-0000-0000-0000-000000000000'); localStorage.setItem('orga_evt', 'EVT-T-001') })
await ctx.route('**/rest/v1/rpc/**', async route => {
  const fn = route.request().url().split('/rpc/')[1]; const body = JSON.parse(route.request().postData() || '{}'); appels.push([fn, body])
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) })
})
await ctx.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"bulles":[],"questions":[]}' }))
const dictees = []
await ctx.route('**/functions/v1/orga-dicter', r => { const c = JSON.parse(r.request().postData()); dictees.push(c)
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c.cible?.type === 'action' ? { quoi: c.cible.a.quoi, quand: '2026-10-30', qui: 'Amina' } : { quoi: 'Commander le pain', cout: 1500, qui: 'Salima', quand: '2026-10-29', poste: 'diner' }) }) })
await ctx.addInitScript(() => { window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => this.onresult?.({ results: [[{ transcript: window.__dit || 'test' }]] }), 100) } stop() { setTimeout(() => this.onend?.(), 30) } } })
await ctx.route(u => !u.href.startsWith(`http://localhost:${port}`) && !u.href.includes('/rest/v1/') && !u.href.includes('/functions/v1/'), r => r.abort())
const p = await ctx.newPage()
let erreurs = []
p.on('pageerror', e => erreurs.push(e.message))

console.log('Écrans')
for (const [r, attendu] of ROUTES) {
  erreurs = []
  await p.goto(`http://localhost:${port}/#/${r}`); await p.waitForTimeout(600)
  const txt = await p.evaluate(() => document.body.innerText)
  if (erreurs.length) echec(`#/${r} plante : ${erreurs[0].slice(0, 120)}`)
  else if (txt.trim().length < 20) echec(`#/${r} écran vide`)
  else if (attendu && !txt.includes(attendu)) echec(`#/${r} ne montre pas « ${attendu} »`)
  else console.log('  ✓', `#/${r}`)
}

console.log('Parcours')
// 0. Rafraîchir la page de l'événement garde l'événement
await p.goto(`http://localhost:${port}/#/accueil`); await p.waitForTimeout(400); await p.getByText('Mariage Test').first().click(); await p.waitForTimeout(500)
await p.reload(); await p.waitForTimeout(700)
if (!(await p.locator('.pv-cpt').count())) echec('rafraîchir la page de l\'événement la quitte'); else console.log('  ✓ rafraîchir garde la page de l\'événement')
// 0 bis. Le bouton du cadrage reste dans l'écran
await p.goto(`http://localhost:${port}/#/cadrage`); await p.waitForTimeout(500)
const bb = await p.locator('.cd-pied').boundingBox()
if (!bb || bb.x + bb.width > 390) echec(`bouton du cadrage hors de l'écran (${bb && bb.x + bb.width})`); else console.log('  ✓ bouton du cadrage dans l\'écran')
// 1. Une action sans coût est refusée, avec coût elle part avec les bons champs
await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500)
await p.getByText('+ Action').click(); await p.waitForTimeout(400)
await p.locator('.sheet input').first().fill('Récupérer les chafing')
appels.length = 0
const bouton = p.locator('.sheet .foot button')
if (!(await bouton.isDisabled()) || !(await bouton.innerText()).includes('Il manque : coût')) echec('action sans coût : bouton actif ou sans explication')
else console.log('  ✓ action sans coût : bouton grisé « Il manque : coût »')
await p.locator('.sheet input').nth(1).fill('600')
await p.locator('.sheet .foot button').click(); await p.waitForTimeout(400)
const env = appels.find(a => a[0] === 'action_enregistrer')
if (!env) echec('action avec coût non envoyée')
else if (env[1].p.cout !== 600 || env[1].p.poste !== 'materiel' || !env[1].p.qui || !env[1].p.quand) echec(`action mal remplie : ${JSON.stringify(env[1].p)}`)
else console.log('  ✓ action enregistrée (coût, enveloppe, qui, quand)')
// 2. Le compteur de l'événement additionne les enveloppes
await p.goto(`http://localhost:${port}/#/`); await p.waitForTimeout(600)
const cpt = (await p.locator('.pv-cpt').first().innerText()).replace(/\s/g, '')
const prevu = donnees.postes.reduce((s, x) => s + x.prevu, 0)
if (!cpt.includes(`${Math.round(prevu / 1000)}k`) && !cpt.includes(`${(prevu / 1000).toFixed(1).replace('.', ',')}k`)) echec(`compteur prévu faux : ${cpt}`); else console.log('  ✓ compteur prévu = somme des enveloppes')
// 3. Cocher une action sur Aujourd'hui l'envoie au serveur
await p.goto(`http://localhost:${port}/#/aujourdhui`); await p.waitForTimeout(500); appels.length = 0
await p.locator('.au-ac .pv-ck').first().click(); await p.waitForTimeout(300)
if (!appels.some(a => a[0] === 'action_enregistrer' && a[1].p.fait === true)) echec('cocher une action ne l\'enregistre pas'); else console.log('  ✓ cocher une action l\'enregistre')
// 3 bis. Aujourd'hui : ⋯ repousser à demain et confier à quelqu'un, avec Annuler
await p.goto(`http://localhost:${port}/#/aujourdhui`); await p.waitForTimeout(500); appels.length = 0
await p.locator('.au-ac .pv-3').first().click(); await p.waitForTimeout(400)
await p.locator('.sheet .chip', { hasText: 'Demain' }).click(); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'action_enregistrer' && a[1].p.quand === '2026-10-29') || !(await p.getByRole('button', { name: 'Annuler' }).count())) echec('repousser à demain depuis Aujourd\'hui'); else console.log('  ✓ repousser à demain depuis Aujourd\'hui, avec Annuler')
appels.length = 0
await p.locator('.au-ac .pv-3').first().click(); await p.waitForTimeout(400)
await p.locator('.sheet .am-q', { hasText: 'Amina' }).click(); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'action_enregistrer' && a[1].p.qui === 'Amina')) echec('confier une action'); else console.log('  ✓ confier une action à quelqu\'un')
// 3 ter. Micro unique : l'étiquette suit l'écran ; parler à une action touchée l'applique
await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500)
if (!(await p.locator('.mi-pill', { hasText: 'Matériel et équipement' }).count())) echec('le micro ne vise pas l\'enveloppe'); else console.log('  ✓ le micro vise l\'enveloppe affichée')
await p.locator('.tabs .mic').click(); await p.waitForTimeout(300); await p.locator('.tabs .mic').click(); await p.waitForTimeout(700)
if (await p.locator('.sheet input').first().inputValue() !== 'Commander le pain') echec('dicter sur une enveloppe ne remplit pas la fiche'); else console.log('  ✓ dicter sur une enveloppe remplit la fiche action')
await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/aujourdhui`); await p.waitForTimeout(500); appels.length = 0
await p.locator('.au-ac .pv-3').first().click(); await p.waitForTimeout(300)
await p.locator('.sheet .mi-b').click(); await p.waitForTimeout(300); await p.locator('.sheet .mi-b').click(); await p.waitForTimeout(700)
if (dictees.at(-1)?.cible?.type !== 'action' || !appels.some(a => a[0] === 'action_enregistrer' && a[1].p.qui === 'Amina' && a[1].p.quand === '2026-10-30')) echec('parler à une action touchée'); else console.log('  ✓ parler à une action touchée l\'applique')
// 4. Carte BB / Epicure proposée seulement pour un événement en espèces
await p.evaluate(() => localStorage.setItem('orga_evt', 'EVT-T-001'))
await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500)
await p.getByText('+ Action').click(); await p.waitForTimeout(300); await p.getByRole('button', { name: 'Carte', exact: true }).click()
if (await p.getByText('Carte Business Boys').count()) echec('choix de carte proposé hors événement espèces'); else console.log('  ✓ pas de choix de carte hors espèces')

// 4 ter. « + Ligne » : chercher dans la bibliothèque, l'article remplit mode et prix
await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500); appels.length = 0
await p.getByText('+ Ligne').click(); await p.waitForTimeout(400); await p.keyboard.type('chafing'); await p.waitForTimeout(300)
await p.locator('.ls-r button', { hasText: 'Chafing dish' }).click(); await p.waitForTimeout(300)
await p.locator('.sheet input[inputmode=decimal]').first().fill('4'); await p.getByRole('button', { name: /^Ajouter/ }).click(); await p.waitForTimeout(400)
const la = appels.find(a => a[0] === 'ligne_ajouter')
if (!la || la[1].p.catalogue_id !== 'CAT-1' || la[1].p.mode !== 'louer' || Number(la[1].p.prix) !== 120 || la[1].p.qte !== '4') echec('+ Ligne depuis la bibliothèque'); else console.log('  ✓ + Ligne : recherche bibliothèque, mode et prix repris')
// 4 quater. Page événement : Budget par défaut, l'argent client dans l'onglet Client
await p.evaluate(() => localStorage.removeItem('orga_onglet')); await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/`); await p.waitForTimeout(600)
const avant = await p.getByText('prix signé HT').count()
await p.getByRole('button', { name: 'Client', exact: true }).click(); await p.waitForTimeout(400)
if (avant || !(await p.getByText('prix signé HT').count())) echec('onglets Budget / Client'); else console.log('  ✓ Budget d\'abord, argent client dans l\'onglet Client')
await p.getByRole('button', { name: 'Budget', exact: true }).click()

// 4 bis. En-tête de l'événement : corriger sur place, menu ⋯
await p.goto(`http://localhost:${port}/#/accueil`); await p.waitForTimeout(400); await p.getByText('Mariage Test').first().click(); await p.waitForTimeout(500)
appels.length = 0
await p.locator('h1 .ep').click(); await p.locator('h1 .ep-in').fill('Mariage Test renommé'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'evenement_maj' && a[1].p.nom === 'Mariage Test renommé')) echec('renommer sur place ne part pas'); else console.log('  ✓ nom corrigé sur place')
appels.length = 0
await p.getByRole('button', { name: '200 invités' }).click(); await p.locator('.ee-meta .ep-in').fill('230'); await p.keyboard.press('Enter'); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'maj_invites' && a[1].p_n === 230)) echec('invités corrigés sur place : pas envoyé'); else console.log('  ✓ invités corrigés sur place')
appels.length = 0
await p.getByText('+ lieu').click(); await p.locator('.ee-meta .ep-in').fill('Villa Test'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
if (appels.some(a => a[0] === 'evenement_maj')) echec('Échap a enregistré'); else console.log('  ✓ Échap annule la saisie')
await p.getByRole('button', { name: "Plus d'actions" }).click(); await p.waitForTimeout(400)
if (!(await p.getByText('Supprimer l\'événement').count())) echec('menu ⋯ sans Supprimer'); else console.log('  ✓ menu ⋯ : chiffrage, Drive, supprimer')

// 4 ter. Menu ⋯ : déplacer une ligne, supprimer une action puis Annuler, dupliquer
await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500); appels.length = 0
await p.locator('.pv-ln .pv-3').first().click(); await p.waitForTimeout(300); await p.getByText('Déplacer vers…').click(); await p.waitForTimeout(300)
await p.locator('.sheet .ee-menu button', { hasText: 'Consommables' }).click(); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'ligne_deplacer' && a[1].p_poste === 'consommables')) echec('déplacer une ligne : pas envoyé'); else console.log('  ✓ ⋯ → déplacer une ligne vers une autre enveloppe')
await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/poste/materiel`); await p.waitForTimeout(500); appels.length = 0
await p.locator('.pv-sa .pv-3').first().click(); await p.waitForTimeout(300); await p.locator('.sheet .danger').click(); await p.waitForTimeout(500)
if (!appels.some(a => a[0] === 'objet_supprimer' && a[1].p_type === 'action')) echec('supprimer une action : pas envoyé')
else { await p.getByRole('button', { name: 'Annuler' }).click(); await p.waitForTimeout(400); if (!appels.some(a => a[0] === 'objet_restaurer' && a[1].p_corbeille === 77)) echec('Annuler ne restaure pas'); else console.log('  ✓ supprimer puis Annuler restaure') }
appels.length = 0
await p.locator('.pv-ln .pv-3').first().click(); await p.waitForTimeout(300); await p.getByText('Dupliquer').click(); await p.waitForTimeout(400)
if (!appels.some(a => a[0] === 'objet_dupliquer' && a[1].p_type === 'element')) echec('dupliquer : pas envoyé'); else console.log('  ✓ dupliquer une ligne')

// 5. Connexion : mauvais code refusé, compte bloqué annoncé, bon code accepté
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } })
await ctx2.route('**/rest/v1/rpc/**', async route => { const fn = route.request().url().split('/rpc/')[1]; const body = JSON.parse(route.request().postData() || '{}'); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn] ? RPC[fn](body) : true) }) })
await ctx2.route('**/functions/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
const q = await ctx2.newPage()
const taper = async code => { for (const c of code) await q.locator('.pad button', { hasText: new RegExp(`^${c}$`) }).click(); await q.waitForTimeout(400) }
await q.goto(`http://localhost:${port}/`); await q.waitForTimeout(400); await q.getByText('Salmane').click()
await taper('123456')
if (!(await q.getByText('Code incorrect.').count())) echec('mauvais code : pas de message'); else console.log('  ✓ mauvais code refusé')
await taper('999999')
if (!(await q.getByText(/réessaie dans 15 minutes/).count())) echec('compte bloqué : pas de message'); else console.log('  ✓ blocage annoncé')
await taper('111111'); await q.waitForTimeout(600)
if (!(await q.evaluate(() => localStorage.getItem('orga_token')))) echec('bon code : pas connecté'); else console.log('  ✓ bon code accepté')

await b.close(); srv.close()
console.log(ko ? `\n${ko} échec(s)` : '\nTout passe')
process.exit(ko ? 1 : 0)
