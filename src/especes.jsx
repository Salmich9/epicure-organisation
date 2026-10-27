import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, ddmm, n, useUI } from './ui'
// Espèces : montants exacts (pas d'arrondi en « k »)
const mad = v => Math.round(n(v)).toLocaleString('fr-FR')

/* Solde d'une enveloppe : même règle que la base (orga._reste) */
export function soldes(mvts) {
  const p = {}
  const g = nom => (p[nom] = p[nom] || { nom, remis: 0, depense: 0, reste: 0, attente: 0, n: 0, mvts: [] })
  mvts.forEach(m => {
    const x = g(m.titulaire); x.mvts.push(m)
    const v = n(m.montant), ok = m.statut === 'ok', vivant = m.statut !== 'refuse'
    if (m.type === 'remise') { if (ok) { x.remis += v; x.reste += v } else if (m.statut === 'a_confirmer') x.attente += v }
    if (m.type === 'transfert_in') { if (ok) { x.remis += v; x.reste += v } else if (m.statut === 'a_confirmer') x.attente += v }
    if (m.type === 'depense' && ok) { x.depense += v; x.reste -= v; x.n++ }
    if ((m.type === 'transfert_out' || m.type === 'rendu') && vivant) x.reste -= v
  })
  return Object.values(p)
}
const LIB = { remise: 'Remise', depense: 'Dépense', transfert_out: 'Passé à', transfert_in: 'Reçu de', rendu: 'Rendu' }

export function Especes({ data, go }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [e, setE] = useState(null)
  const [sheet, setSheet] = useState(null)
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  const [voir, setVoir] = useState(null)
  const charger = () => api.especesListe(data.evt).then(setE).catch(err => ui.toast(err.message))
  useEffect(() => { charger() }, [data.evt])

  const env = useMemo(() => e ? soldes(e.mouvements) : [], [e])
  if (!e) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const encaisse = e.encaissements.filter(x => (x.mode || 'Espèces') === 'Espèces').reduce((s, x) => s + n(x.montant), 0)
  const enEnv = e.mouvements.filter(m => m.type === 'remise' && m.statut !== 'refuse').reduce((s, m) => s + n(m.montant), 0) - e.mouvements.filter(m => m.type === 'rendu' && m.statut === 'ok').reduce((s, m) => s + n(m.montant), 0)
  const depense = e.mouvements.filter(m => m.type === 'depense' && m.statut === 'ok').reduce((s, m) => s + n(m.montant), 0)
  const porteur = nom => e.porteurs.find(p => p.nom === nom)

  async function encaisser() {
    const v = Number(String(f.montant || '').replace(/\s/g, '').replace(',', '.')); if (!(v > 0)) { ui.bubble('Tape le montant encaissé.'); return }
    setBusy(true)
    try { await api.encaissementAjouter(data.evt, v, f.date || data.aujourdhui, f.note || '', f.mode || 'Espèces'); ui.toast(`${mad(v)} MAD encaissés`); setSheet(null); setF({}); await charger() } catch (err) { ui.toast(err.message) }
    setBusy(false)
  }
  async function remettre() {
    const v = Number(String(f.montant || '').replace(/\s/g, '').replace(',', '.'))
    if (!f.nom) { ui.bubble('Choisis à qui tu confies l\'enveloppe.'); return }
    if (!(v > 0)) { ui.bubble('Tape le montant de l\'enveloppe.'); return }
    if (v > n(e.chez_salmane)) { ui.bubble(`Il ne reste que ${mad(e.chez_salmane)} MAD encaissés : note d'abord l'avance du client.`); return }
    setBusy(true)
    try {
      const r = await api.enveloppeRemettre(data.evt, f.nom, v)
      const p = porteur(f.nom)
      if (r.notifie) ui.toast(`${f.nom} doit confirmer sur le bot`)
      else ui.bubble(p?.code ? `${f.nom} n'est pas encore relié au bot : il envoie le code ${p.code} au bot GroupeTreso, puis confirme la remise.` : `Enveloppe notée. Le bot n'a pas pu prévenir ${f.nom} (${r.raison || '?'}).`)
      setSheet(null); setF({}); await charger()
    } catch (err) { ui.toast(err.message) }
    setBusy(false)
  }
  async function nouveauPorteur() {
    const nom = (f.nouveau || '').trim(); if (!nom) return
    try { const code = await api.porteurAjouter(nom); ui.bubble(`${nom} envoie le code ${code} au bot GroupeTreso pour être relié.`); setF(x => ({ ...x, nom, nouveau: '' })); await charger() } catch (err) { ui.toast(err.message) }
  }

  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ {ev.nom}</button>
        <h1 style={{ fontSize: 34 }}>Espèces</h1>
      </div>
      <div className="esp-k">
        <div><b>{mad(encaisse)}</b>encaissé du client</div>
        <div><b>{mad(depense)}</b>dépensé</div>
        <div><b>{mad(enEnv - depense)}</b>chez les porteurs</div>
        <div className="main"><b>{mad(e.chez_salmane)}</b>reste chez toi <Info text="Encaissé = dépensé + chez les porteurs + chez toi. Chez toi : l'encaissé, moins les enveloppes remises, plus ce qu'on t'a rendu." /></div>
      </div>

      <div className="group">Enveloppes</div>
      {!env.length && <div className="empty">Aucune enveloppe. Note d'abord l'avance du client, puis confie une enveloppe.</div>}
      {env.map(x => {
        const p = porteur(x.nom), base = x.remis || x.attente || 1
        return (
          <motion.button key={x.nom} className="who" whileTap={{ scale: .98 }} onClick={() => setVoir(x)}>
            <div className="t"><span>{x.nom}{x.attente > 0 && <span className="pend">À CONFIRMER</span>}{p && !p.relie && <span className="pend">PAS RELIÉ</span>}</span><b>{mad(x.remis + x.attente)}</b></div>
            <div className="s">{x.attente > 0 && !x.remis ? `${mad(x.attente)} à confirmer` : <>dépensé {mad(x.depense)} · {x.reste < 0 ? <span className="neg">on lui doit {mad(-x.reste)}</span> : `reste ${mad(x.reste)}`}{x.n ? ` · ${x.n} dépense${x.n > 1 ? 's' : ''}` : ''}</>}</div>
            <div className="bar"><i style={{ width: `${Math.min(100, (x.depense / base) * 100)}%`, background: x.reste < 0 ? 'var(--red)' : undefined }} /></div>
          </motion.button>
        )
      })}
      <div className="two"><motion.button whileTap={{ scale: .97 }} onClick={() => { setF({}); setSheet('enc') }}>+ Encaissement</motion.button><motion.button whileTap={{ scale: .97 }} className="p" onClick={() => { setF({}); setSheet('env') }}>+ Enveloppe</motion.button></div>

      {e.encaissements.length > 0 && <>
        <div className="group">Encaissements du client</div>
        <div className="list">{e.encaissements.map(x => <div key={x.id} className="row"><div className="top"><span className="name">{mad(x.montant)} MAD</span><span className="small mute">{x.mode || 'Espèces'} · {ddmm(x.date)}</span></div>{x.note && <div className="info">{x.note}</div>}</div>)}</div>
      </>}

      <Sheet open={sheet === 'enc'} onClose={() => setSheet(null)} foot={<button className="btn primary" disabled={busy} onClick={encaisser}>Noter</button>}>
        <div className="el-kicker">{ev.nom}</div>
        <div className="el-name" style={{ fontSize: 28 }}>Encaissement client</div>
        <div className="label">Montant reçu du client</div>
        <input inputMode="numeric" autoFocus value={f.montant || ''} onChange={x => setF({ ...f, montant: x.target.value })} placeholder="60 000" />
        <div className="label">Mode</div>
        <div className="chips">{['Espèces', 'Virement', 'Chèque'].map(m => <button key={m} className={`chip ${(f.mode || 'Espèces') === m ? 'on' : ''}`} onClick={() => setF({ ...f, mode: m })}>{m}</button>)}</div>
        <div className="label">Date</div>
        <input type="date" value={f.date || data.aujourdhui} onChange={x => setF({ ...f, date: x.target.value })} />
        <div className="label">Note</div>
        <input value={f.note || ''} onChange={x => setF({ ...f, note: x.target.value })} placeholder="avance, solde…" />
      </Sheet>

      <Sheet open={sheet === 'env'} onClose={() => setSheet(null)} foot={<button className="btn primary" disabled={busy} onClick={remettre}>{busy ? '…' : 'Confier'}</button>}>
        <div className="el-kicker">{ev.nom} · {mad(e.chez_salmane)} MAD chez toi</div>
        <div className="el-name" style={{ fontSize: 28 }}>Nouvelle enveloppe</div>
        <div className="label">À qui ?</div>
        <div className="chips">{e.porteurs.map(p => <button key={p.nom} className={`chip ${f.nom === p.nom ? 'on' : ''}`} onClick={() => setF({ ...f, nom: p.nom })}>{p.nom}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><input value={f.nouveau || ''} onChange={x => setF({ ...f, nouveau: x.target.value })} placeholder="Autre personne" /><button className="chip" onClick={nouveauPorteur}>Ajouter</button></div>
        <div className="label">Montant</div>
        <input inputMode="numeric" value={f.montant || ''} onChange={x => setF({ ...f, montant: x.target.value })} placeholder="5 000" />
        {f.nom && !porteur(f.nom)?.relie && <p className="small mute" style={{ marginTop: 10 }}>{f.nom} n'est pas encore relié au bot : il envoie <b>{porteur(f.nom)?.code}</b> au bot GroupeTreso.</p>}
      </Sheet>

      <Sheet open={!!voir} onClose={() => setVoir(null)}>
        {voir && <>
          <div className="el-kicker">{ev.nom}</div>
          <div className="el-name" style={{ fontSize: 28 }}>{voir.nom}</div>
          <div className="el-sub">{voir.reste < 0 ? `On lui doit ${mad(-voir.reste)} MAD` : `Il lui reste ${mad(voir.reste)} MAD`}{!porteur(voir.nom)?.relie && porteur(voir.nom)?.code ? ` · code bot ${porteur(voir.nom).code}` : ''}</div>
          <div className="list" style={{ margin: '14px 0 0' }}>{voir.mvts.map(m => (
            <div key={m.id} className="row"><div className="top"><span className="name">{LIB[m.type]}{m.motif ? ` · ${m.motif}` : ''}</span><span className={m.type === 'depense' || m.type === 'transfert_out' || m.type === 'rendu' ? 'neg-s' : ''}>{m.type === 'depense' || m.type === 'transfert_out' || m.type === 'rendu' ? '−' : '+'}{mad(m.montant)}</span></div>
              <div className="info">{ddmm(String(m.cree_le).slice(0, 10))}{m.statut === 'a_confirmer' ? ' · à confirmer' : m.statut === 'refuse' ? ' · refusé' : ''}</div></div>
          ))}</div>
        </>}
      </Sheet>
    </motion.div>
  )
}
