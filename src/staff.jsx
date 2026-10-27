import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n, useUI } from './ui'
import { teinte } from './equipe'

/* Bibliothèque staff : fiches, staff d'un événement, notes à la clôture */
export const FAMILLES = ['Coordination', 'Logistique & achats', 'Bar', 'Salle', 'Runners', 'Cuisine']
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export const nomStaff = s => (s.nom ? `${s.prenom} ${s.nom}` : s.surnom || s.prenom)
const moy = v => (v === null || v === undefined ? '—' : String(v).replace('.', ','))
let cache = null

export function Visage({ s, t = 36 }) {
  const nom = nomStaff(s || {})
  return s?.photo
    ? <i className="sf-av" style={{ width: t, height: t, backgroundImage: `url(${s.photo})` }} />
    : <i className="sf-av" style={{ width: t, height: t, fontSize: t * .38, background: teinte(nom) }}>{(nom || '?')[0].toUpperCase()}</i>
}

function useStaff() {
  const ui = useUI()
  const [l, setL] = useState(cache)
  const charger = () => api.staffListe().then(x => { cache = x; setL(x) }).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  return [l, charger]
}

/* ---------- Liste ---------- */
export function StaffListe({ go }) {
  const [l] = useStaff()
  const [q, setQ] = useState('')
  const [fam, setFam] = useState('')
  if (!l) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const c = norm(q)
  const vus = l.filter(s => (!fam || s.famille === fam) && (!c || norm(`${s.prenom} ${s.nom || ''} ${s.surnom || ''} ${s.role || ''} ${(s.roles || []).join(' ')}`).includes(c)))
  const groupes = [...FAMILLES, ''].map(f => [f, vus.filter(s => (s.famille || '') === f)]).filter(x => x[1].length)
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('accueil')}>‹ Accueil</button><h1 style={{ fontSize: 36 }}>Staff</h1><div className="meta">{l.length} personnes</div></div>
      <input className="rv-search sf-q" placeholder="Chercher un nom, un rôle…" value={q} onChange={x => setQ(x.target.value)} />
      <div className="sf-ch">
        <button className={!fam ? 'on' : ''} onClick={() => setFam('')}>Tous</button>
        {FAMILLES.map(f => { const k = l.filter(s => s.famille === f).length; return k ? <button key={f} className={fam === f ? 'on' : ''} onClick={() => setFam(fam === f ? '' : f)}>{f} {k}</button> : null })}
      </div>
      {groupes.map(([f, ss]) => (
        <div key={f || 'x'}>
          <div className="ac-st">{f || 'Sans famille'} · {ss.length}</div>
          <div className="sf-l">{ss.map(s => (
            <motion.button key={s.id} whileTap={{ scale: .98 }} onClick={() => go(`staff/${s.id}`)}>
              <Visage s={s} />
              <div><b>{nomStaff(s)}</b><span>{[s.role, ...(s.roles || [])].filter(Boolean).join(' · ')}{s.surnom && s.nom ? ` · « ${s.surnom} »` : ''}</span></div>
              <em>{s.moyenne !== null && s.moyenne !== undefined ? <>★ {moy(s.moyenne)}</> : '★ —'}<small>{s.nb_evt} év.</small></em>
            </motion.button>
          ))}</div>
        </div>
      ))}
      {!vus.length && <div className="empty">Personne ne correspond.</div>}
      <motion.button whileTap={{ scale: .94 }} className="sf-fab" onClick={() => go('staff/nouveau')}>+</motion.button>
    </motion.div>
  )
}

/* ---------- Fiche ---------- */
function reduirePhoto(file) {
  return new Promise((ok, ko) => {
    const r = new FileReader()
    r.onload = () => {
      const img = new Image()
      img.onload = () => {
        const t = 320, k = Math.max(t / img.width, t / img.height)
        const c = document.createElement('canvas'); c.width = t; c.height = t
        const w = img.width * k, h = img.height * k
        c.getContext('2d').drawImage(img, (t - w) / 2, (t - h) / 2, w, h)
        ok(c.toDataURL('image/jpeg', .8))
      }
      img.onerror = ko; img.src = r.result
    }
    r.onerror = ko; r.readAsDataURL(file)
  })
}

const CHAMPS = [['prenom', 'Prénom'], ['nom', 'Nom'], ['surnom', 'Surnom'], ['tel', 'Téléphone'], ['cin', 'CIN']]

export function StaffFiche({ go, id }) {
  const ui = useUI()
  const [, recharger] = useStaff()
  const [s, setS] = useState(id === 'nouveau' ? { prenom: '', roles: [], historique: [] } : null)
  const [edit, setEdit] = useState(id === 'nouveau' ? 'prenom' : null)
  const [val, setVal] = useState('')
  const [roleSheet, setRoleSheet] = useState(false)
  const fichier = useRef(null)
  useEffect(() => { if (id !== 'nouveau') api.staffFiche(id).then(setS).catch(e => ui.toast(e.message)) }, [id])
  if (!s) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const tous = (cache || []).flatMap(x => [x.role, ...(x.roles || [])]).filter(Boolean)
  const rolesConnus = [...new Set(tous)].sort()

  async function sauver(p) {
    try {
      const r = await api.staffMaj(s.id || null, p)
      setS(r); recharger()
      if (!s.id) go(`staff/${r.id}`)
    } catch (e) { ui.toast(e.message) }
  }
  function ouvrir(k) { setEdit(k); setVal(s[k] || '') }
  async function valider() { const k = edit; setEdit(null); if ((s[k] || '') !== val) await sauver({ [k]: val }) }
  async function photo(f) { if (!f) return; try { await sauver({ photo: await reduirePhoto(f) }) } catch { ui.toast('Photo illisible') } }
  const roleTap = r => {
    if (s.role === r) return
    const autres = (s.roles || []).includes(r) ? s.roles.filter(x => x !== r) : [...(s.roles || []), r]
    sauver({ roles: autres })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('staff')}>‹ Staff</button></div>
      <div className="sf-photo" onClick={() => s.id && fichier.current?.click()}>
        <Visage s={s} t={104} /><em>📷</em>
        <input ref={fichier} type="file" accept="image/*" hidden onChange={x => photo(x.target.files?.[0])} />
      </div>
      <div className="sf-nm">{nomStaff(s) || 'Nouvelle personne'}</div>
      <div className="sf-rl">{s.role || 'rôle à choisir'}</div>
      {s.id && <div className="sf-kpi">
        <div><b>{moy(s.moyenne)}</b>note moyenne</div><div><b>{n(s.nb_evt)}</b>événement{n(s.nb_evt) > 1 ? 's' : ''}</div>
      </div>}
      <div className="sf-f">
        {CHAMPS.map(([k, l]) => (
          <div key={k} className="sf-r" onClick={() => edit !== k && ouvrir(k)}>
            <span>{l}</span>
            {edit === k
              ? <input autoFocus value={val} inputMode={k === 'tel' ? 'tel' : undefined} onChange={x => setVal(x.target.value)} onBlur={valider} onKeyDown={x => x.key === 'Enter' && x.target.blur()} />
              : <b className={s[k] ? '' : 'm'}>{s[k] || 'à compléter'}</b>}
          </div>
        ))}
        <div className="sf-r" onClick={() => setRoleSheet(true)}><span>Rôle par défaut</span><b className={s.role ? '' : 'm'}>{s.role || 'à choisir'} ›</b></div>
        <div className="sf-r"><span>Famille</span><select value={s.famille || ''} onChange={x => sauver({ famille: x.target.value })}><option value="">—</option>{FAMILLES.map(f => <option key={f}>{f}</option>)}</select></div>
        <div className="sf-r" onClick={() => edit !== 'note' && ouvrir('note')}><span>Note</span>
          {edit === 'note' ? <input autoFocus value={val} onChange={x => setVal(x.target.value)} onBlur={valider} /> : <b className={s.note ? '' : 'm'}>{s.note || '—'}</b>}</div>
      </div>
      {s.id && <>
        <div className="ac-st">Peut aussi <Info text="Touche un rôle pour l'ajouter ou le retirer. Sur un événement, tu peux lui donner n'importe quel rôle sans changer sa fiche." /></div>
        <div className="sf-roles">{rolesConnus.filter(r => r !== s.role).map(r => <button key={r} className={(s.roles || []).includes(r) ? 'on' : ''} onClick={() => roleTap(r)}>{r}</button>)}</div>
        {(s.historique || []).length > 0 && <>
          <div className="ac-st">Événements</div>
          <div className="sf-f">{s.historique.map(h => (
            <div key={h.evt} className="sf-r"><span>{h.nom}<small>{h.role || ''}</small></span><b className="sf-st">{h.note ? '★'.repeat(h.note) : <i className="m">pas noté</i>}</b></div>
          ))}</div>
        </>}
        <button className="lien-perdu" onClick={async () => { await sauver({ actif: false }); ui.toast(`${nomStaff(s)} retiré de la liste`); go('staff') }}>Retirer de la liste</button>
      </>}
      <Sheet open={roleSheet} onClose={() => setRoleSheet(false)}>
        <div className="el-name" style={{ fontSize: 26 }}>Rôle par défaut</div>
        <div className="sf-roles" style={{ margin: '14px 0 0' }}>{rolesConnus.map(r => <button key={r} className={s.role === r ? 'on' : ''} onClick={() => { setRoleSheet(false); sauver({ role: r, roles: (s.roles || []).filter(x => x !== r) }) }}>{r}</button>)}</div>
        <input placeholder="Autre rôle" style={{ marginTop: 12 }} onKeyDown={x => { if (x.key === 'Enter' && x.target.value.trim()) { setRoleSheet(false); sauver({ role: x.target.value.trim() }) } }} />
      </Sheet>
    </motion.div>
  )
}

/* ---------- Staff d'un événement ---------- */
const FAM_POSTE = { 'Staff bar': ['Bar'], 'Staff salle': ['Salle', 'Runners'], 'Staff cuisine': ['Cuisine'], Encadrement: ['Coordination', 'Logistique & achats'], 'Logistique et sécurité': ['Logistique & achats'] }
function score(s, poste) {
  const el = norm(poste.element).replace(/\(.*\)/, '').trim(), r = norm(s.role)
  if (r && (el.includes(r) || r.includes(el))) return 3
  if ((s.roles || []).some(x => { const y = norm(x); return y && (el.includes(y) || y.includes(el)) })) return 2
  if ((FAM_POSTE[poste.sous_zone] || []).includes(s.famille)) return 1
  return 0
}

export function StaffEvt({ data, go }) {
  const ui = useUI()
  const [l] = useStaff()
  const [st, setSt] = useState(null)
  const [poste, setPoste] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { api.staffEvtListe(data.evt).then(setSt).catch(e => ui.toast(e.message)) }, [data.evt])
  const parId = useMemo(() => Object.fromEntries((l || []).map(s => [s.id, s])), [l])
  if (!st || !l) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const passe = ev.date && ev.date < data.aujourdhui
  const pris = new Set(st.affectes.map(a => a.staff_id))
  const sans = st.affectes.filter(a => !st.postes.some(p => p.id === a.element_id))
  async function affecter(s, retirer = false) {
    try { setSt(await api.staffAffecter(data.evt, s.id, poste?.id || null, poste?.element || s.role, retirer)) } catch (e) { ui.toast(e.message) }
  }
  const choix = poste ? l.filter(s => !q || norm(`${nomStaff(s)} ${s.role}`).includes(norm(q)))
    .map(s => [s, score(s, poste)]).sort((a, b) => b[1] - a[1] || nomStaff(a[0]).localeCompare(nomStaff(b[0]))) : []
  const ligne = (p, aff) => {
    const b = Math.ceil(n(p.besoin)), k = aff.length
    return (
      <motion.button key={p.id || 'x'} whileTap={{ scale: .98 }} className="sf-p" onClick={() => { setPoste(p); setQ('') }}>
        <div><b>{p.element}</b><span>{k ? aff.map(a => nomStaff(parId[a.staff_id] || {})).join(', ') : 'à choisir'}</span></div>
        <div className="sf-faces">{aff.slice(0, 4).map(a => <Visage key={a.staff_id} s={parId[a.staff_id]} t={24} />)}</div>
        {b > 0 && <strong className={k >= b ? 'g' : 'r'}>{k} / {b}</strong>}
      </motion.button>
    )
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button><h1 style={{ fontSize: 34 }}>Staff</h1>
        <div className="meta">{st.affectes.length} personne{st.affectes.length > 1 ? 's' : ''} · touche un poste pour choisir <Info text="Les postes viennent de la zone Staff de l'événement (le cadrage les ajoute). Le rôle donné ici vaut pour cet événement seulement : la fiche de la personne ne change pas." /></div></div>
      {st.postes.length ? <div className="sf-f sf-m">{st.postes.map(p => ligne(p, st.affectes.filter(a => a.element_id === p.id)))}</div>
        : <div className="empty">Aucun poste de staff dans l'événement. Fais le cadrage ou ajoute-les depuis la bibliothèque.</div>}
      {sans.length > 0 && <><div className="ac-st">Autres</div><div className="sf-f sf-m">{ligne({ element: 'Hors poste', besoin: 0 }, sans)}</div></>}
      <motion.button whileTap={{ scale: .98 }} className={`rv-entree${passe ? '' : ' cd-entree'}`} style={passe ? {} : { background: 'var(--surface)', color: 'var(--ink)' }} onClick={() => go('staff-evt/noter')} disabled={!st.affectes.length}>
        <div><b>Noter l'équipe</b><span>{st.affectes.filter(a => a.note).length} / {st.affectes.length} notés</span></div>›
      </motion.button>
      <Sheet open={!!poste} onClose={() => setPoste(null)}>
        {poste && <>
          <div className="el-name" style={{ fontSize: 26 }}>{poste.element}</div>
          <div className="mute small" style={{ marginTop: 4 }}>{st.affectes.filter(a => a.element_id === poste.id).length} choisi{st.affectes.filter(a => a.element_id === poste.id).length > 1 ? 's' : ''}{n(poste.besoin) ? ` sur ${Math.ceil(n(poste.besoin))}` : ''}</div>
          <input placeholder="Chercher" value={q} onChange={x => setQ(x.target.value)} style={{ margin: '12px 0 8px' }} />
          <div className="sf-pick">{choix.map(([s, sc], i) => {
            const a = st.affectes.find(x => x.staff_id === s.id), ici = a && a.element_id === poste.id
            return (
              <div key={s.id}>
                {i > 0 && sc < 2 && choix[i - 1][1] >= 2 && <div className="sf-sep">Autres</div>}
                <button className={ici ? 'on' : ''} onClick={() => affecter(s, ici)}>
                  <Visage s={s} t={32} /><div><b>{nomStaff(s)}</b><span>{s.role}{a && !ici ? ` · déjà ${a.role}` : ''}</span></div>
                  <em>{s.moyenne ? `★ ${moy(s.moyenne)}` : ''}</em><strong>{ici ? '✓' : '+'}</strong>
                </button>
              </div>
            )
          })}</div>
        </>}
      </Sheet>
    </motion.div>
  )
}

/* ---------- Notes à la clôture ---------- */
export function StaffNoter({ data, go }) {
  const ui = useUI()
  const [l, recharger] = useStaff()
  const [st, setSt] = useState(null)
  useEffect(() => { api.staffEvtListe(data.evt).then(setSt).catch(e => ui.toast(e.message)) }, [data.evt])
  if (!st || !l) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const parId = Object.fromEntries(l.map(s => [s.id, s]))
  async function noter(a, k) {
    const v = a.note === k ? 0 : k
    setSt({ ...st, affectes: st.affectes.map(x => x.staff_id === a.staff_id ? { ...x, note: v || null } : x) })
    try { await api.staffNoter(data.evt, a.staff_id, v) } catch (e) { ui.toast(e.message) }
  }
  const faits = st.affectes.filter(a => a.note).length
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('staff-evt')}>‹ Staff</button><h1 style={{ fontSize: 34 }}>Noter l'équipe</h1><div className="meta">{faits} / {st.affectes.length} · un toucher par étoile</div></div>
      <div className="sf-f sf-m">{st.affectes.map(a => {
        const s = parId[a.staff_id] || {}
        return (
          <div key={a.staff_id} className="sf-rate">
            <Visage s={s} t={34} /><div><b>{nomStaff(s)}</b><span>{a.role}</span></div>
            <div className="sf-stars">{[1, 2, 3, 4, 5].map(k => <button key={k} className={n(a.note) >= k ? 'on' : ''} onClick={() => noter(a, k)}>★</button>)}</div>
          </div>
        )
      })}</div>
      <div className="cd-pied" style={{ position: 'static', margin: '18px 14px 0' }}><button className="p" onClick={() => { recharger(); go('staff-evt') }}>Terminer</button></div>
    </motion.div>
  )
}
