import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, ddmm, n, useUI } from './ui'
import { Av, MODES_L, modeLigne } from './postes'
import { vehicules } from './regles'
import { feliciter } from './envie'

/* Lot C : le terrain. Tournées par véhicule, liste de chargement, retour compté. */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (d, j) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + j); return iso(x) }
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const jourMot = (d, t) => d === t ? 'Aujourd\'hui' : d === plus(t, 1) ? 'Demain' : `${JOURS[new Date(d + 'T12:00:00').getDay()]} ${ddmm(d)}`
const carte = lieu => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`

// Un arrêt = une livraison, une récupération, ou un retour J+1 (le lendemain de l'événement)
export function arrets(actions) {
  const out = []
  for (const a of actions || []) {
    const L = a.logistique || {}
    if (L.mode === 'livre' || L.mode === 'recuperer') out.push({ a, id: a.id, jour: a.echeance, heure: a.heure || '', type: L.mode, lieu: L.lieu, vehicule: L.vehicule || '', fait: a.statut === 'Fait' })
    if (L.retour_j1 && a.evt_date) out.push({ a, id: a.id + '-r', jour: plus(a.evt_date, 1), heure: '', type: 'retour', lieu: L.lieu, vehicule: L.vehicule || '', fait: false })
  }
  return out.filter(x => x.jour).sort((x, y) => (x.heure || '99').localeCompare(y.heure || '99'))
}

/* ---------- Tournées : par jour, par véhicule ---------- */
export function Tournees({ go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [jour, setJour] = useState(null)
  const charger = () => api.aujourdhui().then(x => { setD(x); setJour(j => j || x.aujourdhui) }).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  const tous = useMemo(() => arrets(d?.actions), [d])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const t = d.aujourdhui
  const jours = [...new Set([t, plus(t, 1), ...tous.map(x => x.jour).filter(j => j >= t)])].sort().slice(0, 7)
  const du = tous.filter(x => x.jour === jour)
  const vs = [...new Set([...vehicules(), ...du.map(x => x.vehicule).filter(Boolean)])]
  const groupes = [...vs.map(v => [v, du.filter(x => x.vehicule === v)]), ['À attribuer', du.filter(x => !x.vehicule)]].filter(g => g[1].length)
  async function attribuer(x, v) {
    try { await api.actionEnregistrer(x.a.evenement_id, x.a.id, { logistique: { ...(x.a.logistique || {}), vehicule: v } }); ui.toast(`${v} · ${x.a.quoi}`); charger() } catch (e) { ui.toast(e.message) }
  }
  async function cocher(x) {
    if (x.type === 'retour') return go('retour')
    if (!x.fait) feliciter()
    try { await api.actionEnregistrer(x.a.evenement_id, x.a.id, { fait: !x.fait }); charger() } catch (e) { ui.toast(e.message) }
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('aujourdhui')}>‹ Aujourd'hui</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Tournées<Info text="Les livraisons, récupérations et retours J+1 de tous les événements, rangés par véhicule et par heure. Le véhicule et l'heure se choisissent dans la fiche de l'action, partie Logistique." /></h1></div>
      <div className="chips hi-f tr-j">{jours.map(j => { const k = tous.filter(x => x.jour === j && !x.fait).length
        return <button key={j} className={`chip ${j === jour ? 'on' : ''}`} onClick={() => setJour(j)}>{jourMot(j, t)}{k ? <em>{k}</em> : null}</button> })}</div>
      <div className="px">
        {!groupes.length && <div className="pv-vide" style={{ marginTop: 18 }}>Rien à transporter ce jour-là.</div>}
        {groupes.map(([v, xs]) => (
          <div key={v} className={`tr-v ${v === 'À attribuer' ? 'libre' : ''}`}>
            <div className="tr-h"><b>{v === 'À attribuer' ? '⚠︎ ' : '🚚 '}{v}</b><span>{xs.filter(x => !x.fait).length} arrêt{xs.filter(x => !x.fait).length > 1 ? 's' : ''}</span></div>
            {xs.map(x => (
              <div key={x.id} className={`tr-a ${x.fait ? 'fait' : ''}`}>
                <div className="hr">{x.heure || '—'}</div>
                <motion.button whileTap={{ scale: .85 }} className={`pv-ck ${x.fait ? 'on' : ''}`} onClick={() => cocher(x)} aria-label="Fait" />
                <div className="x">
                  <b><i className={`tr-t ${x.type}`}>{x.type === 'livre' ? 'Livrer' : x.type === 'recuperer' ? 'Récupérer' : 'Retour'}</i>{x.a.quoi}</b>
                  <span>{x.a.evt_nom}{x.lieu ? <> · <a href={carte(x.lieu)} target="_blank" rel="noreferrer">📍 {x.lieu}</a></> : ''}</span>
                  {v === 'À attribuer' && <div className="chips tr-c">{vehicules().slice(0, 4).map(w => <button key={w} className="chip" onClick={() => attribuer(x, w)}>{w}</button>)}</div>}
                </div>
                <Av nom={x.a.resp} size={28} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/* ---------- Chargement et retour : les lignes qu'on transporte ---------- */
const TRANSPORT = ['prelever', 'louer']
const lignesTransport = data => (data.postes || []).flatMap(p => (data.elements || []).filter(e => (p.lignes || []).includes(e.id) && TRANSPORT.includes(modeLigne(e))).map(e => ({ e, p })))
const qteDe = e => n(e.stock) + n(e.location) || n(e.qte_forcee)

export function Chargement({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [loc, setLoc] = useState({})
  const L = lignesTransport(data).map(({ e, p }) => ({ e: { ...e, ...(loc[e.id] || {}) }, p }))
  const ok = L.filter(x => n(x.e.charge) >= qteDe(x.e)).length
  async function charger(e, q) {
    const v = Math.max(0, Math.min(q, qteDe(e)))
    if (v >= qteDe(e)) feliciter()
    setLoc(x => ({ ...x, [e.id]: { charge: v } }))
    try { await api.ligneTerrain(e.id, { charge: v }) } catch (er) { ui.toast(er.message); setLoc(x => ({ ...x, [e.id]: undefined })) }
  }
  const parP = [...new Set(L.map(x => x.p.cle))].map(c => [L.find(x => x.p.cle === c).p, L.filter(x => x.p.cle === c)])
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => { reload?.(); go('') }}>‹ {ev.nom}</button><h1>Chargement</h1>
        <div className="meta">{ok} sur {L.length} lignes chargées</div></div>
      <div className="px">
        <div className="tr-bar"><i style={{ width: `${L.length ? ok / L.length * 100 : 0}%` }} /></div>
        {!L.length && <div className="pv-vide">Rien à prélever ni à louer dans cet événement.</div>}
        {parP.map(([p, xs]) => <div key={p.cle}>
          <div className="pv-st">{p.nom.toUpperCase()}</div>
          {xs.map(({ e }) => { const q = qteDe(e), c = n(e.charge), plein = c >= q
            return <div key={e.id} className={`ch-l ${plein ? 'fait' : ''}`}>
              <motion.button whileTap={{ scale: .85 }} className={`pv-ck ${plein ? 'on' : ''}`} onClick={() => charger(e, plein ? 0 : q)} aria-label="Chargé" />
              <div className="x"><b>{e.element}</b><span>{MODES_L[modeLigne(e)]}{e.fournisseur ? ` · ${e.fournisseur}` : ''}</span></div>
              <div className="ch-q"><button onClick={() => charger(e, c - 1)}>−</button><b>{c}<small>/{q}</small></b><button onClick={() => charger(e, c + 1)}>+</button></div>
            </div> })}
        </div>)}
      </div>
    </motion.div>
  )
}

export function Retour({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [loc, setLoc] = useState({})
  const L = lignesTransport(data).map(({ e, p }) => ({ e: { ...e, ...(loc[e.id] || {}) }, p }))
  const parti = e => n(e.charge) || qteDe(e)
  const revenu = e => e.revenu ?? null
  async function maj(e, p) {
    setLoc(x => ({ ...x, [e.id]: { ...(x[e.id] || {}), ...p } }))
    try { await api.ligneTerrain(e.id, p) } catch (er) { ui.toast(er.message) }
  }
  const faits = L.filter(x => revenu(x.e) !== null)
  const ecarts = faits.filter(x => n(x.e.revenu) < parti(x.e))
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => { reload?.(); go('') }}>‹ {ev.nom}</button><h1>Retour</h1>
        <div className="meta">{faits.length} sur {L.length} lignes comptées{ecarts.length ? ` · ${ecarts.length} écart${ecarts.length > 1 ? 's' : ''}` : ''}</div></div>
      <div className="px">
        {ecarts.length > 0 && <div className="rt-ec"><b>Écarts</b>{ecarts.map(x => <span key={x.e.id}>{x.e.element} : {parti(x.e) - n(x.e.revenu)} manquent{n(x.e.casse) ? ` (${n(x.e.casse)} cassés)` : ''}</span>)}</div>}
        {L.map(({ e }) => { const pa = parti(e), r = revenu(e), ok = r !== null && n(r) >= pa
          return <div key={e.id} className={`rt-l ${ok ? 'fait' : r !== null ? 'rt-ko' : ''}`}>
            <div className="t"><b>{e.element}</b><span>parti {pa} · {MODES_L[modeLigne(e)]}{e.fournisseur ? ` chez ${e.fournisseur}` : ''}</span></div>
            {r === null ? <div className="chips"><button className="chip on" onClick={() => { feliciter(); maj(e, { revenu: pa, casse: 0 }) }}>Tout revenu · {pa}</button><button className="chip" onClick={() => maj(e, { revenu: pa - 1, casse: 0 })}>Il en manque</button></div>
              : <div className="rt-q">
                  <div><span>Revenu</span><div className="ch-q"><button onClick={() => maj(e, { revenu: Math.max(0, n(r) - 1) })}>−</button><b>{n(r)}<small>/{pa}</small></b><button onClick={() => maj(e, { revenu: Math.min(pa, n(r) + 1) })}>+</button></div></div>
                  <div><span>Dont cassés</span><div className="ch-q"><button onClick={() => maj(e, { casse: Math.max(0, n(e.casse) - 1) })}>−</button><b>{n(e.casse)}</b><button onClick={() => maj(e, { casse: Math.min(pa - n(r), n(e.casse) + 1) })}>+</button></div></div>
                </div>}
          </div> })}
      </div>
    </motion.div>
  )
}
