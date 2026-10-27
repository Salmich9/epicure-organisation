import { createContext, useContext, useEffect, useState } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'

/* ---------- libellés et couleurs ---------- */
export const ETATS = {
  a_couvrir: { l: 'À couvrir', c: 'red' }, partiel: { l: 'Partiel', c: 'red' }, a_clarifier: { l: 'À clarifier', c: 'gold' },
  en_retard: { l: 'En retard', c: 'red' }, non_recu: { l: 'Non reçu', c: 'red' }, recu_partiel: { l: 'Reçu partiel', c: 'red' },
  a_revoir: { l: 'À revoir', c: 'gold' }, couvert: { l: 'À confirmer', c: '' }, confirme: { l: 'Confirmé', c: 'ok' },
  recu: { l: 'Reçu', c: 'ok' }, tiers: { l: 'Tiers', c: '' }, non_concerne: { l: 'Pas besoin', c: '' }, annule: { l: 'Annulé', c: '' },
}
export const OUVERT = ['a_couvrir', 'partiel', 'a_clarifier']
export const ALERTE = ['en_retard', 'non_recu', 'recu_partiel', 'a_revoir']
export const MODES = [
  { k: 'stock', l: 'Dépôt', c: 'var(--stock)', p: null },
  { k: 'location', l: 'Location', c: 'var(--location)', p: 'prix_location' },
  { k: 'achat', l: 'Achat', c: 'var(--achat)', p: 'prix_achat' },
  { k: 'production', l: 'Production', c: 'var(--production)', p: 'prix_production' },
]
export const n = v => (v === null || v === undefined || v === '' ? 0 : Number(v))
export const mad = v => { v = n(v); return v >= 10000 ? `${Math.round(v / 1000)} k` : Math.round(v).toLocaleString('fr-FR') }
/* Enveloppe d'une zone : celle retenue pour l'événement, sinon MAD par invité × invités */
export const envZone = (z, ev) => (ev.budget_zones && ev.budget_zones[z.nom] != null ? n(ev.budget_zones[z.nom]) : n(z.enveloppe) * n(ev.invites))
export const ddmm = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')
export const jours = (d, today) => (d ? Math.round((new Date(d) - new Date(today)) / 864e5) : null)
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
export const dateLongue = d => { if (!d) return 'Date à fixer'; const x = new Date(d + 'T12:00:00'); return `${JOURS[x.getDay()]} ${x.getDate()} ${MOIS[x.getMonth()]}` }
export const dans = (d, today) => { const j = jours(d, today); if (j === null) return ''; if (j === 0) return "aujourd'hui"; if (j === 1) return 'demain'; if (j < 0) return `il y a ${-j} jours`; return `dans ${j} jours` }

/* ---------- toast et bulle ---------- */
const Ctx = createContext(null)
export function UIProvider({ children }) {
  const [toast, setToast] = useState(null)
  const [bubble, setBubble] = useState(null)
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2000); return () => clearTimeout(t) }, [toast])
  return (
    <Ctx.Provider value={{ toast: setToast, bubble: setBubble }}>
      {children}
      <AnimatePresence>
        {toast && <motion.div key="t" className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>{toast}</motion.div>}
        {bubble && <motion.div key="b" className="bubble" onClick={() => setBubble(null)} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .96 }}>{bubble}</motion.div>}
      </AnimatePresence>
    </Ctx.Provider>
  )
}
export const useUI = () => useContext(Ctx)
export function Info({ text }) {
  const ui = useUI()
  return <button className="i" aria-label="Plus d'info" onClick={e => { e.stopPropagation(); ui.bubble(text) }}>i</button>
}

/* ---------- feuille qui glisse du bas ---------- */
export function Sheet({ open, onClose, children, foot, z = 0 }) {
  const drag = useDragControls()
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" style={{ zIndex: 50 + z * 2 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="sheet" style={{ zIndex: 51 + z * 2 }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: .6 }}
            onDragEnd={(e, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose() }}>
            <div onPointerDown={e => drag.start(e)} style={{ touchAction: 'none', paddingBottom: 4 }}><div className="grab" /></div>
            <div className="body">{children}</div>
            {foot && <div className="foot">{foot}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---------- table ronde vue d'en haut ---------- */
export function Table({ els, size = 104 }) {
  const tot = els.length
  const ok = els.filter(e => !OUVERT.includes(e.etat) && !ALERTE.includes(e.etat)).length
  const al = els.filter(e => ALERTE.includes(e.etat)).length
  const cx = size / 2, cy = size / 2, R = size * .33
  const seats = Math.min(tot, 20)
  const scale = tot ? seats / tot : 1
  const okS = Math.round(ok * scale), alS = Math.min(seats - okS, Math.round(al * scale) || (al ? 1 : 0))
  const dots = []
  for (let i = 0; i < seats; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / seats
    const c = i < okS ? 'var(--chair-ok)' : i < okS + alS ? 'var(--red)' : 'var(--chair-no)'
    dots.push(<circle key={i} cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)} r={seats > 14 ? 3.6 : 4.6} fill={c} />)
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {tot === 0
        ? <circle cx={cx} cy={cy} r={R - 8} fill="none" stroke="var(--table-stroke)" strokeDasharray="3 4" />
        : <>{dots}<circle cx={cx} cy={cy} r={R - 10} fill="var(--table)" stroke="var(--table-stroke)" />
            <text x={cx} y={cy + 7} textAnchor="middle" fontSize="20" fill="var(--ink)" fontFamily="var(--display)">{ok}/{tot}</text></>}
    </svg>
  )
}

export function Seg({ e, besoin }) {
  if (['tiers', 'non_concerne'].includes(e.etat)) return <div className="seg"><i style={{ width: '100%', background: 'var(--tiers)' }} /></div>
  const b = n(besoin ?? e.besoin) || 1
  return <div className="seg">{MODES.map(m => n(e[m.k]) > 0 && <i key={m.k} style={{ width: `${Math.min(100, (n(e[m.k]) / b) * 100)}%`, background: m.c }} />)}</div>
}

/* ---------- icônes ---------- */
export const Icon = {
  plan: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="5" /><circle cx="12" cy="3.5" r="1.4" /><circle cx="12" cy="20.5" r="1.4" /><circle cx="3.5" cy="12" r="1.4" /><circle cx="20.5" cy="12" r="1.4" /></svg>,
  decider: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7h16M4 12h10M4 17h7" /></svg>,
  planning: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>,
  deleguer: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .6 3 2.5 3 5" /></svg>,
  notes: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 5h16v11H8l-4 4z" /></svg>,
  mic: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>,
}
