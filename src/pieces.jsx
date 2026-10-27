import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Sheet, ddmm, mad, n, useUI } from './ui'

const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
export const aImputer = data => (data.pieces || []).filter(p => !p.facture_id && !p.ignoree)

/* Suggestion sans IA : le même fournisseur déjà imputé, ou l'élément qui a ce fournisseur */
function devine(data, p) {
  const k = cle(p.fournisseur)
  if (!k) return null
  const proche = x => { const c = cle(x); return c && (c === k || (Math.min(c.length, k.length) >= 5 && (c.includes(k) || k.includes(c)))) }
  const f = (data.factures || []).find(x => x.element_id && proche(x.fournisseur))
  if (f) return { element_id: f.element_id, pourquoi: `Déjà imputé pour ${f.fournisseur}` }
  const e = data.elements.find(x => proche(x.fournisseur))
  if (e) return { element_id: e.id, pourquoi: `Fournisseur de ${e.element}` }
  return null
}

const depuis = (iso, auj) => { const d = String(iso || '').slice(0, 10); if (!d) return ''; if (d === auj) return "aujourd'hui"; const j = Math.round((new Date(auj) - new Date(d)) / 864e5); return j === 1 ? 'hier' : `le ${ddmm(d)}` }

export function Pieces({ data, go, reload }) {
  const ui = useUI()
  const liste = aImputer(data)
  const [sug, setSug] = useState({})
  const [choix, setChoix] = useState(null)
  const [zone, setZone] = useState(null)
  const [busy, setBusy] = useState(null)
  const parId = useMemo(() => Object.fromEntries(data.elements.map(e => [e.id, e])), [data.elements])

  // Suggestions : d'abord les règles simples, puis le copilote pour les pièces restantes (une seule fois)
  useEffect(() => {
    const s = {}, reste = []
    liste.forEach(p => { const d = p.suggestion?.element_id ? p.suggestion : devine(data, p); if (d && parId[d.element_id]) s[p.id] = d; else reste.push(p.id) })
    setSug(s)
    if (reste.length) api.suggestionsPieces(reste).then(r => setSug(x => ({ ...x, ...Object.fromEntries((r.suggestions || []).filter(y => parId[y.element_id]).map(y => [y.id, y])) }))).catch(() => {})
  }, [data.evt])

  async function imputer(p, element) {
    setBusy(p.id)
    try {
      await api.pieceImputer(p.id, element)
      ui.toast(element ? `${p.fournisseur || 'Pièce'} → ${parId[element]?.element}` : 'Retirée des dépenses de l\'événement')
      setChoix(null); setZone(null); await reload()
    } catch (e) { ui.toast(e.message) }
    setBusy(null)
  }

  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Plan</button>
        <h1 style={{ fontSize: 34 }}>Pièces à imputer</h1>
      </div>
      {!liste.length && <div className="empty">Tout est imputé. Les prochaines pièces du bot arriveront ici.</div>}
      {liste.map(p => {
        const s = sug[p.id], e = s && parId[s.element_id]
        return (
          <div key={p.id} className="pc">
            <a className="th" href={p.drive_url || undefined} target="_blank" rel="noreferrer"><span>{p.type === 'BL' ? 'BL' : p.type ? 'FACT' : 'PDF'}</span></a>
            <div className="x">
              <div className="t"><span>{p.fournisseur || 'Fournisseur ?'}</span><b>{p.montant ? mad(p.montant) : '?'}</b></div>
              <div className="s">{p.depose_par?.split(' ')[0] || '?'} · {depuis(p.cree_le, data.aujourdhui)}{p.statut === 'a_revoir' && <span className="tag">À REVOIR</span>}{p.statut === 'investissement' && <span className="tag gold">INVESTISSEMENT</span>}</div>
              {e
                ? <div className="sug"><small>LE COPILOTE PROPOSE</small>{e.zone} › {e.element}{e.fournisseur && e.fournisseur !== p.fournisseur ? ` · ${e.fournisseur}` : ''}</div>
                : <div className="sug vide"><small>À CLASSER</small>Choisis la zone et la ligne</div>}
              <div className="btns">
                {e && <motion.button whileTap={{ scale: .95 }} className="p" disabled={busy === p.id} onClick={() => imputer(p, e.id)}>✓ Oui</motion.button>}
                <motion.button whileTap={{ scale: .95 }} onClick={() => { setChoix(p); setZone(e?.zone || null) }}>{e ? 'Changer' : 'Classer'}</motion.button>
              </div>
            </div>
          </div>
        )
      })}

      <Sheet open={!!choix} onClose={() => { setChoix(null); setZone(null) }}>
        {choix && <>
          <div className="el-kicker">{choix.fournisseur} · {mad(choix.montant)} MAD</div>
          <div className="el-name" style={{ fontSize: 28 }}>Où va cette dépense ?</div>
          <div className="chips" style={{ marginTop: 14 }}>{data.zones.filter(z => data.elements.some(e => e.zone === z.nom)).map(z => <button key={z.nom} className={`chip ${zone === z.nom ? 'on' : ''}`} onClick={() => setZone(z.nom)}>{z.nom}</button>)}</div>
          {zone && <div className="list" style={{ margin: '14px 0 0' }}>{data.elements.filter(e => e.zone === zone).map(e => (
            <button key={e.id} className="row" disabled={busy === choix.id} onClick={() => imputer(choix, e.id)}>
              <div className="top"><span className="name">{e.element}</span><span className="small mute">{n(e.facture) > 0 ? `facturé ${mad(e.facture)}` : n(e.cout) > 0 ? `prévu ${mad(e.cout)}` : ''}</span></div>
              {(e.fournisseur || e.description) && <div className="info">{[e.fournisseur, e.description].filter(Boolean).join(' · ').slice(0, 70)}</div>}
            </button>
          ))}</div>}
          <button className="btn block" style={{ marginTop: 18 }} onClick={() => imputer(choix, null)}>Pas une dépense de cet événement</button>
        </>}
      </Sheet>
    </motion.div>
  )
}
