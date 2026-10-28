import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'

/* Ajouter un article à l'oral pendant la revue : l'IA propose la famille et le prix, on valide */
const MODES = { Location: ['location', 'prix_location', 'Louer'], Achat: ['achat', 'prix_achat', 'Acheter'], 'Production / sous-traitance': ['production', 'prix_production', 'Produire'], Stock: ['stock', null, 'Dépôt'] }
const SOURCE = { bibliotheque: 'bibliothèque', evenements: 'événements passés', estimation: 'estimé par l\'IA' }
const mt = v => Math.round(n(v)).toLocaleString('fr-FR')

function useDictee(setTexte) {
  const rec = useRef(null)
  const [actif, setActif] = useState(false)
  const arreter = () => { if (rec.current) rec.current.stop() }
  const lancer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR || rec.current) return !!SR
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true
    r.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; setTexte(t) }
    r.onend = () => { rec.current = null; setActif(false) }
    rec.current = r; try { r.start(); setActif(true) } catch { rec.current = null }
    return true
  }
  return [actif, lancer, arreter]
}

export function AjoutVoix({ open, onClose, data, putEl, reload }) {
  const ui = useUI()
  const [texte, setTexte] = useState('')
  const [phase, setPhase] = useState('parle')
  const [arts, setArts] = useState([])
  const [busy, setBusy] = useState(false)
  const [actif, lancer, arreter] = useDictee(setTexte)
  const inv = n(data.evenements.find(x => x.id === data.evt)?.invites)
  useEffect(() => { if (open) { setTexte(''); setArts([]); setPhase('parle'); if (!lancer()) ui.bubble('Dictée indisponible ici : écris l\'article ou utilise le micro du clavier.') } else arreter() }, [open])

  async function chercher() {
    arreter()
    if (!texte.trim()) return
    setPhase('cherche')
    try {
      const d = await api.copilote('article', { note: texte.trim() })
      const l = (d.articles || []).map((a, k) => ({ ...a, k, garde: true, dedans: a.catalogue_id && data.elements.some(e => e.catalogue_id === a.catalogue_id) }))
      if (!l.length) { ui.bubble('Je n\'ai pas compris l\'article : redis-le.'); setPhase('parle'); return }
      setArts(l); setPhase('propose')
    } catch (e) { ui.toast(e.message); setPhase('parle') }
  }
  const maj = (k, ch) => setArts(l => l.map(a => a.k === k ? { ...a, ...ch } : a))

  async function valider() {
    const l = arts.filter(a => a.garde && !a.dedans)
    if (!l.length) { onClose(); return }
    setBusy(true)
    let ok = 0
    for (const a of l) {
      try {
        const [mk, pk] = MODES[a.mode] || MODES.Location
        let el
        if (a.catalogue_id) el = await api.elementDepuisCatalogue(data.evt, a.catalogue_id)
        else {
          try {
            el = await api.catalogueCreer({ element: a.element.trim(), zone: a.zone, sous_zone: a.sous_zone, unite: a.unite, base: a.base, qte_par_base: a.qte_par_base,
              mode: a.mode, prix: a.prix || null, source_prix: a.source === 'estimation' ? 'Estimé par l\'IA (dicté)' : a.source === 'evenements' ? 'Événements passés (dicté)' : null }, data.evt)
          } catch (e) { if (/existe_deja/.test(e.message)) { ui.toast(`${a.element} existe déjà dans la bibliothèque : ajoute-le depuis la bibliothèque`); continue } throw e }
        }
        const q = n(a.quantite) > 0 ? n(a.quantite) : null
        const ch = { ...(q ? { qte_forcee: q } : {}), ...(pk && a.prix ? { [pk]: a.prix } : {}) }
        let fresh = await api.elementRevoir(el.id, ch)
        const besoin = q ?? n(fresh.qte_calc)
        if (besoin > 0 && !n(fresh[mk])) fresh = await api.elementRevoir(el.id, { [mk]: besoin })
        putEl(fresh); ok++
      } catch (e) { ui.toast(`${a.element} : ${e.message}`) }
    }
    setBusy(false)
    if (ok) { ui.toast(`${ok} article${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''} et validé${ok > 1 ? 's' : ''}`); reload?.() }
    onClose()
  }

  const nb = arts.filter(a => a.garde && !a.dedans).length
  const foot = phase === 'parle'
    ? <button className="btn primary" disabled={!texte.trim()} onClick={chercher}>Proposer</button>
    : phase === 'propose' ? <button className="btn primary" disabled={busy || !nb} onClick={valider}>{busy ? '…' : nb > 1 ? `Valider les ${nb}` : 'Valider'}</button> : null
  return (
    <Sheet open={open} onClose={onClose} foot={foot}>
      {phase !== 'propose' ? <>
        <div className="el-name" style={{ fontSize: 26 }}>Dis l'article</div>
        <div className="small mute" style={{ marginBottom: 10 }}>Ex. « 40 brumisateurs pour la terrasse et 2 frigos vitrés »</div>
        <div className="va-dicte">
          <button className={`mini-mic ${actif ? 'rec' : ''}`} onClick={() => (actif ? arreter() : lancer())} aria-label="Dicter">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
          </button>
          <textarea rows={3} value={texte} placeholder={actif ? 'Je t\'écoute…' : 'Touche le micro ou écris'} onChange={x => setTexte(x.target.value)} />
        </div>
        {phase === 'cherche' && <div className="va-cherche"><motion.i animate={{ scale: [1, 1.2, 1], opacity: [.6, 1, .6] }} transition={{ repeat: Infinity, duration: 1.2 }} />Je cherche la famille et le prix…</div>}
      </> : <>
        <div className="el-name" style={{ fontSize: 26 }}>{arts.length > 1 ? `${arts.length} articles` : 'Proposition'}</div>
        {arts.map(a => {
          const [, , ml] = MODES[a.mode] || MODES.Location
          const q = n(a.quantite) > 0 ? n(a.quantite) : a.base === 'Fixe' ? n(a.qte_par_base) : a.base === 'Tables' ? Math.ceil(inv / 10 * n(a.qte_par_base)) : Math.ceil(inv * n(a.qte_par_base))
          return (
            <div key={a.k} className={`va-art ${a.garde ? '' : 'off'}`}>
              <div className="va-h">
                <input value={a.element} onChange={x => maj(a.k, { element: x.target.value })} disabled={!!a.catalogue_id} />
                <button onClick={() => maj(a.k, { garde: !a.garde })} aria-label="Retirer">{a.garde ? '✕' : '↺'}</button>
              </div>
              {a.dedans ? <div className="va-deja">Déjà dans la liste de l'événement</div> : <>
                <div className="va-l"><span>Famille</span>
                  <select value={a.zone} disabled={!!a.catalogue_id} onChange={x => maj(a.k, { zone: x.target.value })}>{data.zones.map(z => <option key={z.nom}>{z.nom}</option>)}</select></div>
                {a.sous_zone && <div className="va-sz">{a.sous_zone}</div>}
                <div className="va-l"><span>{ml} · prix unitaire</span>
                  <input inputMode="decimal" value={a.prix || ''} placeholder="MAD" onChange={x => maj(a.k, { prix: Number(x.target.value.replace(',', '.')) || 0 })} /></div>
                <div className="va-l"><span>Quantité</span>
                  <input inputMode="numeric" value={n(a.quantite) > 0 ? a.quantite : ''} placeholder={q ? String(q) : '—'} onChange={x => maj(a.k, { quantite: Number(x.target.value.replace(',', '.')) || 0 })} /></div>
                <div className="va-src">{a.catalogue_id ? 'déjà dans la bibliothèque' : SOURCE[a.source] || ''}{q && a.prix ? ` · ${mt(q * a.prix)} MAD` : ''} <Info text={a.pourquoi || ''} /></div>
              </>}
            </div>
          )
        })}
        <button className="lien-perdu" onClick={() => { setPhase('parle'); lancer() }}>Redire</button>
      </>}
    </Sheet>
  )
}
