import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, dans, dateLongue, n, useUI } from './ui'

/* Le rail de l'événement : chaque étape ouvre la suivante */
const ETAPES = ['Demande', 'Devis', 'Confirmé', 'Réalisé', 'Clôturé']
const RANG = { 'Demande': 0, 'Devis envoyé': 1, 'Confirmé': 2, 'En préparation': 2, 'Réalisé': 3, 'Clôturé': 4 }
export const estVente = ev => !ev.statut || ev.statut === 'Demande' || ev.statut === 'Devis envoyé'
const TVA = { Epicure: 20, 'Business Boys': 10 }
const mt = v => Math.round(n(v)).toLocaleString('fr-FR')

export function Rail({ statut }) {
  const r = RANG[statut] ?? 0
  if (statut === 'Perdu') return <div className="rail perdu">Événement perdu</div>
  return <div className="rail">{ETAPES.map((l, i) => <div key={l} className={`s ${i < r ? 'ok' : i === r ? 'on' : ''}`}><i />{l}</div>)}</div>
}

/* ---------- Avant la signature : on vend ---------- */
export function Vente({ data, go, reload, openEvt }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [cx, setCx] = useState(null)
  const [signe, setSigne] = useState(false)
  useEffect(() => { api.chiffrageContexte(data.evt).then(setCx).catch(() => setCx({})) }, [data.evt])
  const lignes = cx?.chiffrage?.lignes || []
  const cout = lignes.reduce((s, l) => s + n(l.quantite) * n(l.prix), 0)
  const coef = n(cx?.chiffrage?.coef) || n(ev.coef) || 2.4
  const prix = Math.round(cout * 1.03 * coef)

  async function perdu() {
    try { await api.evenementStatut(data.evt, 'Perdu'); ui.toast('Événement marqué perdu'); await reload() } catch (e) { ui.toast(e.message) }
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head" onClick={openEvt}>
        <div className="when">{dateLongue(ev.date)}{ev.date ? ` · ${dans(ev.date, data.aujourdhui)}` : ''}</div>
        <h1>{ev.nom}</h1>
        <div className="meta">{ev.invites ? `${ev.invites} invités` : 'Invités à fixer'} · {ev.entite || 'Epicure'}</div>
      </div>
      <Rail statut={ev.statut} />
      {cx === null ? <div className="empty">Chargement…</div> : !lignes.length ? (
        <div className="dv"><div className="k">Chiffrage</div><p className="small mute">Pas encore chiffré.</p></div>
      ) : (
        <div className="dv">
          <div className="k">Chiffrage</div>
          <div className="r2"><div>Coût de revient</div><b>{mt(cout)}</b></div>
          <div className="r2"><div>Coef × {coef.toFixed(2).replace('.', ',')}<span>imprévus 3 % compris</span></div><b>{mt(prix)} HT</b></div>
          {ev.zoho_devis && <a className="r2" href={ev.zoho_devis.url} target="_blank" rel="noreferrer"><div>Devis {ev.zoho_devis.numero}<span>Zoho · {ev.entite}</span></div><b className="lien">Voir ›</b></a>}
        </div>
      )}
      {lignes.length > 0 && <motion.button whileTap={{ scale: .98 }} className="cta2" onClick={() => setSigne(true)}>Le client a signé</motion.button>}
      <div className="two">
        <motion.button whileTap={{ scale: .97 }} onClick={() => go('chiffrer')}>{lignes.length ? 'Rechiffrer' : 'Chiffrer'}</motion.button>
        {lignes.length > 0 && ev.entite !== 'Espèce' && <motion.button whileTap={{ scale: .97 }} onClick={() => go('devis')}>Devis client</motion.button>}
      </div>
      <div className="lock"><b>🔒 Organisation</b>S'ouvre quand le client signe : pas d'effort sur un événement non confirmé.</div>
      <button className="lien-perdu" onClick={perdu}>Le client a dit non</button>
      <Signature open={signe} onClose={() => setSigne(false)} data={data} ev={ev} prixPropose={prix} cout={cout} go={go} reload={reload} />
    </motion.div>
  )
}

function Signature({ open, onClose, data, ev, prixPropose, cout, go, reload }) {
  const ui = useUI()
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ prix: String(prixPropose || ''), avance: '', mode: ev.entite === 'Espèce' ? 'Espèces' : 'Virement', date: data.aujourdhui }) }, [open])
  const prix = n(String(f.prix || '').replace(/\s/g, '')), avance = n(String(f.avance || '').replace(/\s/g, ''))
  const remise = prixPropose ? (prix / prixPropose - 1) * 100 : 0
  const marge = prix - cout * 1.03
  async function confirmer() {
    if (!(prix > 0)) { ui.bubble('Tape le prix signé HT.'); return }
    setBusy(true)
    try {
      await api.evenementConfirmer(data.evt, prix, avance, f.mode, f.date)
      ui.toast('Événement confirmé'); onClose(); await reload(); go('budget')
    } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} foot={<button className="btn primary" disabled={busy} onClick={confirmer}>{busy ? '…' : 'Confirmer et lancer l\'organisation'}</button>}>
      <div className="el-name" style={{ fontSize: 30 }}>Le client a signé</div>
      <div className="label">Prix signé HT</div>
      <input inputMode="numeric" value={f.prix || ''} onChange={e => setF({ ...f, prix: e.target.value.replace(/[^\d]/g, '') })} />
      {prix > 0 && <p className="small mute" style={{ marginTop: 6 }}>{Math.abs(remise) >= 0.5 ? `${remise < 0 ? 'Remise' : 'Hausse'} ${Math.round(Math.abs(remise))} % · ` : ''}marge prévue <b style={{ color: marge < 0 ? 'var(--red)' : 'var(--accent)' }}>{mt(marge)} ({prix ? Math.round(marge / prix * 100) : 0} %)</b></p>}
      <div className="label">Avance reçue</div>
      <input inputMode="numeric" value={f.avance || ''} placeholder="0" onChange={e => setF({ ...f, avance: e.target.value.replace(/[^\d]/g, '') })} />
      <div className="label">Mode</div>
      <div className="chips">{['Espèces', 'Virement', 'Chèque'].map(m => <button key={m} className={`chip ${f.mode === m ? 'on' : ''}`} onClick={() => setF({ ...f, mode: m })}>{m}</button>)}</div>
      <div className="label">Date de signature</div>
      <input type="date" value={f.date || ''} onChange={e => setF({ ...f, date: e.target.value })} />
    </Sheet>
  )
}

/* ---------- Le devis que voit le client ---------- */
export function DevisClient({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [pres, setPres] = useState(ev.presentation || 'prestation')
  const [a, setA] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setA(null); api.zoho('apercu', { presentation: pres }).then(setA).catch(e => { ui.toast(e.message); setA({ lignes: [] }) }) }, [pres, data.evt])
  async function envoyer() {
    setBusy(true)
    try { const d = await api.zoho('devis', { presentation: pres }); ui.toast(`${d.numero} ${d.mis_a_jour ? 'mis à jour' : 'créé'} dans Zoho`); window.open(d.url, '_blank'); await reload() } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  const tva = TVA[ev.entite] || 0
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button><h1 style={{ fontSize: 32 }}>Devis client</h1></div>
      <div className="seg2"><button className={pres === 'prestation' ? 'on' : ''} onClick={() => setPres('prestation')}>Par prestation</button><button className={pres === 'forfait' ? 'on' : ''} onClick={() => setPres('forfait')}>Forfait unique</button></div>
      {!a ? <div className="empty">Calcul…</div> : (
        <div className="dv">
          <div className="k">Ce que voit le client {ev.prix_signe ? <span className="pill ok" style={{ marginLeft: 6 }}>prix signé</span> : null}</div>
          {a.lignes.map(l => <div key={l.nom} className="r2"><div>{l.nom}<span>{l.description}</span></div><b>{mt(l.montant)}</b></div>)}
          <div className="tot2"><span>Total HT</span><b>{mt(a.total)}</b></div>
          {tva > 0 && <div className="r2 fin"><span>TVA {tva} % · {mt(a.total * tva / 100)}</span><span className="ttc">TTC {mt(a.total * (1 + tva / 100))}</span></div>}
        </div>
      )}
      <p className="small mute px" style={{ marginTop: 10 }}>Staff, logistique, lieu et technique sont répartis dans les prestations <Info text="Le client ne voit jamais ta structure de coûts. La logistique et le lieu sont répartis au prorata des prestations." /></p>
      {ev.entite !== 'Espèce' && <div className="px"><button className="btn primary block" style={{ marginTop: 14 }} disabled={busy || !a?.lignes?.length} onClick={envoyer}>{busy ? '…' : ev.zoho_devis ? `Mettre à jour ${ev.zoho_devis.numero} dans Zoho` : 'Créer le devis dans Zoho'}</button></div>}
    </motion.div>
  )
}

/* ---------- Après la signature : l'argent de l'événement ---------- */
export function Argent({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [enc, setEnc] = useState(null)
  useEffect(() => { api.especesListe(data.evt).then(r => setEnc(r.encaissements || [])).catch(() => setEnc([])) }, [data.evt])
  if (!ev.prix_signe) return null
  const ttc = n(ev.prix_signe) * (1 + (TVA[ev.entite] || 0) / 100)
  const encaisse = (enc || []).reduce((s, x) => s + n(x.montant), 0)
  const budget = n(ev.budget)
  const marge = n(ev.prix_signe) - budget
  const passe = ev.date && ev.date < data.aujourdhui
  async function etape(s) { try { await api.evenementStatut(data.evt, s); ui.toast(`Événement ${s.toLowerCase()}`); await reload() } catch (e) { ui.toast(e.message) } }
  return (
    <>
      <div className="kpi">
        <div><b>{mt(ev.prix_signe)}</b>prix signé HT</div>
        <div className={marge >= 0 ? 'ok' : 'ko'}><b>{budget ? mt(marge) : '—'}</b>marge prévue{budget && ev.prix_signe ? ` · ${Math.round(marge / n(ev.prix_signe) * 100)} %` : ''}</div>
        <button onClick={() => go('especes')}><b>{enc === null ? '…' : mt(encaisse)}</b>encaissé ›</button>
        <div><b>{enc === null ? '…' : mt(Math.max(0, ttc - encaisse))}</b>reste à encaisser{TVA[ev.entite] ? ' TTC' : ''}</div>
      </div>
      {ev.statut === 'Confirmé' && passe && <motion.button whileTap={{ scale: .98 }} className="cta2 g" onClick={() => etape('Réalisé')}>L'événement a eu lieu : marquer réalisé</motion.button>}
      {ev.statut === 'Réalisé' && <motion.button whileTap={{ scale: .98 }} className="cta2 g" onClick={() => etape('Clôturé')}>Tout est payé et encaissé : clôturer</motion.button>}
    </>
  )
}
