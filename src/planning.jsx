import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from './api'
import { sendWa } from './element'
import { OUVERT, Sheet, ddmm, n, useUI } from './ui'
import { Picker } from './element'

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
const iso = d => d.toISOString().slice(0, 10)
const addDays = (s, k) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + k); return iso(d) }
const diff = (a, b) => Math.round((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / 864e5)
const jLabel = (date, evDate) => { const k = diff(date, evDate); return k === 0 ? 'J' : k < 0 ? `J${k}` : `J+${k}` }
const jour = s => { const d = new Date(s + 'T12:00:00Z'); return `${JOURS[d.getUTCDay()]} ${ddmm(s)}` }
const toMin = h => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : null)
const toH = m => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`

/* Tout ce qui a une date, rassemblé en une seule liste */
export function construire(data, rows, factures) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const out = []
  rows.forEach(r => out.push({ key: r.id, kind: 'planning', date: r.date, heure: r.heure, titre: r.titre, sous: [r.lieu, r.note].filter(Boolean).join(' · '), qui: r.qui, fait: r.fait, ref: r }))
  data.actions.filter(a => a.echeance && a.statut !== 'Annulé').forEach(a => out.push({ key: a.id, kind: 'action', date: a.echeance, heure: null, titre: a.quoi, sous: 'Action', qui: a.resp, fait: a.statut === 'Fait', ref: a }))
  if (ev.date) data.deroule.forEach(d => out.push({ key: `D${d.id}`, kind: 'deroule', date: d.date || ev.date, heure: d.debut, titre: d.moment, sous: [d.contenu, d.style].filter(x => x && x !== '—').join(' · '), qui: null, fait: false, ref: d }))
  const avecAction = new Set(data.actions.map(a => a.element_id).filter(Boolean))
  const groupes = {}
  data.elements.filter(e => e.echeance && OUVERT.includes(e.etat) && !avecAction.has(e.id)).forEach(e => {
    const k = `${e.echeance}|${e.resp || ''}|${e.zone}`; (groupes[k] = groupes[k] || []).push(e)
  })
  Object.entries(groupes).forEach(([k, l]) => {
    const [date, resp, zone] = k.split('|')
    out.push({ key: `E${k}`, kind: 'echeance', date, heure: null, titre: l.length > 1 ? `${l.length} éléments de ${zone} à couvrir` : `${l[0].element} à couvrir`, sous: 'Échéance', qui: resp || null, fait: false, ref: l })
  })
  data.elements.filter(e => e.livraison).forEach(e => out.push({ key: `L${e.id}`, kind: 'livraison', date: e.livraison, heure: null, titre: `Livraison : ${e.element}`, sous: e.fournisseur || '', qui: e.resp, fait: e.reception === 'Reçu', ref: [e] }))
  const recus = {}
  factures.filter(f => f.date).forEach(f => { (recus[f.date] = recus[f.date] || new Set()).add(f.fournisseur) })
  Object.entries(recus).forEach(([d, s]) => out.push({ key: `R${d}`, kind: 'reception', date: d, heure: null, titre: `${s.size > 1 ? `${s.size} réceptions` : 'Réception'} : ${[...s].join(', ')}`, sous: '', qui: null, fait: true, ref: null }))
  // Le soir du jour J déborde après minuit : 00 h à 06 h se range après 23 h.
  const cle = i => { const m = toMin(i.heure); return m === null ? -1 : (i.date === ev.date && m < 360 ? m + 1440 : m) }
  return out.sort((a, b) => a.date.localeCompare(b.date) || cle(a) - cle(b))
}

export function texteWhatsApp(data, items, titre) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const parJour = {}
  items.forEach(i => { (parJour[i.date] = parJour[i.date] || []).push(i) })
  let t = `📅 *${ev.nom}${ev.date ? ` · ${jour(ev.date)}` : ''}*\n${ev.invites ? `${ev.invites} invités` : ''}${titre ? ` · ${titre}` : ''}\n`
  Object.keys(parJour).sort().forEach(d => {
    t += `\n*${ev.date ? jLabel(d, ev.date).toUpperCase() : ''} · ${jour(d)}*\n`
    parJour[d].forEach(i => { t += `${i.fait ? '✓ ' : ''}${i.heure ? `${i.heure} · ` : '• '}${i.titre}${i.qui ? ` (${i.qui})` : ''}\n` })
  })
  return t.trim()
}

function pdf(data, items, titre) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const parJour = {}
  items.forEach(i => { (parJour[i.date] = parJour[i.date] || []).push(i) })
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const body = Object.keys(parJour).sort().map(d => `<section><h2><span>${ev.date ? jLabel(d, ev.date) : ''}</span> ${jour(d)}</h2><table>${parJour[d].map(i =>
    `<tr class="${i.fait ? 'f' : ''}"><td class="h">${i.heure || ''}</td><td>${esc(i.titre)}${i.sous ? `<small>${esc(i.sous)}</small>` : ''}</td><td class="q">${esc(i.qui || '')}</td></tr>`).join('')}</table></section>`).join('')
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planning ${esc(ev.nom)}</title><style>
    body{font-family:Georgia,serif;color:#1D2B24;margin:32px}h1{font-weight:400;font-size:30px;margin:0}p.m{color:#77837C;margin:4px 0 20px;font-family:Helvetica,Arial,sans-serif;font-size:13px}
    section{break-inside:avoid;margin-bottom:16px}h2{font-weight:400;font-size:18px;border-bottom:1px solid #DDE2DC;padding-bottom:4px;margin:0 0 6px}h2 span{color:#1F6F6B;margin-right:6px}
    table{width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:12.5px}td{padding:5px 6px;vertical-align:top;border-bottom:1px solid #F0F2EF}
    td.h{width:52px;font-weight:700;color:#1F6F6B}td.q{width:90px;text-align:right;color:#77837C}small{display:block;color:#77837C;font-size:11px}tr.f td{color:#A3ACA6;text-decoration:line-through}
  </style></head><body><h1>${esc(ev.nom)}</h1><p class="m">${ev.date ? jour(ev.date) : ''}${ev.invites ? ` · ${ev.invites} invités` : ''}${titre ? ` · ${esc(titre)}` : ''}</p>${body}
  <script>setTimeout(()=>print(),300)</script></body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

/* ---------- Édition d'un créneau ---------- */
function Editeur({ item, data, evDate, onClose, onSaved, onDelete, onDup }) {
  const ui = useUI()
  const [f, setF] = useState(null)
  const [decaler, setDecaler] = useState(false)
  const [picker, setPicker] = useState(false)
  const [autreMin, setAutreMin] = useState(false)
  const joursRef = useRef(null)
  useEffect(() => {
    if (!item) return
    setF({ titre: item.titre || '', date: item.date || data.aujourdhui, heure: item.heure || '', qui: item.qui || '', lieu: item.ref?.lieu || '', note: item.ref?.note || '', rappel: !!item.ref?.rappel })
    setDecaler(false); setAutreMin(false)
  }, [item])
  useEffect(() => { setTimeout(() => joursRef.current?.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 50) }, [f?.date, item])
  if (!item || !f) return <Sheet open={false} onClose={onClose} />
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const jours = []
  for (let k = -30; k <= 5; k++) jours.push(addDays(evDate, k))
  const hh = f.heure ? f.heure.slice(0, 2) : null
  const mm = f.heure ? f.heure.slice(3, 5) : null
  const equipe = data.intervenants.filter(i => i.type === 'Équipe').map(i => i.nom)
  const nouveau = !item.key
  const kind = item.kind || 'planning'
  async function save() {
    if (!f.titre.trim()) { ui.bubble('Donnez un titre au créneau.'); return }
    try { await onSaved(item, f, decaler); onClose() } catch (e) { ui.toast(e.message) }
  }
  return (
    <>
      <Sheet open onClose={onClose} foot={<>
        {!nouveau && kind === 'planning' && <button className="btn" style={{ flex: 'none', padding: '16px 14px' }} onClick={() => onDelete(item)}>Supprimer</button>}
        {!nouveau && <button className="btn" onClick={() => onDup(item, f)}>Dupliquer</button>}
        <button className="btn primary" onClick={save}>Enregistrer</button></>}>
        <div className="el-kicker">{nouveau ? 'Nouveau créneau' : kind === 'action' ? 'Action' : kind === 'deroule' ? 'Déroulé du jour J' : 'Créneau'}</div>
        <input value={f.titre} onChange={e => set('titre', e.target.value)} placeholder="ex : Livraison location art de table" style={{ marginTop: 10, fontWeight: 650 }} autoFocus={nouveau} />

        <div className="label">Quel jour</div>
        <div className="scroller" ref={joursRef}>
          {jours.map(d => (
            <button key={d} className={`daychip ${f.date === d ? 'on' : ''} ${d === data.aujourdhui ? 'today' : ''}`} onClick={() => set('date', d)}>
              <b>{jLabel(d, evDate)}</b><span>{jour(d)}</span>
            </button>
          ))}
        </div>
        <input type="date" value={f.date} onChange={e => e.target.value && set('date', e.target.value)} style={{ marginTop: 8, padding: '9px 12px' }} />

        <div className="label">À quelle heure</div>
        <div className="scroller">
          <button className={`chip ${!f.heure ? 'on' : ''}`} onClick={() => set('heure', '')}>Sans heure</button>
          {[...Array(24).keys()].map(h => (h + 6) % 24).map(h => { const s = String(h).padStart(2, '0'); return <button key={s} className={`chip ${hh === s ? 'on' : ''}`} onClick={() => set('heure', `${s}:${mm || '00'}`)}>{s} h</button> })}
        </div>
        {f.heure && <>
          <div className="scroller" style={{ marginTop: 8 }}>
            {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map(m => <button key={m} className={`chip ${mm === m ? 'on' : ''}`} onClick={() => set('heure', `${hh}:${m}`)}>:{m}</button>)}
            <button className={`chip ${autreMin ? 'on' : 'ghost'}`} onClick={() => setAutreMin(true)}>Exacte…</button>
          </div>
          {autreMin && <input type="time" step="60" value={f.heure} onChange={e => e.target.value && set('heure', e.target.value.slice(0, 5))} style={{ marginTop: 8, padding: '9px 12px' }} />}
          <div className="small mute" style={{ marginTop: 8 }}>{jour(f.date)} à <b style={{ color: 'var(--ink)' }}>{f.heure.replace(':', ' h ')}</b></div>
        </>}

        {kind !== 'deroule' && <>
          <div className="label">Qui</div>
          <div className="chips">
            {equipe.map(x => <button key={x} className={`chip ${f.qui === x ? 'on' : ''}`} onClick={() => set('qui', f.qui === x ? '' : x)}>{x}</button>)}
            <button className={`chip ${f.qui && !equipe.includes(f.qui) ? 'on' : 'ghost'}`} onClick={() => setPicker(true)}>{f.qui && !equipe.includes(f.qui) ? f.qui : 'Autre…'}</button>
          </div>
        </>}
        {kind === 'planning' && <>
          <div className="field"><span>Où</span><input value={f.lieu} onChange={e => set('lieu', e.target.value)} placeholder="ex : back-office, entrée livraison" /></div>
          <button className="toggle" onClick={() => set('rappel', !f.rappel)}><span>Rappel WhatsApp la veille</span><i className={f.rappel ? 'on' : ''} /></button>
        </>}
        {!nouveau && item.heure && f.heure && f.heure !== item.heure && (
          <button className="toggle" onClick={() => setDecaler(d => !d)}><span>Décaler aussi la suite de ce jour ({toMin(f.heure) - toMin(item.heure) > 0 ? '+' : ''}{toMin(f.heure) - toMin(item.heure)} min)</span><i className={decaler ? 'on' : ''} /></button>
        )}
        {kind !== 'deroule' && <div className="field"><span>Note</span><textarea rows={2} value={f.note} onChange={e => set('note', e.target.value)} /></div>}
      </Sheet>
      <Picker open={picker} onClose={() => setPicker(false)} title="Qui" items={data.intervenants.map(i => i.nom)} value={f.qui} onPick={v => set('qui', v)} />
    </>
  )
}

let CACHE = null

/* ---------- Écran planning ---------- */
export function Planning({ data, reload, open, go }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const evDate = ev.date || data.aujourdhui
  const [rows, setRows] = useState([])
  const [factures, setFactures] = useState([])
  const [vue, setVue] = useState('avenir')
  const [mine, setMine] = useState(false)
  const [edit, setEdit] = useState(null)
  const [share, setShare] = useState(false)
  const [shareVue, setShareVue] = useState('avenir')
  const [sharePers, setSharePers] = useState('')
  const [ouverts, setOuverts] = useState({})
  const [sugg, setSugg] = useState(null)
  const [ecartees, setEcartees] = useState([])

  async function charger() {
    try { const r = await api.planningListe(data.evt); setRows(r.planning || []); setFactures(r.factures || []) } catch (e) { ui.toast(e.message) }
  }
  useEffect(() => { charger() }, [data.evt])
  useEffect(() => {
    if (CACHE && CACHE.evt === data.evt && Date.now() - CACHE.t < 15 * 60e3) { CACHE.p.then(r => setSugg(r.creneaux || [])).catch(() => setSugg([])); return }
    const p = api.copilote('planning'); CACHE = { evt: data.evt, t: Date.now(), p }
    p.then(r => setSugg(r.creneaux || [])).catch(() => setSugg([]))
  }, [data.evt])

  const tous = useMemo(() => construire(data, rows, factures), [data, rows, factures])
  const debut = addDays(evDate, -30), fin = addDays(evDate, 5)
  const filtre = (v, pers) => tous.filter(i => i.date >= debut && i.date <= fin).filter(i => {
    if (pers && i.qui !== pers) return false
    if (v === 'avenir') return i.date >= data.aujourdhui
    if (v === 'semaine') return i.date >= data.aujourdhui && i.date <= addDays(data.aujourdhui, 7)
    if (v === 'jourj') return i.date === evDate
    if (v === 'apres') return i.date > evDate
    return true
  })
  const items = filtre(vue, mine ? data.moi : null)

  // jours à afficher : seulement ceux qui ont quelque chose ; les jours passés et faits se replient
  const parJour = {}
  items.forEach(i => { (parJour[i.date] = parJour[i.date] || []).push(i) })
  const dates = Object.keys(parJour).sort()
  const blocs = []
  let passe = []
  dates.forEach(d => {
    const tousFaits = parJour[d].every(i => i.fait)
    if (d < data.aujourdhui && tousFaits && !ouverts[d]) passe.push(d)
    else { if (passe.length) { blocs.push({ type: 'replie', dates: passe }); passe = [] } blocs.push({ type: 'jour', date: d }) }
  })
  if (passe.length) blocs.push({ type: 'replie', dates: passe })
  const suggestions = (sugg || []).filter((s, k) => !ecartees.includes(k)).map((s, k) => ({ ...s, k }))
  const demain = addDays(data.aujourdhui, 1)
  const rappels = rows.filter(r => r.rappel && r.date === demain && !r.fait && r.qui)

  async function enregistrer(item, f, decaler) {
    const p = { titre: f.titre, date: f.date, heure: f.heure, qui: f.qui, lieu: f.lieu, note: f.note, rappel: f.rappel }
    if (!item.key || item.kind === 'planning') await api.planningEnregistrer(data.evt, item.key || null, p)
    else if (item.kind === 'action') await api.actionModifier(item.ref.id, p)
    else if (item.kind === 'deroule') await api.derouleModifier(item.ref.id, p)
    if (decaler && item.heure && f.heure) {
      const delta = toMin(f.heure) - toMin(item.heure)
      const suite = tous.filter(i => i.date === item.date && i.key !== item.key && i.heure && toMin(i.heure) > toMin(item.heure))
      for (const i of suite) {
        const h = toH(toMin(i.heure) + delta)
        if (i.kind === 'planning') await api.planningEnregistrer(data.evt, i.key, { heure: h })
        else if (i.kind === 'deroule') await api.derouleModifier(i.ref.id, { heure: h })
      }
      ui.toast(`${suite.length} créneau${suite.length > 1 ? 'x' : ''} décalé${suite.length > 1 ? 's' : ''}`)
    } else ui.toast('Enregistré')
    await charger(); reload()
  }
  async function supprimer(item) { await api.planningSupprimer(item.key); setEdit(null); ui.toast('Supprimé'); charger() }
  async function dupliquer(item, f) { await api.planningEnregistrer(data.evt, null, { ...f, titre: f.titre }); setEdit(null); ui.toast('Dupliqué'); charger() }
  async function cocher(i) {
    if (i.kind === 'planning') { await api.planningEnregistrer(data.evt, i.key, { fait: !i.fait }); charger() }
    else if (i.kind === 'action') { await api.actionModifier(i.ref.id, { fait: !i.fait }); reload() }
  }
  async function accepter(s) {
    await api.planningEnregistrer(data.evt, null, { titre: s.titre, date: s.date, heure: s.heure || '', qui: s.qui || '', source: 'copilote' })
    setEcartees(e => [...e, s.k]); ui.toast('Ajouté au planning'); charger()
  }
  function toucher(i) {
    if (['planning', 'action', 'deroule'].includes(i.kind)) setEdit(i)
    else if (i.ref?.length === 1) open(i.ref[0])
    else if (i.ref?.length) go(`zone/${data.zones.findIndex(z => z.nom === i.ref[0].zone)}`)
  }
  const shareItems = filtre(shareVue, sharePers || null)
  const shareTitre = { avenir: 'à venir', semaine: 'cette semaine', jourj: 'jour J', apres: 'après', tout: '' }[shareVue] + (sharePers ? ` · ${sharePers}` : '')

  const Sugg = ({ s }) => (
    <motion.div layout className="cop-inline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <b>Copilote</b> · {s.constat} Je mets « {s.titre} » {jLabel(s.date, evDate)}{s.heure ? ` à ${s.heure.replace(':', ' h ')}` : ''}{s.qui ? `, pour ${s.qui}` : ''} ?
      <div className="a">
        <button onClick={() => accepter(s)}>Oui</button>
        <button className="g" onClick={() => setEdit({ kind: 'planning', titre: s.titre, date: s.date, heure: s.heure, qui: s.qui })}>Ajuster</button>
        <button className="g" onClick={() => setEcartees(e => [...e, s.k])}>Plus tard</button>
      </div>
    </motion.div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><h1>Planning</h1><div className="meta">{ev.nom}{ev.date ? ` · ${jour(ev.date)}` : ''}</div></div>
        <button className="btn primary" style={{ flex: 'none', padding: '10px 16px', fontSize: 13.5 }} onClick={() => setShare(true)}>Partager</button>
      </div>
      <div className="scroller" style={{ padding: '14px 16px 0' }}>
        {[['tout', 'J-30 à J+5'], ['avenir', 'À venir'], ['semaine', 'Cette semaine'], ['jourj', 'Jour J'], ['apres', 'Après']].map(([k, l]) =>
          <button key={k} className={`chip ${vue === k ? 'on' : ''}`} onClick={() => setVue(k)}>{l}</button>)}
        <button className={`chip ${mine ? 'on' : 'ghost'}`} onClick={() => setMine(m => !m)}>Ma part</button>
      </div>

      {rappels.length > 0 && <div className="rappels">
        <div className="small" style={{ fontWeight: 700 }}>Rappels à envoyer pour demain</div>
        {rappels.map(r => <div key={r.id} className="row-top" style={{ marginTop: 8 }}><span className="small">{r.heure ? `${r.heure} · ` : ''}{r.titre} ({r.qui})</span>
          <button className="wa-btn" onClick={() => sendWa(data, { resp: r.qui }, `Salam ${r.qui}, petit rappel pour demain${r.heure ? ` à ${r.heure.replace(':', ' h ')}` : ''} : ${r.titre}${r.lieu ? ` (${r.lieu})` : ''}. Merci 🙏`)}>Envoyer</button></div>)}
      </div>}

      <div className="timeline">
        {sugg === null && <div className="small mute" style={{ padding: '10px 4px' }}>Le copilote inspecte le planning…</div>}
        {suggestions.filter(s => !s.date || s.date < (dates[0] || '9999')).map(s => <Sugg key={s.k} s={s} />)}
        {!blocs.length && <div className="empty">Rien de prévu sur cette période. Touchez + pour ajouter un créneau.</div>}
        {blocs.map((b, bi) => b.type === 'replie' ? (
          <button key={`r${bi}`} className="gapline" onClick={() => setOuverts(o => ({ ...o, ...Object.fromEntries(b.dates.map(d => [d, true])) }))}>
            {jLabel(b.dates[0], evDate)}{b.dates.length > 1 ? ` à ${jLabel(b.dates.at(-1), evDate)}` : ''} · {b.dates.reduce((s, d) => s + parJour[d].length, 0)} faits ▾
          </button>
        ) : (
          <div key={b.date}>
            {b.date >= data.aujourdhui && (bi === 0 || blocs[bi - 1].type === 'replie' || blocs[bi - 1].date < data.aujourdhui) && <div className="now"><span>Aujourd'hui · {jLabel(data.aujourdhui, evDate)}</span></div>}
            <div className={`dayrow ${b.date === data.aujourdhui ? 'today' : ''} ${b.date === evDate ? 'jj' : ''}`}>
              <div className="j"><b>{jLabel(b.date, evDate)}</b><span>{jour(b.date)}</span></div>
              <div className="items">
                {parJour[b.date].map(i => {
                  const late = !i.fait && i.date < data.aujourdhui
                  return (
                    <motion.div layout key={i.key} className={`slot ${i.fait ? 'done' : ''} ${late ? 'late' : ''} ${i.kind === 'deroule' ? 'jjs' : ''}`}>
                      {['planning', 'action'].includes(i.kind)
                        ? <button className={`tick ${i.fait ? 'on' : ''}`} onClick={() => cocher(i)}>{i.fait ? '✓' : ''}</button>
                        : <span className="t">{i.fait ? '✓' : ''}</span>}
                      <button className="x" onClick={() => toucher(i)}>
                        {i.heure && <em>{i.heure}</em>}{i.titre}
                        {(i.sous || late) && <span>{late ? 'En retard' : ''}{late && i.sous ? ' · ' : ''}{i.sous}</span>}
                      </button>
                      {i.qui && <span className="w">{i.qui}</span>}
                    </motion.div>
                  )
                })}
              </div>
            </div>
            {suggestions.filter(s => s.date === b.date || (s.date > b.date && (!dates[dates.indexOf(b.date) + 1] || s.date < dates[dates.indexOf(b.date) + 1]))).map(s => <Sugg key={s.k} s={s} />)}
          </div>
        ))}
      </div>

      <motion.button className="fab" whileTap={{ scale: .9 }} onClick={() => setEdit({ kind: 'planning', date: vue === 'jourj' ? evDate : data.aujourdhui })} aria-label="Ajouter un créneau">+</motion.button>

      <Editeur item={edit} data={data} evDate={evDate} onClose={() => setEdit(null)} onSaved={enregistrer} onDelete={supprimer} onDup={dupliquer} />

      <Sheet open={share} onClose={() => setShare(false)} foot={<>
        <button className="btn" onClick={() => pdf(data, shareItems, shareTitre)}>PDF</button>
        <button className="btn wa" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(texteWhatsApp(data, shareItems, shareTitre))}`, '_blank')}>WhatsApp</button></>}>
        <div className="label" style={{ marginTop: 4 }}>Quoi</div>
        <div className="chips">{[['avenir', 'À venir'], ['jourj', 'Jour J'], ['semaine', 'Cette semaine'], ['tout', 'Tout']].map(([k, l]) => <button key={k} className={`chip ${shareVue === k ? 'on' : ''}`} onClick={() => setShareVue(k)}>{l}</button>)}</div>
        <div className="label">Pour qui</div>
        <div className="chips"><button className={`chip ${!sharePers ? 'on' : ''}`} onClick={() => setSharePers('')}>Tout le monde</button>
          {[...new Set(tous.map(i => i.qui).filter(Boolean))].map(p => <button key={p} className={`chip ${sharePers === p ? 'on' : ''}`} onClick={() => setSharePers(p)}>{p}</button>)}</div>
        <div className="label">Aperçu</div>
        <pre className="preview">{shareItems.length ? texteWhatsApp(data, shareItems, shareTitre) : 'Rien sur cette sélection.'}</pre>
      </Sheet>
    </motion.div>
  )
}
