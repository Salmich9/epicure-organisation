// Parcours de l'onglet Dépôt : stock, fiche article, achat, à commander, inventaire, historique.
// Lancer : npm run build && node tests/e2e/depot.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5199, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

const C = { bar: ['c1', 'Bar & verrerie', 1], log: ['c2', 'Logistique', 2], cons: ['c3', 'Consommables', 3], deco: ['c4', 'Décoration', 4] }
const art = (id, nom, c, qte, unite, seuil, cout, nature = 'consommable') => ({ id, nom, cat_id: C[c][0], cat: C[c][1], cat_ordre: C[c][2], qte, unite, seuil, cout, dernier_prix: cout, valeur: qte * cout, nature,
  alerte: seuil != null && qte < seuil, a_commander: seuil != null && qte < seuil ? seuil - qte : 0, photo: null })
const ARTICLES = [
  art('a1', 'Verre à vin Bordeaux', 'bar', 420, 'pce', 300, 18, 'retournable'), art('a2', 'Flûte à champagne', 'bar', 180, 'pce', 250, 16, 'retournable'),
  art('a3', 'Seau à glace inox', 'bar', 24, 'pce', null, 140, 'retournable'), art('a4', 'Shaker Boston', 'bar', 12, 'pce', 10, 95, 'retournable'),
  art('a5', 'Banio', 'log', 6, 'pce', null, 20, 'retournable'), art('a6', 'Diable de manutention', 'log', 3, 'pce', null, 650, 'retournable'), art('a7', 'Glacière 50 L', 'log', 8, 'pce', 6, 380, 'retournable'),
  art('a8', 'Serviettes cocktail', 'cons', 1200, 'pce', 2000, .35), art('a9', 'Pailles papier', 'cons', 300, 'pce', 1000, .2), art('a10', 'Sirop de sucre de canne', 'cons', 14, 'L', 10, 42), art('a11', 'Citrons verts', 'cons', 3, 'kg', 8, 28),
  art('a12', 'Photophore verre', 'deco', 90, 'pce', null, 22, 'retournable'), art('a13', 'Chemin de table lin', 'deco', 30, 'pce', null, 75, 'retournable'),
]
const MVTS = [
  { id: 'm1', article: 'Verre à vin Bordeaux', type: 'prelevement', qte: -240, evt: 'Mariage Norah et François', qui: 'Ghali Benchekroun', quand: '2026-11-15T18:20:00Z' },
  { id: 'm2', article: 'Citrons verts', type: 'achat', qte: 5, fournisseur: 'Marché de gros', qui: 'Ouadia Daalaoui', quand: '2026-11-15T09:10:00Z' },
  { id: 'm3', article: 'Verre à vin Bordeaux', type: 'retour', qte: 236, evt: 'Oberoi', qui: 'Ghali Benchekroun', quand: '2026-11-14T23:40:00Z' },
  { id: 'm4', article: 'Serviettes cocktail', type: 'achat', qte: 1000, fournisseur: 'Ali', qui: 'Salmane', quand: '2026-11-13T11:00:00Z' },
  { id: 'm5', article: 'Flûte à champagne', type: 'inventaire', qte: 180, qui: 'Ouadia Daalaoui', note: 'écart −4', quand: '2026-11-10T16:00:00Z' },
  { id: 'm6', article: 'Glacière 50 L', type: 'prelevement', qte: -4, evt: 'Oberoi', qui: 'Ouadia Daalaoui', quand: '2026-11-09T15:00:00Z' },
]
let equipe = false
const RPC = {
  aujourdhui: () => ({ ...aujourdhui, depot: equipe ? ['voir', 'acheter', 'inventaire'] : ['voir', 'acheter', 'inventaire', 'gerer', 'prix'] }), accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  depot_stock: () => equipe ? { prix: false, inventaire: '2026-09-10', articles: ARTICLES.map(({ cout, valeur, dernier_prix, ...a }) => a) }
    : { prix: true, valeur: ARTICLES.reduce((t, a) => t + a.valeur, 0), inventaire: '2026-09-10', articles: ARTICLES },
  depot_article: () => ({ achats: [{ id: 'p1', qte: 300, date: '2026-09-02', prix: equipe ? null : 18, total: 5400, annule: false, fournisseur: 'Verrerie Atlas' }, { id: 'p2', qte: 120, date: '2026-06-11', prix: equipe ? null : 17.5, annule: false, fournisseur: 'Verrerie Atlas' }],
    mouvements: MVTS.filter(m => m.article === 'Verre à vin Bordeaux').concat([{ id: 'm9', type: 'achat', qte: 300, fournisseur: 'Verrerie Atlas', qui: 'Salmane', quand: '2026-09-02T10:00:00Z' }]) }),
  depot_referentiels: () => ({ fournisseurs: [{ id: 'f1', nom: 'Verrerie Atlas' }, { id: 'f2', nom: 'Marché de gros' }, { id: 'f3', nom: 'Ali' }, { id: 'f4', nom: 'Metro Marrakech' }], categories: Object.values(C).map(([id, nom]) => ({ id, nom })), unites: [{ id: 'u1', nom: 'Pièce', abr: 'pce' }, { id: 'u2', nom: 'Kilo', abr: 'kg' }, { id: 'u3', nom: 'Litre', abr: 'L' }], motifs: [] }),
  depot_achat: b => ({ purchase_id: 'pn', article_id: b.p.article_id }),
  depot_historique: b => ({ lignes: MVTS.filter(m => !b.p?.type || m.type === b.p.type).slice(0, b.p?.limite || 80) }),
  depot_inventaires: () => [{ id: 'i2', libelle: 'Inventaire novembre 2026', date: '2026-11-16', statut: 'brouillon', lignes: 5, par: 'Ouadia Daalaoui', valeur: null }, { id: 'i1', libelle: 'Inventaire (Basse)', date: '2026-09-10', statut: 'valide', lignes: 275, responsable: 'Salma', valeur: equipe ? null : 368181.74 }],
  depot_inventaire: () => ({ id: 'i2', libelle: 'Inventaire novembre 2026', date: '2026-11-16', statut: 'brouillon', comptes: { a1: 420, a2: 176, a3: 24, a4: 12, a8: 1150 } }),
  depot_inventaire_compter: () => true,
  depot_reglages: () => ({ categories: Object.values(C).map(([id, nom], i) => ({ id, nom, n: ARTICLES.filter(a => a.cat_id === id).length })),
    unites: [{ id: 'u1', nom: 'Pièce', abr: 'pce' }, { id: 'u2', nom: 'Kilo', abr: 'kg' }, { id: 'u3', nom: 'Litre', abr: 'L' }],
    fournisseurs: [{ id: 'f1', nom: 'Verrerie Atlas', tel: '0661 00 00 00', note: 'Livre le mardi' }, { id: 'f2', nom: 'Marché de gros' }, { id: 'f3', nom: 'Ali' }, { id: 'f4', nom: 'Metro Marrakech' }],
    motifs: [{ id: 'mo1', nom: 'Consommée', perte: false }, { id: 'mo2', nom: 'Casse', perte: true }, { id: 'mo3', nom: 'Oublié sur place', perte: true }, { id: 'mo4', nom: 'Vol', perte: true }],
    archives: [{ id: 'z1', nom: 'Verre Old Fashioned (ancien modèle)', cat: 'Bar & verrerie' }, { id: 'z2', nom: 'Bâche 4×6', cat: 'Logistique' }] }),
  depot_reglage_maj: () => true, depot_article_maj: () => ({ id: 'a1' }),
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
const photo = async (nom, plein) => { if (captures) await p.screenshot({ path: path.join(captures, nom), fullPage: !!plein }) }
const voir = async (route, ms = 900) => { await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }

await voir('aujourdhui', 1200)
if (!(await p.locator('.tabs button:has-text("Dépôt")').count())) echec('onglet Dépôt absent')
await p.click('.tabs button:has-text("Dépôt")'); await p.waitForTimeout(900)
if (!(await p.locator('h1:has-text("Dépôt")').count())) echec('écran Dépôt absent')
await photo('1-depot.png')
await p.locator('.dp-k > button').first().click(); await p.waitForTimeout(300)
if ((await p.locator('.row.dp-a').count()) !== ARTICLES.filter(a => a.alerte).length) echec('filtre sous le seuil')
await p.locator('.dp-k > button').first().click()
await p.click('text=Verre à vin Bordeaux'); await p.waitForTimeout(900)
await photo('2-fiche.png')
await p.click('.dp-act button:has-text("+ Achat")'); await p.waitForTimeout(400)
const ch = p.locator('input[inputmode=decimal]'); await ch.nth(0).fill('60'); await ch.nth(1).fill('18,5')
await p.click(".chip:has-text(\"Verrerie Atlas\")"); await p.waitForTimeout(200)
await photo('3-achat.png')
await p.click('button:has-text("Enregistrer")'); await p.waitForTimeout(400)
const ach = appels.find(a => a[0] === 'depot_achat')?.[1]?.p
if (!ach || ach.article_id !== 'a1' || ach.qte !== 60 || ach.prix !== 18.5 || ach.fournisseur_id !== 'f1') echec(`achat : ${JSON.stringify(ach)}`)
await voir('depot/commande'); await photo('4-commande.png')
if ((await p.locator('.dp-st').count()) !== ARTICLES.filter(a => a.a_commander > 0).length) echec('bon de commande')
await voir('depot/inventaire'); await photo('5-inventaires.png')
await voir('depot/inventaire/i2'); await photo('6-comptage.png')
if (!(await p.locator('.dp-prog').textContent()).includes('5 / 13')) echec('progression inventaire')
await voir('depot/historique'); await photo('7-historique.png')
await p.click('.chip:has-text("Sorties")'); await p.waitForTimeout(400)
if ((await p.locator('.row.dp-m').count()) !== 2) echec('filtre sorties')
// réglages (droit gérer)
await voir('depot/article/a1', 1000)
await p.click('.dp-act button:has-text("Modifier")'); await p.waitForTimeout(500)
await photo('9-article-modif.png')
await p.fill('.sheet input[inputmode=decimal], [role=dialog] input[inputmode=decimal]', '350')
await p.click('button:has-text("Enregistrer")'); await p.waitForTimeout(400)
const am = appels.find(a => a[0] === 'depot_article_maj')?.[1]
if (!am || am.p_id !== 'a1' || am.p.seuil !== 350 || am.p.unite_id !== 'u1' || am.p.cat_id !== 'c1') echec(`modif article : ${JSON.stringify(am)}`)
await voir('depot', 900)
if (!(await p.locator('.dp-ic').count())) echec('bouton réglages absent')
await p.click('.dp-ic'); await p.waitForTimeout(900)
await photo('10-reglages.png')
await p.click('.chip:has-text("Fournisseurs")'); await p.waitForTimeout(300)
await p.click('text=Verrerie Atlas'); await p.waitForTimeout(400)
await photo('11-fournisseur.png')
await p.locator('.scrim').first().click({ position: { x: 20, y: 20 } }); await p.waitForTimeout(500)
await p.click('.chip:has-text("Motifs")'); await p.waitForTimeout(300)
await photo('12-motifs.png')
equipe = true
await voir('depot', 300); await p.reload(); await p.waitForTimeout(1500); await photo('8-depot-equipe.png')
if (await p.locator('text=valeur du stock').count()) echec('valeur visible pour l\'équipe')
if (await p.locator('.dp-ic').count()) echec('réglages visibles sans le droit gérer')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'DEPOT OK')
process.exit(ko ? 1 : 0)
