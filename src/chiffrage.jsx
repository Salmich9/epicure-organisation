// Paramètres de chiffrage (une seule source pour le copilote écrit et l'agent vocal) et chiffrage détaillé :
// moments séparés, staff une ligne par personne, transport du personnel séparé de celui des marchandises.
// Toucher une ligne calculée ouvre sa fenêtre : prix, ratio, effectif, « Cet événement seulement » ou « Aussi la référence ».
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, mad, n, useUI } from './ui'
import { nomStaff } from './staff'

const glisse = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }
export const fr = v => { v = n(v); return v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) }
const num = s => { if (s === null || s === undefined || String(s).trim() === '') return null; const x = Number(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null }
const dj = d => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '')

export const SECTIONS = [['moments', 'Moments'], ['staff', 'Staff'], ['transport', 'Transport'], ['bar', 'Bar et boissons'], ['materiel', 'Matériel'], ['marges', 'Marges']]
export const BLOCS = [['moments', 'Moments'], ['staff', 'Staff'], ['frais_staff', 'Frais du staff'], ['transport_personnel', 'Transport du personnel'],
  ['transport_marchandises', 'Transport des marchandises'], ['materiel', 'Matériel et locations'], ['bar', 'Bar et boissons'], ['divers', 'Imprévus et divers']]
export const MOMENTS = [['accueil', 'Accueil'], ['cocktail', 'Cocktail dînatoire'], ['diner_assis', 'Dîner assis'], ['buffet', 'Buffet'], ['desserts', 'Desserts'],
  ['late_snack', 'Late snack'], ['bar_sans_alcool', 'Bar sans alcool']]
const ALCOOLS = [['cocktails', 'Cocktails'], ['vins', 'Vins'], ['spirits', 'Spirits']]
const PORTEE = { reference: 'référence', evenement: 'cet événement', cloture: 'clôture' }

// Texte du ratio d'un paramètre
export function ratioTexte(p, r = p.ratio) {
  if (r === null || r === undefined) return ''
  if (p.calcul === 'un_pour') return `1 pour ${fr(r)} ${p.ratio_unite || ''}`.trim()
  return `${fr(r)} ${p.ratio_unite || ''}`.trim()
}
function Tend({ p }) {
  const t = n(p.tendance)
  if (!p.tendance || !t) return null
  return <span className={`cf-tend ${t > 0 ? 'up' : 'down'}`}>{t > 0 ? '↗' : '↘'} {Math.abs(t)} %</span>
}
const histoTexte = h => `${dj(h.le)} · ${h.champ === 'actif' ? (n(h.nouveau) ? 'allumé' : 'éteint') : `${fr(h.ancien)} → ${fr(h.nouveau)}`}${h.champ === 'ratio' ? ' (ratio)' : ''} · ${h.portee === 'evenement' ? h.evt_nom || 'un événement' : PORTEE[h.portee]}${h.par ? ` · ${h.par}` : ''}`

/* ---------- Écran Paramètres ---------- */
export function Parametres({ go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [sec, setSec] = useState('moments')
  const [ouvert, setOuvert] = useState(null)
  useEffect(() => { api.chiffrageParams().then(setD).catch(e => ui.toast(e.message)) }, [])
  const groupes = useMemo(() => {
    const g = []
    for (const p of (d?.params || []).filter(x => x.section === sec)) { let x = g.find(y => y.nom === p.groupe); if (!x) g.push(x = { nom: p.groupe, ps: [] }); x.ps.push(p) }
    return g
  }, [d, sec])
  return (
    <motion.div {...glisse} className="wiz">
      <div className="head">
        <button className="back" onClick={() => go('accueil')}>‹ Événements</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Paramètres <Info text="Les prix et ratios du chiffrage, pour le copilote et l'agent vocal. Touche une ligne pour la changer : le prochain chiffrage la prend tout de suite." /></h1>
        <div className="meta">{d && !d.peut_modifier ? 'Lecture seule : seul Salmane change les références' : 'Chiffrage écrit et vocal'}</div>
      </div>
      <div className="px"><div className="chips dp-cats" style={{ marginTop: 12 }}>
        {SECTIONS.map(([k, l]) => <button key={k} className={`chip ${sec === k ? 'on' : ''}`} onClick={() => setSec(k)}>{l}</button>)}
      </div></div>
      {!d && <p className="small mute px" style={{ marginTop: 20 }}>Chargement…</p>}
      {groupes.map(g => (
        <div key={g.nom}>
          <div className="cf-grp">{g.nom.toUpperCase()}</div>
          <div className="list">{g.ps.map(p => (
            <button key={p.cle} className={`cf-l ${p.actif ? '' : 'off'}`} onClick={() => setOuvert(p)}>
              <div className="x"><b>{p.libelle}{p.actif ? '' : ' · éteint'}</b>
                <span>{[ratioTexte(p), p.sous, p.nb_modifs ? `modifié ${p.nb_modifs} fois` : ''].filter(Boolean).join(' · ')}<Tend p={p} /></span></div>
              <div className="cf-v"><span className="cf-chip">{fr(p.valeur)}</span><em>{p.unite}</em></div>
            </button>
          ))}</div>
        </div>
      ))}
      <ParamSheet p={ouvert} peut={!!d?.peut_modifier} onClose={() => setOuvert(null)} onSaved={nd => { setD(nd); setOuvert(null); ui.toast('Référence changée : le prochain chiffrage la prend') }} />
    </motion.div>
  )
}

function ParamSheet({ p, peut, onClose, onSaved }) {
  const ui = useUI()
  const [v, setV] = useState(''), [r, setR] = useState(''), [actif, setActif] = useState(true), [envoi, setEnvoi] = useState(false)
  useEffect(() => { if (p) { setV(fr(p.valeur)); setR(p.ratio === null ? '' : fr(p.ratio)); setActif(p.actif) } }, [p])
  if (!p) return <Sheet open={false} onClose={onClose} />
  const aRatio = p.ratio !== null || p.calcul === 'un_pour'
  async function sauver() {
    const x = { valeur: num(v), actif }
    if (aRatio) x.ratio = num(r)
    if (x.valeur === null) return ui.toast('Il manque le chiffre')
    setEnvoi(true)
    try { onSaved(await api.chiffrageParamMaj(p.cle, x)) } catch (e) { ui.toast(e.message) }
    setEnvoi(false)
  }
  return (
    <Sheet open={!!p} onClose={onClose} foot={peut ? <button className="btn primary" disabled={envoi} onClick={sauver}>{envoi ? '…' : 'Enregistrer la référence'}</button> : null}>
      <div className="el-kicker">{p.groupe}</div>
      <div className="el-name" style={{ fontSize: 28 }}>{p.libelle}</div>
      {p.sous && <div className="small mute">{p.sous}</div>}
      <div className="cf-lbl">{p.calcul === 'pct' ? 'Taux' : p.section === 'staff' && p.calcul !== 'par_base' ? 'Coût par personne' : 'Prix'}</div>
      <div className="cf-in"><input inputMode="decimal" value={v} disabled={!peut} onChange={e => setV(e.target.value)} autoFocus={peut} /><span>{p.unite}</span></div>
      {aRatio && <>
        <div className="cf-lbl">{p.calcul === 'un_pour' ? 'Ratio' : p.calcul === 'fixe' ? 'Nombre' : 'Quantité'}</div>
        <div className="cf-in">{p.calcul === 'un_pour' && <span>1 pour</span>}<input inputMode="decimal" value={r} disabled={!peut} onChange={e => setR(e.target.value)} /><span>{p.ratio_unite}</span></div>
      </>}
      {p.calcul !== 'regle' && <div className="chips" style={{ marginTop: 14 }}>
        <button className={`chip ${actif ? 'on' : ''}`} disabled={!peut} onClick={() => setActif(true)}>Compté</button>
        <button className={`chip ${!actif ? 'on' : ''}`} disabled={!peut} onClick={() => setActif(false)}>Éteint</button>
      </div>}
      <div className="cf-src">{p.nb_modifs ? <>Modifié <b>{p.nb_modifs} fois</b><Tend p={p} />{p.tendance_evt ? <> · moyenne des derniers événements <b>{fr(p.tendance_evt)}</b></> : null}</> : 'Jamais modifié'}
        {(p.histo || []).length > 0 && <ul className="cf-h">{p.histo.slice(0, 5).map((h, i) => <li key={i}>{histoTexte(h)}</li>)}</ul>}
      </div>
      {!peut && <p className="small mute" style={{ marginTop: 12 }}>Seul Salmane change les références.</p>}
    </Sheet>
  )
}

/* ---------- Informations de base de l'événement ---------- */
export function InfosBase({ base, onChange, occupe }) {
  if (!base) return null
  const m = base.moments || [], al = base.alcool || []
  const bascule = (k, v) => onChange({ [k]: v })
  const tg = (arr, x) => (arr.includes(x) ? arr.filter(y => y !== x) : [...arr, x])
  const resume = [base.traiteur && 'Traiteur', base.bar && 'Bar', ...MOMENTS.filter(([k]) => m.includes(k)).map(([, l]) => l)].filter(Boolean).join(' · ')
  return (
    <details className="cf-base">
      <summary>Informations de base <span>{occupe ? 'calcul…' : resume || 'à choisir'} ›</span></summary>
      <div className="chips">
        <button className={`chip ${base.traiteur ? 'on' : ''}`} onClick={() => bascule('traiteur', !base.traiteur)}>Traiteur</button>
        <button className={`chip ${base.bar ? 'on' : ''}`} onClick={() => bascule('bar', !base.bar)}>Bar</button>
      </div>
      {base.traiteur && <><div className="cf-lbl">Moments</div><div className="chips">
        {MOMENTS.map(([k, l]) => <button key={k} className={`chip ${m.includes(k) ? 'on' : ''}`} onClick={() => bascule('moments', tg(m, k))}>{l}</button>)}
      </div></>}
      {base.bar && <><div className="cf-lbl">Alcool fourni par nous</div><div className="chips">
        {ALCOOLS.map(([k, l]) => <button key={k} className={`chip ${al.includes(k) ? 'on' : ''}`} onClick={() => bascule('alcool', tg(al, k))}>{l}</button>)}
      </div></>}
      <div className="cf-lbl">Lieu</div><div className="chips">
        <button className={`chip ${base.hors_marrakech ? 'on' : ''}`} onClick={() => bascule('hors_marrakech', !base.hors_marrakech)}>Hors Marrakech</button>
        <button className={`chip ${base.autre_ville ? 'on' : ''}`} onClick={() => bascule('autre_ville', !base.autre_ville)}>Autre ville</button>
      </div>
    </details>
  )
}

// « Chef de rang » → « Chefs de rang » ; « Commis » ne change pas
const pluriel = (t, k) => (k > 1 ? t.replace(/^(\S+?)(?<![sx])(\s|$)/, '$1s$2') : t)

/* ---------- Le chiffrage détaillé, bloc par bloc ---------- */
export function Detail({ lignes, params, base, onParam, onPersonne, extras }) {
  const [deplie, setDeplie] = useState({})
  const blocs = useMemo(() => BLOCS.map(([k, l]) => {
    const ls = lignes.map((x, i) => ({ ...x, i })).filter(x => x.param && (x.groupe || 'divers') === k)
    const par = []
    for (const x of ls) { let g = par.find(y => y.cle === x.param); if (!g) par.push(g = { cle: x.param, ls: [], total: 0 }); g.ls.push(x); g.total += n(x.quantite) * n(x.prix) }
    return { k, l, par, total: par.reduce((s, g) => s + g.total, 0), pers: ls.filter(x => x.rang).length }
  }).filter(b => b.par.length), [lignes])
  const sur = cle => !!(base?.surcharges?.[cle] || base?.effectifs?.[cle] !== undefined)
  return <>
    {blocs.map(b => (
      <div key={b.k}>
        <div className="cf-grp"><span>{b.l.toUpperCase()}{b.k === 'staff' ? ` · ${b.pers} PERSONNES` : ''}</span><b>{mad(b.total)}</b></div>
        <div className="list">{b.par.map(g => {
          const p = params[g.cle] || {}, staff = g.ls[0].rang !== undefined
          const nom = staff ? `${pluriel(String(p.libelle || g.ls[0].element).replace(/ \d+$/, ''), g.ls.length)} · ${g.ls.length}` : g.ls[0].element
          const ouvert = deplie[g.cle] || g.ls.length <= 4, vus = ouvert ? g.ls : g.ls.slice(0, 3)
          return (
            <div key={g.cle}>
              <button className="cf-l" onClick={() => onParam(g.cle, g.ls)}>
                <div className="x"><b>{nom}</b><span>{g.ls[0].note}{sur(g.cle) ? <span className="cf-evt" style={{ display: 'inline' }}> · pour cet événement</span> : null}</span></div>
                <div className="cf-v">{fr(Math.round(g.total))}</div>
              </button>
              {staff && <>
                {vus.map(x => (
                  <button key={x.i} className="cf-sub" onClick={() => onPersonne(g.cle, x)}>
                    <b>{x.nom ? x.element : `${p.libelle || ''} ${x.rang}`}</b><span>{fr(x.prix)}{x.nom ? '' : ' · nommer ›'}</span>
                  </button>
                ))}
                {g.ls.length > 4 && <button className="cf-sub" onClick={() => setDeplie(d => ({ ...d, [g.cle]: !ouvert }))}>
                  <span>{ouvert ? 'Replier' : `… et ${g.ls.length - 3} autres`}</span><span>{ouvert ? '⌃' : '›'}</span></button>}
              </>}
            </div>
          )
        })}</div>
      </div>
    ))}
    {extras}
  </>
}

/* ---------- Fenêtre d'une ligne calculée ---------- */
export function LigneSheet({ ouvert, params, base, peut, invites, lignes, onClose, onSave }) {
  const ui = useUI()
  const p = ouvert ? params[ouvert.cle] : null
  const s = (ouvert && base?.surcharges?.[ouvert.cle]) || {}
  const [v, setV] = useState(''), [r, setR] = useState(''), [eff, setEff] = useState(''), [ref, setRef] = useState(false), [envoi, setEnvoi] = useState(false)
  useEffect(() => {
    if (!p) return
    setV(fr(s.valeur ?? p.valeur)); setR(p.ratio === null && s.ratio === undefined ? '' : fr(s.ratio ?? p.ratio))
    setEff(base?.effectifs?.[ouvert.cle] !== undefined ? String(base.effectifs[ouvert.cle]) : ''); setRef(false)
  }, [ouvert?.cle])
  if (!p) return <Sheet open={false} onClose={onClose} />
  const staff = p.section === 'staff' && p.calcul !== 'par_base'
  const aRatio = p.ratio !== null || p.calcul === 'un_pour'
  const vv = num(v), rr = num(r)
  // Aperçu : effectif ou quantité à partir de la base de calcul
  const baseNb = p.base === 'invites' ? n(invites) : p.base === 'tables' ? Math.ceil(n(invites) / 10)
    : p.base?.startsWith('role:') ? lignes.filter(l => l.param === p.base.slice(5)).length
    : p.base === 'staff' ? lignes.filter(l => l.rang).length : null
  const nb = num(eff) ?? (p.calcul === 'un_pour' && baseNb !== null && rr > 0 ? Math.ceil(baseNb / rr) : p.calcul === 'fixe' ? rr ?? 1
    : p.calcul === 'par_base' && baseNb !== null ? baseNb * (rr ?? 1) : null)
  const total = p.calcul === 'pct' ? null : nb !== null && vv !== null ? nb * vv : null
  async function sauver(remettre) {
    const x = remettre ? { valeur: p.valeur, ...(aRatio ? { ratio: p.ratio } : {}), ...(staff ? { effectif: '' } : {}) }
      : { valeur: vv, ...(aRatio ? { ratio: rr } : {}), ...(staff ? { effectif: num(eff) ?? '' } : {}) }
    if (x.valeur === null) return ui.toast('Il manque le chiffre')
    setEnvoi(true)
    try { await onSave(ouvert.cle, x, remettre ? false : ref) } catch (e) { ui.toast(e.message) }
    setEnvoi(false)
  }
  const unite = staff ? 'MAD par personne' : p.unite
  return (
    <Sheet open={!!ouvert} onClose={onClose} foot={<button className="btn primary" disabled={envoi} onClick={() => sauver(false)}>{envoi ? '…' : ref ? `Enregistrer · référence à ${fr(vv)}` : 'Enregistrer'}</button>}>
      <div className="el-kicker">{SECTIONS.find(([k]) => k === p.section)?.[1]} · {p.groupe}</div>
      <div className="el-name" style={{ fontSize: 28 }}>{p.libelle}</div>
      {aRatio && <>
        <div className="cf-lbl">{p.calcul === 'un_pour' ? 'Ratio' : p.calcul === 'fixe' ? 'Nombre' : p.ratio_unite}</div>
        <div className="cf-in">{p.calcul === 'un_pour' && <span>1 pour</span>}<input inputMode="decimal" value={r} onChange={e => setR(e.target.value)} />
          <span>{p.calcul === 'un_pour' ? `${p.ratio_unite}${nb !== null && !num(eff) ? ` → ${fr(nb)}` : ''}` : p.calcul === 'fixe' ? p.ratio_unite : ''}</span></div>
      </>}
      {staff && <>
        <div className="cf-lbl">Ou le nombre de personnes</div>
        <div className="cf-in"><input inputMode="numeric" placeholder="selon le ratio" value={eff} onChange={e => setEff(e.target.value.replace(/\D/g, ''))} /><span>personnes</span></div>
      </>}
      <div className="cf-lbl">{p.calcul === 'pct' ? 'Taux' : staff ? 'Coût par personne' : 'Prix'}</div>
      <div className="cf-in"><input inputMode="decimal" value={v} onChange={e => setV(e.target.value)} /><span>{unite}{total !== null ? ` → ${fr(Math.round(total))}` : ''}</span></div>
      <div className="cf-src">Référence : <b>{fr(p.valeur)} {p.unite}</b>{p.ratio !== null ? <> · <b>{ratioTexte(p)}</b></> : null} · Paramètres › {SECTIONS.find(([k]) => k === p.section)?.[1]}
        <div className="h">{p.nb_modifs ? `Modifié ${p.nb_modifs} fois` : 'Jamais modifié'}{p.tendance ? ` ${n(p.tendance) > 0 ? '↗' : '↘'} ${Math.abs(n(p.tendance))} %` : ''}{p.tendance_evt ? ` · moyenne des derniers événements : ${fr(p.tendance_evt)}` : ''}{p.histo?.[0] ? ` · dernier : ${histoTexte(p.histo[0])}` : ''}</div>
      </div>
      <div className="cf-lbl">Ce changement vaut pour</div>
      <div className="cf-choix">
        <button className={!ref ? 'on' : ''} onClick={() => setRef(false)}>Cet événement seulement</button>
        <button className={ref ? 'on' : ''} disabled={!peut} onClick={() => setRef(true)}>Aussi la référence</button>
      </div>
      {!peut && <p className="small mute" style={{ marginTop: 8 }}>Seul Salmane change les références.</p>}
      {(Object.keys(s).length > 0 || base?.effectifs?.[ouvert.cle] !== undefined) &&
        <div className="ee-menu" style={{ marginTop: 12 }}><button onClick={() => sauver(true)} disabled={envoi}>Revenir à la référence<span>›</span></button></div>}
    </Sheet>
  )
}

/* ---------- Fenêtre d'une personne du staff : nom et tarif réel ---------- */
export function PersonneSheet({ ouvert, params, onClose, onSave }) {
  const ui = useUI()
  const [liste, setListe] = useState(null), [q, setQ] = useState(''), [prix, setPrix] = useState(''), [choix, setChoix] = useState(null), [envoi, setEnvoi] = useState(false)
  useEffect(() => { if (ouvert && liste === null) api.staffListe().then(setListe).catch(() => setListe([])) }, [ouvert])
  useEffect(() => { if (ouvert) { setPrix(fr(ouvert.x.prix)); setChoix(ouvert.x.nom ? { nom: ouvert.x.nom, id: ouvert.x.staff_id } : null); setQ('') } }, [ouvert?.x?.i])
  if (!ouvert) return <Sheet open={false} onClose={onClose} />
  const p = params[ouvert.cle] || {}
  const vus = (liste || []).filter(s => !q || nomStaff(s).toLowerCase().includes(q.toLowerCase())).slice(0, 8)
  async function sauver(retirer) {
    setEnvoi(true)
    try { await onSave(ouvert.cle, ouvert.x.rang, retirer ? {} : { nom: choix?.nom || '', staff_id: choix?.id || '', prix: num(prix) ?? '' }) } catch (e) { ui.toast(e.message) }
    setEnvoi(false)
  }
  return (
    <Sheet open={!!ouvert} onClose={onClose} foot={<button className="btn primary" disabled={envoi} onClick={() => sauver(false)}>{envoi ? '…' : 'Enregistrer'}</button>}>
      <div className="el-kicker">Staff · {p.libelle} {ouvert.x.rang}</div>
      <div className="el-name" style={{ fontSize: 28 }}>{choix?.nom || `${p.libelle} ${ouvert.x.rang}`}</div>
      <div className="cf-lbl">Qui</div>
      <input className="cf-cherche" placeholder="Chercher dans le staff…" value={q} onChange={e => setQ(e.target.value)} />
      <div className="chips">{vus.map(s => <button key={s.id} className={`chip ${choix?.id === s.id ? 'on' : ''}`} onClick={() => setChoix({ nom: nomStaff(s), id: s.id })}>{nomStaff(s)}</button>)}
        {q && !vus.some(s => nomStaff(s).toLowerCase() === q.toLowerCase()) && <button className="chip" onClick={() => setChoix({ nom: q.trim(), id: '' })}>+ {q.trim()}</button>}
      </div>
      <div className="cf-lbl">Son tarif réel</div>
      <div className="cf-in"><input inputMode="decimal" value={prix} onChange={e => setPrix(e.target.value)} /><span>MAD · réf. {fr(p.valeur)}</span></div>
      {ouvert.x.nom && <div className="ee-menu" style={{ marginTop: 12 }}><button onClick={() => sauver(true)} disabled={envoi}>Retirer le nom<span>›</span></button></div>}
    </Sheet>
  )
}

/* ---------- Clôture : nouveaux prix proposés par l'IA, décidés un à un ---------- */
function Courbe({ pts }) {
  const v = (pts || []).map(Number).filter(x => x > 0)
  if (v.length < 2) return null
  const mi = Math.min(...v), ma = Math.max(...v), h = 16, w = 60
  const d = v.map((x, i) => `${2 + (i * (w - 4)) / (v.length - 1)},${ma === mi ? h / 2 : h - 2 - ((x - mi) / (ma - mi)) * (h - 4)}`).join(' ')
  return <svg width={w} height={h + 2} viewBox={`0 0 ${w} ${h + 2}`} style={{ verticalAlign: 'middle', marginLeft: 6 }}><polyline fill="none" stroke="#9A6416" strokeWidth="2" points={d} /></svg>
}
const valTexte = (q, v) => (q.champ === 'ratio' && q.calcul === 'un_pour' ? `1 pour ${fr(v)}` : `${fr(v)}${q.champ === 'ratio' ? '' : ` ${String(q.unite || '').replace(/^MAD/, 'MAD')}`}`)
const STATUT = { acceptee: 'accepté', modifiee: 'modifié', gardee: 'gardé' }

export function NouveauxPrix({ r, data, go, props, setProps, complet }) {
  const ui = useUI()
  const [busy, setBusy] = useState(false)
  const [modif, setModif] = useState(null)
  const ps = props?.propositions || [], aD = ps.filter(p => p.statut === 'proposee'), faits = ps.filter(p => p.statut !== 'proposee')
  const peut = !!props?.peut_modifier
  async function demander() {
    setBusy(true)
    try { const x = await api.copilote('prix', {}); setProps(x); ui.toast(x.propositions?.filter(p => p.statut === 'proposee').length ? 'Propositions prêtes' : 'Rien à changer : le réel colle aux paramètres') }
    catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  async function decider(q, decision, valeur, raison) {
    try { setProps(await api.propositionDecider(q.id, decision, valeur, raison)); setModif(null); ui.toast(decision === 'garder' ? 'Gardé' : 'Référence changée : le prochain chiffrage la prend') }
    catch (e) { ui.toast(e.message) }
  }
  const prevu = r.budget, reel = r.reel + r.estime, ecart = prevu ? (reel / prevu - 1) * 100 : 0
  return (
    <motion.div {...glisse}>
      <div className="head"><button className="back" onClick={() => go('bilan')}>‹ Bilan</button>
        <div className="when">{r.ev.nom}{complet ? ' · toutes les pièces inscrites' : ''}</div>
        <h1 style={{ fontSize: 34, display: 'flex', alignItems: 'center', gap: 10 }}>Nouveaux prix <Info text="L'IA compare le prévu de chaque paramètre au réel des pièces et aux derniers événements. Tu acceptes, tu modifies ou tu gardes, une proposition à la fois." /></h1></div>
      <div className="cf-tot"><div><b>{mad(prevu)}</b>prévu</div><div><b>{mad(reel)}</b>réel</div><div><b style={{ color: ecart > 0 ? '#F3B37A' : undefined }}>{ecart > 0 ? '+' : ''}{fr(Math.round(ecart * 10) / 10)} %</b>écart</div></div>
      {!complet && <div className="cf-vieux"><span>Il manque des pièces{r.sansPiece.length ? ` : ${r.sansPiece.map(z => z.nom).join(', ')}` : ''}. Les propositions viendront quand tout sera inscrit.</span></div>}
      {complet && !ps.length && <div className="px" style={{ marginTop: 16 }}><button className="btn primary block" disabled={busy} onClick={demander}>{busy ? 'L\'IA compare…' : 'Demander les propositions à l\'IA'}</button></div>}
      {aD.length > 0 && <>
        <div className="cf-grp"><span>À DÉCIDER · {aD.length}</span></div>
        <div className="list">{aD.map(q => (
          <div key={q.id} className="cf-prop">
            <div className="t"><b>{q.libelle} · {q.champ === 'ratio' ? 'ratio' : 'prix'}</b><span className="ar"><s>{q.champ === 'ratio' && q.calcul === 'un_pour' ? `1 pour ${fr(q.actuel)}` : fr(q.actuel)}</s>→ {valTexte(q, q.propose)}</span></div>
            {q.raison && <div className="w">{q.raison}</div>}
            {(q.tendance || (q.points || []).length > 1) && <div className="w">{q.tendance}<Courbe pts={q.points} /></div>}
            {peut ? <div className="bt">
              <button className="ok" onClick={() => decider(q, 'accepter')}>Accepter</button>
              <button onClick={() => setModif(q)}>Modifier</button>
              <button onClick={() => decider(q, 'garder')}>Garder</button>
            </div> : <div className="w" style={{ marginTop: 8 }}>Seul Salmane décide.</div>}
          </div>
        ))}</div>
      </>}
      {faits.length > 0 && <>
        <div className="cf-grp"><span>DÉJÀ DÉCIDÉES</span></div>
        <div className="list">{faits.map(q => (
          <div key={q.id} className="cf-l"><div className="x"><b>{q.libelle}</b>
            <span>{q.statut === 'gardee' ? `gardé à ${valTexte(q, q.ancien)} · proposé ${valTexte(q, q.propose)}` : `${valTexte(q, q.ancien)} → ${valTexte(q, q.valeur_finale)}`}{q.decide_par ? ` · ${q.decide_par}` : ''}</span></div>
            <div className="cf-v" style={{ fontSize: 14, color: q.statut === 'gardee' ? 'var(--mute)' : 'var(--accent)' }}>{STATUT[q.statut]}</div></div>
        ))}</div>
      </>}
      {complet && ps.length > 0 && !aD.length && <div className="px" style={{ marginTop: 14 }}><button className="chip" disabled={busy} onClick={demander}>{busy ? '…' : 'Redemander à l\'IA'}</button></div>}
      <ModifSheet q={modif} onClose={() => setModif(null)} onSave={(v, raison) => decider(modif, 'modifier', v, raison)} />
    </motion.div>
  )
}

function ModifSheet({ q, onClose, onSave }) {
  const ui = useUI()
  const [v, setV] = useState(''), [raison, setRaison] = useState('')
  useEffect(() => { if (q) { setV(fr(q.propose)); setRaison('') } }, [q?.id])
  if (!q) return <Sheet open={false} onClose={onClose} />
  const x = num(v)
  return (
    <Sheet open={!!q} onClose={onClose} foot={<button className="btn primary" onClick={() => (x > 0 ? onSave(x, raison) : ui.toast('Il manque le chiffre'))}>Enregistrer la référence à {x > 0 ? fr(x) : '…'}</button>}>
      <div className="el-kicker">{SECTIONS.find(([k]) => k === q.section)?.[1]} · {q.groupe}</div>
      <div className="el-name" style={{ fontSize: 28 }}>{q.libelle}</div>
      <div className="cf-lbl">{q.champ === 'ratio' ? (q.calcul === 'un_pour' ? 'Nouveau ratio (1 pour…)' : 'Nouveau ratio') : 'Nouveau prix'}</div>
      <div className="cf-in"><input inputMode="decimal" value={v} onChange={e => setV(e.target.value)} autoFocus /><span>{q.champ === 'ratio' ? q.ratio_unite : q.unite}</span></div>
      <div className="cf-src">Proposé par l'IA : <b>{valTexte(q, q.propose)}</b> · actuel <b>{valTexte(q, q.actuel)}</b>
        <div className="h">{[q.reel ? `réel ici ${fr(q.reel)}` : '', q.tendance, q.nb_modifs ? `modifié ${q.nb_modifs} fois` : ''].filter(Boolean).join(' · ')}</div></div>
      <div className="cf-lbl">Raison (facultatif)</div>
      <input placeholder="ex. nouveau fournisseur" value={raison} onChange={e => setRaison(e.target.value)} />
    </Sheet>
  )
}
