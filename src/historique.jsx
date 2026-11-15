import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, ddmm, useUI } from './ui'
import { Av } from './postes'

/* Corbeille (30 jours) et historique des changements : rien ne se perd, on voit qui a fait quoi */
const TYPES = { element: 'Ligne', action: 'Action', poste: 'Enveloppe', evenement: 'Événement' }
const CHAMPS = { cout: 'le coût', montant: 'le montant', qte: 'la quantité', prix: 'le prix', quand: 'la date', echeance: 'la date', qui: 'le responsable', resp: 'le responsable',
  nom: 'le nom', quoi: 'le nom', invites: 'les invités', date: 'la date', statut: 'le statut', paye: 'le paiement', lieu: 'le lieu', client: 'le client', mode: 'le mode' }
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const jour = (ts, today) => {
  const d = iso(new Date(ts)), h = new Date(today + 'T12:00:00'); h.setDate(h.getDate() - 1)
  if (d === today) return 'Aujourd\'hui'
  if (d === iso(h)) return 'Hier'
  return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][new Date(ts).getDay()] + ' ' + ddmm(d)
}
const heure = ts => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
const val = (v, champ) => v === null || v === undefined || v === '' ? '—' : champ === 'paye' ? (v === true || v === 'true' ? 'payé' : 'à payer')
  : /^\d{4}-\d\d-\d\d$/.test(v) ? ddmm(v) : !isNaN(v) && v !== true && v !== false ? Number(v).toLocaleString('fr-FR') : String(v)
const parJour = (items, today) => items.reduce((g, x) => { const j = jour(x.quand, today); (g[j] = g[j] || []).push(x); return g }, {})

function Tete({ go, retour, titre, info }) {
  return (
    <div className="head">
      <button className="back" onClick={() => go(retour)}>‹ Retour</button>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{titre}{info && <Info text={info} />}</h1>
    </div>
  )
}

/* ---------- Corbeille ---------- */
export function Corbeille({ data, go, tout: toutInit, reload }) {
  const ui = useUI()
  const [tout, setTout] = useState(!!toutInit)
  const [items, setItems] = useState(null)
  const charger = () => api.corbeilleListe(tout ? null : data.evt).then(setItems).catch(e => ui.toast(e.message))
  useEffect(() => { setItems(null); charger() }, [tout])
  async function remettre(c) {
    try {
      await api.objetRestaurer(c.id)
      setItems(x => x.filter(y => y.id !== c.id)); ui.toast(`${c.nom} est revenu`); reload?.()
    } catch (e) { ui.toast(e.message) }
  }
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Tete go={go} retour={toutInit ? 'accueil' : ''} titre="Corbeille" info="Ce qui est supprimé reste ici 30 jours. « Remettre » le replace exactement où il était, avec ses montants et ses actions." />
      <div className="chips hi-f">
        <button className={`chip ${!tout ? 'on' : ''}`} onClick={() => setTout(false)}>{ev.nom || 'Cet événement'}</button>
        <button className={`chip ${tout ? 'on' : ''}`} onClick={() => setTout(true)}>Tous les événements</button>
      </div>
      {!items ? <div className="empty">Chargement…</div> : !items.length ? <div className="empty">La corbeille est vide.</div> :
        Object.entries(parJour(items.map(c => ({ ...c, quand: c.supprime_le })), data.aujourdhui)).map(([j, cs]) => (
          <div key={j}>
            <div className="group">{j}</div>
            <div className="list">{cs.map(c => (
              <div key={c.id} className="row hi-c">
                <Av nom={c.supprime_par} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="name">{c.nom}</div>
                  <div className="info"><span className={`hi-t ${c.type}`}>{TYPES[c.type]}</span>{[c.lieu, tout && c.type !== 'evenement' ? c.evt_nom : null].filter(Boolean).join(' · ')}</div>
                  {c.jours_restants <= 7 && <div className="info hi-urg">Effacé dans {c.jours_restants} j</div>}
                </div>
                <motion.button whileTap={{ scale: .94 }} className="hi-r" onClick={() => remettre(c)}>Remettre</motion.button>
              </div>
            ))}</div>
          </div>
        ))}
    </motion.div>
  )
}

/* ---------- Historique des changements d'un événement ---------- */
function Phrase({ h }) {
  const nom = <b>{h.nom}</b>
  if (h.quoi === 'ajout') return <>a ajouté {nom}</>
  if (h.quoi === 'suppr') return <>a supprimé {nom}</>
  if (h.quoi === 'restaure') return <>a remis {nom}</>
  if (h.quoi === 'deplace') return <>a déplacé {nom}</>
  if (h.quoi === 'coche') return <>a coché {nom}</>
  return <>a changé {CHAMPS[h.champ] || h.champ} de {nom}</>
}
export function Historique({ data, go }) {
  const ui = useUI()
  const [items, setItems] = useState(null)
  const [qui, setQui] = useState(null)
  useEffect(() => { api.historique(data.evt).then(setItems).catch(e => ui.toast(e.message)) }, [])
  async function remettre(h) {
    try { await api.objetRestaurer(h.corbeille_id); setItems(x => x.map(y => y.id === h.id ? { ...y, restaure: true } : y)); ui.toast(`${h.nom} est revenu`) } catch (e) { ui.toast(e.message) }
  }
  const gens = items ? [...new Set(items.map(h => h.qui))] : []
  const vus = (items || []).filter(h => !qui || h.qui === qui)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Tete go={go} retour="" titre="Historique" info="Chaque ajout, correction, déplacement ou suppression sur cet événement, avec qui l'a fait et quand." />
      {gens.length > 1 && <div className="chips hi-f">
        <button className={`chip ${!qui ? 'on' : ''}`} onClick={() => setQui(null)}>Tout le monde</button>
        {gens.map(g => <button key={g} className={`chip ${qui === g ? 'on' : ''}`} onClick={() => setQui(qui === g ? null : g)}>{g}</button>)}
      </div>}
      {!items ? <div className="empty">Chargement…</div> : !vus.length ? <div className="empty">Aucun changement pour l'instant.</div> :
        Object.entries(parJour(vus, data.aujourdhui)).map(([j, hs]) => (
          <div key={j}>
            <div className="group">{j}</div>
            <div className="list">{hs.map(h => (
              <div key={h.id} className="row hi-h">
                <Av nom={h.qui} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hi-p">{h.qui} <Phrase h={h} /></div>
                  {h.quoi === 'modif' && <div className="hi-v"><s>{val(h.avant, h.champ)}</s> → <b>{val(h.apres, h.champ)}</b></div>}
                  {h.quoi === 'deplace' && <div className="hi-v">{h.avant} → <b>{h.apres}</b></div>}
                  <div className="info"><span className={`hi-t ${h.type}`}>{TYPES[h.type]}</span>{h.lieu ? `${h.lieu} · ` : ''}{heure(h.quand)}</div>
                </div>
                {h.quoi === 'suppr' && h.corbeille_id && !h.restaure && <motion.button whileTap={{ scale: .94 }} className="hi-r" onClick={() => remettre(h)}>Remettre</motion.button>}
              </div>
            ))}</div>
          </div>
        ))}
    </motion.div>
  )
}
