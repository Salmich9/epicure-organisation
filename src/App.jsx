import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, store } from './api'
import { ElementSheet, sendWa } from './element'
import { Pieces } from './pieces'
import { Bibliotheque, Revue, RevueZone } from './revue'
import { Cadrage } from './cadrage'
import { Equipe } from './equipe'
import { Accueil, Voix } from './accueil'
import { DevisClient, Vente, estVente } from './cycle'
import { Decider, Deleguer, Notes, Perimetre, Plan, Zone } from './screens'
import { Aujourdhui, Poste } from './postes'
import { setRegles } from './regles'
import { Sante } from './sante'
import { Seuil, seuilDuJour } from './seuil'
import { AchatEspeces } from './bon'
import { Chargement, Retour, Tournees } from './terrain'
import { useCibleActive, useMicro } from './micro'
import { reseau } from './reseau'
import { synchroniser, vite } from './api'
import { ETATS, Icon, Sheet, ddmm, n, useUI } from './ui'

// Écrans chargés à la première ouverture : le démarrage ne télécharge que l'essentiel
const tard = (charger, nom) => lazy(() => charger().then(m => ({ default: m[nom] })))
const creation = () => import('./creation'), staff = () => import('./staff'), copilote = () => import('./copilote'), historique = () => import('./historique')
const Chiffrer = tard(creation, 'Chiffrer'), Nouveau = tard(creation, 'Nouveau')
const Especes = tard(() => import('./especes'), 'Especes')
const depot = () => import('./depot')
const Depot = tard(depot, 'Depot'), DepotArticle = tard(depot, 'DepotArticle'), DepotCommande = tard(depot, 'DepotCommande'), DepotInventaires = tard(depot, 'DepotInventaires'), DepotInventaire = tard(depot, 'DepotInventaire'), DepotHistorique = tard(depot, 'DepotHistorique'), DepotReglages = tard(depot, 'DepotReglages')
const Bilan = tard(() => import('./bilan'), 'Bilan')
const Menu = tard(() => import('./menu'), 'Menu')
const StaffEvt = tard(staff, 'StaffEvt'), StaffFiche = tard(staff, 'StaffFiche'), StaffListe = tard(staff, 'StaffListe'), StaffNoter = tard(staff, 'StaffNoter')
const Copilote = tard(copilote, 'Copilote'), Proposition = tard(copilote, 'Proposition')
const prechargerChallenge = evt => copilote().then(m => m.prechargerChallenge(evt)).catch(() => {})
const Planning = tard(() => import('./planning'), 'Planning')
const Corbeille = tard(historique, 'Corbeille'), Historique = tard(historique, 'Historique')
const Comptes = tard(() => import('./comptes'), 'Comptes')
const JourJ = tard(() => import('./jourj'), 'JourJ')
const Patience = () => <div className="empty" style={{ paddingTop: 80 }}>…</div>
// Une fois l'appli affichée, les autres écrans se téléchargent en douce : ils s'ouvriront vite, même hors connexion
if (typeof window !== 'undefined') addEventListener('load', () => setTimeout(() => [creation, staff, copilote, historique, () => import('./especes'), () => import('./bilan'), () => import('./menu'), () => import('./planning'), () => import('./comptes'), () => import('./jourj')].forEach(f => f().catch(() => {})), 4000))

// Stock du dépôt : chargé à part, gardé 5 minutes (il change rarement et pèse lourd)
const DEPOT = { liste: null, le: 0 }
async function depotFrais(forcer) {
  if (!forcer && DEPOT.liste && Date.now() - DEPOT.le < 5 * 60e3) return DEPOT.liste
  try { DEPOT.liste = await api.depotListe(); DEPOT.le = Date.now() } catch (e) { if (e.code === 'session_expiree') throw e }
  return DEPOT.liste
}

function useHash() {
  const [h, setH] = useState(location.hash ? location.hash.slice(2) : 'aujourdhui')
  useEffect(() => { const f = () => setH(location.hash.slice(2)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return [h, to => { location.hash = '/' + to; window.scrollTo(0, 0) }]
}

/* ---------- Connexion ---------- */
function Login({ onIn }) {
  const [nom, setNom] = useState(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [autre, setAutre] = useState(false)
  const [saisi, setSaisi] = useState('')
  const noms = (() => { try { return JSON.parse(localStorage.getItem('orga_noms')) || ['Salmane', 'Hamza', 'Ghali'] } catch { return ['Salmane', 'Hamza', 'Ghali'] } })()
  const retenir = x => { try { localStorage.setItem('orga_noms', JSON.stringify([...new Set([x, ...noms])].slice(0, 8))) } catch {} }
  async function tap(k) {
    if (k === '⌫') return setPin(p => p.slice(0, -1))
    const p = (pin + k).slice(0, 6); setPin(p); setErr('')
    if (p.length === 6) {
      try { const r = await api.connexion(nom, p); store.token = r.token; retenir(r.nom || nom); onIn() } catch (e) { setErr(e.message); setPin('') }
    }
  }
  return (
    <div className="login">
      <div className="marque">
        <svg viewBox="0 0 96 96" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.8"><circle cx="48" cy="25" r="3.4" fill="var(--gold)" stroke="none" /><path d="M20 62a28 28 0 0 1 56 0M14 68h68" stroke="var(--gold)" /><path d="M38 47l7 7 13-14" stroke="var(--ink)" /></svg>
        <b>Epicure</b><span>Organisation</span>
      </div>
      {!nom ? <>
        <p className="mute" style={{ margin: '26px 0 12px' }}>Qui êtes-vous ?</p>
        <div className="chips">{noms.map(x => <button key={x} className="chip" onClick={() => setNom(x)}>{x}</button>)}
          {!autre && <button className="chip ghost" onClick={() => setAutre(true)}>Autre prénom</button>}</div>
        {autre && <div className="lg-autre"><input autoFocus value={saisi} onChange={x => setSaisi(x.target.value)} placeholder="Ton prénom" onKeyDown={x => x.key === 'Enter' && saisi.trim() && setNom(saisi.trim())} />
          <button className="btn primary" disabled={!saisi.trim()} onClick={() => setNom(saisi.trim())}>OK</button></div>}
      </> : <>
        <p className="mute" style={{ marginTop: 26 }}>{nom}, votre code à 6 chiffres <button className="small" style={{ textDecoration: 'underline' }} onClick={() => { setNom(null); setPin('') }}>changer</button></p>
        <div className="pin">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < pin.length ? 'f' : ''} />)}</div>
        <div className="err">{err}</div>
        <div className="pad" style={{ marginTop: 10 }}>{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k === '' ? <span key={i} /> : <motion.button whileTap={{ scale: .9 }} key={i} onClick={() => tap(k)}>{k}</motion.button>)}</div>
      </>}
    </div>
  )
}

/* ---------- Vue d'un responsable (lien WhatsApp, sans compte) : mêmes cartes que l'appli ---------- */
const JOURS_L = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const quandMot = d => { if (!d) return ''; const t = new Date(); t.setHours(12, 0, 0, 0); const x = new Date(d + 'T12:00:00'); const j = Math.round((x - t) / 864e5)
  return j === 0 ? 'aujourd\'hui' : j === 1 ? 'demain' : j === -1 ? 'hier' : j < 0 ? `en retard (${ddmm(d)})` : j < 7 ? JOURS_L[x.getDay()] : `le ${ddmm(d)}` }
function RespView({ lien }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [rep, setRep] = useState(null)        // id de l'action dont on écrit la réponse
  const [manque, setManque] = useState(null)  // { e, r, texte }
  const load = () => api.listeResponsable(lien).then(setD).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  if (err) return <div className="login"><h1>Lien invalide</h1><p className="mute" style={{ marginTop: 12 }}>{err}</p></div>
  if (!d) return <div className="login"><p className="mute">Chargement…</p></div>
  async function toggle(a) { const st = a.statut === 'Fait' ? 'À faire' : 'Fait'; setD(x => ({ ...x, actions: x.actions.map(y => y.id === a.id ? { ...y, statut: st } : y) })); try { await api.respAction(lien, a.id, st) } catch (er) { ui.toast(`Pas enregistré : ${er.message}`); load() } }
  async function recep(e, r, texte) {
    if (r !== 'Reçu' && !texte) { setManque({ e, r, texte: '' }); return }
    try { await api.respReception(lien, e.id, r, texte || null); setManque(null); ui.toast('Merci, c\'est noté'); load() } catch (er) { ui.toast(er.message) }
  }
  async function repondre(a, texte) { setRep(null); if (texte === (a.reponse || '')) return; setD(x => ({ ...x, actions: x.actions.map(y => y.id === a.id ? { ...y, reponse: texte } : y) })); try { await api.respAction(lien, a.id, null, texte); ui.toast('Envoyé') } catch (er) { ui.toast(`Pas envoyé : ${er.message}`); load() } }
  const reste = d.actions.filter(a => a.statut !== 'Fait').length
  return (
    <div className="app rv-app">
      <div className="head"><div className="when">{d.evenement?.nom}</div><h1>Bonjour {d.nom}</h1><div className="meta">{reste ? `${reste} chose${reste > 1 ? 's' : ''} à faire` : 'Tout est fait, merci !'}</div></div>
      <div className="px">
        {!d.actions.length && <div className="pv-vide">Rien pour l'instant.</div>}
        {d.actions.map(a => (
          <div key={a.id}>
            <div className={`au-ac ${a.statut === 'Fait' ? 'fait' : ''}`}>
              <motion.button whileTap={{ scale: .85 }} className={`pv-ck ${a.statut === 'Fait' ? 'on' : ''}`} onClick={() => toggle(a)} aria-label="Fait" />
              <div className="x"><b>{a.quoi}</b><span>{quandMot(a.echeance)}{a.heure ? ` · ${a.heure}` : ''}</span></div>
              <button className="rv-rep" onClick={() => setRep(rep === a.id ? null : a.id)}>{a.reponse ? '💬' : 'Répondre'}</button>
            </div>
            {a.reponse && rep !== a.id && <div className="pv-rp">« {a.reponse} »</div>}
            {rep === a.id && <input autoFocus className="rv-in" defaultValue={a.reponse || ''} placeholder="Ta réponse ou une remarque" onBlur={ev => repondre(a, ev.target.value.trim())} onKeyDown={ev => ev.key === 'Enter' && ev.currentTarget.blur()} />}
          </div>
        ))}
        {d.elements.length > 0 && <>
          <div className="pv-st">À RECEVOIR · {d.elements.length}</div>
          {d.elements.map(e => (
            <div key={e.id} className="rv-el">
              <div className="t"><b>{e.element}</b><span>{[e.besoin && `${e.besoin} pièces`, e.prochaine].filter(Boolean).join(' · ')}</span></div>
              <div className="chips">{['Reçu', 'Partiel', 'Non reçu'].map(r => <button key={r} className={`chip ${e.reception === r ? 'on' : ''}`} onClick={() => recep(e, r)}>{r}</button>)}</div>
              {manque?.e.id === e.id && <div className="rv-manque"><input autoFocus value={manque.texte} onChange={x => setManque(m => ({ ...m, texte: x.target.value }))} placeholder="Ce qui manque : ex. 40 tasses" />
                <button className="btn primary" disabled={!manque.texte.trim()} onClick={() => recep(e, manque.r, manque.texte.trim())}>OK</button></div>}
            </div>
          ))}
        </>}
      </div>
    </div>
  )
}

/* ---------- Application ---------- */
export default function App() {
  const ui = useUI()
  const lien = new URLSearchParams(location.search).get('l')
  const [logged, setLogged] = useState(!!store.token)
  const [data, setData] = useState(null)
  const dataRef = useRef(null); dataRef.current = data
  const [route, go] = useHash()
  const [seuil, setSeuil] = useState(seuilDuJour)
  const [openEl, setOpenEl] = useState(null)
  const [addSheet, setAddSheet] = useState(null)
  const [newName, setNewName] = useState('')
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [mine, setMineState] = useState(() => { try { return localStorage.getItem('orga_mine') === '1' } catch { return false } })
  const setMine = v => { setMineState(v); try { localStorage.setItem('orga_mine', v ? '1' : '0') } catch {} }
  const rec = useRef(null)
  const [prop, setProp] = useState(null)
  const net = useSyncExternalStore(reseau.abonner, reseau.get)
  const lot = useRef(net.attente)
  useEffect(() => {
    if (net.attente > lot.current) lot.current = net.attente
    if (lot.current > 0 && net.attente === 0 && net.enLigne) { ui.toast(`${lot.current > 1 ? `${lot.current} changements envoyés` : 'Changement envoyé'} ✓`); lot.current = 0; if (data) load(data.evt) }
  }, [net.attente, net.enLigne])
  const cible = useCibleActive()
  const micro = useMicro(t => cible?.onTexte(t))
  const [droitsDepot, setDroitsDepot] = useState(() => vite.aujourdhui()?.depot || [])
  useEffect(() => { if (store.token) api.aujourdhui().then(d => setDroitsDepot(d?.depot || [])).catch(() => {}) }, [store.token])

  // Gestes instantanés : un rechargement arrivé pendant qu'un envoi est en vol, ou dépassé par un plus récent, est ignoré
  const vol = useRef(0), tour = useRef(0)
  const load = useCallback(async (evt, discret) => {
    const n0 = ++tour.current
    // Ouverture immédiate : si l'événement demandé n'est pas déjà à l'écran, on montre sa dernière copie en attendant
    if (!discret && dataRef.current?.evt !== (evt || store.evt)) {
      const c = vite.donnees(evt || store.evt)
      if (c?.evenements) { setRegles(c.regles); setData({ ...c, depot: DEPOT.liste || c.depot || [] }) }
    }
    try {
      if (evt) store.evt = evt
      const [d0, depot] = await Promise.all([api.donnees(evt || store.evt), depotFrais(!!evt)])
      let d = d0
      // Événement mémorisé supprimé entre-temps : on retombe sur le prochain événement
      if (!d.evenements.some(x => x.id === d.evt)) d = await api.donnees(null)
      d = { ...d, depot: Array.isArray(depot) ? depot : d.depot || [] }
      if (n0 !== tour.current || (discret && vol.current)) return
      setRegles(d.regles); setData(d); store.evt = d.evt; prechargerChallenge(d.evt) }
    catch (e) { if (e.code === 'session_expiree') { store.token = null; setLogged(false) } else ui.toast(e.message) }
  }, [])
  useEffect(() => { if (logged && !lien) load() }, [logged])
  // L'écran change tout de suite ; l'envoi part derrière, puis les totaux se recalculent en silence.
  // Si l'envoi échoue : retour à la version du serveur, et un message le dit.
  const geste = useCallback(async (changer, envoyer) => {
    if (changer) setData(d => (d && changer(d)) || d)
    vol.current++
    try { return { ok: true, r: await envoyer() } }
    catch (e) { ui.toast(`Pas enregistré : ${e.message}`); return { ok: false } }
    finally { vol.current--; if (!vol.current) load(null, true) }
  }, [])
  useEffect(() => { setOpenEl(null); setProp(null) }, [route])

  if (lien) return <RespView lien={lien} />
  if (!logged) return <Login onIn={() => setLogged(true)} />
  // Le seuil : la leçon du jour à la première ouverture, puis Aujourd'hui (les données se chargent derrière)
  if (seuil) return <Seuil entrer={() => { setSeuil(false); go('aujourdhui') }} />
  if (!data) return <div className="login"><p className="mute">Chargement de l'événement…</p></div>

  const putEl = (fresh, action) => setData(d => ({ ...d, elements: fresh._supprime ? d.elements.filter(x => x.id !== fresh.id) : d.elements.map(x => x.id === fresh.id ? fresh : x), actions: action ? [...d.actions, action] : d.actions }))
  const patch = async (id, p) => { try { putEl(await api.majElement(id, p)) } catch (e) { ui.toast(e.message) } }
  async function delegate(e) {
    if (!e.resp) { setOpenEl(e); ui.bubble('Choisissez qui s\'en occupe dans « Suivi et délégation ».'); return }
    try { const a = await api.ajoutAction(data.evt, e.id, e.prochaine || `S'occuper de : ${e.element}`, e.resp, e.echeance); putEl(e, a); sendWa(data, a) } catch (er) { ui.toast(er.message) }
  }
  async function addEl() {
    const nom = newName.trim(); if (!nom) return
    try { const e = await api.ajoutElement(data.evt, addSheet, nom); setData(d => ({ ...d, elements: [...d.elements, e] })); setAddSheet(null); setNewName(''); go(`zone/${data.zones.findIndex(z => z.nom === e.zone)}`); setOpenEl(e) } catch (er) { ui.toast(er.message) }
  }
  async function placer(note) {
    setProp({ note, res: null })
    try { const res = await api.copilote('placer', { note: note.texte }); setProp({ note, res }) }
    catch (e) { setProp(null); ui.toast(e.message) }
  }
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (route !== 'notes') go('notes')
    if (!SR) { ui.bubble('La dictée n\'est pas disponible dans ce navigateur : utilisez le micro du clavier.'); return }
    if (rec.current) { rec.current.stop(); return }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true
    const base = draft
    r.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; setDraft((base ? base + ' ' : '') + t) }
    r.onend = () => { rec.current = null; setListening(false) }
    rec.current = r; r.start(); setListening(true)
  }

  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const view = mine ? { ...data, elements: data.elements.filter(e => e.resp === data.moi), actions: data.actions.filter(a => a.resp === data.moi) } : data
  const tab = route === 'aujourdhui' ? 'auj' : route === 'mapart' ? 'mapart' : route === 'notes' ? 'notes' : route.startsWith('depot') ? 'depot' : 'evts'

  let screen
  const ouvrir = id => { go(''); load(id) }
  const ouvrirPoste = async (id, cle) => { await load(id); go(cle ? `poste/${cle}` : '') }
  if (route === 'aujourdhui') screen = <Aujourdhui key="auj" go={go} ouvrirPoste={ouvrirPoste} />
  else if (route === 'mapart') screen = <Aujourdhui key="mp" mapart go={go} ouvrirPoste={ouvrirPoste} />
  else if (route.startsWith('poste/')) screen = <Poste key={route} data={data} cle={route.split('/')[1]} go={go} openEl={setOpenEl} reload={() => load(data.evt)} geste={geste} />
  else if (route === 'accueil') screen = <Accueil key={data.evt + (data.evenements.length)} go={go} ouvrir={ouvrir} />
  else if (route === 'corbeille' || route === 'corbeille/tout') screen = <Corbeille key={route} data={data} go={go} tout={route === 'corbeille/tout'} reload={() => load(data.evt)} />
  else if (route === 'comptes') screen = <Comptes go={go} />
  else if (route === 'sante') screen = <Sante go={go} />
  else if (route === 'tournees') screen = <Tournees go={go} />
  else if (route === 'jourj') screen = <JourJ data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'chargement') screen = <Chargement data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'retour') screen = <Retour data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'historique') screen = <Historique data={data} go={go} />
  else if (route === 'voix') screen = <Voix data={data} go={go} ouvrir={ouvrir} />
  else if (route.startsWith('perimetre/')) screen = <Perimetre key={route} data={view} kind={route.split('/')[1]} go={go} open={setOpenEl} />
  else if (route.startsWith('zone/')) screen = <Zone key={route} data={view} idx={Number(route.split('/')[1])} go={go} open={setOpenEl} patch={patch} delegate={delegate} addEl={z => setAddSheet(z)} />
  else if (route === 'staff') screen = <StaffListe go={go} />
  else if (route.startsWith('staff/')) screen = <StaffFiche key={route} go={go} id={route.split('/')[1]} />
  else if (route === 'staff-evt') screen = <StaffEvt data={data} go={go} />
  else if (route === 'staff-evt/noter') screen = <StaffNoter data={data} go={go} />
  else if (route === 'menu') screen = <Menu data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'equipe') screen = <Equipe data={data} go={go} reload={() => load(data.evt)} />
  else if (route.startsWith('cadrage')) screen = <Cadrage key={route} data={data} go={go} fin={route === 'cadrage/fin'} reload={() => load(data.evt)} />
  else if (route === 'revue') screen = <Revue data={data} go={go} putEl={fresh => putEl(fresh)} reload={() => load(data.evt)} />
  else if (route.startsWith('revue/')) screen = <RevueZone key={route} data={data} go={go} idx={Number(route.split('/')[1])} elId={route.split('/')[2]} putEl={fresh => putEl(fresh)} reload={() => load(data.evt)} geste={geste} />
  else if (route.startsWith('biblio')) screen = <Bibliotheque data={data} go={go} zoneIdx={route.split('/')[1] !== undefined ? Number(route.split('/')[1]) : undefined} reload={() => load(data.evt)} />
  else if (route.startsWith('bilan')) screen = <Bilan key={route} data={data} go={go} sous={route.split('/')[1] || ''} reload={() => load(data.evt)} />
  else if (route === 'especes') screen = <Especes data={data} go={go} />
  else if (route === 'depot') screen = <Depot key="depot" go={go} droits={droitsDepot} />
  else if (route.startsWith('depot/article/')) screen = <DepotArticle key={route} id={route.split('/')[2]} go={go} droits={droitsDepot} />
  else if (route === 'depot/commande') screen = <DepotCommande key={route} go={go} />
  else if (route === 'depot/inventaire') screen = <DepotInventaires key={route} go={go} droits={droitsDepot} />
  else if (route.startsWith('depot/inventaire/')) screen = <DepotInventaire key={route} id={route.split('/')[2]} go={go} droits={droitsDepot} />
  else if (route === 'depot/reglages') screen = <DepotReglages key={route} go={go} />
  else if (route === 'depot/historique') screen = <DepotHistorique key={route} go={go} />
  else if (route.startsWith('achat-especes')) screen = <AchatEspeces key={route} go={go} evt={route.split('/')[1] || null} />
  else if (route === 'pieces') screen = <Pieces data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'nouveau') screen = <Nouveau data={data} go={go} onCreated={id => load(id)} />
  else if (route === 'chiffrer') screen = <Chiffrer key={data.evt} data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'budget') screen = <Chiffrer key={data.evt + 'b'} etapeInit="budget" data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'devis') screen = <DevisClient data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'planning') screen = <Planning data={data} reload={() => load(data.evt)} open={setOpenEl} go={go} />
  else if (route === 'copilote') screen = <Copilote data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'decider') screen = <Decider data={view} open={setOpenEl} />
  else if (route === 'deleguer') screen = <Deleguer data={view} setData={setData} />
  else if (route === 'notes') screen = <Notes data={data} setData={setData} listening={listening} toggleMic={toggleMic} draft={draft} setDraft={setDraft} placer={placer} />
  else if (estVente(ev)) screen = <Vente data={data} go={go} reload={() => load(data.evt)} />
  else screen = <Plan data={view} go={go} mine={mine} setMine={setMine} reload={() => load(data.evt)} />

  return (
    <div className="app">
      {(!net.enLigne || net.attente > 0) && <button className={`hl-ban ${net.enLigne ? 'envoi' : ''}`} onClick={() => synchroniser()}>
        <i />{net.enLigne ? `Envoi de ${net.attente} changement${net.attente > 1 ? 's' : ''}…`
          : <>Hors connexion{net.vuLe ? ` · copie de ${new Date(net.vuLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}{net.attente ? <b> · {net.attente} en attente</b> : ''}</>}
      </button>}
      <Suspense fallback={<Patience />}><AnimatePresence mode="wait">{screen}</AnimatePresence></Suspense>

      {(micro.ecoute || micro.lit) && <div className="mi-live"><b>{micro.lit ? 'Je comprends…' : `Pour ${cible?.label || ''}`}</b><span>{micro.dit ? `« ${micro.dit} »` : 'Je t\'écoute… touche le micro quand tu as fini'}</span></div>}
      {!route.startsWith('achat-especes') && <nav className="tabs">
        <button className={tab === 'auj' ? 'on' : ''} onClick={() => go('aujourdhui')}>{Icon.planning}Aujourd'hui</button>
        <button className={tab === 'evts' ? 'on' : ''} onClick={() => go('accueil')}>{Icon.plan}Événements</button>
        <div className="mi-nav">
          <span className="mi-pill">{cible ? `→ ${cible.label}` : '→ une note'}</span>
          <motion.button whileTap={{ scale: .9 }} className={`mic ${listening || micro.ecoute ? 'rec' : ''}`} onClick={cible ? micro.basculer : toggleMic} aria-label={cible ? `Parler à ${cible.label}` : 'Dicter une note'}>{Icon.mic}</motion.button>
        </div>
        {droitsDepot.length > 0 && <button className={tab === 'depot' ? 'on' : ''} onClick={() => go('depot')}>{Icon.depot}Dépôt</button>}
        <button className={`${tab === 'mapart' ? 'on' : ''} ${n(data.pour_toi) > 0 && tab !== 'mapart' ? 'pt-dot' : ''}`} onClick={() => go('mapart')}>{Icon.deleguer}Ma part</button>
        <button className={tab === 'notes' ? 'on' : ''} onClick={() => go('notes')}>{Icon.notes}Notes</button>
      </nav>}

      {prop && <Suspense fallback={null}><Proposition prop={prop} data={data} onClose={() => setProp(null)} onDone={() => { setProp(null); load(data.evt) }} /></Suspense>}

      {openEl && <ElementSheet el={openEl} data={data} geste={geste} onClose={() => { setOpenEl(null); if (route.startsWith('poste/')) load(data.evt, true) }} onSaved={putEl} />}

      <Sheet open={!!addSheet} onClose={() => setAddSheet(null)} foot={<button className="btn primary" onClick={addEl}>Ajouter</button>}>
        <div className="el-kicker">{addSheet}</div>
        <div className="el-name" style={{ fontSize: 28 }}>Nouvel élément</div>
        <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex : thermoplongeur" style={{ marginTop: 16 }} onKeyDown={e => e.key === 'Enter' && addEl()} />
        <p className="small mute" style={{ marginTop: 10 }}>S'il existe au catalogue, ses prix et ses moments sont repris. Sinon il y est ajouté pour la prochaine fois.</p>
      </Sheet>

    </div>
  )
}
