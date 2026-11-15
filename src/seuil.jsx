import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { feliciter } from './envie'
import { leconDuJour } from './lecons'
import { api, vite } from './api'

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

// Une fois par jour, à la première ouverture
const CLE = 'orga_seuil'
const aujourd = () => new Date().toLocaleDateString('sv')
export const seuilDuJour = () => { try { return localStorage.getItem(CLE) !== aujourd() } catch { return false } }

export function Seuil({ entrer }) {
  const l = useMemo(() => leconDuJour(vite.aujourdhui()?.aujourdhui), [])
  const [j, setJ] = useState(maJournee)
  useEffect(() => { if (!j.moi) api.aujourdhui().then(() => setJ(maJournee())).catch(() => {}) }, [])
  const [sort, setSort] = useState(false)
  const go = () => { if (sort) return; setSort(true); feliciter(); try { localStorage.setItem(CLE, aujourd()) } catch {} setTimeout(entrer, 380) }
  useEffect(() => { const k = e => (e.key === 'Enter' || e.key === ' ') && go(); addEventListener('keydown', k); return () => removeEventListener('keydown', k) })
  const r = resume(j)
  const jour = vite.aujourdhui()?.aujourdhui

  return (
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
}
