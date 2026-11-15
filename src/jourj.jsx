import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, dateLongue, n, useUI } from './ui'
import { Av } from './postes'
import { feliciter } from './envie'

/* Lot D : le jour J. Une frise heure par heure, et le brief que toute l'équipe lit en arrivant. */
const toMin = h => (h ? Number(String(h).slice(0, 2)) * 60 + Number(String(h).slice(3, 5)) : null)
const hh = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`
const carte = lieu => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`
const TYPES = { livraison: 'Livraison', creneau: 'Créneau', moment: 'Service', action: 'Action' }

// Tout ce qui se passe le jour J, avec une heure ; après minuit se range après 23 h
export function frise(data, rows) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const j = ev.date, out = []
  if (!j) return out
  for (const a of data.actions || []) {
    if (a.echeance !== j || a.statut === 'Annulé') continue
    const L = a.logistique || {}
    out.push({ k: a.id, type: L.mode ? 'livraison' : 'action', debut: a.heure, titre: a.quoi, sous: [L.mode === 'livre' ? 'livré' : L.mode === 'recuperer' ? 'à récupérer' : null, L.lieu, L.vehicule].filter(Boolean).join(' · '), qui: a.resp, fait: a.statut === 'Fait', a })
  }
  for (const r of rows || []) if (r.date === j) out.push({ k: 'P' + r.id, type: 'creneau', debut: r.heure, fin: r.fin, titre: r.titre, sous: [r.lieu, r.note].filter(Boolean).join(' · '), qui: r.qui, fait: !!r.fait, r })
  for (const d of data.deroule || []) if ((d.date || j) === j) out.push({ k: 'D' + d.id, type: 'moment', debut: d.debut, fin: d.fin, titre: d.moment, sous: [d.contenu, d.style].filter(x => x && x !== '—').join(' · '), fait: false })
  const cle = i => { const m = toMin(i.debut); return m === null ? 9999 : m < 360 ? m + 1440 : m }
  return out.sort((x, y) => cle(x) - cle(y))
}

function Maintenant({ items, now }) {
  const m = now < 360 ? now + 1440 : now
  const cle = i => { const v = toMin(i.debut); return v === null ? null : v < 360 ? v + 1440 : v }
  const enCours = items.filter(i => cle(i) !== null && cle(i) <= m && (toMin(i.fin) ? (toMin(i.fin) < 360 ? toMin(i.fin) + 1440 : toMin(i.fin)) > m : cle(i) + 30 > m) && !i.fait)
  const suivant = items.find(i => cle(i) !== null && cle(i) > m && !i.fait)
  if (!enCours.length && !suivant) return null
  return (
    <div className="jj-now">
      <div className="t">Maintenant · {hh(now)}</div>
      {enCours.length > 0 ? enCours.slice(0, 2).map(i => <b key={i.k}>{i.titre}{i.fin ? <small> jusqu'à {i.fin.slice(0, 5)}</small> : null}</b>) : <b>Rien en cours</b>}
      {suivant && <span>Ensuite : <b>{suivant.titre}</b> à {suivant.debut.slice(0, 5)} · dans {cle(suivant) - m} min</span>}
    </div>
  )
}

export function JourJ({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [rows, setRows] = useState(null)
  const [onglet, setOnglet] = useState('frise')
  const [brief, setBrief] = useState(null)
  const [loc, setLoc] = useState({})
  useEffect(() => { api.planningListe(data.evt).then(r => setRows(r.planning || [])).catch(() => setRows([])); api.brief(data.evt).then(setBrief).catch(() => setBrief({})) }, [data.evt])
  const items = useMemo(() => frise(data, rows).map(i => ({ ...i, fait: loc[i.k] ?? i.fait })), [data, rows, loc])
  const d = new Date(), now = d.getHours() * 60 + d.getMinutes()
  const cestAujourdhui = ev.date === data.aujourdhui
  async function cocher(i) {
    const f = !i.fait; if (f) feliciter()
    setLoc(x => ({ ...x, [i.k]: f }))
    try { if (i.a) await api.actionEnregistrer(data.evt, i.a.id, { fait: f }); else if (i.r) await api.planningEnregistrer(data.evt, i.r.id, { fait: f }) } catch (e) { ui.toast(e.message) }
  }
  const sansHeure = items.filter(i => !i.debut)
  const avecHeure = items.filter(i => i.debut)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button>
        <h1>Jour J</h1><div className="meta">{dateLongue(ev.date)}{ev.lieu ? ` · ${ev.lieu}` : ''}{ev.invites ? ` · ${ev.invites} invités` : ''}</div></div>
      <div className="au-seg"><button className={onglet === 'frise' ? 'on' : ''} onClick={() => setOnglet('frise')}>Heure par heure</button><button className={onglet === 'brief' ? 'on' : ''} onClick={() => setOnglet('brief')}>Brief de l'équipe</button></div>
      <div className="px">
        {onglet === 'frise' && <>
          {cestAujourdhui && <Maintenant items={avecHeure} now={now} />}
          {rows === null ? <div className="pv-vide">Chargement…</div> : !items.length ? <div className="pv-vide">Rien d'heure encore pour le jour J. Ajoute des créneaux dans Planning ou une heure aux actions.</div> : <>
            <div className="jj-f">
              {avecHeure.map((i, x) => { const m = toMin(i.debut), passe = cestAujourdhui && (m < 360 ? m + 1440 : m) < (now < 360 ? now + 1440 : now)
                const prev = x > 0 ? toMin(avecHeure[x - 1].debut) : null, nouvelleHeure = prev === null || Math.floor(prev / 60) !== Math.floor(m / 60)
                return <div key={i.k} className={`jj-i ${i.type} ${i.fait ? 'fait' : ''} ${passe ? 'passe' : ''}`}>
                  <div className="h">{nouvelleHeure ? i.debut.slice(0, 5) : ''}</div>
                  <div className="b">
                    <div className="l1"><i className={`jj-t ${i.type}`}>{TYPES[i.type]}</i><b>{i.titre}</b></div>
                    <span>{[i.fin ? `${i.debut.slice(0, 5)} → ${i.fin.slice(0, 5)}` : i.debut.slice(0, 5), i.sous].filter(Boolean).join(' · ')}</span>
                  </div>
                  {i.qui && <Av nom={i.qui} size={26} />}
                  {i.type !== 'moment' && <motion.button whileTap={{ scale: .85 }} className={`pv-ck ${i.fait ? 'on' : ''}`} onClick={() => cocher(i)} aria-label="Fait" />}
                </div> })}
            </div>
            {sansHeure.length > 0 && <><div className="pv-st">SANS HEURE · {sansHeure.length}</div>
              {sansHeure.map(i => <div key={i.k} className={`jj-i ${i.fait ? 'fait' : ''}`}><div className="h" /><div className="b"><div className="l1"><i className={`jj-t ${i.type}`}>{TYPES[i.type]}</i><b>{i.titre}</b></div><span>{i.sous}</span></div>{i.qui && <Av nom={i.qui} size={26} />}<motion.button whileTap={{ scale: .85 }} className={`pv-ck ${i.fait ? 'on' : ''}`} onClick={() => cocher(i)} aria-label="Fait" /></div>)}</>}
          </>}
          <button className="pv-plus" style={{ marginTop: 14 }} onClick={() => go('planning')}>Ajouter ou déplacer dans Planning ›</button>
        </>}
        {onglet === 'brief' && <Brief data={data} ev={ev} items={items} brief={brief} />}
      </div>
    </motion.div>
  )
}

function Brief({ data, ev, items, brief }) {
  const parPersonne = {}
  for (const p of data.postes || []) if (p.resp) (parPersonne[p.resp] = parPersonne[p.resp] || { env: [], quoi: [] }).env.push(p.nom)
  for (const i of items) if (i.qui) (parPersonne[i.qui] = parPersonne[i.qui] || { env: [], quoi: [] }).quoi.push(i)
  const arrivee = (items.find(i => i.debut && i.type === 'creneau') || items.find(i => i.debut))?.debut
  const manques = (data.elements || []).filter(e => ['Partiel', 'Non reçu'].includes(e.reception))
  const contacts = [...new Map((data.actions || []).filter(a => a.logistique?.contact).map(a => [a.logistique.contact, a])).values()]
  const staff = brief?.staff || []
  const texte = () => {
    let t = `📋 *Brief · ${ev.nom}*\n${dateLongue(ev.date)}${ev.lieu ? ` · ${ev.lieu}` : ''}${ev.invites ? ` · ${ev.invites} invités` : ''}\n`
    if (arrivee) t += `Arrivée de l'équipe : ${arrivee.slice(0, 5)}\n`
    t += '\n*Qui fait quoi*\n'
    Object.entries(parPersonne).forEach(([nom, x]) => { t += `• ${nom}${x.env.length ? ` · ${x.env.join(', ')}` : ''}${x.quoi.length ? ` : ${x.quoi.map(i => `${i.debut ? i.debut.slice(0, 5) + ' ' : ''}${i.titre}`).join(' ; ')}` : ''}\n` })
    if (staff.length) t += `\n*Extras* (${staff.length})\n` + staff.map(s => `• ${s.nom}${s.poste ? ` · ${s.poste}` : ''}`).join('\n') + '\n'
    if (manques.length) t += `\n*À surveiller*\n` + manques.map(e => `• ${e.element} : ${e.reception.toLowerCase()}${e.manque ? `, manque ${e.manque}` : ''}`).join('\n') + '\n'
    return t.trim()
  }
  return <>
    <div className="bf-c">
      {ev.lieu && <a className="bf-lieu" href={carte(ev.lieu)} target="_blank" rel="noreferrer">📍 {ev.lieu}<span>Itinéraire ›</span></a>}
      <div className="bf-k"><div><b>{arrivee ? arrivee.slice(0, 5) : '—'}</b>arrivée équipe</div><div><b>{ev.invites || '—'}</b>invités</div><div><b>{Object.keys(parPersonne).length + staff.length}</b>personnes</div></div>
    </div>
    <div className="pv-st">QUI FAIT QUOI <Info text="Tiré des enveloppes (qui les tient) et des créneaux et actions du jour J, avec leur heure." /></div>
    {Object.entries(parPersonne).map(([nom, x]) => (
      <div key={nom} className="bf-p"><Av nom={nom} size={34} />
        <div className="x"><b>{nom}</b>{x.env.length > 0 && <span className="env">{x.env.join(' · ')}</span>}
          {x.quoi.map(i => <span key={i.k} className="q">{i.debut ? <em>{i.debut.slice(0, 5)}</em> : null}{i.titre}</span>)}</div>
      </div>))}
    {staff.length > 0 && <><div className="pv-st">EXTRAS · {staff.length}</div>
      <div className="bf-s">{staff.map(s => <span key={s.nom}><Av nom={s.nom} size={22} />{s.nom}{s.poste ? <em>{s.poste}</em> : null}</span>)}</div></>}
    {manques.length > 0 && <><div className="pv-st rouge">À SURVEILLER · {manques.length}</div>
      {manques.map(e => <div key={e.id} className="bf-w">{e.element} · {e.reception.toLowerCase()}{e.manque ? `, manque ${e.manque}` : ''}</div>)}</>}
    {contacts.length > 0 && <><div className="pv-st">CONTACTS</div>
      {contacts.map(a => <div key={a.id} className="bf-w neutre">☎ {a.logistique.contact}<span>{a.quoi}</span></div>)}</>}
    <button className="btn primary block" style={{ marginTop: 18 }} onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texte())}`, '_blank')}>Envoyer le brief sur WhatsApp</button>
  </>
}
