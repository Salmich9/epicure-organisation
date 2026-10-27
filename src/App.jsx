import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, store } from './api'
import { ElementSheet, sendWa } from './element'
import { Chiffrer, Nouveau } from './creation'
import { Pieces } from './pieces'
import { Especes } from './especes'
import { Decider, Deleguer, Notes, Perimetre, Plan, Zone } from './screens'
import { Copilote, Proposition, prechargerChallenge } from './copilote'
import { Planning } from './planning'
import { ETATS, Icon, Sheet, ddmm, useUI } from './ui'

function useHash() {
  const [h, setH] = useState(location.hash.slice(2))
  useEffect(() => { const f = () => setH(location.hash.slice(2)); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return [h, to => { location.hash = '/' + to; window.scrollTo(0, 0) }]
}

/* ---------- Connexion ---------- */
function Login({ onIn }) {
  const [nom, setNom] = useState(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  async function tap(k) {
    if (k === '⌫') return setPin(p => p.slice(0, -1))
    const p = (pin + k).slice(0, 6); setPin(p); setErr('')
    if (p.length === 6) {
      try { const r = await api.connexion(nom, p); store.token = r.token; onIn() } catch (e) { setErr(e.message); setPin('') }
    }
  }
  return (
    <div className="login">
      <div className="mute small" style={{ fontWeight: 600 }}>Epicure Catering</div>
      <h1>Organisation des événements</h1>
      {!nom ? <>
        <p className="mute" style={{ margin: '26px 0 12px' }}>Qui êtes-vous ?</p>
        <div className="chips">{['Salmane', 'Hamza', 'Ghali'].map(x => <button key={x} className="chip" onClick={() => setNom(x)}>{x}</button>)}</div>
      </> : <>
        <p className="mute" style={{ marginTop: 26 }}>{nom}, votre code à 6 chiffres <button className="small" style={{ textDecoration: 'underline' }} onClick={() => { setNom(null); setPin('') }}>changer</button></p>
        <div className="pin">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} className={i < pin.length ? 'f' : ''} />)}</div>
        <div className="err">{err}</div>
        <div className="pad" style={{ marginTop: 10 }}>{['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => k === '' ? <span key={i} /> : <motion.button whileTap={{ scale: .9 }} key={i} onClick={() => tap(k)}>{k}</motion.button>)}</div>
      </>}
    </div>
  )
}

/* ---------- Vue d'un responsable (lien WhatsApp, sans compte) ---------- */
function RespView({ lien }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const load = () => api.listeResponsable(lien).then(setD).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  if (err) return <div className="login"><h1>Lien invalide</h1><p className="mute" style={{ marginTop: 12 }}>{err}</p></div>
  if (!d) return <div className="login"><p className="mute">Chargement…</p></div>
  async function toggle(a) { const st = a.statut === 'Fait' ? 'À faire' : 'Fait'; setD(x => ({ ...x, actions: x.actions.map(y => y.id === a.id ? { ...y, statut: st } : y) })); await api.respAction(lien, a.id, st) }
  async function recep(e, r) {
    let manque = null
    if (r !== 'Reçu') { manque = prompt('Qu\'est-ce qui manque ?'); if (!manque) return }
    try { await api.respReception(lien, e.id, r, manque); ui.toast('Merci, c\'est noté'); load() } catch (er) { ui.toast(er.message) }
  }
  return (
    <div className="app">
      <div className="head"><div className="when">{d.evenement?.nom}</div><h1>Bonjour {d.nom}</h1><div className="meta">Ta liste, à jour en direct.</div></div>
      <div className="group">À faire · {d.actions.filter(a => a.statut !== 'Fait').length}</div>
      <div className="list">
        {!d.actions.length && <div className="empty">Rien pour l'instant.</div>}
        {d.actions.map(a => (
          <div key={a.id} className="act">
            <motion.button whileTap={{ scale: .85 }} className={`check ${a.statut === 'Fait' ? 'on' : ''}`} onClick={() => toggle(a)}>{a.statut === 'Fait' ? '✓' : ''}</motion.button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{a.quoi}</div>
              {a.echeance && <div className="small mute" style={{ marginTop: 3 }}>Avant le {ddmm(a.echeance)}</div>}
              <input defaultValue={a.reponse || ''} placeholder="Une réponse ou une remarque" style={{ marginTop: 8, padding: '9px 12px', fontSize: 14 }}
                onBlur={ev => { if (ev.target.value !== (a.reponse || '')) api.respAction(lien, a.id, null, ev.target.value).then(() => ui.toast('Envoyé')) }} />
            </div>
          </div>
        ))}
      </div>
      {d.elements.length > 0 && <>
        <div className="group">Ce que tu suis · {d.elements.length}</div>
        <div className="list">{d.elements.map(e => (
          <div key={e.id} className="row" style={{ cursor: 'default' }}>
            <div className="top"><span className="name">{e.element}</span><span className={`pill ${(ETATS[e.etat] || {}).c || ''}`}>{(ETATS[e.etat] || {}).l || e.etat}</span></div>
            <div className="info">{[e.zone, e.besoin && `${e.besoin} pièces`, e.prochaine].filter(Boolean).join(' · ')}</div>
            <div className="chips" style={{ marginTop: 10 }}>{['Reçu', 'Partiel', 'Non reçu'].map(r => <button key={r} className={`chip ${e.reception === r ? 'on' : ''}`} onClick={() => recep(e, r)}>{r}</button>)}</div>
          </div>
        ))}</div>
      </>}
    </div>
  )
}

/* ---------- Application ---------- */
export default function App() {
  const ui = useUI()
  const lien = new URLSearchParams(location.search).get('l')
  const [logged, setLogged] = useState(!!store.token)
  const [data, setData] = useState(null)
  const [route, go] = useHash()
  const [openEl, setOpenEl] = useState(null)
  const [evtSheet, setEvtSheet] = useState(false)
  const [addSheet, setAddSheet] = useState(null)
  const [newName, setNewName] = useState('')
  const [draft, setDraft] = useState('')
  const [listening, setListening] = useState(false)
  const [mine, setMineState] = useState(() => { try { return localStorage.getItem('orga_mine') === '1' } catch { return false } })
  const setMine = v => { setMineState(v); try { localStorage.setItem('orga_mine', v ? '1' : '0') } catch {} }
  const rec = useRef(null)
  const [prop, setProp] = useState(null)

  const load = useCallback(async (evt) => {
    try { const d = await api.donnees(evt || store.evt); setData(d); store.evt = d.evt; prechargerChallenge(d.evt) }
    catch (e) { if (e.code === 'session_expiree') { store.token = null; setLogged(false) } else ui.toast(e.message) }
  }, [])
  useEffect(() => { if (logged && !lien) load() }, [logged])
  useEffect(() => { setOpenEl(null); setProp(null) }, [route])

  if (lien) return <RespView lien={lien} />
  if (!logged) return <Login onIn={() => setLogged(true)} />
  if (!data) return <div className="login"><p className="mute">Chargement de l'événement…</p></div>

  const putEl = (fresh, action) => setData(d => ({ ...d, elements: d.elements.map(x => x.id === fresh.id ? fresh : x), actions: action ? [...d.actions, action] : d.actions }))
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
  const tab = route.startsWith('zone') || route.startsWith('perimetre') || route === 'copilote' || route === 'decider' || route === 'nouveau' || route === 'chiffrer' || route === 'pieces' || route === 'especes' || route === '' ? 'plan' : route
  let screen
  if (route.startsWith('perimetre/')) screen = <Perimetre key={route} data={view} kind={route.split('/')[1]} go={go} open={setOpenEl} />
  else if (route.startsWith('zone/')) screen = <Zone key={route} data={view} idx={Number(route.split('/')[1])} go={go} open={setOpenEl} patch={patch} delegate={delegate} addEl={z => setAddSheet(z)} />
  else if (route === 'especes') screen = <Especes data={data} go={go} />
  else if (route === 'pieces') screen = <Pieces data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'nouveau') screen = <Nouveau data={data} go={go} onCreated={id => load(id)} />
  else if (route === 'chiffrer') screen = <Chiffrer key={data.evt} data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'planning') screen = <Planning data={data} reload={() => load(data.evt)} open={setOpenEl} go={go} />
  else if (route === 'copilote') screen = <Copilote data={data} go={go} reload={() => load(data.evt)} />
  else if (route === 'decider') screen = <Decider data={view} open={setOpenEl} />
  else if (route === 'deleguer') screen = <Deleguer data={view} setData={setData} />
  else if (route === 'notes') screen = <Notes data={data} setData={setData} listening={listening} toggleMic={toggleMic} draft={draft} setDraft={setDraft} placer={placer} />
  else screen = <Plan data={view} go={go} openEvt={() => setEvtSheet(true)} mine={mine} setMine={setMine} />

  return (
    <div className="app">
      <AnimatePresence mode="wait">{screen}</AnimatePresence>

      <nav className="tabs">
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => go('')}>{Icon.plan}Plan</button>
        <button className={tab === 'planning' ? 'on' : ''} onClick={() => go('planning')}>{Icon.planning}Planning</button>
        <motion.button whileTap={{ scale: .9 }} className={`mic ${listening ? 'rec' : ''}`} onClick={toggleMic} aria-label="Dicter une note">{Icon.mic}</motion.button>
        <button className={tab === 'deleguer' ? 'on' : ''} onClick={() => go('deleguer')}>{Icon.deleguer}Déléguer</button>
        <button className={tab === 'notes' ? 'on' : ''} onClick={() => go('notes')}>{Icon.notes}Notes</button>
      </nav>

      <Proposition prop={prop} data={data} onClose={() => setProp(null)} onDone={() => { setProp(null); load(data.evt) }} />

      {openEl && <ElementSheet el={openEl} data={data} onClose={() => setOpenEl(null)} onSaved={putEl} />}

      <Sheet open={!!addSheet} onClose={() => setAddSheet(null)} foot={<button className="btn primary" onClick={addEl}>Ajouter</button>}>
        <div className="el-kicker">{addSheet}</div>
        <div className="el-name" style={{ fontSize: 28 }}>Nouvel élément</div>
        <input autoFocus value={newName} onChange={e => setNewName(e.target.value)} placeholder="ex : thermoplongeur" style={{ marginTop: 16 }} onKeyDown={e => e.key === 'Enter' && addEl()} />
        <p className="small mute" style={{ marginTop: 10 }}>S'il existe au catalogue, ses prix et ses moments sont repris. Sinon il y est ajouté pour la prochaine fois.</p>
      </Sheet>

      <Sheet open={evtSheet} onClose={() => setEvtSheet(false)}>
        <div className="el-name" style={{ fontSize: 28 }}>Événements</div>
        <div className="list" style={{ margin: '14px 0 0' }}>{data.evenements.map(x => (
          <button key={x.id} className="row" onClick={() => { setEvtSheet(false); go(''); load(x.id) }}>
            <div className="top"><span className="name" style={{ fontWeight: x.id === data.evt ? 800 : 600 }}>{x.nom}</span><span className="small mute">{x.date ? ddmm(x.date) : 'date ?'}</span></div>
            <div className="info">{x.invites || '?'} invités · {x.statut}{x.entite ? ` · ${x.entite}` : ''}</div>
          </button>
        ))}</div>
        <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => { setEvtSheet(false); go('nouveau') }}>+ Nouvel événement</button>
        {ev.drive_url && <a className="btn block" style={{ marginTop: 8 }} href={ev.drive_url} target="_blank" rel="noreferrer">📁 Dossier Drive</a>}
        <button className="btn block" style={{ marginTop: 8 }} onClick={() => { setEvtSheet(false); go('chiffrer') }}>{ev.budget ? 'Revoir le chiffrage' : 'Chiffrer cet événement'}</button>
        <div className="label">Invités pour {ev.nom}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input inputMode="numeric" defaultValue={ev.invites || ''} id="inv" />
          <button className="btn primary" style={{ flex: 'none' }} onClick={async () => { const v = Number(document.getElementById('inv').value); if (!v) return; await api.majInvites(data.evt, v); setEvtSheet(false); ui.toast('Quantités recalculées'); load(data.evt) }}>Mettre à jour</button>
        </div>
        <button className="btn block" style={{ marginTop: 22 }} onClick={() => { store.token = null; location.reload() }}>Se déconnecter ({data.moi})</button>
      </Sheet>
    </div>
  )
}
