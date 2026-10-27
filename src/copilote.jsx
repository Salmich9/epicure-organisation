import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from './api'
import { Sheet, ddmm, n, useUI } from './ui'

const LIB = {
  perimetre: 'Qui s\'en charge', fourni_par: 'Fourni par', qte_forcee: 'Quantité', stock: 'Dépôt', location: 'Location', achat: 'Achat',
  production: 'Production', prix_location: 'Prix location', prix_achat: 'Prix achat', prix_production: 'Prix production', statut_prix: 'Prix',
  description: 'Description', moments: 'Moments', choix: 'Modèle', fournisseur: 'Fournisseur', dispo: 'Disponibilité', engagement: 'Engagement',
  livraison: 'Livraison', reception: 'Réception', manque: 'Manque', resp: 'Responsable', prochaine: 'Prochaine action', echeance: 'Échéance', note: 'Note',
}
const val = (k, v) => (v === null || v === undefined || v === '' ? '—' : ['livraison', 'echeance'].includes(k) ? ddmm(String(v)) : String(v))

/* Texte lisible d'un changement proposé */
export function Diff({ c, data }) {
  if (c.type === 'invites') {
    const ev = data.evenements.find(x => x.id === data.evt) || {}
    return <><b>Invités</b> : {ev.invites ?? '?'} → <b>{c.invites}</b><div className="small mute">Toutes les quantités calculées suivront.</div></>
  }
  if (c.type === 'action') return <><b>Action pour {c.resp || '?'}</b>{c.echeance ? ` avant le ${ddmm(c.echeance)}` : ''} : {c.quoi}</>
  if (c.type === 'ajouter') return <><b>Nouvel élément</b> dans {c.zone} : {c.element}{c.champs && Object.keys(c.champs).length ? <div className="small mute">{Object.entries(c.champs).map(([k, v]) => `${LIB[k] || k} : ${val(k, v)}`).join(' · ')}</div> : null}</>
  const e = data.elements.find(x => x.id === c.element_id)
  return <><b>{e ? e.element : c.element_id}</b>{e?.description && <span className="mute"> · {String(e.description).slice(0, 40)}</span>}{Object.entries(c.champs || {}).map(([k, v]) => (
    <div key={k} className="small">{LIB[k] || k} : <span className="mute">{val(k, k === 'qte_forcee' && e ? (e.qte_forcee ?? e.qte_calc) : e?.[k])}</span> → <b>{val(k, v)}</b></div>
  ))}</>
}

/* Applique une liste de changements, un par un */
export async function appliquer(changes, data) {
  for (const c of changes) {
    if (c.type === 'modifier' && c.element_id && c.champs) await api.majElement(c.element_id, c.champs)
    else if (c.type === 'ajouter' && c.zone && c.element) {
      const e = await api.ajoutElement(data.evt, c.zone, c.element)
      if (c.champs && Object.keys(c.champs).length) await api.majElement(e.id, c.champs)
    } else if (c.type === 'action' && c.quoi) await api.ajoutAction(data.evt, c.element_id || null, c.quoi, c.resp || data.moi, c.echeance || null)
    else if (c.type === 'invites' && c.invites) await api.majInvites(data.evt, Math.round(c.invites))
  }
}

/* Feuille : ce que le copilote propose pour une note */
export function Proposition({ prop, data, onClose, onDone }) {
  const ui = useUI()
  const [sel, setSel] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (prop?.res) setSel(prop.res.changements?.map(() => true) || []) }, [prop])
  const open = !!prop
  const res = prop?.res
  async function go() {
    setBusy(true)
    try {
      await appliquer(res.changements.filter((_, i) => sel[i]), data)
      await api.rangerNote(prop.note.id, 'Appliquée', res.resume)
      ui.toast('Appliqué'); onDone()
    } catch (e) { ui.toast(e.message) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} foot={res && <>
      <button className="btn" onClick={onClose}>Plus tard</button>
      <button className="btn primary" disabled={busy || !sel.some(Boolean)} onClick={go}>{busy ? '…' : 'Appliquer'}</button></>}>
      <div className="el-kicker">Copilote</div>
      {!res ? <Reflexion /> : <>
        <div className="el-name" style={{ fontSize: 26 }}>{res.resume}</div>
        <div className="small mute" style={{ marginTop: 8 }}>« {prop.note.texte} »</div>
        {res.question && <div className="cop-q">{res.question}</div>}
        <div className="list" style={{ margin: '16px 0 0' }}>
          {(res.changements || []).map((c, i) => (
            <button key={i} className="act" style={{ width: '100%', textAlign: 'left' }} onClick={() => setSel(s => s.map((x, j) => j === i ? !x : x))}>
              <span className={`check ${sel[i] ? 'on' : ''}`}>{sel[i] ? '✓' : ''}</span>
              <div style={{ flex: 1, fontSize: 14 }}><Diff c={c} data={data} />{c.pourquoi && <div className="small mute" style={{ marginTop: 4 }}>{c.pourquoi}</div>}</div>
            </button>
          ))}
          {!res.changements?.length && <div className="empty">Rien à changer : la note est rangée telle quelle.</div>}
        </div>
      </>}
    </Sheet>
  )
}

function Reflexion() {
  return (
    <div style={{ padding: '30px 0', textAlign: 'center' }}>
      <motion.div className="cop-orb" animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} />
      <p className="mute" style={{ marginTop: 18 }}>Le copilote réfléchit…</p>
    </div>
  )
}

let CACHE = null
/* Prépare la prochaine série de questions en arrière-plan, pour qu'elle soit prête au toucher */
export function prechargerChallenge(evt) {
  if (CACHE && CACHE.evt === evt && Date.now() - CACHE.t < 15 * 60e3) return
  const p = api.copilote('challenge', { theme: null }); p.catch(() => {})
  CACHE = { evt, t: Date.now(), p }
}

const THEMES = ['Tout', 'Logistique', 'Technique et électricité', 'Art de table', 'Staff', 'Cuisine', 'Budget', 'Tiers']

/* Écran : le copilote te challenge, une question à la fois */
export function Copilote({ data, go, reload }) {
  const ui = useUI()
  const [theme, setTheme] = useState('Tout')
  const [qs, setQs] = useState(null)
  const [i, setI] = useState(0)
  const [choix, setChoix] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function charger(t = theme) {
    setQs(null); setI(0); setChoix(null); setErr('')
    try {
      let p
      if (t === 'Tout' && CACHE && CACHE.evt === data.evt) { p = CACHE.p; CACHE = null } else p = api.copilote('challenge', { theme: t === 'Tout' ? null : t })
      const r = await p
      setQs(r.questions || [])
      if (t === 'Tout') prechargerChallenge(data.evt)
    } catch (e) { setErr(e.message); setQs([]) }
  }
  useEffect(() => { charger() }, [])
  const q = qs?.[i]
  const suivante = () => { setChoix(null); setI(x => x + 1) }
  async function valider() {
    setBusy(true)
    try { await appliquer(choix.effets, data); ui.toast('Appliqué'); reload(); suivante() } catch (e) { ui.toast(e.message) } finally { setBusy(false) }
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Accueil</button>
        <h1>Challenge</h1>
        <div className="meta">Le copilote cherche ce qui risque d'être oublié.</div>
      </div>
      <div className="chips" style={{ padding: '14px 16px 0', flexWrap: 'nowrap', overflowX: 'auto' }}>
        {THEMES.map(t => <button key={t} className={`chip ${theme === t ? 'on' : ''}`} style={{ whiteSpace: 'nowrap' }} onClick={() => { setTheme(t); charger(t) }}>{t}</button>)}
      </div>
      <div style={{ padding: '18px 16px 0' }}>
        {qs === null && <Reflexion />}
        {err && <div className="empty">{err}</div>}
        <AnimatePresence mode="wait">
          {q && (
            <motion.div key={i} className="cop-card" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -60, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 280 }}>
              <div className="row-top"><span className="el-kicker">{q.theme}</span><span className="small mute">{i + 1} / {qs.length}</span></div>
              <div className="cop-question">{q.question}</div>
              {q.conseil && <div className="small mute" style={{ marginTop: 10, lineHeight: 1.45 }}>{q.conseil}</div>}
              {!choix ? (
                <div className="cop-options">
                  {q.options.map((o, k) => (
                    <motion.button key={k} whileTap={{ scale: .97 }} className="cop-opt" onClick={() => (o.effets?.length ? setChoix(o) : suivante())}>{o.libelle}</motion.button>
                  ))}
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <div className="small mute" style={{ fontWeight: 600 }}>« {choix.libelle} » va :</div>
                  <div className="list" style={{ margin: '8px 0 0' }}>{choix.effets.map((c, k) => <div key={k} className="act" style={{ fontSize: 14 }}><div><Diff c={c} data={data} /></div></div>)}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="btn" onClick={() => setChoix(null)}>Retour</button>
                    <button className="btn primary" disabled={busy} onClick={valider}>{busy ? '…' : 'Appliquer'}</button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {qs && !err && i >= qs.length && (
          <div className="empty">
            {qs.length ? 'Fini pour cette série.' : 'Pas de question cette fois.'}
            <div style={{ marginTop: 14 }}><button className="btn primary" onClick={() => charger()}>Trois nouvelles questions</button></div>
          </div>
        )}
      </div>
    </motion.div>
  )
}
