import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { n } from './ui'

/* Lot B : l'envie. Une jauge « prêt à … % », une coche qui fait du bien, des mercis, la carte de fin de journée. */

// Prêt = actions cochées + lignes reçues, sur le total des deux (même règle que orga._pret côté base)
const A_RECEVOIR = ['louer', 'acheter', 'produire', 'rafistoler']
export function pret(data, cles) {
  const ps = (data.postes || []).filter(p => !cles || cles.includes(p.cle))
  const ids = new Set(ps.flatMap(p => p.lignes || [])), acts = new Set(ps.flatMap(p => p.actions || []))
  const lignes = (data.elements || []).filter(e => ids.has(e.id) && A_RECEVOIR.includes(e.mode_ligne))
  const actions = (data.actions || []).filter(a => acts.has(a.id))
  const total = lignes.length + actions.length
  const fait = lignes.filter(e => e.reception === 'Reçu').length + actions.filter(a => a.statut === 'Fait').length
  return { fait, total, v: total ? fait / total : 0 }
}

export function Anneau({ v, size = 44, epais = 5, children }) {
  const r = (size - epais) / 2, c = 2 * Math.PI * r, plein = v >= 1
  return (
    <span className={`an ${plein ? 'plein' : ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={epais} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={plein ? 'var(--ok)' : 'var(--accent)'} strokeWidth={epais} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeDasharray={c} initial={false} animate={{ strokeDashoffset: c * (1 - Math.min(1, v)) }} transition={{ type: 'spring', damping: 22, stiffness: 120 }} />
      </svg>
      {children && <i>{children}</i>}
    </span>
  )
}

export function Pret({ p, titre = 'Prêt à' }) {
  if (!p.total) return null
  const pc = Math.round(p.v * 100)
  return (
    <div className="pr">
      <Anneau v={p.v} size={46}><b>{pc}</b></Anneau>
      <div><b>{pc >= 100 ? 'Tout est prêt' : `${titre} ${pc} %`}</b><span>{p.fait} sur {p.total} · actions faites et lignes reçues</span></div>
    </div>
  )
}

// Une coche qui fait du bien : petite vibration, la case rebondit
export function feliciter() { try { navigator.vibrate?.(12) } catch {} }

export function Merci({ a, moi, onDone }) {
  const [m, setM] = useState(a.mercis || [])
  useEffect(() => { setM(a.mercis || []) }, [a.id, a.mercis])
  if (a.statut !== 'Fait' || !a.resp || a.resp === moi) return m.length ? <span className="me-n">👏 {m.length}</span> : null
  const deja = m.some(x => x.de === moi)
  async function go(ev) {
    ev.stopPropagation()
    if (deja) return
    setM(x => [...x, { de: moi }]); feliciter()
    try { await api.actionMerci(a.id); onDone?.() } catch { setM(a.mercis || []) }
  }
  return <motion.button whileTap={{ scale: .9 }} className={`me ${deja ? 'on' : ''}`} onClick={go}>👏 {deja ? 'Merci envoyé' : 'Merci'}{m.length > 1 ? ` · ${m.length}` : ''}</motion.button>
}

// Carte de fin de journée (après 17 h, ou dès qu'on a coché quelque chose)
export function Journee({ mapart }) {
  const [j, setJ] = useState(null)
  useEffect(() => { api.maJournee().then(setJ).catch(() => {}) }, [])
  if (!j) return null
  const h = new Date().getHours()
  const mercis = j.mercis || []
  if (mapart) return mercis.length ? <div className="jr mercis"><b>👏 {mercis.length} merci{mercis.length > 1 ? 's' : ''} cette semaine</b><span>{[...new Set(mercis.map(x => x.de))].join(', ')} · {[...new Set(mercis.map(x => x.quoi))].slice(0, 2).map(q => `« ${q} »`).join(', ')}</span></div> : null
  if (h < 17 && !n(j.faites)) return null
  return (
    <div className="jr">
      <div className="t">{h >= 17 ? 'Ta journée' : 'Aujourd\'hui, déjà'}</div>
      <div className="c"><div><b>{n(j.faites)}</b>faite{n(j.faites) > 1 ? 's' : ''}</div><div><b>{n(j.repoussees)}</b>repoussée{n(j.repoussees) > 1 ? 's' : ''}</div><div><b>{mercis.length}</b>merci{mercis.length > 1 ? 's' : ''}</div></div>
      {(j.evenements || []).length > 0 && <div className="e">{j.evenements.map(e => <span key={e.id}><Anneau v={e.pret} size={18} epais={3} />{e.nom} {Math.round(e.pret * 100)} %{n(e.gain) > 0 ? <em> +{Math.round(e.gain * 100)}</em> : ''}</span>)}</div>}
    </div>
  )
}
