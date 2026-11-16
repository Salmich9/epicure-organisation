// v72 · Paramètres › Questions : liste (Express, conditions), modifier une question, en créer une (« Un DJ ? »),
// créer le poste qui va avec (« DJ », compté quand DJ → Oui), « Compté quand » d'un poste, conditions du devis.
// Lancer : npm run build && node tests/e2e/questions.mjs [dossier-captures]   (données fictives, aucune requête réseau réelle)
import { createRequire } from 'node:module'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { accueil, aujourdhui, donnees } from './fixture.mjs'
import { CONDITIONS, QUESTIONS } from './questions.fixture.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')

const dist = path.resolve('dist'), port = 5202, captures = process.argv[2]
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/' || !fs.existsSync(path.join(dist, p))) p = '/index.html'; const f = path.join(dist, p); r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)) }).listen(port)

let qs = JSON.parse(JSON.stringify(QUESTIONS)), conds = [...CONDITIONS]
let params = [{ cle: 'x_kit_plonge', section: 'materiel', groupe: 'Cuisine', libelle: 'Kit plonge', calcul: 'fixe', valeur: 0, unite: 'MAD', ratio: 1, ratio_unite: 'forfait', si: 'plonge:rien', actif: true, a_regler: true, histo: [] },
  { cle: 's_bartender', section: 'staff', groupe: 'Bar', libelle: 'Bartender', calcul: 'un_pour', valeur: 600, unite: 'MAD / jour', ratio: 50, ratio_unite: 'invités', si: 'bar', min_par_bar: 2, actif: true, histo: [] }]
const liste = () => ({ peut_modifier: true, questions: qs, conditions: conds, devis: { conditions: 'Avance de 50 % à la signature.', validite: 15 } })
const RPC = {
  aujourdhui: () => aujourdhui, accueil: () => accueil, donnees: () => donnees, depot_liste: () => [],
  bulles_liste: () => ({ jour: donnees.aujourdhui, aujourdhui: donnees.aujourdhui, bulles: [] }), pour_toi: () => ({ non_vus: 0, items: [] }),
  chiffrage_questions_liste: liste, chiffrage_params: () => ({ peut_modifier: true, params }),
  chiffrage_question_maj: b => {
    if (!b.p_cle) { const q = { cle: 'q_dj', section: b.p.section, texte: b.p.texte, type: b.p.type, choix: b.p.choix, defaut: b.p.defaut, quand: b.p.quand, express: b.p.express, actif: true, ordre: 95, systeme: false }; qs.push(q); conds.push({ cle: 'q_dj:oui', libelle: 'Il y a un DJ → Oui' }, { cle: 'q_dj:non', libelle: 'Il y a un DJ → Non' }) }
    else qs = qs.map(q => q.cle === b.p_cle ? { ...q, ...b.p } : q)
    return liste()
  },
  chiffrage_poste_creer: b => { params = [...params, { cle: 'u_dj', section: b.p.section, groupe: 'Ajoutés', libelle: b.p.libelle, calcul: b.p.calcul, valeur: b.p.valeur, unite: 'MAD', ratio: 1, si: b.p.si, actif: true, a_regler: true, histo: [] }]; return { peut_modifier: true, params } },
  chiffrage_param_maj: () => ({ peut_modifier: true, params }), chiffrage_poste_regler: b => { params = params.map(p => p.cle === b.p_cle ? { ...p, ...b.p } : p); return { peut_modifier: true, params } },
  chiffrage_devis_reglages: () => liste(),
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
const voir = async (route, ms = 1200) => { await p.goto('about:blank'); await p.goto(`http://localhost:${port}/#/${route}`); await p.waitForTimeout(ms) }
const dernier = fn => appels.filter(a => a[0] === fn).pop()?.[1]

// 1. La liste
await voir('aujourdhui', 800); await voir('parametres')
await p.click('.chip:has-text("Questions")'); await p.waitForTimeout(600)
if (!(await p.locator('.cf-l:has-text("Combien de bars") .q-e').count())) echec('E absent')
if (!(await p.locator('.cf-l:has-text("Combien de cocktails signature") span:has-text("si")').count())) echec('condition absente de la liste')
await photo('q1-liste.png')
// 2. Modifier une question : texte, Complet seulement → Express
await p.click('.cf-l:has-text("Côté plonge")'); await p.waitForTimeout(500)
await p.fill('.sheet textarea', 'La plonge : fournie, un espace vide, ou rien ?')
await p.click('.sheet .chip:has-text("Express et Complet")')
await photo('q2-question.png')
await p.click('.sheet .btn.primary'); await p.waitForTimeout(600)
const mj = dernier('chiffrage_question_maj')
if (mj?.p_cle !== 'plonge' || !mj.p.express || !mj.p.texte.startsWith('La plonge')) echec(`modifier : ${JSON.stringify(mj)}`)
// 3. Nouvelle question « Il y a un DJ ? »
await p.click('.pv-plus:has-text("Nouvelle question")'); await p.waitForTimeout(500)
await p.fill('.sheet textarea', 'Il y a un DJ ?'); await p.click('.sheet .q-def:near(:text("Non"))').catch(() => {})
await p.click('.sheet .btn.primary'); await p.waitForTimeout(600)
const nq = dernier('chiffrage_question_maj')
if (nq?.p_cle !== null || nq.p.type !== 'oui_non') echec(`créer : ${JSON.stringify(nq)}`)
// 4. Nouveau poste « DJ », compté quand DJ → Oui
await p.click('.chip:has-text("Matériel")'); await p.waitForTimeout(500)
await p.click('.pv-plus:has-text("Nouveau poste")'); await p.waitForTimeout(500)
await p.fill('.sheet input[placeholder^="Ex : DJ"]', 'DJ'); await p.fill('.sheet .cf-in input', '4500')
await p.click('.sheet .chip.on:has-text("Toujours")'); await p.waitForTimeout(400)
await p.click('.sheet button:has-text("Il y a un DJ → Oui")'); await p.waitForTimeout(300)
await photo('q3-poste.png')
await p.click('.sheet .btn.primary:has-text("Créer le poste")'); await p.waitForTimeout(600)
const np = dernier('chiffrage_poste_creer')
if (!np || np.p.libelle !== 'DJ' || np.p.si !== 'q_dj:oui' || np.p.valeur !== 4500) echec(`poste : ${JSON.stringify(np)}`)
// 5. « Compté quand » d'un poste existant
await p.click('.cf-l:has-text("Kit plonge")'); await p.waitForTimeout(500)
if (!(await p.locator('.sheet .chip.on:has-text("Rien")').count())) echec('« Compté quand » du kit plonge')
await photo('q4-compte-quand.png')
await p.keyboard.press('Escape'); await p.goto('about:blank')
// 6. Conditions du devis
await voir('parametres'); await p.click('.chip:has-text("Marges")'); await p.waitForTimeout(600)
if (!(await p.locator('.cf-grp:has-text("CONDITIONS DU DEVIS")').count())) echec('conditions du devis absentes')
await p.fill('.q-txt', 'Avance de 40 % à la signature.'); await p.click('.btn.primary:has-text("Enregistrer les conditions")'); await p.waitForTimeout(400)
if (dernier('chiffrage_devis_reglages')?.p?.conditions !== 'Avance de 40 % à la signature.') echec('conditions pas enregistrées')

await b.close(); srv.close()
console.log(ko ? `${ko} échec(s)` : 'QUESTIONS OK')
process.exit(ko ? 1 : 0)
