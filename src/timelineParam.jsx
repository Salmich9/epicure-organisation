// v78 · Paramètres › Timeline : le modèle posé à la création de chaque événement, d'après son début et sa fin.
// Tout se change ici : intitulé, jour (J−30 à J+5), accroche (début, fin, heure fixe) et décalage, durée, rôle, « Généré quand », critique.
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { Info, Sheet, useUI } from './ui'
import { Picker } from './element'
import { TYPES } from './notifs'
import { libelleCondition } from './questions'

export const BLOCS = [['avant', 'Avant le jour J'], ['jourj', 'Jour J · équipe'], ['deroule', 'Déroulé · invités'], ['apres', 'Après']]
export const ROLES = [['coordination', 'Coordination'], ['bar', 'Bar'], ['cuisine', 'Cuisine'], ['achats', 'Achats'], ['production', 'Production']]
const jLib = j => (j === 0 ? 'J' : j < 0 ? `J−${-j}` : `J+${j}`)
export const duree = m => { if (m == null || m === '') return ''; const a = Math.abs(m), h = Math.floor(a / 60), mn = a % 60; return `${m < 0 ? '−' : m > 0 ? '+' : ''}${h ? `${h} h${mn ? ` ${String(mn).padStart(2, '0')}` : ''}` : `${mn} min`}`.replace(/^\+?0 min$/, '0') }
const hh = s => (s ? s.replace(':', ' h ').replace(' h 00', ' h') : '')
// Où tombe la ligne pour un 19 h → 2 h (l'exemple de l'aperçu)
const EX = { d: 19 * 60, f: 26 * 60 }
function exemple(l) {
  if (l.ancre === 'aucune') return `${jLib(l.jour)} · sans heure`
  const t = l.ancre === 'debut' ? EX.d + l.decalage_min : l.ancre === 'fin' ? EX.f + l.decalage_min : l.heure ? Number(l.heure.slice(0, 2)) * 60 + Number(l.heure.slice(3)) : null
  if (t == null) return jLib(l.jour)
  const m = ((t % 1440) + 1440) % 1440
  return `${jLib(l.jour + (l.jour === 0 && t >= 1440 && t < 1800 ? 0 : Math.floor(t / 1440)))} · ${String(Math.floor(m / 60)).padStart(2, '0')} h ${String(m % 60).padStart(2, '0')}`.replace(' h 00', ' h')
}
const quandTxt = (l, qs) => (l.quand?.length ? l.quand.map(c => libelleCondition(c, qs)).join(' et ') : 'toujours')

export function ParamTimeline() {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [qs, setQs] = useState([])
  const [edit, setEdit] = useState(null)
  useEffect(() => { api.timelineModele().then(setD).catch(e => ui.toast(e.message)); api.chiffrageQuestions().then(x => setQs(x?.questions || [])).catch(() => {}) }, [])
  if (!d) return <p className="small mute px" style={{ marginTop: 20 }}>Chargement…</p>
  const lignes = d.lignes || []
  return (
    <div className="tl-p">
      <p className="small mute px" style={{ marginTop: 14 }}>Posée à la création, d'après le début et la fin <Info text="Chaque nouvel événement reçoit ces lignes, à ses dates et heures. Une ligne éteinte n'est plus posée. Un changement vaut pour les prochains événements ; ceux qui existent gardent leur planning." /></p>
      {BLOCS.map(([b, t]) => {
        const l = lignes.filter(x => x.bloc === b)
        return <div key={b}>
          <div className="cf-grp"><span>{t.toUpperCase()} · {l.filter(x => x.actif).length}</span><span>{b === 'deroule' ? 'durée type' : ''}</span></div>
          <div className="tl-list">{l.map(x => (
            <button key={x.cle} className={`tl-l ${x.actif ? '' : 'off'}`} onClick={() => setEdit(x)}>
              <div className="j">{b === 'deroule' ? `${l.indexOf(x) + 1}` : jLib(x.jour)}<small>{b === 'deroule' ? duree(x.duree_min) : x.ancre === 'fixe' ? hh(x.heure) : x.ancre === 'aucune' ? '—' : `${x.ancre === 'debut' ? 'début' : 'fin'} ${duree(x.decalage_min) || '0'}`}</small></div>
              <div className="t"><b>{x.titre}{x.critique && <i> · critique</i>}</b><span>{x.actif ? quandTxt(x, qs) : 'éteinte'}</span></div>
              {x.role && <span className="r">{ROLES.find(r => r[0] === x.role)?.[1] || x.role}</span>}
            </button>))}
          </div>
          {d.peut_modifier && <button className="tl-add" onClick={() => setEdit({ bloc: b, titre: '', jour: b === 'avant' ? -1 : b === 'apres' ? 1 : 0, ancre: b === 'jourj' || b === 'deroule' ? 'debut' : 'aucune', decalage_min: 0, heure: null, duree_min: b === 'deroule' ? 30 : null, type: 'autre', role: b === 'deroule' ? null : 'coordination', quand: [], critique: false, actif: true })}>+ Ligne</button>}
        </div>
      })}
      <LigneSheet l={edit} qs={qs} peut={d.peut_modifier} onClose={() => setEdit(null)}
        onSave={async (cle, p) => { try { setD(await api.timelineModeleMaj(cle, p)); setEdit(null); ui.toast('Enregistré : vaut pour les prochains événements') } catch (e) { ui.toast(e.message) } }} />
    </div>
  )
}

function LigneSheet({ l, qs, peut, onClose, onSave }) {
  const [f, setF] = useState(null)
  const [pick, setPick] = useState(false)
  useEffect(() => { setF(l ? { ...l, quand: [...(l.quand || [])] } : null) }, [l])
  // Conditions possibles : chaque réponse d'une question à choix (les mêmes que le chiffrage)
  const conds = useMemo(() => qs.filter(q => q.actif && ['choix', 'multi', 'oui_non'].includes(q.type))
    .flatMap(q => (q.type === 'oui_non' ? [{ cle: 'oui' }, { cle: 'non' }] : q.choix || []).map(c => ({ cle: `${q.cle}:${c.cle}` })))
    .map(c => ({ ...c, libelle: libelleCondition(c.cle, qs) })), [qs])
  if (!f) return <Sheet open={false} onClose={onClose} />
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const nouveau = !f.cle
  const der = f.bloc === 'deroule'
  const pas = f.ancre === 'fixe' ? 0 : 15
  const save = () => onSave(f.cle || null, { titre: f.titre, bloc: f.bloc, jour: f.jour, ancre: der ? 'debut' : f.ancre, decalage_min: f.decalage_min, heure: f.ancre === 'fixe' ? f.heure || '' : '',
    duree_min: f.duree_min ?? '', type: f.type || '', role: f.role || '', quand: f.quand, critique: f.critique, actif: f.actif })
  return (
    <Sheet open={!!l} onClose={onClose} foot={peut && <button className="btn primary" disabled={!f.titre?.trim()} onClick={save}>{nouveau ? 'Ajouter' : 'Enregistrer'}</button>}>
      <div className="tl-k">{BLOCS.find(b => b[0] === f.bloc)?.[1]}</div>
      <input className="tl-in" value={f.titre} disabled={!peut} onChange={e => set('titre', e.target.value)} placeholder="Intitulé" autoFocus={nouveau} />
      {!der && <><div className="cf-lbl">Jour</div>
        <div className="tl-step"><button disabled={!peut || f.jour <= -30} onClick={() => set('jour', f.jour - 1)}>−</button><b>{jLib(f.jour)}</b><button disabled={!peut || f.jour >= 5} onClick={() => set('jour', f.jour + 1)}>+</button></div>
        <div className="cf-lbl">Heure <Info text="Début ou fin : l'heure suit les horaires de l'événement, avec le décalage. Heure fixe : toujours la même heure. Sans heure : juste le jour." /></div>
        <div className="chips">{[['debut', 'Début'], ['fin', 'Fin'], ['fixe', 'Heure fixe'], ['aucune', 'Sans heure']].map(([k, t]) => <button key={k} className={`chip ${f.ancre === k ? 'on' : ''}`} disabled={!peut} onClick={() => set('ancre', k)}>{t}</button>)}</div>
        {(f.ancre === 'debut' || f.ancre === 'fin') && <div className="tl-step" style={{ marginTop: 10 }}><button disabled={!peut} onClick={() => set('decalage_min', f.decalage_min - pas)}>−</button><b>{duree(f.decalage_min) || `pile à la ${f.ancre === 'debut' ? 'début' : 'fin'}`}</b><button disabled={!peut} onClick={() => set('decalage_min', f.decalage_min + pas)}>+</button></div>}
        {f.ancre === 'fixe' && <input className="tl-in" type="time" value={f.heure || ''} disabled={!peut} onChange={e => set('heure', e.target.value)} style={{ marginTop: 10, width: 140 }} />}
        <div className="tl-ex">Pour un 19 h → 2 h : <b>{exemple(f)}</b></div></>}
      <div className="cf-lbl">{der ? 'Durée type' : 'Durée'} {der && <Info text="Les moments se suivent depuis le début ; le dernier s'étire jusqu'à la fin ; s'ils dépassent, ils se resserrent." />}</div>
      <div className="tl-step"><button disabled={!peut} onClick={() => set('duree_min', Math.max(0, (f.duree_min || 0) - 15) || null)}>−</button><b>{f.duree_min ? duree(f.duree_min).replace(/^[+]/, '') : 'non précisée'}</b><button disabled={!peut} onClick={() => set('duree_min', (f.duree_min || 0) + 15)}>+</button></div>
      {!der && <><div className="cf-lbl">Rôle <Info text="Sur l'événement, la personne de ce rôle dans l'équipe (sinon celle par défaut)." /></div>
        <div className="chips">{ROLES.map(([k, t]) => <button key={k} className={`chip ${f.role === k ? 'on' : ''}`} disabled={!peut} onClick={() => set('role', f.role === k ? null : k)}>{t}</button>)}</div>
        <div className="cf-lbl">Type <Info text="Sert aux rappels : un briefing ou un tasting est rappelé 15 min avant, le reste 30 min avant ou la veille." /></div>
        <div className="chips">{TYPES.map(([k, t]) => <button key={k} className={`chip ${f.type === k ? 'on' : ''}`} disabled={!peut} onClick={() => set('type', k)}>{t}</button>)}</div></>}
      <div className="cf-lbl">Généré quand</div>
      <div className="chips">{f.quand.map(c => <button key={c} className="chip on" disabled={!peut} onClick={() => set('quand', f.quand.filter(x => x !== c))}>{libelleCondition(c, qs)} ✕</button>)}
        {peut && <button className="chip tl-plus" onClick={() => setPick(true)}>+ condition</button>}
        {!f.quand.length && !peut && <span className="small mute">toujours</span>}</div>
      <Picker open={pick} onClose={() => setPick(false)} title="Généré quand" items={conds.filter(c => !f.quand.includes(c.cle)).map(c => c.libelle)} value=""
        onPick={lb => { const c = conds.find(x => x.libelle === lb); if (c) set('quand', [...f.quand, c.cle]) }} />
      {!der && <><div className="cf-lbl">Critique</div>
        <div className="chips"><button className={`chip ${f.critique ? 'on' : ''}`} disabled={!peut} onClick={() => set('critique', true)}>Oui</button><button className={`chip ${!f.critique ? 'on' : ''}`} disabled={!peut} onClick={() => set('critique', false)}>Non</button></div></>}
      {!nouveau && <div className="chips" style={{ marginTop: 16 }}>
        <button className={`chip ${f.actif ? 'on' : ''}`} disabled={!peut} onClick={() => set('actif', true)}>Posée</button>
        <button className={`chip ${!f.actif ? 'on' : ''}`} disabled={!peut} onClick={() => set('actif', false)}>Éteinte</button></div>}
    </Sheet>
  )
}
