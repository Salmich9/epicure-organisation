import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'
import { Picker } from './element'

/* Revue : on passe chaque chose en revue, zone par zone. Bibliothèque : on pioche ou on crée. */
const QUI = [['À notre charge', 'Nous'], ['En partie', 'Partiel'], ['Tiers', 'Tiers'], ['Pas besoin', 'Pas besoin']]
const MODES = [
  { k: 'stock', l: 'Prélever', p: null, cat: 'Stock' },
  { k: 'location', l: 'Louer', p: 'prix_location', cat: 'Location' },
  { k: 'achat', l: 'Acheter', p: 'prix_achat', cat: 'Achat' },
  { k: 'production', l: 'Produire', p: 'prix_production', cat: 'Production / sous-traitance' },
]
const mt = v => Math.round(n(v)).toLocaleString('fr-FR')
const dec = v => Number(n(v)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const slide = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }

export const etatRevue = e => (!e.revu_le ? 'pas_vu' : e.a_revoir_revue ? 'a_revoir' : 'revu')
const ordre = data => {
  const z = {}; data.zones.forEach((x, i) => { z[x.nom] = i })
  return [...data.elements].sort((a, b) => (z[a.zone] ?? 99) - (z[b.zone] ?? 99) || String(a.sous_zone || '').localeCompare(String(b.sous_zone || '')) || a.id.localeCompare(b.id))
}
export function compteRevue(data) {
  const c = { revu: 0, a_revoir: 0, pas_vu: 0 }
  data.elements.forEach(e => { c[etatRevue(e)]++ })
  return c
}

function regle(e, z) {
  const q = n(e.qte_par_base), marge = n(z?.marge)
  const m = marge ? ` + ${Math.round(marge * 100)} % casse` : ''
  if (e.qte_forcee !== null && e.qte_forcee !== undefined) return 'quantité fixée à la main'
  if (e.base === 'Invités' || e.base === 'Pièces cocktail') return q >= 1 ? `${dec(q)} par invité${m}` : `1 pour ${Math.round(1 / (q || 1))} invités${m}`
  if (e.base === 'Tables') return `${dec(q)} par table de 10${m}`
  if (e.base === 'Nb staff') return `${dec(q)} par personne du staff`
  if (e.base === 'Véhicules') return '1 véhicule pour 15 staff'
  if (e.base === 'Fixe') return 'forfait'
  return 'à préciser'
}

/* ---------- Vue d'ensemble : on reprend où on s'est arrêté ---------- */
export function Revue({ data, go }) {
  const els = ordre(data)
  const c = compteRevue(data)
  const suivant = els.find(e => etatRevue(e) !== 'revu')
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {data.evenements.find(x => x.id === data.evt)?.nom}</button><h1 style={{ fontSize: 34 }}>Revue</h1></div>
      <div className="rv-k">
        <div className="ok"><b>{c.revu}</b>revu</div>
        <div className={c.a_revoir ? 'or' : ''}><b>{c.a_revoir}</b>à revoir <Info text="Un élément déjà revu repasse « à revoir » quand quelqu'un change sa quantité, son prix ou son responsable." /></div>
        <div><b>{c.pas_vu}</b>pas vu</div>
      </div>
      {suivant
        ? <motion.button whileTap={{ scale: .98 }} className="cta2" onClick={() => go(`revue/${data.zones.findIndex(z => z.nom === suivant.zone)}/${suivant.id}`)}>{c.revu ? 'Reprendre' : 'Commencer'} · {suivant.zone}, {suivant.element} ›</motion.button>
        : data.elements.length ? <div className="rv-fini">✓ Tout est revu</div> : <motion.button whileTap={{ scale: .98 }} className="cta2" onClick={() => go('biblio')}>Commencer : ouvrir la bibliothèque ›</motion.button>}
      <div className="rv-z">{data.zones.map((z, i) => {
        const l = els.filter(e => e.zone === z.nom), r = l.filter(e => etatRevue(e) === 'revu').length, av = l.filter(e => etatRevue(e) === 'a_revoir').length
        const fini = l.length && r === l.length
        return (
          <motion.button key={z.nom} whileTap={{ scale: .98 }} onClick={() => go(`revue/${i}`)}>
            <i className={fini ? 'ok' : av ? 'or' : ''}>{fini ? '✓' : `${r}/${l.length}`}</i>
            <div>{z.nom}<span>{!l.length ? 'rien encore' : fini ? `${l.length} / ${l.length} revus` : av ? `${av} changé${av > 1 ? 's' : ''} depuis ta revue` : r ? `${l.length - r} à voir` : 'pas encore vu'}</span></div>›
          </motion.button>
        )
      })}</div>
      <button className="rv-add" onClick={() => go('biblio')}>📚 Ouvrir la bibliothèque</button>
    </motion.div>
  )
}

/* ---------- Une chose à la fois ---------- */
export function RevueZone({ data, go, idx, elId, putEl }) {
  const ui = useUI()
  const z = data.zones[idx] || data.zones[0]
  const liste = useMemo(() => ordre(data).filter(e => e.zone === z?.nom), [data.elements, z?.nom])
  const depart = Math.max(0, elId ? liste.findIndex(e => e.id === elId) : liste.findIndex(e => etatRevue(e) !== 'revu'))
  const [i, setI] = useState(depart)
  const el = liste[i]
  const [e, setE] = useState(el)
  const [chg, setChg] = useState({})
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(null)
  useEffect(() => { setE(liste[i]); setChg({}) }, [i, liste[i]?.id])
  if (!z) return null
  if (!el) return (
    <motion.div {...slide}>
      <div className="head"><button className="back" onClick={() => go('revue')}>‹ Revue</button><h1 style={{ fontSize: 30 }}>{z.nom}</h1></div>
      <div className="empty">Rien dans cette zone pour l'instant.</div>
      <button className="rv-add" onClick={() => go(`biblio/${idx}`)}>+ Ajouter depuis la bibliothèque</button>
    </motion.div>
  )
  const set = (k, v) => { setE(x => ({ ...x, [k]: v })); setChg(c => ({ ...c, [k]: v })) }
  const besoin = e.qte_forcee !== null && e.qte_forcee !== undefined && e.qte_forcee !== '' ? n(e.qte_forcee) : n(e.qte_calc)
  const couvert = MODES.reduce((s, m) => s + n(e[m.k]), 0)
  const total = MODES.reduce((s, m) => s + (m.p ? n(e[m.k]) * n(e[m.p]) : 0), 0)
  const tiers = e.perimetre === 'Tiers' || e.perimetre === 'Pas besoin'
  const equipe = data.intervenants.filter(x => x.type === 'Équipe').map(x => x.nom)
  const autres = data.intervenants.filter(x => !['Équipe', 'Staff / extra', 'Fournisseur'].includes(x.type)).map(x => x.nom)
  const actifs = MODES.filter(m => n(e[m.k]) > 0)
  const art = e.article_id ? (data.depot || []).find(a => a.id === e.article_id) : null
  const dispo = art ? n(art.qte) - n((data.reserve || {})[art.id]) : null

  function basculer(m) {
    if (n(e[m.k]) > 0) { set(m.k, null); return }
    const reste = Math.max(0, besoin - couvert)
    set(m.k, reste || besoin || 1)
  }
  async function enregistrer(dir) {
    setBusy(true)
    try {
      const fresh = await api.elementRevoir(e.id, chg)
      putEl(fresh)
      if (dir > 0 && i === liste.length - 1) {
        const prochaine = data.zones.findIndex((zz, k) => k > idx && data.elements.some(x => x.zone === zz.nom && etatRevue(x) !== 'revu'))
        ui.toast(`${z.nom} revue`)
        go(prochaine >= 0 ? `revue/${prochaine}` : 'revue')
      } else setI(Math.max(0, i + dir))
    } catch (err) { ui.toast(err.message) }
    setBusy(false)
  }
  async function toutValider() {
    setBusy(true)
    try {
      for (const x of liste.slice(i)) if (etatRevue(x) !== 'revu') putEl(await api.elementRevoir(x.id, x.id === e.id ? chg : {}))
      ui.toast(`${z.nom} validée telle quelle`); go('revue')
    } catch (err) { ui.toast(err.message) }
    setBusy(false)
  }
  const suivantNom = liste[i + 1]?.element || data.zones[idx + 1]?.nom
  return (
    <motion.div {...slide} key={z.nom}>
      <div className="head"><button className="back" onClick={() => go('revue')}>‹ Revue</button><h1 style={{ fontSize: 30 }}>{z.nom}</h1></div>
      <div className="rv-prog"><span>{i + 1} / {liste.length}</span><div className="b"><i style={{ width: `${((i + 1) / liste.length) * 100}%` }} /></div>{data.zones[idx + 1] && <button onClick={() => go(`revue/${idx + 1}`)}>{data.zones[idx + 1].nom} ›</button>}</div>
      <motion.div key={e.id} className="rv-card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
        {etatRevue(el) === 'a_revoir' && <div className="rv-flag">Changé depuis ta revue{el.modifie_par ? ` · par ${el.modifie_par}` : ''}</div>}
        <div className="nm">{e.element}</div>
        <div className="bs">Besoin <input className="rv-q" inputMode="numeric" value={e.qte_forcee ?? (besoin || '')} onChange={x => set('qte_forcee', x.target.value === '' ? null : Number(x.target.value.replace(',', '.')) || 0)} /> · {regle(e, z)}</div>

        <div className="q">À qui ?</div>
        <div className="rv-seg">{QUI.map(([v, l]) => <button key={v} className={(e.perimetre || 'À notre charge') === v ? 'on' : ''} onClick={() => set('perimetre', v)}>{l}</button>)}</div>
        {(e.perimetre === 'Tiers' || e.perimetre === 'En partie') && <>
          <div className="q">Qui le fournit ?</div>
          <div className="rv-who">{autres.map(nm => <button key={nm} className={e.fourni_par === nm ? 'on' : ''} onClick={() => set('fourni_par', nm)}>{nm}</button>)}
            <input placeholder="agence, lieu, client…" value={autres.includes(e.fourni_par) ? '' : e.fourni_par || ''} onChange={x => set('fourni_par', x.target.value)} /></div>
        </>}

        {!tiers && <>
          <div className="q">Comment ? <span className="rv-mut">{couvert < besoin ? `${mt(besoin - couvert)} à couvrir` : couvert > besoin ? `${mt(couvert - besoin)} de plus que le besoin` : 'tout est couvert'}</span></div>
          <div className="rv-mx">{MODES.map(m => {
            const on = n(e[m.k]) > 0
            return (
              <div key={m.k} className={on ? 'on' : ''} onClick={() => !on && basculer(m)}>
                <span onClick={x => { if (on) { x.stopPropagation(); basculer(m) } }}>{m.l}{on && ' ✕'}</span>
                {on ? <input inputMode="numeric" value={e[m.k] ?? ''} onClick={x => x.stopPropagation()} onChange={x => set(m.k, x.target.value === '' ? null : Number(x.target.value.replace(',', '.')) || 0)} /> : <b>—</b>}
                <small>{m.k === 'stock' ? (dispo !== null ? `dépôt : ${mt(dispo)}` : 'dépôt') : on && n(e[m.p]) ? `× ${dec(e[m.p])}` : ''}</small>
              </div>
            )
          })}</div>
          {actifs.filter(m => m.p).map(m => (
            <div key={m.k} className="rv-px"><span>{m.l} · prix unitaire</span><input inputMode="decimal" value={e[m.p] ?? ''} placeholder="MAD" onChange={x => set(m.p, x.target.value === '' ? null : Number(x.target.value.replace(',', '.')) || 0)} /></div>
          ))}
          {actifs.some(m => m.p) && <div className="rv-px"><span>Fournisseur</span><input value={e.fournisseur || ''} placeholder="facultatif" onChange={x => set('fournisseur', x.target.value)} /></div>}
        </>}

        <div className="q">Qui s'en occupe ?</div>
        <div className="rv-who">{[...new Set([...equipe, ...(e.resp && !equipe.includes(e.resp) ? [e.resp] : [])])].map(nm => <button key={nm} className={e.resp === nm ? 'on p' : ''} onClick={() => set('resp', e.resp === nm ? null : nm)}>{nm}</button>)}
          <button onClick={() => setPicker('resp')}>+</button></div>
        {!tiers && total > 0 && <div className="bs" style={{ marginTop: 12 }}>Total <b>{mt(total)} MAD</b></div>}
      </motion.div>
      <button className="rv-add" onClick={() => go(`biblio/${idx}`)}>+ Ajouter ce qui manque dans {z.nom}</button>
      <div className="rv-nav">
        <button disabled={busy || i === 0} onClick={() => enregistrer(-1)}>‹</button>
        <button className="p" disabled={busy} onClick={() => enregistrer(1)}>{busy ? '…' : i < liste.length - 1 ? `Suivant · ${suivantNom}` : `Terminer ${z.nom}`}</button>
      </div>
      {liste.slice(i).some(x => etatRevue(x) !== 'revu') && <button className="lien-perdu" onClick={toutValider}>Valider le reste de la zone tel quel</button>}
      <Picker open={picker === 'resp'} onClose={() => setPicker(null)} title="Qui s'en occupe" items={data.intervenants.map(x => x.nom)} value={e.resp} onPick={v => set('resp', v)} />
    </motion.div>
  )
}

/* ---------- Bibliothèque ---------- */
let cache = null
export function Bibliotheque({ data, go, zoneIdx, reload }) {
  const ui = useUI()
  const [cat, setCat] = useState(cache)
  const [q, setQ] = useState('')
  const z0 = zoneIdx !== undefined && data.zones[zoneIdx] ? data.zones[zoneIdx].nom : ''
  const [zone, setZone] = useState(z0)
  const [ouverts, setOuverts] = useState(() => new Set(z0 ? [`z:${z0}`] : []))
  const [cree, setCree] = useState(false)
  const [busy, setBusy] = useState(null)
  useEffect(() => { api.catalogueListe().then(c => { cache = c; setCat(c) }).catch(err => ui.toast(err.message)) }, [])
  const dedans = c => data.elements.some(e => e.catalogue_id === c.id || norm(e.element) === norm(c.element))
  const cherche = norm(q).trim()
  const vus = (cat || []).filter(c => !cherche || norm(`${c.element} ${c.sous_zone || ''} ${c.zone}`).includes(cherche))
  // Famille (zone) › sous-famille › articles, dans l'ordre des zones de l'appli
  const arbre = data.zones.map(zz => {
    const l = vus.filter(c => c.zone === zz.nom), sf = {}
    l.forEach(c => { const k = c.sous_zone || 'Divers'; (sf[k] = sf[k] || []).push(c) })
    return { nom: zz.nom, n: l.length, dedans: l.filter(dedans).length, sous: Object.entries(sf).sort((x, y) => x[0].localeCompare(y[0], 'fr')) }
  }).filter(f => f.n)
  const ouvert = k => !!cherche || ouverts.has(k)
  const basculer = (k, zn) => { setOuverts(o => { const x = new Set(o); x.has(k) ? x.delete(k) : x.add(k); return x }); if (zn) setZone(zn) }
  async function ajouter(c) {
    setBusy(c.id)
    try { await api.elementDepuisCatalogue(data.evt, c.id); await reload(); ui.toast(`${c.element} ajouté · à voir dans la revue`) } catch (err) { ui.toast(err.message) }
    setBusy(null)
  }
  const retour = zoneIdx !== undefined ? `revue/${zoneIdx}` : 'revue'
  return (
    <motion.div {...slide}>
      <div className="head"><button className="back" onClick={() => go(retour)}>‹ Revue</button><h1 style={{ fontSize: 34 }}>Bibliothèque</h1><div className="meta">{(cat || []).length} articles · touche une famille pour l'ouvrir</div></div>
      <div className="px"><input className="rv-search" placeholder="🔍  Chercher : verre, glace, nappe…" value={q} onChange={x => setQ(x.target.value)} /></div>
      {!cat ? <div className="empty">Chargement…</div> : !arbre.length ? (
        <div className="empty">Rien ne correspond. Crée-le ci-dessous : il entrera dans la bibliothèque.</div>
      ) : <div className="bb">{arbre.map(f => (
        <div key={f.nom} className={`bb-f ${ouvert(`z:${f.nom}`) ? 'on' : ''}`}>
          <button className="bb-fh" onClick={() => basculer(`z:${f.nom}`, f.nom)}>
            <span className="ch">›</span><b>{f.nom}</b><span className="ct">{f.dedans ? <em>{f.dedans} ✓</em> : null}{f.n}</span>
          </button>
          {ouvert(`z:${f.nom}`) && f.sous.map(([sn, l]) => {
            const k = `s:${f.nom}|${sn}`, nd = l.filter(dedans).length
            return (
              <div key={k} className={`bb-s ${ouvert(k) ? 'on' : ''}`}>
                <button className="bb-sh" onClick={() => basculer(k, f.nom)}><span className="ch">›</span><span className="n">{sn}</span><span className="ct">{nd ? <em>{nd} ✓</em> : null}{l.length}</span></button>
                {ouvert(k) && <div className="list bb-l">{l.map(c => {
                  const ok = dedans(c), m = MODES.find(x => x.cat === c.mode), px = m?.p ? c[m.p] : null
                  return (
                    <div key={c.id} className="row rv-it">
                      <div><div className="name">{c.element}</div><div className="info">{[m?.l.toLowerCase(), px ? `${dec(px)} MAD` : null, regle({ base: c.base, qte_par_base: c.qte_par_base }, null)].filter(Boolean).join(' · ')}</div></div>
                      {ok ? <i className="rv-ok">✓</i> : <motion.button whileTap={{ scale: .9 }} className="rv-plus" disabled={busy === c.id} onClick={() => ajouter(c)}>{busy === c.id ? '…' : '+'}</motion.button>}
                    </div>
                  )
                })}</div>}
              </div>
            )
          })}
        </div>
      ))}</div>}
      <div className="px"><button className="btn primary block rv-new" onClick={() => setCree(true)}>+ Créer un nouvel article</button></div>
      <Creer open={cree} onClose={() => setCree(false)} data={data} zone={zone} nom={q} reload={reload} onCree={() => { setQ(''); api.catalogueListe().then(c => { cache = c; setCat(c) }) }} />
    </motion.div>
  )
}

const POUR = [['Fixe', "l'événement"], ['Invités', 'chaque invité'], ['Tables', 'chaque table'], ['N', 'N invités']]
function Creer({ open, onClose, data, zone, nom, reload, onCree }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [f, setF] = useState({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setF({ element: nom || '', zone: zone || data.zones[0]?.nom, q: '1', pour: 'Invités', n: '50', prix: '', mode: 'Location', ajouter: true }) }, [open])
  const q = Number(String(f.q || '').replace(',', '.')) || 0
  const base = f.pour === 'N' ? 'Invités' : f.pour
  const qpb = f.pour === 'N' ? q / (Number(f.n) || 1) : q
  const inv = n(ev.invites)
  const apercu = base === 'Fixe' ? q : base === 'Tables' ? Math.ceil((inv / 10) * qpb) : Math.ceil(inv * qpb)
  async function creer() {
    if (!f.element?.trim()) { ui.bubble('Donne un nom à l\'article.'); return }
    setBusy(true)
    try {
      await api.catalogueCreer({ element: f.element.trim(), zone: f.zone, base, qte_par_base: qpb, mode: f.mode, prix: f.prix === '' ? null : Number(String(f.prix).replace(',', '.')) }, f.ajouter ? data.evt : null)
      ui.toast(f.ajouter ? `${f.element.trim()} créé et ajouté à ${ev.nom}` : `${f.element.trim()} ajouté à la bibliothèque`)
      onCree(); if (f.ajouter) await reload(); onClose()
    } catch (err) { ui.toast(/existe_deja/.test(err.message) ? 'Cet article existe déjà dans la bibliothèque' : err.message) }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} foot={<button className="btn primary" disabled={busy} onClick={creer}>{busy ? '…' : 'Créer'}</button>}>
      <div className="el-name" style={{ fontSize: 28 }}>Nouvel article</div>
      <div className="label">Nom</div>
      <input value={f.element || ''} onChange={x => setF({ ...f, element: x.target.value })} placeholder="Brumisateurs terrasse" />
      <div className="label">Zone</div>
      <div className="chips">{data.zones.map(z => <button key={z.nom} className={`chip ${f.zone === z.nom ? 'on' : ''}`} onClick={() => setF({ ...f, zone: z.nom })}>{z.nom}</button>)}</div>
      <div className="label">Quantité</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input style={{ width: 90 }} inputMode="decimal" value={f.q || ''} onChange={x => setF({ ...f, q: x.target.value })} /><span className="small mute">pour</span>
        {f.pour === 'N' && <input style={{ width: 80 }} inputMode="numeric" value={f.n || ''} onChange={x => setF({ ...f, n: x.target.value })} />}</div>
      <div className="chips" style={{ marginTop: 8 }}>{POUR.map(([k, l]) => <button key={k} className={`chip ${f.pour === k ? 'on' : ''}`} onClick={() => setF({ ...f, pour: k })}>{l}</button>)}</div>
      <div className="label">Le plus souvent</div>
      <div className="chips">{MODES.map(m => <button key={m.k} className={`chip ${f.mode === m.cat ? 'on' : ''}`} onClick={() => setF({ ...f, mode: m.cat })}>{m.l}</button>)}</div>
      {f.mode !== 'Stock' && <><div className="label">Prix unitaire (MAD)</div><input inputMode="decimal" value={f.prix} placeholder="facultatif" onChange={x => setF({ ...f, prix: x.target.value })} /></>}
      <button className={`rv-tog ${f.ajouter ? 'on' : ''}`} onClick={() => setF({ ...f, ajouter: !f.ajouter })}><i /><div>Ajouter aussi à {ev.nom}<span>{inv && q ? `${mt(apercu)} pour ${inv} invités` : 'quantité calculée sur les invités'}</span></div></button>
    </Sheet>
  )
}
