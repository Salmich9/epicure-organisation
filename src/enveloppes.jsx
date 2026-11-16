// v67 · Enveloppes par responsable : valider le budget (direction), mon enveloppe (chacun), tableau des enveloppes (direction).
// Le responsable ne voit que SON enveloppe : jamais un prix de vente, une marge ni l'enveloppe d'un autre.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'
import { Av } from './postes'
import { Picker } from './element'

const glisse = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }
const fr = v => Math.round(n(v)).toLocaleString('fr-FR')
const pc = (a, b) => (n(b) > 0 ? Math.round(n(a) / n(b) * 100) : 0)
const jj = d => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}` : '')
const modeDe = a => a.source === 'bon' ? 'espèces' : a.source === 'action' ? 'payé' : /ch[eè]que/i.test(a.type || '') ? 'chèque' : /carte|cb|ticket/i.test(a.type || '') ? 'carte' : a.type ? String(a.type).toLowerCase() : ''
export const etat = e => (n(e.reel) > n(e.prevu) ? 'r' : n(e.engage ?? e.reel) > n(e.prevu) * 1.05 || pc(e.reel, e.prevu) >= 80 ? 'o' : '')

function Barre({ e }) {
  return <div className="pb"><i className={etat(e)} style={{ width: `${Math.min(100, pc(e.reel, e.prevu))}%` }} /></div>
}

/* ---------- Valider le budget : chaque responsable reçoit son enveloppe ---------- */
export function ValiderBudget({ evt, go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [resp, setResp] = useState({})
  const [choisir, setChoisir] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  useEffect(() => { api.enveloppesEvt(evt).then(x => { setD(x); setResp(Object.fromEntries(x.enveloppes.map(e => [e.grp, e.resp || '']))) }).catch(e => ui.toast(e.message)) }, [evt])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const sansResp = d.enveloppes.filter(e => !resp[e.grp]).length
  async function valider() {
    setEnvoi(true)
    try { await api.budgetValider(evt, resp); ui.toast('Budget validé : chacun reçoit son enveloppe'); go(`enveloppes-evt/${evt}`) }
    catch (e) { ui.toast(`Pas enregistré : ${e.message}`) }
    setEnvoi(false)
  }
  return (
    <motion.div {...glisse}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ Budget</button>
        <h1 style={{ fontSize: 36 }}>Valider le budget</h1><div className="meta">Chaque responsable reçoit son enveloppe</div></div>
      <div className="px">
        {d.enveloppes.map(e => (
          <div key={e.grp} className="pv-env">
            <div className="l1"><Av nom={resp[e.grp]} />
              <div className="x"><b>{e.nom}</b><button className="ve-resp" onClick={() => setChoisir(e)}>{resp[e.grp] || 'choisir le responsable'} ›</button></div>
              <div className="m">{fr(e.prevu)}<small>enveloppe</small></div></div>
            {e.detail && <div className="ve-det">{e.detail.map(x => `${x.nom} ${fr(x.prevu)}`).join(' · ')}</div>}
            {resp[e.grp] && !d.membres.some(m => m.toLowerCase().split(' ')[0] === resp[e.grp].toLowerCase().split(' ')[0]) && <div className="ve-warn">pas de compte : pas de notif</div>}
          </div>))}
        <div className="aa-ban">🔔 Chacun reçoit le montant de SA seule enveloppe. Jamais le prix de vente ni la marge.</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => go('')}>Plus tard</button>
          <button className="btn primary" disabled={envoi} onClick={valider}>{envoi ? '…' : sansResp ? `Valider (${sansResp} sans responsable)` : d.valide_le ? 'Valider à nouveau' : 'Valider et envoyer'}</button>
        </div>
      </div>
      <Picker open={!!choisir} onClose={() => setChoisir(null)} title="Responsable" items={d.membres} value={choisir ? resp[choisir.grp] : ''}
        onPick={v => { setResp(r => ({ ...r, [choisir.grp]: v })); setChoisir(null) }} />
    </motion.div>
  )
}

/* ---------- Une liste d'achats ---------- */
function Achats({ achats, onTouch }) {
  if (!achats.length) return <div className="empty" style={{ padding: '14px 16px' }}>Aucun achat pour l'instant.</div>
  return <div className="list">{achats.map((a, k) => (
    <button key={k} className="aa-l" onClick={() => onTouch?.(a)}>
      <div className="x"><b>{a.fournisseur || '?'}</b><span>{[jj(a.date), a.element, a.source === 'bon' ? 'bon signé' : null].filter(Boolean).join(' · ')}{a.ia && <i className="ve-ia">rangé par l'IA</i>}{a.signalee && <i className="ve-sg">signalé</i>}</span></div>
      {modeDe(a) && <span className="aa-pill">{modeDe(a)}</span>}
      <div className="v"><b>{fr(a.montant)}</b></div>
    </button>))}</div>
}

/* ---------- Mon enveloppe (le responsable) ---------- */
export function MonEnveloppe({ evt, go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [sig, setSig] = useState(null)
  const [raison, setRaison] = useState('')
  const charger = () => api.monEnveloppe(evt).then(setD).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [evt])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = d.evenement || {}
  async function signaler() {
    try { await api.pieceSignaler(sig.piece, raison); ui.toast('Signalé : la direction va la reranger'); setSig(null); setRaison(''); charger() }
    catch (e) { ui.toast(e.message) }
  }
  return (
    <motion.div {...glisse}>
      <div className="head"><button className="back" onClick={() => go('mapart')}>‹ Ma part</button>
        <div className="when">{[ev.code, ev.entite === 'Business Boys' ? 'Business Boys' : 'Epicure'].filter(Boolean).join(' · ')}</div>
        <h1 style={{ fontSize: 34 }}>{d.enveloppes.length > 1 ? 'Mes enveloppes' : 'Mon enveloppe'}</h1><div className="meta">{ev.nom}</div></div>
      {!d.enveloppes.length && <div className="empty" style={{ padding: '24px 16px' }}>Pas d'enveloppe à ton nom sur cet événement.</div>}
      {d.enveloppes.map(e => (
        <div key={e.grp + e.resp}>
          <div className="ve-big"><div className="s0">{e.nom}</div>
            <div className="r">{fr(n(e.prevu) - n(e.reel))}</div>
            <div className="s">{n(e.reel) > n(e.prevu) ? `dépassée de ${fr(n(e.reel) - n(e.prevu))}` : `reste sur ${fr(e.prevu)}`} · {pc(e.reel, e.prevu)} % dépensés</div>
            <div className="pb"><i className={etat(e)} style={{ width: `${Math.min(100, pc(e.reel, e.prevu))}%` }} /></div></div>
          {e.detail && <div className="list">{e.detail.map(x => (
            <div key={x.nom} className="aa-l"><div className="x"><b>{x.nom}</b><span>{fr(x.reel)} / {fr(x.prevu)}</span></div><div className="v"><b>{pc(x.reel, x.prevu)} %</b></div></div>))}</div>}
          <div className="cf-grp"><span>MES ACHATS</span><b>{fr(e.achats.reduce((s, a) => s + n(a.montant), 0))}</b></div>
          <Achats achats={e.achats} onTouch={a => a.piece && setSig(a)} />
        </div>))}
      {d.enveloppes.some(e => e.achats.length) && <p className="small mute px" style={{ marginTop: 10 }}>Un achat n'est pas à toi ? Touche-le.</p>}
      <Sheet open={!!sig} onClose={() => setSig(null)} foot={<button className="btn primary" onClick={signaler}>Ce n'est pas à moi</button>}>
        <div className="el-kicker">{sig?.fournisseur} · {fr(sig?.montant)}</div>
        <div className="el-name" style={{ fontSize: 24 }}>Pas dans mon enveloppe</div>
        <input value={raison} onChange={x => setRaison(x.target.value)} placeholder="Pourquoi ? (facultatif) ex : c'est pour le bar" style={{ marginTop: 14 }} />
      </Sheet>
    </motion.div>
  )
}

/* ---------- Toutes les enveloppes d'un événement (direction) ---------- */
export function EnveloppesEvt({ evt, data, go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [depl, setDepl] = useState(null)
  const [ouvert, setOuvert] = useState(null)
  const charger = () => api.enveloppesEvt(evt).then(setD).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [evt])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = (data?.evenements || []).find(x => x.id === evt) || {}
  const tot = d.enveloppes.reduce((s, e) => ({ p: s.p + n(e.prevu), r: s.r + n(e.reel) }), { p: 0, r: 0 })
  const derives = d.enveloppes.filter(e => n(e.prevu) > 0 && (n(e.reel) > n(e.prevu) || n(e.engage) > n(e.prevu) * 1.05))
  const elements = data?.evt === evt ? (data.elements || []) : []
  async function verifier(p) { try { await api.pieceVerifier(p.piece); charger() } catch (e) { ui.toast(e.message) } }
  async function deplacer(nom) {
    const el = elements.find(x => `${x.zone} · ${x.element}` === nom)
    if (!el) return
    try { await api.pieceImputer(depl.piece, el.id); setDepl(null); ui.toast('Déplacée'); charger() } catch (e) { ui.toast(e.message) }
  }
  function pistes() { try { sessionStorage.setItem('copilote_theme', 'Budget') } catch {} go('copilote') }
  return (
    <motion.div {...glisse}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ Événement</button>
        <div className="when">{[ev.nom, ev.code].filter(Boolean).join(' · ')}</div>
        <h1 style={{ fontSize: 34, display: 'flex', alignItems: 'center', gap: 10 }}>Enveloppes <Info text="Réel : les pièces rangées sur les lignes de l'enveloppe et les actions payées. Engagé : ce que coûtent les lignes prévues. Orange à 80 % ou si l'engagé dépasse, rouge au-delà de l'enveloppe." /></h1>
        <div className="meta">{fr(tot.r)} dépensés sur {fr(tot.p)}{!d.valide_le ? ' · pas encore envoyé' : ''}</div></div>
      <div className="px">
        {!d.valide_le && <button className="btn primary" style={{ width: '100%', marginTop: 10 }} onClick={() => go(`budget-valider/${evt}`)}>Valider le budget et l'envoyer</button>}
        {derives.map(e => (
          <div key={e.grp + e.resp} className="ve-derive"><b>⚠️ {e.nom} {n(e.reel) > n(e.prevu) ? `dépassée de ${fr(n(e.reel) - n(e.prevu))}` : `dérive : engagé ${fr(e.engage)} pour ${fr(e.prevu)} (+${Math.round((n(e.engage) / n(e.prevu) - 1) * 100)} %)`}</b>
            {data?.evt === evt && <button className="chip on" style={{ marginTop: 8 }} onClick={pistes}>✨ Pistes du copilote</button>}</div>))}
        {d.enveloppes.map(e => (
          <div key={e.grp + e.resp}>
            <button className="pv-env" onClick={() => setOuvert(ouvert === e.grp + e.resp ? null : e.grp + e.resp)}>
              <div className="l1"><Av nom={e.resp} /><div className="x"><b>{e.nom}</b><span>{e.resp || 'sans responsable'} · {pc(e.reel, e.prevu)} %{e.resp && !e.compte ? ' · pas de compte' : ''}</span></div>
                <div className="m">{fr(e.reel)} / {fr(e.prevu)}<small>dépensé / enveloppe</small></div></div>
              <Barre e={e} />
              {n(e.reel) > n(e.prevu) && <div className="ve-sub r">+{fr(n(e.reel) - n(e.prevu))} · dépassée</div>}
            </button>
            {ouvert === e.grp + e.resp && <div style={{ marginTop: 6 }}><Achats achats={e.achats} /></div>}
          </div>))}
      </div>
      {d.a_verifier.length > 0 && <>
        <div className="cf-grp"><span>RANGÉS PAR L'IA · À VÉRIFIER</span><b>{d.a_verifier.length}</b></div>
        <div className="list">{d.a_verifier.map(p => (
          <div key={p.piece} className="aa-l">
            <div className="x"><b>{p.fournisseur || '?'} · {fr(p.montant)}</b><span>rangé dans {p.zone} · {p.element}{p.signalee ? ` · ${p.signalee}` : ''}</span></div>
            {elements.length > 0 && <button className="chip" onClick={() => setDepl(p)}>Déplacer</button>}
            <button className="chip on" onClick={() => verifier(p)} aria-label="Confirmer">✓</button>
          </div>))}</div>
      </>}
      <Picker open={!!depl} onClose={() => setDepl(null)} title="Ranger sur" items={elements.map(x => `${x.zone} · ${x.element}`)} value="" onPick={deplacer} />
    </motion.div>
  )
}

