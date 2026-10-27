import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, dans, dateLongue, envZone, n, useUI } from './ui'
import { Rail } from './cycle'

/* Bilan de clôture : résultat, prévu / réel, leçons, check-list. Une seule source : les pièces imputées. */
const TVA = { Epicure: 20, 'Business Boys': 10 }
const mt = v => Math.round(n(v)).toLocaleString('fr-FR')
const dec = v => Number(n(v)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const pc = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const slide = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }

export function calculBilan(data, b) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const prix = n(ev.prix_signe || ev.prix)
  const ttc = prix * (1 + (TVA[ev.entite] || 0) / 100)
  const zones = data.zones.map((z, i) => {
    const els = data.elements.filter(e => e.zone === z.nom)
    const reel = els.reduce((s, e) => s + n(e.facture), 0), engage = els.reduce((s, e) => s + n(e.cout), 0)
    return { nom: z.nom, i, prevu: envZone(z, ev), reel, engage }
  }).filter(z => z.prevu > 0 || z.reel > 0 || z.engage > 0)
  const reel = zones.reduce((s, z) => s + z.reel, 0)
  const budget = n(ev.budget) || zones.reduce((s, z) => s + z.prevu, 0)
  const sansPiece = zones.filter(z => !z.reel && z.engage > 0)
  const encaisse = n(b?.encaissements)
  const reste = Math.max(0, Math.round(ttc - encaisse))
  const env = (b?.enveloppes || []).filter(x => Math.round(n(x.reste)) !== 0 || x.attente)
  const coche = ev.bilan || {}
  const checks = [
    { k: 'enc', ok: ttc > 0 && reste <= Math.max(1, ttc * 0.005), t: reste ? `Reste ${mt(reste)} à encaisser` : 'Tout est encaissé', s: `${mt(encaisse)}${TVA[ev.entite] ? ' TTC' : ''} sur ${mt(ttc)}`, go: 'especes' },
    { k: 'pieces', ok: !n(b?.pieces_a_imputer), t: n(b?.pieces_a_imputer) ? `${b.pieces_a_imputer} pièce${b.pieces_a_imputer > 1 ? 's' : ''} à imputer` : 'Toutes les pièces imputées', s: sansPiece.length ? `sans pièce : ${sansPiece.map(z => z.nom).join(', ')}` : 'le coût réel est complet', go: 'pieces' },
    { k: 'env', ok: !env.length, t: env.length ? `${env.length === 1 ? 'Enveloppe' : 'Enveloppes'} pas ${env.length === 1 ? 'rendue' : 'rendues'}` : 'Enveloppes soldées', s: env.length ? env.map(x => x.attente ? `${x.nom} : à confirmer` : n(x.reste) < 0 ? `on doit ${mt(-x.reste)} à ${x.nom}` : `${x.nom} : ${mt(x.reste)}`).join(' · ') : 'rien ne traîne chez les porteurs', go: 'especes' },
    { k: 'retours', manuel: true, ok: !!coche.retours?.ok, t: 'Retours de location comptés', s: coche.retours?.note || 'casse et manquants notés' },
    { k: 'fournisseurs', manuel: true, ok: !!coche.fournisseurs?.ok, t: 'Fournisseurs payés', s: coche.fournisseurs?.note || 'tous les devis signés sont soldés' },
  ]
  return { ev, prix, ttc, zones, reel, budget, sansPiece, encaisse, reste, checks, margeReelle: prix - reel, margePrevue: prix - budget }
}

export function Bilan({ data, go, reload, sous }) {
  const ui = useUI()
  const [b, setB] = useState(null)
  const charger = () => api.bilanListe(data.evt).then(setB).catch(e => { ui.toast(e.message); setB({}) })
  useEffect(() => { charger() }, [data.evt])
  const r = calculBilan(data, b)
  const recharger = async () => { await Promise.all([charger(), reload()]) }
  if (!b) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  if (sous === 'zones') return <Zones r={r} data={data} go={go} recharger={recharger} b={b} />
  if (sous === 'cloturer') return <Cloturer r={r} data={data} go={go} recharger={recharger} />
  if (sous === 'lecons') return <Lecons r={r} data={data} go={go} b={b} setB={setB} recharger={recharger} />
  return <Resultat r={r} data={data} go={go} b={b} recharger={recharger} />
}

function Resultat({ r, data, go, b, recharger }) {
  const ui = useUI()
  const { ev } = r
  const clos = ev.statut === 'Clôturé'
  const verts = r.checks.filter(c => c.ok).length
  const aDecider = (b.lecons || []).filter(l => l.statut === 'proposee').length
  const analyse = !!ev.bilan?.analyse_le
  async function rouvrir() { try { await api.evenementStatut(data.evt, 'Réalisé'); ui.toast('Événement rouvert'); await recharger() } catch (e) { ui.toast(e.message) } }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ {ev.nom}</button>
        <div className="when">{dateLongue(ev.date)}{ev.date ? ` · ${dans(ev.date, data.aujourdhui)}` : ''}</div>
        <h1 style={{ fontSize: 36 }}>Bilan</h1>
      </div>
      <Rail statut={ev.statut} />
      <div className="marge">
        <div className="k">Marge réelle {r.sansPiece.length > 0 && <span className="prov">provisoire</span>}</div>
        <div className="big"><b className={r.margeReelle < 0 ? 'neg' : ''}>{mt(r.margeReelle)}</b><span>{pc(r.margeReelle, r.prix)} %</span></div>
        <div className="r"><span>Prévue</span><b>{mt(r.margePrevue)} · {pc(r.margePrevue, r.prix)} %</b></div>
        <div className="r"><span>Prix signé HT</span><b>{mt(r.prix)}</b></div>
        <div className="r"><span>Coût réel (pièces) <Info text="Somme des pièces fournisseurs imputées. Tant qu'une zone n'a pas de pièce, la marge est provisoire." /></span><b>{mt(r.reel)}</b></div>
      </div>
      <div className="kpi">
        <button onClick={() => go('especes')}><b className={r.reste ? '' : 'ok-c'}>{mt(r.encaisse)}</b>encaissé{TVA[ev.entite] ? ' TTC' : ''}{r.reste ? '' : ' ✓'}</button>
        <div className={r.reste ? 'ko' : ''}><b>{mt(r.reste)}</b>reste à encaisser</div>
      </div>
      <div className="etapes">
        <motion.button whileTap={{ scale: .98 }} onClick={() => go('bilan/zones')}><i>1</i><div>Prévu / réel par zone<span>{analyse ? 'le copilote a expliqué les écarts' : 'avec le pourquoi des écarts'}</span></div>›</motion.button>
        <motion.button whileTap={{ scale: .98 }} onClick={() => go('bilan/lecons')}><i>2</i><div>Leçons<span>{aDecider ? `${aDecider} à retenir ou ignorer` : (b.lecons || []).length ? 'tout est décidé' : 'ce qui corrige les prochains chiffrages'}</span></div>{aDecider ? <em>{aDecider}</em> : '›'}</motion.button>
        <motion.button whileTap={{ scale: .98 }} onClick={() => go('bilan/cloturer')}><i className={clos ? 'ok' : ''}>{clos ? '✓' : 3}</i><div>{clos ? 'Clôturé' : 'Clôturer'}<span>{clos ? `le ${String(ev.cloture_le || '').slice(0, 10).split('-').reverse().join('/')}${ev.bilan?.raison ? ` · ${ev.bilan.raison}` : ''}` : `${verts}/${r.checks.length} vérifications au vert`}</span></div>›</motion.button>
      </div>
      {clos && <button className="lien-perdu" onClick={rouvrir}>Rouvrir l'événement</button>}
    </motion.div>
  )
}

function Zones({ r, data, go, recharger, b }) {
  const ui = useUI()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const pq = r.ev.bilan?.pourquoi || {}
  async function analyser() {
    setBusy(true)
    try { await api.copilote('bilan', { note }); ui.toast('Écarts expliqués, leçons proposées'); setNote(''); await recharger() } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  const tri = [...r.zones].sort((a, b) => Math.abs(b.reel - b.prevu) - Math.abs(a.reel - a.prevu))
  return (
    <motion.div {...slide}>
      <div className="head"><button className="back" onClick={() => go('bilan')}>‹ Bilan</button><h1 style={{ fontSize: 34 }}>Prévu / réel</h1></div>
      <div className="pr">
        {tri.map(z => {
          const e = z.prevu ? (z.reel / z.prevu - 1) * 100 : 0
          const gros = z.reel > 0 && z.prevu > 0 && (Math.abs(e) >= 10 || Math.abs(z.reel - z.prevu) >= 3000)
          return (
            <button key={z.nom} className="z" onClick={() => go(`zone/${z.i}`)}>
              <div className="t"><span>{z.nom}</span>{z.reel > 0 && z.prevu > 0 ? <b className={e > 2 ? 'up' : 'dn'}>{e > 0 ? '+' : ''}{Math.round(e)} %</b> : <b className="mu">{z.reel ? 'hors budget' : 'pas de pièce'}</b>}</div>
              <div className="s">prévu {mt(z.prevu)} · {z.reel ? `réel ${mt(z.reel)}` : `engagé ${mt(z.engage)}, aucune pièce`}</div>
              <div className="bar"><i style={{ width: `${Math.min(100, pc(z.reel || 0, Math.max(z.prevu, z.reel) || 1))}%`, background: e > 2 ? 'var(--red)' : undefined }} />{z.prevu > 0 && <u style={{ left: `${Math.min(100, pc(z.prevu, Math.max(z.prevu, z.reel)))}%` }} />}</div>
              {pq[z.nom] && <div className="pq"><small>POURQUOI ?</small>{pq[z.nom]}</div>}
              {!pq[z.nom] && gros && <div className="pq vide">Écart à expliquer : demande au copilote ci-dessous.</div>}
            </button>
          )
        })}
      </div>
      <div className="px" style={{ marginTop: 14 }}>
        <div className="label">Ce que tu as remarqué le jour J (facultatif)</div>
        <textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="ex. 30 invités de plus au dîner, le lieu a facturé l'électricité…" />
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy} onClick={analyser}>{busy ? 'Le copilote analyse…' : r.ev.bilan?.analyse_le ? 'Relancer l\'analyse' : 'Pourquoi ? Demander au copilote'}</button>
        <p className="small mute" style={{ marginTop: 8 }}>Il explique les gros écarts et propose des leçons. {(b.lecons || []).length ? <button className="lien" onClick={() => go('bilan/lecons')}>Voir les leçons ›</button> : null}</p>
      </div>
    </motion.div>
  )
}

function Cloturer({ r, data, go, recharger }) {
  const ui = useUI()
  const [coche, setCoche] = useState(null)
  const [force, setForce] = useState(false)
  const [raison, setRaison] = useState('')
  const [busy, setBusy] = useState(false)
  const clos = r.ev.statut === 'Clôturé'
  const tous = r.checks.every(c => c.ok)
  async function basculer(k, note) {
    const cur = r.ev.bilan?.[k] || {}
    try { await api.bilanMaj(data.evt, { [k]: { ok: !cur.ok, note: note ?? cur.note ?? '' } }); setCoche(null); await recharger() } catch (e) { ui.toast(e.message) }
  }
  async function cloturer(rs) {
    setBusy(true)
    try { await api.evenementCloturer(data.evt, rs || ''); ui.toast('Événement clôturé'); setForce(false); await recharger(); go('bilan') } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  return (
    <motion.div {...slide}>
      <div className="head"><button className="back" onClick={() => go('bilan')}>‹ Bilan</button><h1 style={{ fontSize: 34 }}>Clôturer</h1></div>
      <div className="chk">
        {r.checks.map(c => (
          <button key={c.k} onClick={() => c.manuel ? (c.ok ? basculer(c.k) : setCoche(c)) : !c.ok && go(c.go)}>
            <i className={c.ok ? 'ok' : c.manuel ? 'vide' : 'ko'}>{c.ok ? '✓' : c.manuel ? '' : '!'}</i>
            <div>{c.t}<span>{c.s}</span></div>{!c.ok && !c.manuel && <em>›</em>}
          </button>
        ))}
      </div>
      {clos ? <p className="small mute px" style={{ marginTop: 14 }}>Événement clôturé. Tu peux le rouvrir depuis le bilan.</p> : <>
        <button className={`cta2 ${tous ? '' : 'off'}`} disabled={!tous || busy} onClick={() => cloturer('')}>{busy ? '…' : 'Clôturer l\'événement'}</button>
        {!tous && <p className="small mute" style={{ textAlign: 'center', marginTop: 8 }}>Le bouton s'active quand tout est vert. <button className="lien" onClick={() => setForce(true)}>Clôturer quand même</button></p>}
      </>}
      <Sheet open={!!coche} onClose={() => setCoche(null)} foot={<button className="btn primary" onClick={() => basculer(coche.k, coche.note)}>C'est fait</button>}>
        {coche && <>
          <div className="el-name" style={{ fontSize: 28 }}>{coche.t}</div>
          <div className="label">{coche.k === 'retours' ? 'Casse ou manquants (facultatif)' : 'Remarque (facultatif)'}</div>
          <input value={coche.note || ''} onChange={e => setCoche({ ...coche, note: e.target.value })} placeholder={coche.k === 'retours' ? 'casse : 14 verres, 3 assiettes' : 'reste l\'acompte de Riad Déco'} />
        </>}
      </Sheet>
      <Sheet open={force} onClose={() => setForce(false)} foot={<button className="btn primary" disabled={!raison.trim() || busy} onClick={() => cloturer(raison.trim())}>Clôturer avec cette raison</button>}>
        <div className="el-name" style={{ fontSize: 28 }}>Clôturer quand même</div>
        <p className="small mute" style={{ marginTop: 6 }}>Ce qui n'est pas vert : {r.checks.filter(c => !c.ok).map(c => c.t.toLowerCase()).join(', ')}.</p>
        <div className="label">Pourquoi ?</div>
        <input value={raison} onChange={e => setRaison(e.target.value)} placeholder="ex. le client ne paiera pas le solde, passé en litige" />
      </Sheet>
    </motion.div>
  )
}

function Lecons({ r, data, go, b, setB, recharger }) {
  const ui = useUI()
  const [busy, setBusy] = useState(false)
  const l = b.lecons || []
  async function decider(x, ok) {
    try { const y = await api.leconDecider(x.id, ok); setB({ ...b, lecons: l.map(z => z.id === x.id ? y : z) }); ui.toast(ok ? (y.catalogue_id && y.champ ? 'Retenue : catalogue corrigé' : 'Retenue pour les prochains chiffrages') : 'Ignorée') } catch (e) { ui.toast(e.message) }
  }
  async function analyser() {
    setBusy(true)
    try { await api.copilote('bilan', {}); await recharger() } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  const unite = x => x.champ === 'qte_par_base' ? ' par invité' : ' MAD'
  return (
    <motion.div {...slide}>
      <div className="head"><button className="back" onClick={() => go('bilan')}>‹ Bilan · {r.ev.nom}</button><h1 style={{ fontSize: 34 }}>Leçons</h1></div>
      {!l.length && <div className="px"><p className="small mute" style={{ margin: '14px 4px' }}>Le copilote compare le prévu et le réel et propose ce qu'il faut retenir.</p><button className="btn primary block" disabled={busy} onClick={analyser}>{busy ? 'Le copilote analyse…' : 'Proposer des leçons'}</button></div>}
      {l.map(x => (
        <div key={x.id} className={`lecon ${x.statut}`}>
          <small>{x.zone}</small>
          <div className="t">{x.texte}</div>
          <div className="s">{x.detail}</div>
          {x.catalogue_id && x.champ && x.valeur != null && <div className="cat">Catalogue : {dec(x.avant)} → <b>{dec(x.valeur)}</b>{unite(x)}</div>}
          {x.statut === 'proposee' ? <div className="bt"><button className="p" onClick={() => decider(x, true)}>Retenir</button><button onClick={() => decider(x, false)}>Ignorer</button></div>
            : <div className="st">{x.statut === 'retenue' ? `✓ Retenue${x.catalogue_id && x.champ ? ' · catalogue corrigé' : ''}` : 'Ignorée'}</div>}
        </div>
      ))}
      {l.length > 0 && <p className="small mute px" style={{ marginTop: 12 }}>Ce que tu retiens corrige le catalogue et nourrit les prochains chiffrages.</p>}
    </motion.div>
  )
}
