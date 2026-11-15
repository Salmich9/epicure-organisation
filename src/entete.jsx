import { useEffect, useRef, useState } from 'react'
import { api, store } from './api'
import { Sheet, dans, dateLongue, useUI } from './ui'
import { SupprimerEvt } from './screens'

/* En-tête d'un événement : chaque information se corrige sur place, d'un toucher ; le reste est dans ⋯ */
const SOCIETES = ['Epicure', 'Business Boys', 'Espèce']

// Une valeur qui devient un champ quand on la touche ; Entrée ou sortie du champ enregistre, Échap annule
export function EnPlace({ valeur, type = 'text', placeholder, className = '', affichage, onSave, large }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState(valeur ?? '')
  const ref = useRef(null)
  useEffect(() => { if (!edit) setV(valeur ?? '') }, [valeur, edit])
  useEffect(() => { if (edit) { ref.current?.focus(); if (type !== 'date') ref.current?.select?.() } }, [edit])
  async function valider() {
    setEdit(false)
    const nv = type === 'number' ? (v === '' ? null : Number(v)) : String(v).trim()
    if ((nv ?? '') === (valeur ?? '') || (type === 'text' && large && !nv)) return
    await onSave(nv)
  }
  if (!edit) return <button className={`ep ${className} ${valeur ? '' : 'vide'}`} onClick={x => { x.stopPropagation(); setEdit(true) }}>{affichage ?? (valeur || placeholder)}</button>
  return <input ref={ref} className={`ep-in ${className}`} type={type} inputMode={type === 'number' ? 'numeric' : undefined} value={v ?? ''} placeholder={placeholder}
    onChange={x => setV(x.target.value)} onBlur={valider} onClick={x => x.stopPropagation()}
    onKeyDown={x => { if (x.key === 'Enter') x.currentTarget.blur(); if (x.key === 'Escape') { setV(valeur ?? ''); setEdit(false) } }} />
}

export function EnteteEvt({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [menu, setMenu] = useState(false)
  const [soc, setSoc] = useState(false)
  async function maj(p, msg = 'Enregistré') {
    try {
      if ('invites' in p) await api.majInvites(data.evt, p.invites)
      const reste = { ...p }; delete reste.invites
      if (Object.keys(reste).length) await api.evenementMaj(data.evt, reste)
      ui.toast(msg); await reload?.()
    } catch (e) { ui.toast(e.message) }
  }
  return (
    <div className="head">
      <div className="ee-top">
        <button className="back" onClick={() => go('accueil')}>‹ Événements</button>
        <button className="ee-plus" onClick={() => setMenu(true)} aria-label="Plus d'actions">⋯</button>
      </div>
      <div className="when">
        <EnPlace valeur={ev.date || ''} type="date" affichage={`${dateLongue(ev.date)}${ev.date ? ` · ${dans(ev.date, data.aujourdhui)}` : ''}`} onSave={d => d && maj({ date: d }, 'Date changée')} />
      </div>
      <h1><EnPlace valeur={ev.nom} large className="ee-nom" onSave={nom => maj({ nom })} /></h1>
      <div className="ee-meta">
        <EnPlace valeur={ev.invites || ''} type="number" placeholder="+ invités" affichage={ev.invites ? `${ev.invites} invités` : null} onSave={n => n > 0 && maj({ invites: n }, 'Quantités recalculées')} />
        <button className="ep" onClick={() => setSoc(true)}>{ev.entite || 'Epicure'}</button>
        <EnPlace valeur={ev.lieu || ''} placeholder="+ lieu" onSave={lieu => maj({ lieu })} />
        <EnPlace valeur={ev.client || ''} placeholder="+ client" onSave={client => maj({ client })} />
      </div>

      <Sheet open={soc} onClose={() => setSoc(false)}>
        <div className="el-name" style={{ fontSize: 26 }}>Qui facture ?</div>
        <div className="chips" style={{ marginTop: 14 }}>{SOCIETES.map(s => <button key={s} className={`chip ${(ev.entite || 'Epicure') === s ? 'on' : ''}`} onClick={() => { setSoc(false); maj({ entite: s }) }}>{s}</button>)}</div>
      </Sheet>

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="el-name" style={{ fontSize: 26 }}>{ev.nom}</div>
        <div className="ee-menu">
          <button onClick={() => { setMenu(false); go('chiffrer') }}>{ev.budget ? 'Revoir le chiffrage' : 'Chiffrer cet événement'}<span>›</span></button>
          {ev.drive_url && <a href={ev.drive_url} target="_blank" rel="noreferrer">Dossier Drive<span>↗</span></a>}
          <button onClick={() => { setMenu(false); go('nouveau') }}>Nouvel événement<span>›</span></button>
        </div>
        <SupprimerEvt data={data} go={go} apres={() => setMenu(false)} />
        <button className="btn block" style={{ marginTop: 18 }} onClick={async () => { try { await api.deconnexion() } catch {} store.token = null; location.reload() }}>Se déconnecter ({data.moi})</button>
      </Sheet>
    </div>
  )
}
