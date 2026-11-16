// v72 · Les questions du chiffrage dans les Paramètres : une seule liste pour l'agent vocal et le chiffrage écrit.
// Une question : texte, ordre, allumée, Express ou Complet, quand elle se pose, réponses et défaut. Une réponse = condition « question:réponse »
// qu'un poste peut prendre pour « Quand ? ». Ici aussi : créer un poste, les conditions du devis. Salmane seul modifie.
import { useEffect, useState } from 'react'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'
import { Picker } from './element'

export const SECTIONS_Q = [['cadrage', 'Cadrage'], ['bar', 'Bar'], ['traiteur', 'Traiteur'], ['sur_place', 'Sur place'], ['prix', 'Prix et récap']]
const TYPES = [['oui_non', 'Oui ou non'], ['choix', 'Un choix'], ['multi', 'Plusieurs choix'], ['nombre', 'Un nombre'], ['texte', 'Texte libre']]
const NOM_TYPE = { oui_non: 'oui ou non', choix: 'un choix', multi: 'plusieurs choix', nombre: 'un nombre', texte: 'texte', date: 'date', horaires: 'horaires', etape: 'étape' }
const OUI_NON = [{ cle: 'oui', libelle: 'Oui' }, { cle: 'non', libelle: 'Non' }]
const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'reponse'
const choixDe = q => (q.type === 'oui_non' ? OUI_NON : q.choix || [])

// Les réponses d'une base, comme le moteur : ce qui est dit, sinon l'ancienne forme, sinon le défaut ; une question hors de son « quand » ne compte pas
export function reponsesDe(base, questions) {
  const b = base || {}, r = {}
  for (const q of (questions || []).filter(x => x.actif && x.type !== 'etape').sort((a, c) => a.ordre - c.ordre)) {
    let v = b[q.cle]
    if (v === undefined || v === null) {
      if (q.cle === 'prestations' && ('traiteur' in b || 'bar' in b)) v = [b.bar && 'bar', b.traiteur && 'traiteur'].filter(Boolean)
      else if (q.cle === 'zone' && 'hors_marrakech' in b) v = b.autre_ville ? 'autre_ville' : b.hors_marrakech ? 'hors_marrakech' : 'marrakech'
      else if (q.cle === 'alcool_qui' && b.alcool_client) v = 'client'
      else v = q.defaut
    }
    if (q.type === 'oui_non' && typeof v === 'boolean') v = v ? 'oui' : 'non'
    if (v === undefined || v === null || !tient(q.quand, r)) continue
    r[q.cle] = v
  }
  return r
}
export function tient(quand, r) {
  return (quand || []).every(c => {
    const [k, a = ''] = c.split(':'), vals = a.split('|')
    if (!(k in r)) return false
    return Array.isArray(r[k]) ? r[k].some(x => vals.includes(x)) : vals.includes(String(r[k]))
  })
}
// Libellé d'une condition « question:réponse »
export function libelleCondition(c, questions, conditions) {
  const x = (conditions || []).find(y => y.cle === c)
  if (x) return x.libelle
  const [k, a = ''] = c.split(':'), q = (questions || []).find(y => y.cle === k)
  if (!q) return c
  const rep = a.split('|').map(v => choixDe(q).find(z => z.cle === v)?.libelle || v).join(' ou ')
  if (k === 'prestations') return `Avec ${rep.toLowerCase().replace(' ou ', ' ou un ').replace(/^/, 'un ')}`
  return `${q.texte.split(/\s*[:,?]/)[0].slice(0, 28)} → ${rep}`
}

/* ---------- Infos de base du chiffrage écrit : générées depuis les questions ---------- */
const DANS_BASE = ['prestations', 'zone', 'heures']
export function InfosQuestions({ base, questions, onChange }) {
  const r = reponsesDe(base, questions)
  const qs = (questions || []).filter(q => q.actif && (DANS_BASE.includes(q.cle) || ['bar', 'traiteur', 'sur_place'].includes(q.section))
    && ['choix', 'multi', 'oui_non', 'nombre', 'horaires'].includes(q.type) && tient(q.quand, r)).sort((a, c) => a.ordre - c.ordre)
  return qs.map(q => {
    const v = r[q.cle]
    const titre = <div className="cf-lbl" key={'t' + q.cle}>{q.texte.replace(/\s*\?$/, '').replace(/ :.*$/, '')}</div>
    if (q.type === 'horaires') {
      const h = v && typeof v === 'object' ? v : {}
      return <div key={q.cle}>{titre}<div className="cf-hr">
        <input type="time" defaultValue={h.debut || ''} onBlur={e => e.target.value !== (h.debut || '') && onChange({ [q.cle]: { ...h, debut: e.target.value } })} />
        <span>→</span>
        <input type="time" defaultValue={h.fin || ''} onBlur={e => e.target.value !== (h.fin || '') && onChange({ [q.cle]: { ...h, fin: e.target.value } })} />
      </div></div>
    }
    if (q.type === 'nombre') return <div key={q.cle}>{titre}<div className="chips">
      {[1, 2, 3, 4, 5, 6].map(k => <button key={k} className={`chip ${n(v) === k ? 'on' : ''}`} onClick={() => onChange({ [q.cle]: k })}>{k}</button>)}</div></div>
    const multi = q.type === 'multi', cur = multi ? (Array.isArray(v) ? v : []) : v
    return <div key={q.cle}>{titre}<div className="chips">{choixDe(q).map(c => {
      const on = multi ? cur.includes(c.cle) : cur === c.cle
      return <button key={c.cle} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange({ [q.cle]: multi ? (on ? cur.filter(x => x !== c.cle) : [...cur, c.cle]) : c.cle })}>{c.libelle}</button>
    })}</div></div>
  })
}

/* ---------- Paramètres › Questions ---------- */
export function ParamQuestions() {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [ouverte, setOuverte] = useState(null)
  useEffect(() => { api.chiffrageQuestions().then(setD).catch(e => ui.toast(e.message)) }, [])
  if (!d) return <p className="small mute px" style={{ marginTop: 20 }}>Chargement…</p>
  const qs = d.questions
  async function monter(q, sens) {
    const meme = qs.filter(x => x.section === q.section).sort((a, b) => a.ordre - b.ordre), i = meme.findIndex(x => x.cle === q.cle), o = meme[i + sens]
    if (!o) return
    try { await api.chiffrageQuestionMaj(q.cle, { ordre: o.ordre }); setD(await api.chiffrageQuestionMaj(o.cle, { ordre: q.ordre })) } catch (e) { ui.toast(e.message) }
  }
  return <>
    <p className="small mute px" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>Posées par l'agent vocal, et reprises dans le chiffrage écrit <Info text="E = posée aussi en Express. Une réponse devient une condition qu'un poste peut prendre pour « Quand ? ». Un changement vaut pour les prochains chiffrages." /></p>
    {SECTIONS_Q.map(([s, l]) => {
      const liste = qs.filter(q => q.section === s).sort((a, b) => a.ordre - b.ordre)
      if (!liste.length) return null
      return <div key={s}>
        <div className="cf-grp">{l.toUpperCase()}</div>
        <div className="list">{liste.map(q => (
          <button key={q.cle} className={`cf-l ${q.actif ? '' : 'off'}`} onClick={() => setOuverte(q)}>
            <div className="x"><b>{q.texte}</b><span>{[NOM_TYPE[q.type], q.quand.length ? `si ${q.quand.map(c => libelleCondition(c, qs)).join(', ')}` : null, q.actif ? null : 'éteinte'].filter(Boolean).join(' · ')}</span></div>
            <div className="cf-v">{q.express && <span className="q-e">E</span>}</div>
          </button>))}</div>
      </div>
    })}
    {d.peut_modifier && <div className="px"><button className="pv-plus" onClick={() => setOuverte({ cle: null, texte: '', type: 'oui_non', section: 'cadrage', choix: [], quand: [], express: false, actif: true })}>+ Nouvelle question</button></div>}
    <QuestionSheet q={ouverte} d={d} onClose={() => setOuverte(null)} onMonter={monter}
      onSaved={nd => { setD(nd); setOuverte(null); ui.toast('Enregistré : les prochains chiffrages la prennent') }} />
  </>
}

function QuestionSheet({ q, d, onClose, onSaved, onMonter }) {
  const ui = useUI()
  const [f, setF] = useState(null)
  const [pick, setPick] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => { if (q) setF({ ...q, choix: [...(q.choix || [])], quand: [...(q.quand || [])] }) }, [q])
  if (!q || !f) return <Sheet open={false} onClose={onClose} />
  const peut = d.peut_modifier, nouvelle = !q.cle, set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const autres = d.questions.filter(x => x.cle !== q.cle && x.actif && ['choix', 'multi', 'oui_non'].includes(x.type))
  const conds = autres.flatMap(x => choixDe(x).map(c => ({ cle: `${x.cle}:${c.cle}`, libelle: libelleCondition(`${x.cle}:${c.cle}`, d.questions) })))
  const defauts = Array.isArray(f.defaut) ? f.defaut : f.defaut == null ? [] : [f.defaut]
  const estDefaut = c => defauts.includes(c)
  const basculerDefaut = c => set('defaut', f.type === 'multi' ? (estDefaut(c) ? defauts.filter(x => x !== c) : [...defauts, c]) : c)
  async function sauver() {
    if (!f.texte.trim()) return ui.toast('Il manque la question')
    if (['choix', 'multi'].includes(f.type) && f.choix.filter(c => c.libelle.trim()).length < 2) return ui.toast('Il faut au moins deux réponses')
    setEnvoi(true)
    const choix = f.choix.filter(c => c.libelle.trim()).map(c => ({ cle: c.cle || slug(c.libelle), libelle: c.libelle.trim() }))
    try { onSaved(await api.chiffrageQuestionMaj(q.cle, { texte: f.texte, aide: f.aide || '', type: f.type, section: f.section, choix, defaut: f.type === 'nombre' ? num(f.defaut) : f.defaut ?? null, quand: f.quand, express: f.express, actif: f.actif })) }
    catch (e) { ui.toast(e.message) }
    setEnvoi(false)
  }
  return <Sheet open onClose={onClose} foot={peut ? <button className="btn primary" disabled={envoi} onClick={sauver}>{envoi ? '…' : nouvelle ? 'Créer la question' : 'Enregistrer'}</button> : null}>
    <div className="el-kicker">{nouvelle ? 'Nouvelle question' : `${SECTIONS_Q.find(([k]) => k === f.section)?.[1]} · ${NOM_TYPE[f.type]}`}</div>
    <textarea className="q-txt" rows={2} value={f.texte} disabled={!peut} onChange={e => set('texte', e.target.value)} placeholder="Ex : Il y a un DJ ?" />
    <input value={f.aide || ''} disabled={!peut} onChange={e => set('aide', e.target.value)} placeholder="Aide pour l'agent (facultatif)" style={{ marginTop: 8 }} />
    {nouvelle && <><div className="cf-lbl">Type de réponse</div><div className="chips">{TYPES.map(([k, l]) => <button key={k} className={`chip ${f.type === k ? 'on' : ''}`} onClick={() => set('type', k)}>{l}</button>)}</div>
      <div className="cf-lbl">Partie</div><div className="chips">{SECTIONS_Q.filter(([k]) => k !== 'prix').map(([k, l]) => <button key={k} className={`chip ${f.section === k ? 'on' : ''}`} onClick={() => set('section', k)}>{l}</button>)}</div></>}
    <div className="cf-lbl">Posée en</div>
    <div className="chips"><button className={`chip ${f.express ? 'on' : ''}`} disabled={!peut} onClick={() => set('express', true)}>Express et Complet</button>
      <button className={`chip ${!f.express ? 'on' : ''}`} disabled={!peut} onClick={() => set('express', false)}>Complet seulement</button></div>
    {f.type !== 'etape' && <>
      <div className="cf-lbl">Quand</div>
      <div className="chips">{f.quand.length ? f.quand.map(c => <button key={c} className="chip on" disabled={!peut} onClick={() => set('quand', f.quand.filter(x => x !== c))}>{libelleCondition(c, d.questions)} ✕</button>)
        : <span className="small mute">Toujours</span>}
        {peut && <button className="chip" onClick={() => setPick(true)}>+ condition</button>}</div>
    </>}
    {['choix', 'multi', 'oui_non'].includes(f.type) && <>
      <div className="cf-lbl">Réponses <span className="small mute">· touche ★ pour le défaut</span></div>
      <div className="list" style={{ margin: 0 }}>{(f.type === 'oui_non' ? OUI_NON : f.choix).map((c, i) => (
        <div key={i} className="q-rep">
          <button className={`q-def ${estDefaut(c.cle || slug(c.libelle)) ? 'on' : ''}`} disabled={!peut} onClick={() => basculerDefaut(c.cle || slug(c.libelle))}>★</button>
          {f.type === 'oui_non' ? <b>{c.libelle}</b> : <input value={c.libelle} disabled={!peut} onChange={e => set('choix', f.choix.map((y, k) => k === i ? { ...y, libelle: e.target.value } : y))} />}
          {f.type !== 'oui_non' && peut && <button className="q-x" onClick={() => set('choix', f.choix.filter((_, k) => k !== i))}>✕</button>}
        </div>))}
        {f.type !== 'oui_non' && peut && <button className="q-rep q-plus" onClick={() => set('choix', [...f.choix, { cle: '', libelle: '' }])}>+ une réponse</button>}
      </div>
    </>}
    {f.type === 'nombre' && <><div className="cf-lbl">Par défaut</div><div className="cf-in"><input inputMode="decimal" value={f.defaut ?? ''} disabled={!peut} onChange={e => set('defaut', e.target.value)} /></div></>}
    {!nouvelle && peut && <div className="chips" style={{ marginTop: 14 }}>
      <button className="chip" onClick={() => onMonter(q, -1)}>↑ Monter</button><button className="chip" onClick={() => onMonter(q, 1)}>↓ Descendre</button>
      {!q.systeme && <button className={`chip ${f.actif ? '' : 'on'}`} onClick={() => set('actif', !f.actif)}>{f.actif ? 'Éteindre' : 'Rallumer'}</button>}</div>}
    {q.systeme && <p className="small mute" style={{ marginTop: 10 }}>Question dont l'appli a besoin : on change son texte, pas son type.</p>}
    {!peut && <p className="small mute" style={{ marginTop: 12 }}>Seul Salmane change les questions.</p>}
    <Picker open={pick} onClose={() => setPick(false)} title="Seulement si" items={conds.map(c => c.libelle)} value=""
      onPick={l => { const c = conds.find(x => x.libelle === l); if (c && !f.quand.includes(c.cle)) set('quand', [...f.quand, c.cle]) }} />
  </Sheet>
}
const num = s => { if (s === null || s === undefined || String(s).trim() === '') return null; const x = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null }

/* ---------- Créer un poste ---------- */
const CALCULS = [['fixe', 'Forfait'], ['par_base', 'Par invité'], ['un_pour', '1 pour N invités'], ['pct', '% du coût']]
export function NouveauPoste({ section, ouvert, conditions, questions, onClose, onSaved }) {
  const ui = useUI()
  const [f, setF] = useState({ libelle: '', calcul: 'fixe', valeur: '', ratio: '', si: 'toujours' })
  const [pick, setPick] = useState(false)
  useEffect(() => { if (ouvert) setF({ libelle: '', calcul: 'fixe', valeur: '', ratio: '', si: 'toujours' }) }, [ouvert])
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function creer() {
    if (!f.libelle.trim()) return ui.toast('Il manque le nom du poste')
    try { onSaved(await api.chiffragePosteCreer({ section, libelle: f.libelle, calcul: f.calcul, valeur: num(f.valeur) ?? 0, ratio: num(f.ratio), si: f.si })) } catch (e) { ui.toast(e.message) }
  }
  return <Sheet open={ouvert} onClose={onClose} foot={<button className="btn primary" onClick={creer}>{num(f.valeur) ? 'Créer le poste' : 'Créer (prix à régler)'}</button>}>
    <div className="el-name" style={{ fontSize: 26 }}>Nouveau poste</div>
    <input value={f.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Ex : DJ, photographe, fleurs" style={{ marginTop: 12 }} />
    <div className="cf-lbl">Calcul</div><div className="chips">{CALCULS.map(([k, l]) => <button key={k} className={`chip ${f.calcul === k ? 'on' : ''}`} onClick={() => set('calcul', k)}>{l}</button>)}</div>
    <div className="cf-lbl">{f.calcul === 'pct' ? 'Taux' : 'Prix'}</div>
    <div className="cf-in"><input inputMode="decimal" value={f.valeur} onChange={e => set('valeur', e.target.value)} placeholder="0 = à régler" /><span>{f.calcul === 'pct' ? '%' : f.calcul === 'par_base' ? 'MAD / invité' : 'MAD'}</span></div>
    {f.calcul === 'un_pour' && <><div className="cf-lbl">Ratio</div><div className="cf-in"><span>1 pour</span><input inputMode="decimal" value={f.ratio} onChange={e => set('ratio', e.target.value)} placeholder="50" /><span>invités</span></div></>}
    <div className="cf-lbl">Quand</div>
    <button className="chip on" onClick={() => setPick(true)}>{libelleCondition(f.si, questions, conditions)} ›</button>
    <Picker open={pick} onClose={() => setPick(false)} title="Compté quand" items={(conditions || []).map(c => c.libelle)} value=""
      onPick={l => { const c = (conditions || []).find(x => x.libelle === l); if (c) set('si', c.cle) }} />
  </Sheet>
}

/* ---------- Conditions du devis (Paramètres › Marges) ---------- */
export function ConditionsDevis() {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [f, setF] = useState(null)
  useEffect(() => { api.chiffrageQuestions().then(x => { setD(x); setF({ conditions: x.devis?.conditions || '', validite: String(x.devis?.validite ?? 15) }) }).catch(() => {}) }, [])
  if (!d || !f) return null
  const change = f.conditions !== (d.devis?.conditions || '') || String(f.validite) !== String(d.devis?.validite ?? 15)
  async function sauver() { try { const x = await api.chiffrageDevisReglages(f); setD(x); ui.toast('Conditions du devis enregistrées') } catch (e) { ui.toast(e.message) } }
  return <>
    <div className="cf-grp">CONDITIONS DU DEVIS</div>
    <div className="px">
      <textarea className="q-txt" rows={6} value={f.conditions} disabled={!d.peut_modifier} onChange={e => setF(x => ({ ...x, conditions: e.target.value }))} />
      <div className="cf-in" style={{ marginTop: 8 }}><span>Valable</span><input inputMode="numeric" value={f.validite} disabled={!d.peut_modifier} onChange={e => setF(x => ({ ...x, validite: e.target.value.replace(/\D/g, '') }))} /><span>jours</span></div>
      {d.peut_modifier && change && <button className="btn primary block" style={{ marginTop: 10 }} onClick={sauver}>Enregistrer les conditions</button>}
    </div>
  </>
}
