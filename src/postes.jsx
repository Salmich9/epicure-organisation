import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, dateLongue, ddmm, n, useUI } from './ui'

/* Du général au particulier : enveloppes (prévu) → lignes (engagé) → actions (qui, quand, combien) */
export const k = v => { v = n(v); return Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: v >= 100000 ? 0 : 1 })} k` : Math.round(v).toLocaleString('fr-FR') }
const COUL = ['#A3456B', '#3D6E9E', '#B0652E', '#1F6F6B', '#6A5ACD', '#4F7A3A', '#8A7A2E', '#9E3D3D']
export const couleur = nom => COUL[[...String(nom || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % COUL.length]
export const Av = ({ nom, size = 30, onClick }) => <i className="pv-av" onClick={onClick} style={{ background: couleur(nom), width: size, height: size, fontSize: size * .4 }}>{(nom || '?')[0]}</i>
export const MODES_L = { prelever: 'Prélever', louer: 'Louer', acheter: 'Acheter', produire: 'Produire', rafistoler: 'Rafistoler' }
const MOMENTS = [['accueil', 'Accueil'], ['cocktail', 'Cocktail'], ['diner', 'Dîner'], ['desserts', 'Desserts'], ['late_snack', 'Late snack']]
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (d, j) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + j); return iso(x) }
const jourCourt = (d, today) => { if (!d) return ''; if (d === today) return 'aujourd\'hui'; if (d === plus(today, 1)) return 'demain'; if (d === plus(today, -1)) return 'hier'; return ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][new Date(d + 'T12:00:00').getDay()] + ' ' + ddmm(d) }

export function modeLigne(e) {
  if (e.mode_ligne) return e.mode_ligne
  const m = [['stock', 'prelever'], ['location', 'louer'], ['achat', 'acheter'], ['production', 'produire']].sort((a, b) => n(e[b[0]]) - n(e[a[0]]))[0]
  return n(e[m[0]]) > 0 ? m[1] : null
}
const active = e => e.mode_ligne || n(e.cout) > 0 || n(e.facture) > 0 || ['stock', 'location', 'achat', 'production'].some(c => n(e[c]) > 0)
const gens = data => [...new Set([...Object.values(data.equipe_evt || {}), data.moi, ...data.intervenants.filter(i => ['Équipe', 'Staff / extra'].includes(i.type)).map(i => i.nom)].filter(Boolean))]

/* ---------- Compteur prévu / engagé / réel / reste ---------- */
export function Compteur({ prevu, engage, reel, sans }) {
  const reste = prevu - engage
  return (
    <div className="pv-cpt">
      <div className="r">
        <div><b>{k(prevu)}</b>prévu</div>
        <div><b>{k(engage)}</b>engagé</div>
        {!sans && <div><b>{k(reel)}</b>réel</div>}
        <div className={reste < 0 ? 'neg' : ''}><b>{reste < 0 ? '+' : ''}{k(Math.abs(reste))}</b>{reste < 0 ? 'dépassé' : 'reste'}</div>
      </div>
      <div className="bar"><i className="e" style={{ width: `${Math.min(100, prevu ? engage / prevu * 100 : 0)}%`, background: engage > prevu ? 'var(--gold)' : undefined }} />{!sans && <i className="re" style={{ width: `${Math.min(100, prevu ? reel / prevu * 100 : 0)}%` }} />}</div>
    </div>
  )
}

/* ---------- Sur la page de l'événement ---------- */
export function Enveloppes({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const ps = data.postes || []
  const t = ps.reduce((s, p) => ({ prevu: s.prevu + n(p.prevu), engage: s.engage + n(p.engage), reel: s.reel + n(p.reel) }), { prevu: 0, engage: 0, reel: 0 })
  const mat = ps.filter(p => p.type === 'matiere'), ach = ps.filter(p => p.type === 'achat')
  const manque = MOMENTS.filter(([c]) => !ps.some(p => p.cle === c))
  const [ajout, setAjout] = useState(false)
  const Ligne = ({ p }) => (
    <motion.button whileTap={{ scale: .98 }} className="pv-env" onClick={() => go(`poste/${p.cle}`)}>
      <div className="l1"><Av nom={p.resp} /><div className="x"><b>{p.nom}{p.type === 'matiere' ? ` · ${String(n(p.prix_couvert)).replace('.', ',')} × ${ev.invites || '?'}` : ''}</b><span>{p.resp || 'à attribuer'}</span></div>
        <div className="m">{k(p.engage)} / {k(p.prevu)}<small>engagé / prévu</small></div><span className="go">›</span></div>
      <div className="pb"><i className={n(p.engage) > n(p.prevu) ? 'o' : ''} style={{ width: `${Math.min(100, n(p.prevu) ? n(p.engage) / n(p.prevu) * 100 : 0)}%` }} /></div>
    </motion.button>
  )
  return (
    <div className="pv">
      <Compteur {...t} />
      <div className="pv-leg"><Info text="Prévu : la somme des enveloppes (chiffrage vocal, sinon un ratio par invité ; touche une enveloppe pour corriger). Engagé : ce que coûtent les lignes et les actions. Réel : les pièces imputées et les actions marquées payées." /></div>
      {mat.length > 0 && <div className="pv-st">MATIÈRE PAR MOMENT</div>}
      {mat.map(p => <Ligne key={p.cle} p={p} />)}
      {(mat.length > 0 || (ev.prestations || []).includes('Traiteur')) && manque.length > 0 && (
        ajout ? <div className="chips" style={{ marginTop: 8 }}>{manque.map(([c, l]) => <button key={c} className="chip" onClick={() => api.posteMaj(data.evt, c, { retire: false }).then(() => { setAjout(false); reload() }).catch(e => ui.toast(e.message))}>+ {l}</button>)}</div>
          : <button className="pv-plus" onClick={() => setAjout(true)}>+ un moment</button>)}
      <div className="pv-st">ACHATS</div>
      {ach.map(p => <Ligne key={p.cle} p={p} />)}
    </div>
  )
}

/* ---------- Une enveloppe : lignes et actions ---------- */
export function Poste({ data, cle, go, openEl, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const p = (data.postes || []).find(x => x.cle === cle)
  const [act, setAct] = useState(null)
  const [lig, setLig] = useState(false)
  const [idees, setIdees] = useState(false)
  const [edit, setEdit] = useState(false)
  const [val, setVal] = useState('')
  const [respSheet, setRespSheet] = useState(false)
  if (!p) return <div className="empty" style={{ paddingTop: 80 }}>Enveloppe introuvable. <button className="small" onClick={() => go('')}>Retour</button></div>
  const els = data.elements.filter(e => p.lignes.includes(e.id))
  const lignes = els.filter(active), autres = els.filter(e => !active(e))
  const acts = data.actions.filter(a => p.actions.includes(a.id))
  const sous = id => acts.filter(a => a.element_id === id)
  const directes = acts.filter(a => !a.element_id || !lignes.some(e => e.id === a.element_id))
  const mat = p.type === 'matiere'
  async function sauver() {
    const v = Number(String(val).replace(',', '.').replace(/\s/g, ''))
    if (!(v >= 0)) return setEdit(false)
    try { await api.posteMaj(data.evt, cle, mat ? { prix_couvert: v } : { montant: v }); setEdit(false); reload() } catch (e) { ui.toast(e.message) }
  }
  async function cocher(a) { try { await api.actionEnregistrer(data.evt, a.id, { fait: a.statut !== 'Fait' }); reload() } catch (e) { ui.toast(e.message) } }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head">
        <div className="pv-top"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button><Av nom={p.resp} size={34} onClick={() => setRespSheet(true)} /></div>
        <h1 style={{ fontSize: 34 }}>{mat ? `${p.nom} · matière` : p.nom}</h1>
        <div className="meta">{p.resp || 'à attribuer'}{mat ? ` · ${String(n(p.prix_couvert)).replace('.', ',')} MAD × ${ev.invites || '?'} invités` : ''} · <button className="pv-lien" onClick={() => { setVal(mat ? p.prix_couvert : p.prevu); setEdit(true) }}>corriger le prévu</button>
          <Info text={p.source === 'chiffrage' ? 'Prévu repris du chiffrage vocal.' : p.source === 'manuel' ? 'Prévu corrigé à la main.' : 'Prévu calculé avec un ratio par invité : corrige-le si tu as mieux.'} /></div>
      </div>
      <div className="px">
        {edit && <div className="pv-edit"><input autoFocus inputMode="decimal" value={val} onChange={x => setVal(x.target.value)} onKeyDown={x => x.key === 'Enter' && sauver()} /><span>{mat ? 'MAD / couvert' : 'MAD'}</span><button className="btn primary" onClick={sauver}>OK</button></div>}
        <Compteur prevu={n(p.prevu)} engage={n(p.engage)} reel={n(p.reel)} />
        <div className="pv-st">LIGNES · {lignes.length}</div>
        {lignes.length + directes.length === 0 && <div className="pv-vide">Rien encore. Ajoute une ligne quand tu sais, ou une action.</div>}
        {lignes.length > 0 && <div className="pv-sub">{lignes.map(e => (
          <div key={e.id}>
            <button className="pv-ln" onClick={() => openEl(e)}>
              <Tag m={modeLigne(e)} />
              <div className="x"><b>{e.element}</b><span>{[n(e.besoin) ? `${n(e.besoin)}` : null, e.fournisseur, e.perimetre === 'Tiers' ? `tiers${e.fourni_par ? ` · ${e.fourni_par}` : ''}` : null].filter(Boolean).join(' · ') || ' '}</span></div>
              <span className="p">{n(e.cout) ? k(e.cout) : '—'}</span>
            </button>
            {sous(e.id).map(a => <SousAction key={a.id} a={a} today={data.aujourdhui} onTap={() => setAct({ a })} onCheck={() => cocher(a)} />)}
          </div>
        ))}</div>}
        {directes.length > 0 && <><div className="pv-st">ACTIONS · {directes.length}</div>
          <div className="pv-sub">{directes.map(a => <LigneAction key={a.id} a={a} today={data.aujourdhui} onTap={() => setAct({ a })} onCheck={() => cocher(a)} />)}</div></>}
        <div className="pv-add">
          <motion.button whileTap={{ scale: .96 }} onClick={() => setAct({ voix: true })}>🎙 Dire</motion.button>
          <motion.button whileTap={{ scale: .96 }} onClick={() => setLig(true)}>+ Ligne</motion.button>
          <motion.button whileTap={{ scale: .96 }} onClick={() => setAct({})}>+ Action</motion.button>
        </div>
        {autres.length > 0 && <>
          <button className="pv-idees" onClick={() => setIdees(!idees)}>Idées de la bibliothèque · {autres.length} {idees ? '▾' : '›'}</button>
          {idees && <div className="pv-sub">{autres.map(e => <button key={e.id} className="pv-ln idee" onClick={() => openEl(e)}><Tag m={null} /><div className="x"><b>{e.element}</b><span>{e.zone}</span></div><span className="p">›</span></button>)}</div>}
        </>}
      </div>
      <ActionSheet open={!!act} init={act} data={data} poste={cle} onClose={() => setAct(null)} onDone={() => { setAct(null); reload() }} />
      <LigneSheet open={lig} data={data} poste={cle} onClose={() => setLig(false)} onDone={() => { setLig(false); reload() }} />
      <Sheet open={respSheet} onClose={() => setRespSheet(false)}>
        <div className="el-name" style={{ fontSize: 26 }}>Qui tient l'enveloppe ?</div>
        <div className="chips" style={{ marginTop: 14 }}>{gens(data).map(g => <button key={g} className={`chip ${g === p.resp ? 'on' : ''}`} onClick={() => api.posteMaj(data.evt, cle, { resp: g }).then(() => { setRespSheet(false); reload() }).catch(e => ui.toast(e.message))}>{g}</button>)}</div>
      </Sheet>
    </motion.div>
  )
}

const Tag = ({ m }) => <span className={`pv-md ${m || 'vide'}`}>{m ? MODES_L[m] : 'Idée'}</span>
const detailAction = (a, today) => [a.resp, jourCourt(a.echeance, today) + (a.heure ? ` ${a.heure}` : ''),
  a.logistique?.mode === 'livre' ? `livré${a.logistique.lieu ? ` ${a.logistique.lieu}` : ''}` : a.logistique?.mode === 'recuperer' ? `à récupérer${a.logistique.lieu ? ` ${a.logistique.lieu}` : ''}` : null,
  a.logistique?.retour_j1 ? 'retour J+1' : null].filter(Boolean).join(' · ')
function SousAction({ a, today, onTap, onCheck }) {
  return <div className={`pv-sa ${a.statut === 'Fait' ? 'fait' : ''}`}><button className={`pv-ck ${a.statut === 'Fait' ? 'on' : ''}`} onClick={onCheck} aria-label="Fait" /><button className="t" onClick={onTap}><b>{a.quoi}</b> · {detailAction(a, today)}{n(a.cout) ? ` · ${k(a.cout)}` : ''}</button></div>
}
function LigneAction({ a, today, onTap, onCheck }) {
  return (
    <div className={`pv-ln ${a.statut === 'Fait' ? 'fait' : ''}`}>
      <button className={`pv-ck ${a.statut === 'Fait' ? 'on' : ''}`} onClick={onCheck} aria-label="Fait" />
      <button className="x" onClick={onTap}><b>{a.quoi}</b><span>{detailAction(a, today)}</span></button>
      <span className="p">{n(a.cout) ? k(a.cout) : '—'}{a.paye ? <small>payé</small> : null}</span>
    </div>
  )
}

/* ---------- Ajouter / modifier une action ---------- */
const PAIE = [['virement', 'Virement / chèque'], ['caisse', 'Caisse espèces'], ['carte', 'Carte']]
export function ActionSheet({ open, init, data, poste, onClose, onDone }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const a0 = init?.a
  const pDefaut = poste || init?.poste || 'materiel'
  const respPoste = c => (data.postes || []).find(p => p.cle === c)?.resp
  const vide = () => ({ quoi: '', cout: '', quand: plus(data.aujourdhui, 1), heure: '', qui: respPoste(pDefaut) || data.moi, poste: pDefaut, element_id: init?.element_id || '', logistique: {}, paiement: '', carte: '', paye: false })
  const [f, setF] = useState(vide)
  const [ecoute, setEcoute] = useState(false)
  const [dit, setDit] = useState('')
  const [lit, setLit] = useState(false)
  const [suppr, setSuppr] = useState(false)
  const [plusG, setPlusG] = useState(false)
  const rec = useRef(null)
  useEffect(() => {
    if (!open) { rec.current?.stop(); return }
    setSuppr(false); setDit(''); setPlusG(false)
    setF(a0 ? { quoi: a0.quoi || '', cout: a0.cout ?? '', quand: a0.echeance || '', heure: a0.heure || '', qui: a0.resp || '', poste: a0.poste || pDefaut, element_id: a0.element_id || '', logistique: a0.logistique || {}, paiement: a0.paiement || '', carte: a0.carte || '', paye: !!a0.paye } : vide())
    if (init?.voix) setTimeout(ecouter, 250)
  }, [open])
  const set = (c, v) => setF(x => ({ ...x, [c]: v }))
  const setL = (c, v) => setF(x => ({ ...x, logistique: { ...x.logistique, [c]: v } }))
  function ecouter() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { ui.bubble('La dictée n\'est pas disponible ici : utilise le micro du clavier dans « Quoi ».'); return }
    if (rec.current) { rec.current.stop(); return }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true
    let t = ''
    r.onresult = e => { t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; setDit(t) }
    r.onend = () => { rec.current = null; setEcoute(false); if (t.trim()) comprendre(t) }
    rec.current = r; r.start(); setEcoute(true)
  }
  async function comprendre(t) {
    setLit(true)
    try {
      const d = await api.dicter(t, poste)
      setF(x => ({ ...x, quoi: d.quoi || x.quoi, cout: d.cout ?? x.cout, qui: d.qui || x.qui, quand: d.quand || x.quand, heure: d.heure || x.heure,
        poste: (data.postes || []).some(p => p.cle === d.poste) ? d.poste : x.poste, element_id: d.element_id || x.element_id,
        paiement: d.paiement || x.paiement,
        logistique: { ...x.logistique, ...(d.livraison ? { mode: d.livraison } : {}), ...(d.lieu ? { lieu: d.lieu } : {}), ...(d.vehicule ? { vehicule: d.vehicule } : {}), ...(d.retour_j1 ? { retour_j1: true } : {}), ...(d.contact ? { contact: d.contact } : {}) } }))
      if (d.vehicule || d.contact) setPlusG(true)
    } catch (e) { ui.toast(e.message) }
    setLit(false)
  }
  const manque = !f.quoi.trim() ? 'quoi' : f.cout === '' || f.cout === null ? 'le coût' : !f.qui ? 'qui' : !f.quand ? 'quand' : null
  async function valider() {
    if (manque) return ui.toast(`Il manque ${manque}.`)
    const p = { ...f, cout: Number(String(f.cout).replace(',', '.')) || 0 }
    try {
      const a = await api.actionEnregistrer(data.evt, a0?.id || null, p)
      if (!a0 && a.resp && a.resp !== data.moi) {
        const L = a.logistique || {}
        const msg = `Salam ${a.resp}, pour ${ev.nom} : ${a.quoi}. Pour ${jourCourt(a.echeance, data.aujourdhui)}${a.heure ? ` ${a.heure}` : ''}${n(a.cout) ? `, budget ${k(a.cout)} MAD` : ''}${L.mode === 'livre' ? `, livré${L.lieu ? ` à ${L.lieu}` : ''}` : L.mode === 'recuperer' ? `, à récupérer${L.lieu ? ` chez ${L.lieu}` : ''}` : ''}${L.contact ? ` (contact : ${L.contact})` : ''}${a.paiement ? `, paiement ${PAIE.find(x => x[0] === a.paiement)?.[1].toLowerCase()}${a.carte ? ` ${a.carte}` : ''}` : ''}. Merci de me confirmer 🙏`
        const tel = data.intervenants.find(i => i.nom === a.resp)?.tel
        window.open(`https://wa.me/${tel || ''}?text=${encodeURIComponent(msg)}`, '_blank')
      }
      ui.toast(a0 ? 'Action modifiée' : 'Action ajoutée'); onDone?.()
    } catch (e) { ui.toast(e.message) }
  }
  async function supprimer() {
    if (!suppr) return setSuppr(true)
    try { await api.actionSupprimer(a0.id); onDone?.() } catch (e) { ui.toast(e.message) }
  }
  const L = f.logistique || {}
  const lignesP = data.elements.filter(e => ((data.postes || []).find(p => p.cle === f.poste)?.lignes || []).includes(e.id) && active(e))
  const coutN = Number(String(f.cout).replace(',', '.')) || 0
  const pourAutre = f.qui && f.qui !== data.moi
  return (
    <Sheet open={open} onClose={onClose} z={1} foot={<button className="btn primary" onClick={valider} disabled={lit}>{a0 ? 'Enregistrer' : `Ajouter${coutN ? ` · +${k(coutN)} engagé` : ''}${pourAutre ? ` · WhatsApp à ${f.qui}` : ''}`}</button>}>
      <div className="as-voix">
        <motion.button whileTap={{ scale: .9 }} className={`as-mic ${ecoute ? 'rec' : ''}`} onClick={ecouter} aria-label="Dicter">🎙</motion.button>
        <span>{lit ? 'Je remplis la fiche…' : dit ? `« ${dit} »` : ecoute ? 'Je t\'écoute…' : a0 ? 'Modifier l\'action' : 'Dis-le : « le pain, 350 pers., 1 500 dh, Salima, livré jeudi 16 h »'}</span>
      </div>
      <div className="as-l">QUOI</div>
      <input value={f.quoi} onChange={x => set('quoi', x.target.value)} placeholder="Commander le pain · 350 pers." />
      <div className="as-2">
        <div><div className="as-l">COÛT</div><input inputMode="decimal" value={f.cout} onChange={x => set('cout', x.target.value)} placeholder="MAD" /></div>
        <div><div className="as-l">QUAND</div><input type="date" value={f.quand} onChange={x => set('quand', x.target.value)} /></div>
      </div>
      <div className="as-l">QUI</div>
      <div className="chips">{gens(data).slice(0, plusG ? 99 : 6).map(g => <button key={g} className={`chip ${f.qui === g ? 'on' : ''}`} onClick={() => set('qui', g)}>{g}</button>)}
        {f.qui && !gens(data).slice(0, plusG ? 99 : 6).includes(f.qui) && <button className="chip on">{f.qui}</button>}
        {!plusG && <button className="chip ghost" onClick={() => setPlusG(true)}>+</button>}</div>
      <div className="as-l">ENVELOPPE</div>
      <div className="chips">{(data.postes || []).map(p => <button key={p.cle} className={`chip ${f.poste === p.cle ? 'on' : ''}`} onClick={() => setF(x => ({ ...x, poste: p.cle, element_id: '' }))}>{p.type === 'matiere' ? `Matière ${p.nom.toLowerCase()}` : p.nom}</button>)}</div>
      {lignesP.length > 0 && <>
        <div className="as-l">SUR LA LIGNE</div>
        <div className="chips">{lignesP.slice(0, 12).map(e => <button key={e.id} className={`chip ${f.element_id === e.id ? 'on' : ''}`} onClick={() => set('element_id', f.element_id === e.id ? '' : e.id)}>{e.element}</button>)}</div>
      </>}
      <div className="as-l">LOGISTIQUE</div>
      <div className="chips">
        <button className={`chip ${L.mode === 'livre' ? 'on' : ''}`} onClick={() => setL('mode', L.mode === 'livre' ? '' : 'livre')}>Livré au lieu</button>
        <button className={`chip ${L.mode === 'recuperer' ? 'on' : ''}`} onClick={() => setL('mode', L.mode === 'recuperer' ? '' : 'recuperer')}>À récupérer</button>
        <button className={`chip ${L.retour_j1 ? 'on' : ''}`} onClick={() => setL('retour_j1', !L.retour_j1)}>Retour J+1</button>
      </div>
      {L.mode && <div className="as-2" style={{ marginTop: 8 }}>
        <input value={L.lieu || ''} onChange={x => setL('lieu', x.target.value)} placeholder={L.mode === 'livre' ? 'Où' : 'Chez qui'} />
        <input value={f.heure} onChange={x => set('heure', x.target.value)} placeholder="Heure (16 h)" />
      </div>}
      <div className="as-2" style={{ marginTop: 8 }}>
        <input value={L.vehicule || ''} onChange={x => setL('vehicule', x.target.value)} placeholder="Véhicule / qui transporte" />
        <input value={L.contact || ''} onChange={x => setL('contact', x.target.value)} placeholder="☎ Contact fournisseur" />
      </div>
      <div className="as-l">PAIEMENT</div>
      <div className="chips">{PAIE.map(([c, l]) => <button key={c} className={`chip ${f.paiement === c ? 'on' : ''}`} onClick={() => setF(x => ({ ...x, paiement: x.paiement === c ? '' : c, carte: c === 'carte' ? x.carte : '' }))}>{l}</button>)}</div>
      {f.paiement === 'carte' && ev.entite === 'Espèce' && <div className="chips" style={{ marginTop: 8 }}>{['Business Boys', 'Epicure'].map(c => <button key={c} className={`chip ${f.carte === c ? 'on' : ''}`} onClick={() => set('carte', c)}>Carte {c}</button>)}</div>}
      {a0 && <>
        <div className="chips" style={{ marginTop: 16 }}><button className={`chip ${f.paye ? 'on' : ''}`} onClick={() => set('paye', !f.paye)}>{f.paye ? '✓ Payé' : 'Marquer payé'}</button></div>
        <button className={`evt-suppr ${suppr ? 'on' : ''}`} style={{ width: '100%', marginTop: 18 }} onClick={supprimer} onBlur={() => setSuppr(false)}>{suppr ? 'Toucher encore pour supprimer' : 'Supprimer l\'action'}</button>
      </>}
    </Sheet>
  )
}

/* ---------- Ajouter une ligne quand on sait ---------- */
export function LigneSheet({ open, data, poste, onClose, onDone }) {
  const ui = useUI()
  const [f, setF] = useState({ nom: '', mode: 'louer', qte: '', prix: '', fournisseur: '', catalogue_id: '' })
  const [cat, setCat] = useState(null)
  useEffect(() => { if (open) { setF({ nom: '', mode: ['staff', 'logistique'].includes(poste) ? 'produire' : poste === 'consommables' || (data.postes || []).find(p => p.cle === poste)?.type === 'matiere' ? 'acheter' : 'louer', qte: '', prix: '', fournisseur: '', catalogue_id: '' }); if (!cat) api.catalogueListe().then(setCat).catch(() => {}) } }, [open])
  const set = (c, v) => setF(x => ({ ...x, [c]: v }))
  const sug = useMemo(() => {
    const q = f.nom.trim().toLowerCase(); if (q.length < 2 || !Array.isArray(cat) || f.catalogue_id) return []
    return cat.filter(c => (c.element || '').toLowerCase().includes(q)).slice(0, 5)
  }, [f.nom, cat, f.catalogue_id])
  function choisir(c) {
    const pr = { louer: c.prix_location, acheter: c.prix_achat, produire: c.prix_production, rafistoler: c.prix_production }[f.mode] ?? c.prix_location ?? c.prix_achat ?? c.prix_production
    setF(x => ({ ...x, nom: c.element, catalogue_id: c.id, prix: pr ?? '', fournisseur: c.fournisseur || x.fournisseur }))
  }
  const tot = (Number(String(f.qte || 1).replace(',', '.')) || 0) * (Number(String(f.prix).replace(',', '.')) || 0)
  async function valider() {
    if (!f.nom.trim()) return ui.toast('Il manque le nom.')
    try { await api.ligneAjouter(data.evt, { ...f, poste, qte: f.qte || 1 }); ui.toast('Ligne ajoutée'); onDone?.() } catch (e) { ui.toast(e.message) }
  }
  return (
    <Sheet open={open} onClose={onClose} z={1} foot={<button className="btn primary" onClick={valider}>Ajouter{tot ? ` · +${k(tot)} engagé` : ''}</button>}>
      <div className="el-name" style={{ fontSize: 26 }}>Nouvelle ligne</div>
      <div className="as-l">QUOI</div>
      <input autoFocus value={f.nom} onChange={x => setF(y => ({ ...y, nom: x.target.value, catalogue_id: '' }))} placeholder="Assiettes plates, chafing dish…" />
      {sug.length > 0 && <div className="as-sug">{sug.map(c => <button key={c.id} onClick={() => choisir(c)}>{c.element}<span>{c.zone}</span></button>)}</div>}
      <div className="as-l">COMMENT</div>
      <div className="chips">{Object.entries(MODES_L).map(([c, l]) => <button key={c} className={`chip ${f.mode === c ? 'on' : ''}`} onClick={() => set('mode', c)}>{l}</button>)}</div>
      <div className="as-2">
        <div><div className="as-l">QUANTITÉ</div><input inputMode="decimal" value={f.qte} onChange={x => set('qte', x.target.value)} placeholder="1" /></div>
        <div><div className="as-l">{f.mode === 'prelever' ? 'COÛT (souvent 0)' : 'PRIX UNITAIRE'}</div><input inputMode="decimal" value={f.prix} onChange={x => set('prix', x.target.value)} placeholder="MAD" /></div>
      </div>
      <div className="as-l">{f.mode === 'louer' ? 'LOUEUR' : f.mode === 'acheter' ? 'FOURNISSEUR' : 'QUI / OÙ'}</div>
      <input value={f.fournisseur} onChange={x => set('fournisseur', x.target.value)} placeholder="Facultatif" />
    </Sheet>
  )
}

/* ---------- Aujourd'hui (et Ma part) : les actions de tous les événements ---------- */
export function Aujourdhui({ go, ouvrirPoste, mapart }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [moi, setMoi] = useState(() => { try { return localStorage.getItem('orga_auj_moi') === '1' } catch { return false } })
  const charger = () => api.aujourdhui().then(setD).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const t = d.aujourdhui, dem = plus(t, 1)
  const seul = mapart || moi
  const L = d.actions.filter(a => !seul || a.resp === d.moi)
  const groupes = mapart
    ? [['EN RETARD', L.filter(a => a.statut !== 'Fait' && a.echeance && a.echeance < t)], ['AUJOURD\'HUI', L.filter(a => a.echeance === t)], ['DEMAIN', L.filter(a => a.echeance === dem)],
       ['PLUS TARD', L.filter(a => a.statut !== 'Fait' && a.echeance > dem)], ['SANS DATE', L.filter(a => a.statut !== 'Fait' && !a.echeance)]]
    : [['EN RETARD', L.filter(a => a.statut !== 'Fait' && a.echeance && a.echeance < t)], ['AUJOURD\'HUI', L.filter(a => a.echeance === t)], ['DEMAIN', L.filter(a => a.echeance === dem)]]
  const plusTard = mapart ? 0 : L.filter(a => a.statut !== 'Fait' && a.echeance > dem).length
  async function cocher(a) {
    setD(x => ({ ...x, actions: x.actions.map(y => y.id === a.id ? { ...y, statut: a.statut === 'Fait' ? 'À faire' : 'Fait' } : y) }))
    try { await api.actionEnregistrer(a.evenement_id, a.id, { fait: a.statut !== 'Fait' }) } catch (e) { ui.toast(e.message); charger() }
  }
  const total = groupes.reduce((s, g) => s + g[1].length, 0)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><div className="when">{dateLongue(t)}</div><h1 style={{ fontSize: 40 }}>{mapart ? 'Ma part' : 'Aujourd\'hui'}</h1>
        {mapart && <div className="meta">Ce qui est à ton nom, tous événements.</div>}</div>
      {!mapart && <div className="au-seg"><button className={!moi ? 'on' : ''} onClick={() => { setMoi(false); try { localStorage.setItem('orga_auj_moi', '0') } catch {} }}>Tout le monde</button><button className={moi ? 'on' : ''} onClick={() => { setMoi(true); try { localStorage.setItem('orga_auj_moi', '1') } catch {} }}>Ma part</button></div>}
      <div className="px">
        {!total && <div className="pv-vide" style={{ marginTop: 20 }}>{mapart ? 'Rien à ton nom.' : 'Rien pour aujourd\'hui ni demain.'}{plusTard ? ` ${plusTard} action${plusTard > 1 ? 's' : ''} plus tard.` : ''}</div>}
        {groupes.filter(g => g[1].length).map(([l, g]) => (
          <div key={l}>
            <div className={`pv-st ${l === 'EN RETARD' ? 'rouge' : ''}`}>{l} · {g.length}</div>
            {g.map(a => {
              const j = a.evt_date ? Math.round((new Date(a.evt_date) - new Date(t)) / 864e5) : null
              return (
                <div key={a.id} className={`au-ac ${a.statut === 'Fait' ? 'fait' : ''}`}>
                  <motion.button whileTap={{ scale: .85 }} className={`pv-ck ${a.statut === 'Fait' ? 'on' : ''}`} onClick={() => cocher(a)} aria-label="Fait" />
                  <button className="x" onClick={() => ouvrirPoste(a.evenement_id, a.poste)}>
                    <b>{a.quoi}</b>
                    <span>{j !== null && j >= 0 && j <= 7 && <i className="pv-j">J-{j}</i>}{[a.evt_nom, a.poste_nom, a.element, a.logistique?.mode === 'livre' ? `livré${a.heure ? ` ${a.heure}` : ''}` : a.logistique?.mode === 'recuperer' ? `à récupérer${a.heure ? ` ${a.heure}` : ''}` : null, a.logistique?.retour_j1 ? 'retour J+1' : null].filter(Boolean).join(' · ')}</span>
                  </button>
                  <div className="h">{n(a.cout) ? k(a.cout) : '—'}<small>{jourCourt(a.echeance, t)}</small></div>
                  <Av nom={a.resp} />
                </div>
              )
            })}
          </div>
        ))}
        {plusTard > 0 && total > 0 && <div className="pv-vide">+ {plusTard} action{plusTard > 1 ? 's' : ''} plus tard</div>}
        <button className="pv-plus" style={{ marginTop: 18 }} onClick={() => go('accueil')}>Événements ›</button>
      </div>
    </motion.div>
  )
}
