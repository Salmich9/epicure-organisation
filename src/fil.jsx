import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Sheet, ddmm, useUI } from './ui'
import { Av } from './postes'

/* Lot E : la conversation. Un fil sous chaque action et chaque ligne (texte, photo, @mentions),
   « Pour toi » dans Ma part, et « Passer le relais ». */

const heure = ts => { const d = new Date(ts), j = new Date(); const memeJour = d.toDateString() === j.toDateString()
  return `${memeJour ? '' : `${ddmm(d.toISOString().slice(0, 10))} · `}${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` }

// Photo réduite à 1000 px, en JPEG : légère, lisible
export function reduire(fichier) {
  return new Promise((ok, ko) => {
    const img = new Image(), url = URL.createObjectURL(fichier)
    img.onload = () => { const r = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas')
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', .72)) }
    img.onerror = ko; img.src = url
  })
}

const Texte = ({ t }) => <>{String(t || '').split(/(@[A-Za-zÀ-ÿ'-]+)/g).map((x, i) => x.startsWith('@') ? <b key={i} className="fl-m">{x}</b> : x)}</>

export function Fil({ type, objet, gens, moi, entete }) {
  const ui = useUI()
  const [l, setL] = useState(null)
  const [t, setT] = useState('')
  const [photo, setPhoto] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [grand, setGrand] = useState(null)
  const fic = useRef(null), bas = useRef(null)
  const charger = () => api.filListe(type, objet.id).then(setL).catch(() => setL([]))
  useEffect(() => { setL(null); setT(''); setPhoto(null); charger() }, [objet?.id])
  useEffect(() => { bas.current?.scrollIntoView({ block: 'nearest' }) }, [l?.length])
  const m = t.match(/@([A-Za-zÀ-ÿ'-]*)$/)
  const sugg = m ? gens.filter(g => g !== moi && g.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 5) : []
  async function envoyer() {
    if (!t.trim() && !photo) return
    setEnvoi(true)
    try { await api.filAjouter(type, objet.id, t.trim(), photo); setT(''); setPhoto(null); await charger() } catch (e) { ui.toast(e.message) }
    setEnvoi(false)
  }
  // La réponse envoyée depuis le lien WhatsApp ouvre le fil
  const msgs = [...(objet.reponse ? [{ id: 'rep', qui: objet.resp, texte: objet.reponse, lien: true }] : []), ...(l || [])]
  return (
    <div className="fl">
      {entete}
      {l === null ? <div className="fl-v">Chargement…</div> : !msgs.length ? <div className="fl-v">Pas encore d'échange. Une question, une photo de la livraison, un @prénom pour prévenir quelqu'un.</div> :
        msgs.map(x => <div key={x.id} className={`fl-x ${x.qui === moi ? 'moi' : ''}`}>
          {x.qui !== moi && <Av nom={x.qui} size={26} />}
          <div className="bu">
            {x.qui !== moi && <b>{x.qui}</b>}
            {x.photo && <img src={x.photo} alt="" onClick={() => setGrand(x.photo)} />}
            {x.texte && <p><Texte t={x.texte} /></p>}
            <small>{x.lien ? 'depuis son lien WhatsApp' : heure(x.cree_le)}</small>
          </div>
        </div>)}
      <div ref={bas} />
      {sugg.length > 0 && <div className="chips fl-s">{sugg.map(g => <button key={g} className="chip" onClick={() => setT(t.replace(/@[A-Za-zÀ-ÿ'-]*$/, `@${g} `))}>@{g}</button>)}</div>}
      {photo && <div className="fl-p"><img src={photo} alt="" /><button onClick={() => setPhoto(null)}>Retirer</button></div>}
      <div className="fl-in">
        <button className="ph" onClick={() => fic.current?.click()} aria-label="Photo">📷</button>
        <input value={t} onChange={x => setT(x.target.value)} placeholder="Écrire… @prénom pour prévenir" onKeyDown={x => x.key === 'Enter' && envoyer()} />
        <motion.button whileTap={{ scale: .9 }} className="go" disabled={envoi || (!t.trim() && !photo)} onClick={envoyer} aria-label="Envoyer">↑</motion.button>
        <input ref={fic} type="file" accept="image/*" capture="environment" hidden onChange={async x => { const f = x.target.files?.[0]; x.target.value = ''; if (f) try { setPhoto(await reduire(f)) } catch { ui.toast('Photo illisible') } }} />
      </div>
      <Sheet open={!!grand} onClose={() => setGrand(null)} z={3}>{grand && <img src={grand} alt="" style={{ width: '100%', borderRadius: 14 }} />}</Sheet>
    </div>
  )
}

// Le fil d'un objet dans sa propre feuille (depuis le menu ⋯)
export function FilSheet({ type, objet, gens, moi, onClose, z = 2 }) {
  return (
    <Sheet open={!!objet} onClose={onClose} z={z}>
      {objet && <Fil type={type} objet={objet} gens={gens} moi={moi} entete={<><div className="el-kicker">Échanges</div><div className="el-name" style={{ fontSize: 24 }}>{objet.quoi || objet.element}</div></>} />}
    </Sheet>
  )
}

// Badge « 💬 3 » sur une ligne ou une action
export const Bulle = ({ n, onClick }) => n > 0 ? <button className="fl-b" onClick={e => { e.stopPropagation(); onClick?.() }}>💬 {n}</button> : null

/* ---------- Pour toi (Ma part) ---------- */
export function PourToi({ ouvrir }) {
  const [l, setL] = useState(null)
  const [tout, setTout] = useState(false)
  useEffect(() => { api.pourToi().then(r => { setL(r); api.pourToiVu().catch(() => {}) }).catch(() => setL({ items: [] })) }, [])
  if (!l || !l.items?.length) return null
  const items = tout ? l.items : l.items.slice(0, 4)
  const icone = { mention: '@', confie: '→', repousse: '↻', message: '💬', relais: '⇄' }
  return (
    <div className="pt">
      <div className="pv-st">POUR TOI{l.non_vus ? <em> · {l.non_vus} nouveau{l.non_vus > 1 ? 'x' : ''}</em> : ''}</div>
      {items.map(x => <button key={x.id} className={`pt-x ${x.nouveau ? 'nv' : ''}`} onClick={() => ouvrir(x)}>
        <i>{icone[x.type] || '•'}</i>
        <div><b>{x.qui}</b> {x.texte}<span>{x.evt_nom}{x.objet ? ` · ${x.objet}` : ''} · {heure(x.quand)}</span></div>
      </button>)}
      {l.items.length > 4 && <button className="pv-plus" onClick={() => setTout(!tout)}>{tout ? 'Moins' : `Tout voir · ${l.items.length}`}</button>}
    </div>
  )
}

/* ---------- Passer le relais ---------- */
export function Relais({ open, data, onClose, onDone }) {
  const ui = useUI()
  const [de, setDe] = useState(null)
  const [a, setA] = useState(null)
  const [mot, setMot] = useState('')
  useEffect(() => { if (open) { setDe(null); setA(null); setMot('') } }, [open])
  const gens = [...new Set([...(data.postes || []).map(p => p.resp), ...(data.actions || []).filter(x => x.statut !== 'Fait').map(x => x.resp)].filter(Boolean))]
  const tous = [...new Set([...gens, ...(data.intervenants || []).filter(i => ['Équipe', 'Staff / extra'].includes(i.type)).map(i => i.nom), data.moi])]
  const acts = de ? (data.actions || []).filter(x => x.resp === de && x.statut !== 'Fait') : []
  const envs = de ? (data.postes || []).filter(p => p.resp === de) : []
  async function passer() {
    try {
      const r = await api.relais(data.evt, de, a, mot.trim() || null)
      onDone?.()
      ui.annulable(`${r.actions.length} action${r.actions.length > 1 ? 's' : ''} et ${r.postes.length} enveloppe${r.postes.length > 1 ? 's' : ''} passées à ${a}`,
        async () => { await api.relais(data.evt, a, de, null, r.actions, r.postes); onDone?.() })
    } catch (e) { ui.toast(e.message) }
  }
  return (
    <Sheet open={open} onClose={onClose} foot={<button className="btn primary" disabled={!de || !a || de === a} onClick={passer}>{!de ? 'Il manque : de qui' : !a ? 'Il manque : à qui' : `Passer à ${a}`}</button>}>
      <div className="el-name" style={{ fontSize: 26 }}>Passer le relais</div>
      <p className="small mute" style={{ marginTop: 4 }}>Quelqu'un est absent ou débordé : ses actions en cours et ses enveloppes passent à une autre personne, d'un coup.</p>
      <div className="as-l">DE</div>
      <div className="chips">{gens.map(g => <button key={g} className={`chip am-q ${de === g ? 'on' : ''}`} onClick={() => setDe(g)}><Av nom={g} size={20} />{g}</button>)}</div>
      {de && <p className="small mute" style={{ marginTop: 8 }}>{acts.length} action{acts.length > 1 ? 's' : ''} en cours{envs.length ? ` · ${envs.map(p => p.nom).join(', ')}` : ''}</p>}
      <div className="as-l">À</div>
      <div className="chips">{tous.filter(g => g !== de).map(g => <button key={g} className={`chip am-q ${a === g ? 'on' : ''}`} onClick={() => setA(g)}><Av nom={g} size={20} />{g}</button>)}</div>
      <div className="as-l">UN MOT (FACULTATIF)</div>
      <input value={mot} onChange={x => setMot(x.target.value)} placeholder="Ouadia est malade, merci Amina !" />
    </Sheet>
  )
}
