// v76 · Parts des associés, en direct. Visible des seuls associés (le serveur refuse tout autre compte) ; Salmane seul modifie.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, ddmm, n, useUI } from './ui'

const fr = v => Math.round(n(v)).toLocaleString('fr-FR').replace(/\s/g, ' ')
const SOURCE = { prevu: 'prévu', partiel: 'en cours', reel: 'réel' }
const ALLOC = [['charite', 'Charité'], ['reinvest', 'Réinvestissement'], ['dettes', 'Dettes'], ['provision', 'Provision']]
const court = (d, nom) => (d.associes || []).find(a => a.nom === nom)?.court || nom

// Les parts en direct : rechargées à l'ouverture, au retour sur l'appli et chaque minute
function useParts(annee) {
  const [d, setD] = useState(null)
  const [refus, setRefus] = useState(false)
  const charger = () => api.partsAssocies(annee).then(x => { setD(x); setRefus(false) }).catch(e => { if (e.code === 'reserve_associes') setRefus(true) })
  useEffect(() => {
    charger()
    const t = setInterval(() => { if (document.visibilityState === 'visible') charger() }, 60000)
    const v = () => { if (document.visibilityState === 'visible') charger() }
    document.addEventListener('visibilitychange', v)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', v) }
  }, [annee])
  return [d, setD, refus, charger]
}

// La carte de l'écran Aujourd'hui (rien pour qui n'est pas associé)
export function PartsCarte({ go }) {
  const [d, , refus] = useParts(null)
  if (refus || !d || !d.associes) return null
  const enCours = (d.evenements || []).some(e => e.source !== 'reel')
  return (
    <motion.button whileTap={{ scale: .98 }} className="pa-carte" onClick={() => go('parts')}>
      <div className="pa-t"><span><i className="pa-live" />Parts {d.annee}</span><em>{enCours ? 'prévu, puis réel' : 'réel'} ›</em></div>
      <div className="pa-3">{d.associes.map(a => <div key={a.nom} className={a.nom === d.moi ? 'moi' : ''}>
        <small>{a.court}</small><b>{fr(a.gagne)}</b><span>{n(a.verse) ? `reste ${fr(n(a.gagne) - n(a.verse))}` : `${String(a.pct).replace('.', ',')} %`}</span></div>)}</div>
    </motion.button>
  )
}

export function Parts({ go }) {
  const ui = useUI()
  const [annee, setAnnee] = useState(null)
  const [d, setD, refus, charger] = useParts(annee)
  const [evt, setEvt] = useState(null)
  const [verse, setVerse] = useState(false)
  if (refus) return <div className="empty" style={{ paddingTop: 80 }}>Réservé aux associés.</div>
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const an = d.annee
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('aujourdhui')}>‹ Aujourd'hui</button>
        <h1>Parts des associés</h1>
        <div className="pa-an"><button onClick={() => setAnnee(an - 1)}>‹</button><b>{an}</b><button onClick={() => setAnnee(an + 1)}>›</button>
          <Info text="Visible par Hamza, Soufiane et Salmane seulement. Par événement : prix signé HT, moins agence, apporteur, opérateurs et coût = marge nette. Coût : le plus haut entre prévu et dépensé par enveloppe, plus les imprévus ; le dépensé seul après clôture. En espèces : marge moins charité, réinvestissement, dettes et provision, partagée selon les Paramètres. Sinon le reste reste dans Epicure." /></div></div>
      <div className="px">
        <div className="pa-3 grand">{d.associes.map(a => <div key={a.nom} className={a.nom === d.moi ? 'moi' : ''}>
          <small>{a.court}</small><b>{fr(a.gagne)}</b>
          <span>versé {fr(a.verse)}</span><span className="r">reste {fr(n(a.gagne) - n(a.verse))}</span>
          {n(a.acquis) > 0 && n(a.acquis) !== n(a.gagne) && <span>dont réel {fr(a.acquis)}</span>}</div>)}</div>

        <div className="pv-st">ÉVÉNEMENTS · {d.evenements.length}</div>
        {!d.evenements.length && <div className="pv-vide">Aucun événement signé en {an}.</div>}
        {d.evenements.map(e => (
          <button key={e.id} className="pa-ev" onClick={() => setEvt(e)}>
            <div className="l1"><b>{e.nom}</b><i className={`pa-src ${e.source}`}>{SOURCE[e.source]}</i></div>
            <div className="l2">{ddmm(e.date)} · {fr(e.ht)} HT · marge <em className={n(e.marge_pct) < 35 ? 'bas' : ''}>{fr(e.marge)} ({e.marge_pct} %)</em>{!e.especes && ' · reste dans Epicure'}</div>
            <div className="l3">{d.associes.map(a => <span key={a.nom}>{a.court} <b>{fr(e.parts[a.nom])}</b></span>)}</div>
            {e.operateurs.a_attribuer && <div className="pa-alerte">Opérateurs sur place à choisir</div>}
          </button>
        ))}

        <div className="pv-st" style={{ display: 'flex', alignItems: 'center' }}>VERSEMENTS · {d.versements.length}
          {d.peut_modifier && <button className="pa-plus" onClick={() => setVerse(true)}>+ Versé</button>}</div>
        {!d.versements.length && <div className="pv-vide">Aucun versement noté.</div>}
        {d.versements.map(v => <div key={v.id} className="pa-v"><div><b>{court(d, v.associe)} · {fr(v.montant)}</b><span>{ddmm(v.le)}{v.evenement ? ` · ${v.evenement}` : ''}{v.note ? ` · ${v.note}` : ''}</span></div>
          {d.peut_modifier && <button onClick={async () => { try { setD(await api.partsVerser({ annuler: v.id, annee: an })); ui.toast('Versement annulé') } catch (e) { ui.toast(e.message) } }}>annuler</button>}</div>)}
      </div>
      <EvtSheet d={d} e={evt} onClose={() => setEvt(null)} onMaj={x => { setEvt(x); charger() }} />
      <VerseSheet d={d} open={verse} onClose={() => setVerse(false)} onFait={x => { setD(x); setVerse(false) }} />
    </motion.div>
  )
}

function EvtSheet({ d, e, onClose, onMaj }) {
  const ui = useUI()
  const [ag, setAg] = useState('')
  useEffect(() => { if (e) setAg(String(e.agence_pct ?? 0)) }, [e?.id])
  if (!e) return <Sheet open={false} onClose={onClose} />
  const edit = d.peut_modifier
  const maj = async p => { try { onMaj(await api.partsEvtMaj(e.id, p)) } catch (x) { ui.toast(x.message) } }
  const noms = d.associes.map(a => a.nom)
  const ops = e.operateurs.qui || []
  const L = (t, v, sous, cls = '') => <div className={`pa-l ${cls}`}><span>{t}{sous && <small>{sous}</small>}</span><b>{v}</b></div>
  return (
    <Sheet open={!!e} onClose={onClose}>
      <div className="pa-k">{ddmm(e.date)} · {SOURCE[e.source]}</div>
      <h2 style={{ marginTop: 4 }}>{e.nom}</h2>
      {L('Prix signé HT', fr(e.ht), `encaissé ${fr(e.encaisse)}`)}
      {L('Agence', `− ${fr(e.agence)}`, e.agence_pct ? `${String(e.agence_pct).replace('.', ',')} %` : null)}
      {edit && <div className="pa-in"><input inputMode="decimal" value={ag} onChange={x => setAg(x.target.value)} onBlur={() => { const v = Number(String(ag).replace(',', '.')); if (!Number.isNaN(v) && v !== n(e.agence_pct)) maj({ agence_pct: v }) }} /><span>% agence</span></div>}
      {L('Apporteur', `− ${fr(e.apporteur.montant)}`, e.apporteur.qui ? court(d, e.apporteur.qui) : 'personne')}
      {edit && <div className="chips">{[...noms, ''].map(x => <button key={x || 'aucun'} className={`chip ${(e.apporteur.qui || '') === x ? 'on' : ''}`} onClick={() => maj({ apporteur: x })}>{x ? court(d, x) : 'Personne'}</button>)}</div>}
      {L('Opérateurs sur place', `− ${fr(e.operateurs.montant)}`, ops.length ? ops.map(x => court(d, x)).join(', ') : 'à choisir', e.operateurs.a_attribuer ? 'alerte' : '')}
      {edit && <div className="chips">{noms.map(x => <button key={x} className={`chip ${ops.includes(x) ? 'on' : ''}`} onClick={() => maj({ operateurs: ops.includes(x) ? ops.filter(y => y !== x) : [...ops, x] })}>{court(d, x)}</button>)}</div>}
      {L('Coût', `− ${fr(e.cout)}`, e.source === 'reel' ? 'dépensé' : `prévu ${fr(e.prevu)} · dépensé ${fr(e.depense)}${n(e.imprevus) ? ` · imprévus ${fr(e.imprevus)}` : ''}`)}
      {L('Marge nette', fr(e.marge), `${e.marge_pct} % du HT`, n(e.marge_pct) < 35 ? 'bas fort' : 'fort')}
      {ALLOC.map(([kk, t]) => <Alloc key={kk} cle={kk} titre={t} a={e.allocations[kk]} edit={edit} maj={maj} />)}
      {L(e.especes ? 'Reste à partager' : 'Reste dans Epicure', fr(e.reste), e.especes ? 'encaissé en espèces' : 'virement ou chèque : pas de partage', 'fort')}
      <div className="pa-3" style={{ marginTop: 14 }}>{d.associes.map(a => <div key={a.nom} className={a.nom === d.moi ? 'moi' : ''}><small>{a.court}</small><b>{fr(e.parts[a.nom])}</b></div>)}</div>
    </Sheet>
  )
}

function Alloc({ cle, titre, a, edit, maj }) {
  const [v, setV] = useState('')
  const [mad, setMad] = useState(false)
  useEffect(() => { setMad(a?.pct === null); setV(a?.pct === null ? String(a?.montant ?? '') : String(a?.pct ?? 0)) }, [a?.pct, a?.montant])
  const enreg = () => { const x = Number(String(v).replace(',', '.')); if (Number.isNaN(x)) return; maj({ allocations: { [cle]: mad ? { mad: x } : { pct: x } } }) }
  return (
    <div className="pa-l">
      <span>{titre}<small>{a?.pct === null ? 'en MAD' : `${String(a?.pct ?? 0).replace('.', ',')} %`}{a?.retouche ? ' · retouché' : ' · défaut'}</small></span>
      {edit ? <div className="pa-al"><input inputMode="decimal" value={v} onChange={x => setV(x.target.value)} onBlur={enreg} />
          <button onClick={() => setMad(!mad)}>{mad ? 'MAD' : '%'}</button>
          {a?.retouche && <button onClick={() => maj({ allocations: { [cle]: null } })} aria-label="Défaut">↺</button>}
          <b>− {fr(a?.montant)}</b></div>
        : <b>− {fr(a?.montant)}</b>}
    </div>
  )
}

function VerseSheet({ d, open, onClose, onFait }) {
  const ui = useUI()
  const [f, setF] = useState({ associe: '', montant: '', le: '', evenement_id: '', note: '' })
  useEffect(() => { if (open) setF({ associe: '', montant: '', le: new Date().toLocaleDateString('sv'), evenement_id: '', note: '' }) }, [open])
  const ok = f.associe && Number(f.montant) > 0
  const go = async () => { try { onFait(await api.partsVerser({ ...f, montant: Number(String(f.montant).replace(/\s/g, '')), annee: d.annee })); ui.toast('Versement noté') } catch (e) { ui.toast(e.message) } }
  return (
    <Sheet open={open} onClose={onClose} foot={<button className="btn primary" disabled={!ok} onClick={go}>Noter le versement</button>}>
      <h2>Versé à</h2>
      <div className="chips">{d.associes.map(a => <button key={a.nom} className={`chip ${f.associe === a.nom ? 'on' : ''}`} onClick={() => setF({ ...f, associe: a.nom })}>{a.court}</button>)}</div>
      <div className="cf-lbl">Montant</div><input className="pa-input" inputMode="numeric" value={f.montant} onChange={e => setF({ ...f, montant: e.target.value })} placeholder="MAD" />
      <div className="cf-lbl">Le</div><input className="pa-input" type="date" value={f.le} onChange={e => setF({ ...f, le: e.target.value })} />
      <div className="cf-lbl">Pour (facultatif)</div>
      <div className="chips">{d.evenements.map(e => <button key={e.id} className={`chip ${f.evenement_id === e.id ? 'on' : ''}`} onClick={() => setF({ ...f, evenement_id: f.evenement_id === e.id ? '' : e.id })}>{e.nom}</button>)}</div>
      <input className="pa-input" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Note (facultatif)" style={{ marginTop: 10 }} />
    </Sheet>
  )
}
