import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { useUI } from './ui'

/* Micro unique : on touche un objet, puis on parle ; ce qui est dit s'applique à cet objet.
   - Dans une fiche (action, ligne, menu ⋯) : le micro de la fiche.
   - Sur un écran : le micro du bas vise ce que l'écran a déclaré (enveloppe, événement), sinon une note. */

// Cible du micro du bas : la dernière déclarée par l'écran affiché
let pile = []
const abonnes = new Set()
const prevenir = () => abonnes.forEach(f => f())
export function useCible(cible) {
  const ref = useRef(cible); ref.current = cible
  useEffect(() => {
    if (!cible) return
    const c = { get label() { return ref.current?.label }, onTexte: t => ref.current?.onTexte(t) }
    pile = [...pile, c]; prevenir()
    return () => { pile = pile.filter(x => x !== c); prevenir() }
  }, [!!cible])
}
export const useCibleActive = () => useSyncExternalStore(f => { abonnes.add(f); return () => abonnes.delete(f) }, () => pile[pile.length - 1] || null)

// Écoute : le texte entendu part à onTexte quand on s'arrête de parler
export function useMicro(onTexte) {
  const ui = useUI()
  const rec = useRef(null)
  const [ecoute, setEcoute] = useState(false)
  const [dit, setDit] = useState('')
  const [lit, setLit] = useState(false)
  useEffect(() => () => rec.current?.stop(), [])
  function basculer() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { ui.bubble('La dictée n\'est pas disponible ici : utilise le micro du clavier.'); return }
    if (rec.current) { rec.current.stop(); return }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true
    let t = ''
    setDit('')
    r.onresult = e => { t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setDit(t) }
    r.onend = async () => { rec.current = null; setEcoute(false); if (t.trim()) { setLit(true); try { await onTexte(t.trim()) } finally { setLit(false); setDit('') } } }
    rec.current = r; r.start(); setEcoute(true)
  }
  return { ecoute, dit, lit, basculer }
}

// Le bouton micro d'une fiche, avec ce qu'il vise et ce qu'il entend
export function MicFiche({ m, pour, exemple }) {
  return (
    <div className={`mi-f ${m.ecoute ? 'rec' : ''}`}>
      <motion.button whileTap={{ scale: .9 }} className={`mi-b ${m.ecoute ? 'rec' : ''}`} onClick={m.basculer} aria-label="Parler">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
      </motion.button>
      <span>{m.lit ? 'Je comprends…' : m.dit ? `« ${m.dit} »` : m.ecoute ? 'Je t\'écoute…' : <><b>Parler à {pour}</b>{exemple && <em>{exemple}</em>}</>}</span>
    </div>
  )
}
