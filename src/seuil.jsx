import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { feliciter } from './envie'
import { leconDuJour } from './lecons'
import { vite } from './api'

/* Le seuil : à la première ouverture du jour, une leçon (stratégie, sagesse, logistique…), puis on entre dans Aujourd'hui. */
const salut = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir' }
const jourLong = j => (j ? new Date(j + 'T12:00:00') : new Date()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

// Ce qui attend la personne aujourd'hui, depuis la dernière copie gardée sur le téléphone
function maJournee() {
  const d = vite.aujourdhui()
  if (!d?.actions) return { moi: d?.moi || '', n: 0, retard: 0, evt: null }
  const t = d.aujourdhui
  const miennes = d.actions.filter(a => a.resp === d.moi && a.statut !== 'Fait' && a.echeance && a.echeance <= t)
  const prochain = [...new Set(d.actions.map(a => a.evt_date && a.evt_date >= t ? `${a.evt_date}|${a.evt_nom}` : null).filter(Boolean))].sort()[0]
  const [ed, en] = prochain ? prochain.split('|') : []
  const j = ed ? Math.round((new Date(ed) - new Date(t)) / 864e5) : null
  return { moi: d.moi, n: miennes.length, retard: miennes.filter(a => a.echeance < t).length, evt: en ? { nom: en, j } : null }
}
const resume = j => [j.n ? `${j.n} chose${j.n > 1 ? 's' : ''} pour toi aujourd'hui` : 'Rien d\'urgent pour toi aujourd\'hui',
  j.evt ? `${j.evt.nom} ${j.evt.j === 0 ? 'c\'est aujourd\'hui' : `dans ${j.evt.j} jour${j.evt.j > 1 ? 's' : ''}`}` : null].filter(Boolean)

export function Seuil({ entrer, style = 'A' }) {
  const l = useMemo(() => leconDuJour(vite.aujourdhui()?.aujourdhui), [])
  const j = useMemo(maJournee, [])
  const [sort, setSort] = useState(false)
  const go = () => { if (sort) return; setSort(true); feliciter(); setTimeout(entrer, 380) }
  useEffect(() => { const k = e => (e.key === 'Enter' || e.key === ' ') && go(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) })
  const r = resume(j)
  const jour = vite.aujourdhui()?.aujourdhui

  if (style === 'B') return (
    <motion.div className="se se-b" onClick={go} animate={sort ? { opacity: 0, y: -30 } : { opacity: 1, y: 0 }} initial={{ opacity: 0 }} transition={{ duration: .35 }}>
      <div className="se-date">{jourLong(jour)}</div>
      <div className="se-hi">{salut()} {j.moi}</div>
      <motion.div className="se-carte" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .15, duration: .5 }}>
        <span className="se-cat">{l.c}</span>
        <div className="se-t">{l.t}</div>
        <div className="se-au">{l.a}</div>
        <div className="se-p">{l.p}</div>
      </motion.div>
      <div className="se-jour">{r.map((x, i) => <div key={i}><i />{x}</div>)}</div>
      <motion.button whileTap={{ scale: .96 }} className="se-btn">Voir ma journée ›</motion.button>
    </motion.div>
  )

  if (style === 'C') return (
    <motion.div className="se se-c" onClick={go} animate={sort ? { opacity: 0, scale: 1.04 } : { opacity: 1, scale: 1 }} initial={{ opacity: 0 }} transition={{ duration: .35 }}>
      <svg className="se-zel" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><pattern id="z" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="scale(.5)">
        <path d="M20 2 L26 14 L38 20 L26 26 L20 38 L14 26 L2 20 L14 14 Z" fill="none" stroke="currentColor" strokeWidth=".8" /><circle cx="20" cy="20" r="3" fill="none" stroke="currentColor" strokeWidth=".6" /></pattern></defs>
        <rect width="120" height="120" fill="url(#z)" /></svg>
      <div className="se-haut"><span>{salut()} {j.moi}</span><span>{jourLong(jour)}</span></div>
      <motion.div className="se-centre" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .2, duration: .6 }}>
        <div className="se-cat">La leçon du jour · {l.c}</div>
        <div className="se-t">{l.t}</div>
        <div className="se-au">{l.a}</div>
      </motion.div>
      <div className="se-bas">
        <div className="se-jour">{r.map((x, i) => <div key={i}>{x}</div>)}</div>
        <motion.div className="se-glisse" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.8 }}>⌃<b>Touche pour entrer</b></motion.div>
      </div>
    </motion.div>
  )

  return (
    <motion.div className="se se-a" onClick={go} animate={sort ? { opacity: 0 } : { opacity: 1 }} initial={{ opacity: 0 }} transition={{ duration: .35 }}>
      <div className="se-date">{jourLong(jour)}</div>
      <motion.div className="se-centre" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .2, duration: .7 }}>
        <div className="se-guil">“</div>
        <div className="se-t">{l.t}</div>
        <div className="se-trait" />
        <div className="se-au">{l.a}</div>
        <div className="se-cat">{l.c}</div>
      </motion.div>
      <motion.div className="se-bas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .9 }}>
        <div className="se-hi">{salut()} {j.moi}</div>
        <div className="se-jour">{r.join(' · ')}</div>
        <motion.button whileTap={{ scale: .96 }} className="se-btn">Entrer</motion.button>
      </motion.div>
    </motion.div>
  )
}
