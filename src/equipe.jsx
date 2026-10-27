import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, useUI } from './ui'

/* Équipe de l'événement : une personne par rôle ; les éléments automatiques suivent la personne */
export const ROLES = [
  ['coordination', 'Coordination', 'tiers, lieu, déco, encadrement'],
  ['production', 'Production & logistique', 'salle, art de table, transport, technique'],
  ['bar', 'Bar', 'bar, staff bar'],
  ['cuisine', 'Cuisine', 'menu, cuisine, staff cuisine'],
  ['achats', 'Achats', 'tout ce qui est à acheter'],
]
export const nomRole = r => (ROLES.find(x => x[0] === r) || [])[1] || ''
const TEINTES = ['#1F6F6B', '#B0652E', '#6A5ACD', '#8A7A2E', '#3D6E9E', '#A3456B', '#4F7A3A']
export const teinte = nom => { let h = 0; for (const c of String(nom || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TEINTES[h % TEINTES.length] }
export const Pastille = ({ nom, t = 34 }) => <i className="eq-av" style={{ width: t, height: t, fontSize: t * .38, background: nom ? teinte(nom) : 'var(--line)' }}>{nom ? nom[0].toUpperCase() : '–'}</i>

export function Equipe({ data, go, reload }) {
  const ui = useUI()
  const [eq, setEq] = useState(null)
  const [role, setRole] = useState(null)
  const [choix, setChoix] = useState('')
  const [defaut, setDefaut] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.equipeListe(data.evt).then(setEq).catch(e => ui.toast(e.message)) }, [data.evt])
  if (!eq) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const gens = [...new Set([...Object.values(eq.defaut || {}), ...Object.values(eq.equipe || {}), ...data.intervenants.filter(x => x.type === 'Équipe').map(x => x.nom)].filter(Boolean))]
  const actuel = role ? eq.equipe?.[role] || '' : ''
  const c = role ? eq.compte?.[role] || { n: 0, main: 0 } : null
  const auto = c ? c.n - c.main : 0
  const mains = role ? [...new Set(data.elements.filter(e => e.role === role && e.resp_main && e.resp && e.resp !== choix).map(e => e.resp))] : []
  function ouvrir(r) { setRole(r); setChoix(eq.equipe?.[r] || ''); setDefaut(false) }
  async function confirmer() {
    setBusy(true)
    try {
      const r = await api.equipeMaj(data.evt, role, choix, defaut)
      setEq(r); setRole(null); reload?.()
      ui.toast(r.deplaces ? `${r.deplaces} élément${r.deplaces > 1 ? 's' : ''} passent à ${choix}` : `${nomRole(role)} : ${choix}`)
    } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button><h1 style={{ fontSize: 36 }}>Équipe</h1>
        <div className="meta">Touche un rôle pour changer la personne <Info text="Chaque élément va tout seul au bon rôle : à acheter → achats, bar → bar, menu et cuisine → cuisine, tiers et choses à trancher → coordination, le reste → production. Ce que tu donnes à quelqu'un à la main dans la revue reste comme tu l'as mis." /></div></div>
      <div className="eq-l">{ROLES.map(([k, l, s]) => {
        const p = eq.equipe?.[k], cc = eq.compte?.[k]
        return (
          <motion.button key={k} whileTap={{ scale: .98 }} onClick={() => ouvrir(k)}>
            <Pastille nom={p} />
            <div><b>{l}</b><span>{s}</span></div>
            <em className="eq-p">{p || 'personne'}</em>
            <strong>{cc?.n || 0}</strong>
          </motion.button>
        )
      })}</div>
      <Sheet open={!!role} onClose={() => setRole(null)} foot={<button className="btn primary" disabled={busy || choix === actuel} onClick={confirmer}>{busy ? '…' : 'Confirmer'}</button>}>
        {role && <>
          <div className="el-name" style={{ fontSize: 26 }}>{nomRole(role)}</div>
          <div className="eq-ch">{gens.map(g => <button key={g} className={choix === g ? 'on' : ''} onClick={() => setChoix(g)}><Pastille nom={g} t={24} />{g}</button>)}</div>
          <input placeholder="Autre personne" value={gens.includes(choix) ? '' : choix} onChange={x => setChoix(x.target.value)} style={{ marginTop: 10 }} />
          {choix !== actuel && <div className="eq-eff">
            {auto ? <><b>{auto} élément{auto > 1 ? 's' : ''}</b> passe{auto > 1 ? 'nt' : ''} à {choix || 'personne'}.</> : 'Aucun élément à déplacer.'}
            {c.main > 0 && <><br />{c.main} que tu as donné{c.main > 1 ? 's' : ''} à la main{mains.length ? ` (${mains.join(', ')})` : ''} ne bouge{c.main > 1 ? 'nt' : ''} pas.</>}
          </div>}
          <label className="eq-def"><input type="checkbox" checked={defaut} onChange={x => setDefaut(x.target.checked)} /> Aussi pour les prochains événements</label>
        </>}
      </Sheet>
    </motion.div>
  )
}

/* Résumé « délégué à » : qui a combien d'éléments */
export function Delegues({ data, go }) {
  const els = data.elements.filter(e => e.perimetre !== 'Pas besoin')
  const par = {}
  els.forEach(e => { const k = e.resp || ''; par[k] = (par[k] || 0) + 1 })
  const l = Object.entries(par).sort((a, b) => b[1] - a[1])
  if (!l.length) return null
  return <>
    <div className="cd-k">DÉLÉGUÉ À <button onClick={() => go('equipe')}>modifier l'équipe</button></div>
    <div className="cd-lst">{l.map(([nom, nb]) => (
      <div key={nom}><Pastille nom={nom} t={30} /><p>{nom || 'Personne'}<span>{[...new Set(els.filter(e => (e.resp || '') === nom).map(e => nomRole(e.role)).filter(Boolean))].join(' · ')}</span></p><b>{nb}</b></div>
    ))}</div>
  </>
}
