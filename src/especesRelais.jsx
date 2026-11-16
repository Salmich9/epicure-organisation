// v68 · Espèces de l'événement : un virement à un fournisseur relais, qui garde sa commission et rend le reste en espèces.
// Salmane lance (montants ajustables) → Amina H choisit le fournisseur → Salmane valide → Amina saisit le reçu (écart signalé)
// → elle remet à chacun, qui confirme. La commission entre au chiffrage (ligne « Frais d'espèces »).
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'
import { Picker } from './element'

const glisse = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }
const fr = v => Math.round(n(v)).toLocaleString('fr-FR').replace(/\s/g, '\u00a0')
const num = s => { const x = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : 0 }
const jj = d => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '')
const prenom = s => String(s || '').split(' ').map((m, i) => (i ? m[0] || '' : m)).join(' ').trim()
export const CATS = [['staff', 'Staff (extras)'], ['commissions', 'Commissions'], ['repas_transport', 'Repas et transport du staff'], ['petits_achats', 'Petits achats']]
const ETAPE = { a_preparer: 1, refuse: 1, a_valider: 2, valide: 3, recu: 4, termine: 4 }

function Etapes({ statut, lancer }) {
  const e = lancer ? 0 : ETAPE[statut] || 0
  const l = [['1', 'Préparer'], ['2', e > 2 ? 'Validé' : 'Valider'], ['3', 'Reçu'], ['4', 'Remis']]
  return <div className="es-steps">{l.map(([k, t], i) => <span key={k} className={i + 1 === Math.max(1, e) ? 'on' : i + 1 < e ? 'ok' : ''}>{k} {t}</span>)}</div>
}
const remisA = (r, dest) => (r.remises || []).filter(m => m.dest === dest && m.statut !== 'refuse').reduce((s, m) => s + n(m.montant), 0)

/* ---------- Paramètres › Espèces ---------- */
export function ParamEspeces() {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [f, setF] = useState(null)
  const [resp, setResp] = useState(false)
  useEffect(() => { api.especesReglages().then(setD).catch(e => ui.toast(e.message)) }, [])
  if (!d) return <p className="small mute px" style={{ marginTop: 20 }}>Chargement…</p>
  const r = d.reglages || {}, peut = d.peut_modifier, cats = r.categories || [], fs = r.fournisseurs || []
  async function maj(p, msg) { try { setD(await api.especesReglages(p)); if (msg) ui.toast(msg) } catch (e) { ui.toast(e.message) } }
  function sauverF() {
    const nom = f.nom.trim(), taux = num(f.taux)
    if (!nom || taux < 0 || taux > 50) return ui.toast('Il manque le nom ou le taux')
    const l = fs.filter((x, i) => i !== f.i); l.splice(f.i ?? l.length, 0, { nom, taux })
    maj({ fournisseurs: l }, 'Fournisseur enregistré'); setF(null)
  }
  return <>
    <div className="cf-grp">PAYÉS EN ESPÈCES PAR DÉFAUT</div>
    <div className="px"><div className="chips">{CATS.map(([k, l]) => <button key={k} disabled={!peut} className={`chip ${cats.includes(k) ? 'on' : ''}`}
      onClick={() => maj({ categories: cats.includes(k) ? cats.filter(x => x !== k) : [...cats, k] })}>{l}</button>)}</div>
      <p className="small mute" style={{ marginTop: 6 }}>Ajustable pour chaque événement avant de lancer.</p></div>
    <div className="cf-grp"><span>FOURNISSEURS RELAIS</span><b>taux</b></div>
    <div className="list">
      {fs.map((x, i) => <button key={x.nom + i} className="aa-l" disabled={!peut} onClick={() => setF({ i, nom: x.nom, taux: String(x.taux) })}>
        <div className="x"><b>{x.nom}</b><span>rend en espèces</span></div><span className="es-taux">{fr(x.taux)} %</span></button>)}
      {!fs.length && <div className="aa-l"><div className="x"><span>Aucun : le taux par défaut ({fr(r.taux ?? 5)} %) s'applique.</span></div></div>}
      {peut && <button className="aa-l" onClick={() => setF({ i: null, nom: '', taux: String(r.taux ?? 5) })}><div className="x"><b>+ Ajouter un fournisseur</b></div></button>}
    </div>
    <div className="cf-grp">RESPONSABLE DES ESPÈCES</div>
    <div className="list"><button className="aa-l" disabled={!peut} onClick={() => setResp(true)}>
      <div className="x"><b>{r.responsable || 'à choisir'}</b><span>prépare le virement, reçoit et redistribue</span></div><span className="go">›</span></button></div>
    <Sheet open={!!f} onClose={() => setF(null)} foot={<div style={{ display: 'flex', gap: 8 }}>
      {f?.i !== null && f?.i !== undefined && <button className="btn" onClick={() => { maj({ fournisseurs: fs.filter((x, i) => i !== f.i) }, 'Retiré'); setF(null) }}>Retirer</button>}
      <button className="btn primary" onClick={sauverF}>Enregistrer</button></div>}>
      <div className="el-name" style={{ fontSize: 26 }}>Fournisseur relais</div>
      <input value={f?.nom || ''} onChange={e => setF(v => ({ ...v, nom: e.target.value }))} placeholder="Nom" style={{ marginTop: 14 }} />
      <div className="cf-lbl">Commission</div>
      <div className="cf-in"><input inputMode="decimal" value={f?.taux || ''} onChange={e => setF(v => ({ ...v, taux: e.target.value }))} /><span>% des espèces rendues</span></div>
    </Sheet>
    <Picker open={resp} onClose={() => setResp(false)} title="Responsable des espèces" items={d.membres || []} value={r.responsable || ''} onPick={v => v && maj({ responsable: v }, 'Responsable changé')} />
  </>
}

/* ---------- Une ligne de montant ---------- */
const Ligne = ({ nom, sous, v, fort, onClick, droite }) => {
  const C = onClick ? 'button' : 'div'
  return <C className={`aa-l ${fort ? 'es-fort' : ''}`} onClick={onClick}><div className="x"><b>{nom}</b>{sous && <span>{sous}</span>}</div>{droite || <div className="v"><b>{fr(v)}</b></div>}</C>
}

/* ---------- Espèces de l'événement (Salmane) ---------- */
export function EspecesEvt({ evt, go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [lignes, setLignes] = useState(null)
  const [edit, setEdit] = useState(null)
  const [refus, setRefus] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [nouveau, setNouveau] = useState(false)
  const recevoir = x => { setD(x); setLignes(l => l || x.proposition.filter(p => n(p.montant) > 0 || p.cat)) }
  const charger = () => api.especesEvt(evt).then(recevoir).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [evt])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = d.evenement || {}, cfg = d.reglages || {}, resp = prenom(cfg.responsable) || 'Amina H'
  const r = d.relais[0]
  const actif = r && !nouveau && (r.statut !== 'termine' || (n(r.ecart) > 0 && !r.ecart_regle) || (r.remises || []).some(m => m.statut === 'a_confirmer'))
  async function faire(p, msg) { setEnvoi(true); try { recevoir(await p); if (msg) ui.toast(msg); setNouveau(false) } catch (e) { ui.toast(e.message) } setEnvoi(false) }
  function sauverLigne() {
    const m = num(edit.montant)
    if (!edit.nom?.trim()) return ui.toast('Il manque le nom')
    setLignes(l => { const x = [...l]; const v = { ...(edit.i !== null ? l[edit.i] : { cat: 'autre' }), nom: edit.nom.trim(), montant: m, dest: edit.dest || null }; if (edit.i === null) x.push(v); else x[edit.i] = v; return x })
    setEdit(null)
  }
  const tete = <div className="head"><button className="back" onClick={() => go('')}>‹ Événement</button>
    <div className="when">{[ev.nom, ev.code].filter(Boolean).join(' · ')}</div>
    <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Espèces <Info text={`Un virement au fournisseur relais : il garde sa commission et rend le reste en espèces. ${resp} prépare, tu valides, elle reçoit et remet à chacun, qui confirme.`} /></h1>
    <div className="meta">{actif ? `${fr(r.besoin)} à récupérer` : 'à prévoir pour cet événement'}</div></div>

  if (!actif) {
    const l = lignes || [], b = l.reduce((s, x) => s + n(x.montant), 0), t = n(cfg.taux ?? 5), c = Math.round(b * t / 100)
    return <motion.div {...glisse}>{tete}
      <Etapes lancer />
      <div className="list">
        {l.map((x, i) => <Ligne key={i} nom={x.nom} sous={[x.dest ? prenom(x.dest) : 'à qui ?', x.note].filter(Boolean).join(' · ')} v={x.montant}
          onClick={() => setEdit({ i, nom: x.nom, montant: String(Math.round(n(x.montant))), dest: x.dest || '' })} />)}
        <button className="aa-l" onClick={() => setEdit({ i: null, nom: '', montant: '', dest: '' })}><div className="x"><b>+ une ligne</b></div></button>
        <Ligne fort nom="Espèces à récupérer" v={b} />
        <Ligne nom={`Commission fournisseur ${fr(t)} %`} sous="ligne « Frais d'espèces » du chiffrage" v={c} />
        <Ligne fort nom="Virement à faire" v={b + c} />
      </div>
      <p className="small mute px" style={{ marginTop: 8 }}>Le taux final suit le fournisseur choisi par {resp}.</p>
      <div className="px"><button className="btn primary block" style={{ marginTop: 12 }} disabled={envoi || b <= 0}
        onClick={() => faire(api.especesLancer(evt, l.filter(x => n(x.montant) > 0)), `Envoyé à ${resp}`)}>{envoi ? '…' : `Lancer chez ${resp}`}</button></div>
      {d.relais.length > 0 && <Historique relais={d.relais} />}
      <Sheet open={!!edit} onClose={() => setEdit(null)} foot={<div style={{ display: 'flex', gap: 8 }}>
        {edit?.i !== null && <button className="btn" onClick={() => { setLignes(x => x.filter((y, k) => k !== edit.i)); setEdit(null) }}>Pas en espèces</button>}
        <button className="btn primary" onClick={sauverLigne}>OK</button></div>}>
        <input value={edit?.nom || ''} onChange={e => setEdit(v => ({ ...v, nom: e.target.value }))} placeholder="Poste (ex : chauffeurs)" className="el-name" style={{ fontSize: 22 }} />
        <div className="cf-lbl">Montant en espèces</div>
        <div className="cf-in"><input inputMode="numeric" value={edit?.montant || ''} onChange={e => setEdit(v => ({ ...v, montant: e.target.value }))} autoFocus /><span>MAD</span></div>
        <div className="cf-lbl">Remis à</div>
        <div className="chips">{(d.membres || []).map(m => <button key={m} className={`chip ${edit?.dest === m ? 'on' : ''}`} onClick={() => setEdit(v => ({ ...v, dest: m }))}>{prenom(m)}</button>)}</div>
      </Sheet>
    </motion.div>
  }

  const ecart = n(r.ecart) > 0 && !r.ecart_regle
  return <motion.div {...glisse}>{tete}
    <Etapes statut={r.statut} />
    {r.statut === 'refuse' && <div className="es-alerte">Refusé{r.raison ? ` : ${r.raison}` : ''} · {resp} doit choisir un autre fournisseur</div>}
    <div className="list">
      {r.fournisseur && <Ligne nom={`${r.fournisseur} · ${fr(r.taux)} %`} sous={r.valide_le ? `validé par ${prenom(r.valide_par)} le ${jj(r.valide_le)}` : 'choisi par ' + resp} v={r.virement} />}
      {r.lignes.map((x, i) => <Ligne key={i} nom={x.nom} sous={x.dest ? `${prenom(x.dest)}${ETAPE[r.statut] === 4 ? ` · remis ${fr(remisA(r, x.dest))}` : ''}` : null} v={x.montant} />)}
      <Ligne fort nom="Espèces à récupérer" v={r.besoin} />
      <Ligne nom={`Commission ${fr(r.taux)} %`} sous="dans le chiffrage" v={r.commission} />
      <Ligne fort nom="Virement" v={r.virement} />
      {r.recu != null && <Ligne fort nom={`Reçu par ${resp}`} sous={jj(r.recu_le)} v={r.recu} />}
    </div>
    {ecart && <div className="es-alerte">Il manque {fr(r.ecart)} · {d.peut_valider && <button className="chip on" style={{ marginLeft: 6 }} disabled={envoi} onClick={() => faire(api.especesEcartRegler(r.id), 'Écart réglé')}>Écart réglé</button>}</div>}
    {(r.remises || []).length > 0 && <><div className="cf-grp">REMIS</div><div className="list">
      {r.remises.map(m => <Ligne key={m.id} nom={prenom(m.dest)} sous={m.statut === 'ok' ? `✓ reçu ${jj(m.le)}` : m.statut === 'refuse' ? 'dit ne pas avoir reçu' : 'en attente de sa confirmation'} v={m.montant} />)}</div></>}
    <div className="px" style={{ marginTop: 12 }}>
      {r.statut === 'a_preparer' && <p className="small mute">Chez {resp} : elle choisit le fournisseur.</p>}
      {r.statut === 'valide' && <p className="small mute">{resp} attend les espèces du fournisseur.</p>}
      {r.statut === 'a_valider' && d.peut_valider && <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={envoi} onClick={() => setRefus('')}>Refuser</button>
        <button className="btn primary" disabled={envoi} onClick={() => faire(api.especesValider(r.id, true), 'Validé : frais au chiffrage')}>Valider le virement</button></div>}
      {r.statut === 'termine' && <button className="btn block" onClick={() => { setNouveau(true); setLignes(d.proposition) }}>Nouveau virement</button>}
    </div>
    {d.relais.length > 1 && <Historique relais={d.relais.slice(1)} />}
    <Sheet open={refus !== null} onClose={() => setRefus(null)} foot={<button className="btn primary" onClick={() => { faire(api.especesValider(r.id, false, refus), 'Refusé'); setRefus(null) }}>Refuser</button>}>
      <div className="el-name" style={{ fontSize: 24 }}>Refuser le virement</div>
      <input value={refus || ''} onChange={e => setRefus(e.target.value)} placeholder="Pourquoi ? ex : prends le fournisseur B" style={{ marginTop: 14 }} />
    </Sheet>
  </motion.div>
}

function Historique({ relais }) {
  const S = { a_preparer: 'à préparer', a_valider: 'à valider', valide: 'validé', refuse: 'refusé', recu: 'reçu', termine: 'remis' }
  return <><div className="cf-grp">AVANT</div><div className="list">{relais.map(r => (
    <Ligne key={r.id} nom={`${r.fournisseur || '?'} · ${S[r.statut]}`} sous={[jj(r.demande_le), n(r.ecart) > 0 ? `écart ${fr(r.ecart)}${r.ecart_regle ? ' réglé' : ''}` : null].filter(Boolean).join(' · ')} v={r.besoin} />))}</div></>
}

/* ---------- La tâche d'Amina : préparer, recevoir, remettre ---------- */
export function EspecesRelais({ id, go }) {
  const ui = useUI()
  const [r, setR] = useState(null)
  const [four, setFour] = useState('')
  const [recu, setRecu] = useState('')
  const [rem, setRem] = useState(null)
  const [qui, setQui] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const charger = () => api.especesRelaisVoir(id).then(x => { setR(x); setFour(f => f || x.fournisseur || '') }).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [id])
  if (!r) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = r.evenement || {}, fs = r.fournisseurs || []
  async function faire(p, msg) { setEnvoi(true); try { await p; if (msg) ui.toast(msg); await charger() } catch (e) { ui.toast(e.message) } setEnvoi(false) }
  const tete = (h, s) => <div className="head"><button className="back" onClick={() => go('mapart')}>‹ Ma part</button>
    <div className="when">{[ev.code || ev.nom, ev.entite].filter(Boolean).join(' · ')}</div><h1 style={{ fontSize: 34 }}>{h}</h1><div className="meta">{s}</div></div>

  if (r.statut === 'a_preparer' || r.statut === 'refuse') {
    const f = fs.find(x => x.nom === four), t = f ? n(f.taux) : n(r.taux), c = Math.round(n(r.besoin) * t / 100)
    return <motion.div {...glisse}>{tete('Virement espèces', `demandé par ${prenom(r.demande_par)}`)}<Etapes statut={r.statut} />
      {r.statut === 'refuse' && <div className="es-alerte">Refusé{r.raison ? ` : ${r.raison}` : ''}</div>}
      <div className="cf-grp">QUEL FOURNISSEUR ?</div>
      <div className="list">{fs.map(x => <button key={x.nom} className={`aa-l ${four === x.nom ? 'es-on' : ''}`} onClick={() => setFour(x.nom)}>
        <div className="x"><b>{x.nom}</b><span>{fr(Math.round(n(r.besoin) * n(x.taux) / 100) + n(r.besoin))} à virer</span></div><span className="es-taux">{fr(x.taux)} %</span></button>)}
        {!fs.length && <div className="aa-l"><div className="x"><span>Aucun fournisseur relais dans les Paramètres.</span></div></div>}</div>
      <div className="list" style={{ marginTop: 12 }}>
        <Ligne fort nom="Espèces à récupérer" v={r.besoin} />
        <Ligne nom={`Commission ${fr(t)} %`} v={c} />
        <Ligne fort nom="Virement à faire" v={n(r.besoin) + c} />
      </div>
      <div className="px"><button className="btn primary block" style={{ marginTop: 14 }} disabled={!four || envoi}
        onClick={() => faire(api.especesPreparer(r.id, four), `Envoyé à ${prenom(r.demande_par)} pour validation`)}>{four ? 'Envoyer pour validation' : 'Choisis le fournisseur'}</button></div>
    </motion.div>
  }
  if (r.statut === 'a_valider') return <motion.div {...glisse}>{tete('Virement espèces', `${r.fournisseur} · ${fr(r.taux)} %`)}<Etapes statut={r.statut} />
    <div className="list"><Ligne fort nom="Virement" sous={`en attente de ${prenom(r.demande_par)}`} v={r.virement} /></div></motion.div>

  if (r.statut === 'valide') {
    const m = num(recu), e = n(r.besoin) - m
    return <motion.div {...glisse}>{tete('Virement espèces', `demandé par ${prenom(r.demande_par)}`)}<Etapes statut={r.statut} />
      <div className="list">
        <Ligne nom={`${r.fournisseur} · ${fr(r.taux)} %`} sous={`virement validé par ${prenom(r.valide_par)} le ${jj(r.valide_le)}`} v={r.virement} />
        <Ligne fort nom="Espèces attendues" v={r.besoin} /></div>
      <div className="cf-grp">COMBIEN AS-TU REÇU ?</div>
      <div className="px"><input className="es-gros" inputMode="numeric" value={recu} onChange={x => setRecu(x.target.value)} placeholder={fr(r.besoin)} autoFocus />
        {m > 0 && e > 0 && <div className="es-alerte" style={{ margin: '10px 0 0' }}>Il manque {fr(e)} · {prenom(r.demande_par)} sera prévenu, l'écart reste visible jusqu'à ce qu'il soit réglé</div>}
        {m > 0 && e < 0 && <div className="aa-ban" style={{ margin: '10px 0 0' }}>{fr(-e)} de plus que prévu</div>}
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={m <= 0 || envoi} onClick={() => faire(api.especesRecu(r.id, m), 'Réception confirmée')}>Confirmer la réception</button></div>
    </motion.div>
  }

  // Remettre à chacun
  const parDest = {}
  for (const x of r.lignes || []) { const k = x.dest || ''; parDest[k] = parDest[k] || { dest: x.dest, noms: [], montant: 0 }; parDest[k].noms.push(x.nom.toLowerCase().replace('(extras)', '').trim()); parDest[k].montant += n(x.montant) }
  const groupes = Object.values(parDest)
  async function remettre() {
    const m = num(rem.montant)
    if (!rem.dest) return setQui(true)
    await faire(api.especesRemettre(r.id, rem.dest, m), `Remis à ${prenom(rem.dest)} : il doit confirmer`); setRem(null)
  }
  return <motion.div {...glisse}>{tete('Remettre', 'chacun confirme qu\'il a reçu')}<Etapes statut={r.statut} />
    <div className="list">
      {groupes.map(g => {
        const deja = g.dest ? remisA(r, g.dest) : 0, reste = Math.max(0, g.montant - deja)
        const l = g.dest ? (r.remises || []).filter(m => m.dest === g.dest) : []
        const sous = reste <= 0 ? (l.every(m => m.statut === 'ok') ? `✓ reçu le ${jj(l[l.length - 1]?.le)}` : 'en attente de sa confirmation') : deja ? `${fr(deja)} déjà remis` : 'à remettre'
        return <Ligne key={g.dest || '?'} nom={`${g.dest ? prenom(g.dest) : 'à qui ?'} · ${g.noms.join(', ')}`} sous={sous}
          droite={reste > 0 && n(r.reste) > 0 ? <button className="btn primary es-mini" onClick={() => setRem({ dest: g.dest || '', montant: String(Math.min(reste, Math.round(n(r.reste)))) })}>Remettre {fr(Math.min(reste, n(r.reste)))}</button> : <div className="v"><b>{fr(g.montant)}</b></div>} />
      })}
      {(r.remises || []).filter(m => m.statut === 'refuse').map(m => <Ligne key={m.id} nom={prenom(m.dest)} sous="dit ne pas avoir reçu : revenu chez toi" v={m.montant} />)}
      <Ligne fort nom={`Gardé par ${prenom(r.responsable)}`} v={r.reste} />
    </div>
    {n(r.reste) > 0 && <div className="px"><button className="pv-plus" onClick={() => setRem({ dest: '', montant: '' })}>+ remettre à quelqu'un d'autre</button></div>}
    {n(r.ecart) > 0 && !r.ecart_regle && <div className="es-alerte">Écart de {fr(r.ecart)} signalé à {prenom(r.demande_par)}</div>}
    <Sheet open={!!rem} onClose={() => setRem(null)} foot={<button className="btn primary" disabled={envoi || num(rem?.montant) <= 0} onClick={remettre}>{rem?.dest ? `Remettre à ${prenom(rem.dest)}` : 'Choisir à qui'}</button>}>
      <div className="el-kicker">tu as {fr(r.reste)}</div>
      <button className="el-name" style={{ fontSize: 26, textAlign: 'left' }} onClick={() => setQui(true)}>{rem?.dest || 'À qui ?'} ›</button>
      <div className="cf-lbl">Montant</div>
      <div className="cf-in"><input inputMode="numeric" value={rem?.montant || ''} onChange={e => setRem(v => ({ ...v, montant: e.target.value }))} /><span>MAD</span></div>
    </Sheet>
    <Picker open={qui} onClose={() => setQui(false)} title="Remettre à" items={(r.membres || []).filter(m => m !== r.responsable)} value={rem?.dest || ''} onPick={v => setRem(x => ({ ...x, dest: v }))} />
  </motion.div>
}

/* ---------- Bloc de Ma part : tâches d'Amina, espèces à confirmer ---------- */
export function MesEspeces({ go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const charger = () => api.mesEspeces().then(x => setD(x && Array.isArray(x.taches) ? x : null)).catch(() => {})
  useEffect(() => { charger() }, [])
  if (!d || (!d.taches.length && !d.a_confirmer.length)) return null
  const T = { a_preparer: 'à préparer', refuse: 'refusé : autre fournisseur', valide: 'validé : saisir le reçu', recu: 'à remettre' }
  async function confirmer(m, ok) { try { await api.especesConfirmer(m.id, ok); ui.toast(ok ? 'Merci, c\'est noté' : 'Noté : l\'argent revient chez qui te l\'a remis'); charger() } catch (e) { ui.toast(e.message) } }
  return <div className="px" style={{ marginBottom: 6 }}>
    {d.a_confirmer.length > 0 && <><div className="pv-st">ESPÈCES À CONFIRMER</div>
      {d.a_confirmer.map(m => <div key={m.id} className="pv-env"><div className="l1"><div className="x"><b>{fr(m.montant)} de {prenom(m.par)}</b><span>{[m.code, m.evt].filter(Boolean).join(' · ')}</span></div></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><button className="chip" onClick={() => confirmer(m, false)}>Pas reçu</button><button className="chip on" onClick={() => confirmer(m, true)}>J'ai reçu</button></div></div>)}</>}
    {d.taches.length > 0 && <><div className="pv-st">VIREMENTS ESPÈCES</div>
      {d.taches.map(t => <motion.button whileTap={{ scale: .98 }} key={t.id} className="pv-env" onClick={() => go(`especes-relais/${t.id}`)}>
        <div className="l1"><div className="x"><b>{T[t.statut]}</b><span>{[t.code, t.evt].filter(Boolean).join(' · ')}</span></div><div className="m">{fr(t.besoin)}<small>en espèces</small></div><span className="go">›</span></div></motion.button>)}</>}
  </div>
}
