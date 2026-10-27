import { useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { api } from './api'
import { sendWa } from './element'
import { ALERTE, ETATS, Info, OUVERT, Seg, Sheet, Table, dans, dateLongue, ddmm, jours, mad, n, useUI } from './ui'

export function zoneStats(data, z) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const els = data.elements.filter(e => e.zone === z.nom)
  const ouverts = els.filter(e => OUVERT.includes(e.etat)).length
  const alertes = els.filter(e => ALERTE.includes(e.etat)).length
  const cout = els.reduce((s, e) => s + n(e.cout), 0)
  const env = n(z.enveloppe) * n(ev.invites)
  return { els, ouverts, alertes, cout, env }
}

export const CONFIRMES = ['Confirmé', 'Avance versée', 'Payé', 'Livré / reçu']
export function camp(e) {
  if (e.perimetre === 'Tiers') return 'autres'
  if (e.perimetre === 'Pas besoin') return 'aucun'
  if (!e.perimetre || e.perimetre === 'À clarifier') return 'flou'
  return 'nous'
}
const estAutres = e => camp(e) === 'autres' || e.perimetre === 'En partie'

/* ---------- Bornage : à nous, aux autres, personne ---------- */
function Camps({ data, go, mine, setMine }) {
  const nous = data.elements.filter(e => camp(e) === 'nous')
  const autres = data.elements.filter(estAutres)
  const flou = data.elements.filter(e => camp(e) === 'flou')
  const nousOk = nous.filter(e => !OUVERT.includes(e.etat) && !ALERTE.includes(e.etat)).length
  const autresOk = autres.filter(e => CONFIRMES.includes(e.engagement)).length
  return (
    <>
      <div className="scope">
        <button className={!mine ? 'on' : ''} onClick={() => setMine(false)}>Tout l'événement</button>
        <button className={mine ? 'on' : ''} onClick={() => setMine(true)}>Ma part · {data.moi}</button>
      </div>
      <div className="camps">
        <motion.button whileTap={{ scale: .96 }} className="camp" onClick={() => document.getElementById('plan')?.scrollIntoView({ behavior: 'smooth' })}>
          <b>{nous.length}</b><span className="t">À nous</span><span className="s">{nousOk} bouclés</span>
        </motion.button>
        <motion.button whileTap={{ scale: .96 }} className="camp" onClick={() => go('perimetre/autres')}>
          <b>{autres.length}</b><span className="t">Aux autres</span><span className={`s ${autres.length - autresOk ? 'warn' : ''}`}>{autres.length - autresOk ? `${autres.length - autresOk} à vérifier` : 'tout confirmé'}</span>
        </motion.button>
        <motion.button whileTap={{ scale: .96 }} className={`camp ${flou.length ? 'danger' : ''}`} onClick={() => go('perimetre/flou')}>
          <b>{flou.length}</b><span className="t">Personne ne sait</span><span className="s">{flou.length ? 'à attribuer' : 'rien d\'oublié'}</span>
        </motion.button>
      </div>
    </>
  )
}

/* ---------- Liste « aux autres » ou « personne ne sait » ---------- */
export function Perimetre({ data, kind, go, open }) {
  const autres = kind === 'autres'
  const els = data.elements.filter(autres ? estAutres : e => camp(e) === 'flou')
  const groups = {}
  els.forEach(e => { const k = autres ? (e.fourni_par || 'Fournisseur à préciser') : e.zone; (groups[k] = groups[k] || []).push(e) })
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  function demander(qui, l) {
    const todo = l.filter(e => !CONFIRMES.includes(e.engagement))
    const txt = `Bonjour, pour ${ev.nom}${ev.date ? ` du ${ddmm(ev.date)}` : ''}${ev.invites ? ` (${ev.invites} invités)` : ''}, pouvez-vous nous confirmer ce qui est prévu de votre côté :\n` +
      todo.map(e => `• ${e.element}${e.besoin ? ` : ${n(e.besoin)}` : ''}`).join('\n') + `\nMerci beaucoup.`
    sendWa(data, { resp: qui }, txt)
  }
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Accueil</button>
        <h1 style={{ fontSize: 38 }}>{autres ? 'Aux autres' : 'Personne ne sait'}</h1>
        <div className="meta">{autres ? 'Ce que fournissent l\'agence, le lieu ou le client. À faire confirmer, rien à payer.' : 'Personne ne l\'a pris en charge. Décidez qui s\'en occupe.'}</div>
      </div>
      {!els.length && <div className="empty">{autres ? 'Rien n\'est confié à un tiers pour l\'instant.' : 'Tout a un responsable. Rien d\'oublié.'}</div>}
      {Object.entries(groups).map(([g, l]) => (
        <div key={g}>
          <div className="group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{g} · {l.length}</span>
            {autres && l.some(e => !CONFIRMES.includes(e.engagement)) && <button className="wa-btn" onClick={() => demander(g, l)}>Demander confirmation</button>}
          </div>
          <div className="list">{l.map(e => {
            const ok = CONFIRMES.includes(e.engagement)
            return (
              <button key={e.id} className="row" onClick={() => open(e)}>
                <div className="top"><span className="name">{e.element}</span>
                  {autres ? <span className={`pill ${ok ? 'ok' : 'gold'}`}>{ok ? 'Confirmé' : 'À vérifier'}</span> : <span className="pill red">À attribuer</span>}</div>
                <div className="info">{[autres ? e.zone : e.sous_zone, e.perimetre === 'En partie' ? 'partagé avec nous' : null, e.description].filter(Boolean).join(' · ')}</div>
              </button>
            )
          })}</div>
        </div>
      ))}
    </motion.div>
  )
}

/* ---------- Plan de salle (accueil) ---------- */
export function Plan({ data, go, openEvt, mine, setMine }) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const cout = data.elements.reduce((s, e) => s + n(e.cout), 0)
  const env = data.zones.reduce((s, z) => s + n(z.enveloppe) * n(ev.invites), 0)
  const budget = n(ev.budget) || env
  const nudge = useMemo(() => {
    const late = data.actions.filter(a => a.statut !== 'Fait' && a.statut !== 'Annulé' && a.echeance && a.echeance < data.aujourdhui)
    if (late.length) return { t: <><b>{late.length} action{late.length > 1 ? 's' : ''} en retard</b>, dont « {late[0].quoi} » pour {late[0].resp}.</>, to: 'deleguer' }
    const z = data.zones.map(z => ({ z, s: zoneStats(data, z) })).filter(x => x.s.ouverts || x.s.alertes).sort((a, b) => (b.s.alertes * 3 + b.s.ouverts) - (a.s.alertes * 3 + a.s.ouverts))[0]
    if (z) return { t: <><b>{z.z.nom}</b> : {z.s.ouverts ? `${z.s.ouverts} élément${z.s.ouverts > 1 ? 's' : ''} sans solution` : ''}{z.s.ouverts && z.s.alertes ? ', ' : ''}{z.s.alertes ? `${z.s.alertes} en alerte` : ''}.</>, to: `zone/${data.zones.indexOf(z.z)}` }
    return null
  }, [data])
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head" onClick={openEvt}>
        <div className="when">{dateLongue(ev.date)}{ev.date ? ` · ${dans(ev.date, data.aujourdhui)}` : ''}</div>
        <h1>{ev.nom}</h1>
        <div className="meta">{ev.invites ? `${ev.invites} invités` : 'Invités à fixer'} · {data.elements.length} éléments {mine ? 'à ta charge' : 'suivis'}</div>
      </div>
      <Camps data={data} go={go} mine={mine} setMine={setMine} />
      <div className="budget">
        <div className="v">{mad(cout)}<small>{mine ? `sous ta responsabilité, sur ${mad(budget)} MAD` : `engagés sur ${mad(budget)} MAD`}</small></div>
        <div className="track"><i style={{ width: `${Math.min(100, budget ? (cout / budget) * 100 : 0)}%`, background: cout > budget ? 'var(--red)' : undefined }} />{n(ev.budget) > 0 && env > 0 && <em style={{ left: `${Math.min(100, (env / budget) * 100)}%` }} />}</div>
        <div className="legend"><span>{budget ? Math.round((cout / budget) * 100) : 0} % du budget</span><span>enveloppes de zone {mad(env)} <Info text="Le trait marque la somme des enveloppes par zone (MAD par invité × invités). Le budget est celui de l'événement." /></span></div>
      </div>
      {nudge && <motion.button className="nudge" style={{ width: 'calc(100% - 32px)', textAlign: 'left' }} whileTap={{ scale: .98 }} onClick={() => go(nudge.to)}><span className="d" /><p>{nudge.t}</p><span className="go">Voir</span></motion.button>}
      <div className="plan" id="plan">
        {data.zones.map((z, i) => {
          const s = zoneStats(data, z)
          const st = !s.els.length ? (mine ? 'rien pour toi' : 'vide') : s.alertes ? `${s.alertes} alerte${s.alertes > 1 ? 's' : ''}` : s.ouverts ? `${s.ouverts} à couvrir` : 'bouclée'
          return (
            <motion.button key={z.nom} className="table-btn" whileTap={{ scale: .94 }} onClick={() => go(`zone/${i}`)}>
              <Table els={s.els} />
              <div className="n">{z.nom}</div>
              <div className={`s ${s.alertes || s.ouverts ? 'alert' : ''}`}>{st}</div>
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

/* ---------- Ligne d'élément qu'on peut faire glisser ---------- */
function SwipeRow({ e, onOpen, onConfirm, onDelegate }) {
  const x = useMotionValue(0)
  const bgOpacity = useTransform(x, [-80, -20, 0, 20, 80], [1, .2, 0, .2, 1])
  const etat = ETATS[e.etat] || { l: e.etat, c: '' }
  const qte = e.etat === 'tiers' ? `Tiers${e.fourni_par ? ` · ${e.fourni_par}` : ''}` : e.etat === 'non_concerne' ? 'Pas besoin'
    : e.besoin === null ? 'Quantité ?' : n(e.reste) > 0 ? `${n(e.reste)} sur ${n(e.besoin)} à couvrir` : `${n(e.besoin)} couvert${n(e.besoin) > 1 ? 's' : ''}`
  return (
    <div className="swipe-wrap">
      <motion.div className="swipe-bg" style={{ opacity: bgOpacity }}><span className="l">✓ Confirmer</span><span className="r">Déléguer →</span></motion.div>
      <motion.button className="row" style={{ x }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={.5} dragDirectionLock
        onDragEnd={(ev, i) => { if (i.offset.x > 90) onConfirm(e); else if (i.offset.x < -90) onDelegate(e); animate(x, 0) }}
        onTap={() => onOpen(e)}>
        <div className="top"><span className="name">{e.element}{e.qte_forcee !== null && e.qte_forcee !== undefined && e.qte_calc !== null && n(e.qte_forcee) !== n(e.qte_calc) && n(e.qte_calc) > 1 ? ' ✎' : ''}</span><span className={`pill ${etat.c}`}>{etat.l}</span></div>
        <Seg e={e} />
        <div className="info">{qte}{e.article_id ? ' · dépôt' : ''}{e.resp ? ` · ${e.resp}` : ''}{e.echeance ? ` · ${ddmm(e.echeance)}` : ''}</div>
      </motion.button>
    </div>
  )
}

/* ---------- Une zone (une table) ---------- */
export function Zone({ data, idx, go, open, patch, delegate, addEl }) {
  const ui = useUI()
  const z = data.zones[idx]
  if (!z) return null
  const s = zoneStats(data, z)
  const groups = {}
  s.els.forEach(e => { (groups[e.sous_zone || 'Autres'] = groups[e.sous_zone || 'Autres'] || []).push(e) })
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Plan de salle</button>
        <h1 style={{ fontSize: 38 }}>{z.nom}</h1>
        <div className="meta">{s.els.length - s.ouverts - s.alertes}/{s.els.length} bouclés · {mad(s.cout)}{s.env ? ` sur ${mad(s.env)}` : ''} MAD{s.env && s.cout > s.env ? ' · au-dessus de l\'enveloppe' : ''}</div>
      </div>
      {!s.els.length && <div className="empty">Aucun élément dans cette zone. Ajoutez le premier.</div>}
      {Object.entries(groups).map(([g, els]) => (
        <div key={g}>
          <div className="group">{g}</div>
          <div className="list">{els.map(e => <SwipeRow key={e.id} e={e} onOpen={open}
            onConfirm={async el => { await patch(el.id, { engagement: 'Confirmé' }); ui.toast(`${el.element} confirmé`) }}
            onDelegate={delegate} />)}</div>
        </div>
      ))}
      <div style={{ padding: '18px 14px 0' }}><button className="btn block" onClick={() => addEl(z.nom)}>Ajouter un élément</button></div>
      <p className="small mute" style={{ textAlign: 'center', marginTop: 12 }}>Glissez une ligne vers la droite pour confirmer, vers la gauche pour déléguer.</p>
    </motion.div>
  )
}

/* ---------- Décider ---------- */
export function Decider({ data, open }) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const over = data.zones.map(z => ({ z, s: zoneStats(data, z) })).filter(x => x.s.env && x.s.cout > x.s.env)
  const depotKo = data.elements.filter(e => { const a = e.article_id && data.depot.find(d => d.id === e.article_id); return a && n(e.stock) > n(a.qte) - n(data.reserve[a.id]) })
  const sections = [
    ['Sans solution', e => ['a_couvrir', 'partiel'].includes(e.etat)],
    ['À clarifier', e => e.etat === 'a_clarifier'],
    ['En retard ou mal reçu', e => ['en_retard', 'non_recu', 'recu_partiel'].includes(e.etat)],
    ['À revoir', e => e.etat === 'a_revoir'],
  ]
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><div className="when">{ev.nom}</div><h1>Décider</h1><div className="meta">Ce qui attend une décision, par ordre d'urgence.</div></div>
      {over.length > 0 && <><div className="group">Au-dessus de l'enveloppe</div><div className="list">{over.map(({ z, s }) => <div key={z.nom} className="row"><div className="top"><span className="name">{z.nom}</span><span className="pill red">+{mad(s.cout - s.env)} MAD</span></div><div className="info">{mad(s.cout)} engagés pour {mad(s.env)} prévus</div></div>)}</div></>}
      {depotKo.length > 0 && <><div className="group">Dépôt insuffisant</div><div className="list">{depotKo.map(e => <button key={e.id} className="row" onClick={() => open(e)}><div className="top"><span className="name">{e.element}</span><span className="pill red">{n(e.stock)} prévus</span></div><div className="info">{e.article_nom}</div></button>)}</div></>}
      {sections.map(([t, f]) => {
        const l = data.elements.filter(f)
        if (!l.length) return null
        return <div key={t}><div className="group">{t} · {l.length}</div><div className="list">{l.map(e => <button key={e.id} className="row" onClick={() => open(e)}><div className="top"><span className="name">{e.element}</span><span className="small mute">{e.zone}</span></div>{(e.prochaine || e.resp) && <div className="info">{[e.prochaine, e.resp].filter(Boolean).join(' · ')}</div>}</button>)}</div></div>
      })}
      {!over.length && !depotKo.length && !data.elements.some(e => OUVERT.concat(ALERTE).includes(e.etat)) && <div className="empty">Rien à décider. Tout est bouclé.</div>}
    </motion.div>
  )
}

/* ---------- Déléguer ---------- */
export function Deleguer({ data, setData }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [share, setShare] = useState(false)
  const by = {}
  data.actions.filter(a => a.statut !== 'Annulé').forEach(a => { (by[a.resp || 'Sans responsable'] = by[a.resp || 'Sans responsable'] || []).push(a) })
  async function toggle(a) {
    const st = a.statut === 'Fait' ? 'À faire' : 'Fait'
    setData(d => ({ ...d, actions: d.actions.map(x => x.id === a.id ? { ...x, statut: st } : x) }))
    try { await api.majAction(a.id, st) } catch (e) { ui.toast(e.message) }
  }
  async function sendList(nom) {
    try {
      const t = await api.lienResponsable(nom, data.evt)
      const link = `${location.origin}/?l=${t}`
      sendWa(data, { resp: nom }, `Salam ${nom}, voici ta liste pour ${ev.nom} : ${link}`)
      setShare(false)
    } catch (e) { ui.toast(e.message) }
  }
  const resps = [...new Set(data.actions.map(a => a.resp).concat(data.elements.map(e => e.resp)).filter(Boolean))]
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><div className="when">{ev.nom}</div><h1>Déléguer</h1><div className="meta">Qui fait quoi, et pour quand.</div></div>
      {!Object.keys(by).length && <div className="empty">Aucune action. Depuis un élément, touchez « Déléguer ».</div>}
      {Object.entries(by).map(([r, l]) => {
        const sorted = [...l].sort((a, b) => (a.statut === 'Fait') - (b.statut === 'Fait') || String(a.echeance).localeCompare(String(b.echeance)))
        return (
          <div key={r}>
            <div className="group">{r} · {l.filter(a => a.statut !== 'Fait').length} à faire</div>
            <div className="list">{sorted.map(a => {
              const j = jours(a.echeance, data.aujourdhui), done = a.statut === 'Fait', late = !done && j !== null && j < 0, soon = !done && j !== null && j >= 0 && j <= 2
              return (
                <div key={a.id} className="act">
                  <motion.button whileTap={{ scale: .85 }} className={`check ${done ? 'on' : ''}`} onClick={() => toggle(a)} aria-label="Fait">{done ? '✓' : ''}</motion.button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14.5, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--mute)' : undefined }}>{a.quoi}</div>
                    <div className="small" style={{ marginTop: 4 }}>{a.echeance && <span className={`pill ${late ? 'red' : soon ? 'gold' : ''}`}>{late ? 'En retard · ' : ''}{ddmm(a.echeance)}</span>}{a.reponse && <span className="mute"> « {a.reponse} »</span>}</div>
                  </div>
                  {!done && <button className="wa-btn" onClick={() => sendWa(data, a)}>{late || soon ? 'Relancer' : 'Envoyer'}</button>}
                </div>
              )
            })}</div>
          </div>
        )
      })}
      <div style={{ padding: '18px 14px 0' }}><button className="btn block" onClick={() => setShare(true)}>Envoyer sa liste à un responsable</button></div>
      <Sheet open={share} onClose={() => setShare(false)}>
        <div className="el-name" style={{ fontSize: 26 }}>Envoyer sa liste</div>
        <p className="small mute" style={{ margin: '8px 0 14px' }}>Il reçoit sur WhatsApp un lien vers ses tâches, sans compte à créer.</p>
        <div className="chips">{resps.map(r => <button key={r} className="chip" onClick={() => sendList(r)}>{r}</button>)}</div>
      </Sheet>
    </motion.div>
  )
}

/* ---------- Notes ---------- */
export function Notes({ data, setData, listening, toggleMic, draft, setDraft }) {
  const ui = useUI()
  async function add() {
    const t = draft.trim(); if (!t) return
    try { const x = await api.ajoutNote(data.evt, t); setData(d => ({ ...d, notes: [x, ...d.notes] })); setDraft(''); ui.toast('Note ajoutée') } catch (e) { ui.toast(e.message) }
  }
  async function st(x, s) { setData(d => ({ ...d, notes: d.notes.map(y => y.id === x.id ? { ...y, statut: s } : y) })); try { await api.majNote(x.id, s) } catch (e) { ui.toast(e.message) } }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><h1>Notes</h1><div className="meta">Dites ou écrivez une idée, rien ne se perd.</div></div>
      <div style={{ padding: '16px 14px 0' }}>
        <textarea rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder={listening ? 'Je vous écoute…' : 'Un changement, un oubli, une idée…'} />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}><button className="btn" onClick={toggleMic}>{listening ? 'Arrêter' : 'Dicter'}</button><button className="btn primary" onClick={add}>Ajouter</button></div>
      </div>
      <div className="group">Boîte de réception <Info text="Chaque note attend votre validation. Le copilote proposera bientôt où la placer et ce qu'elle change." /></div>
      <div className="list">
        {!data.notes.length && <div className="empty">Vide pour l'instant.</div>}
        {data.notes.map(x => {
          const done = x.statut !== 'À valider'
          return (
            <div key={x.id} className="row" style={{ cursor: 'default' }}>
              <div style={{ fontSize: 14.5, color: done ? 'var(--mute)' : undefined }}>{x.texte}</div>
              {x.placement && <div className="info">→ {x.placement}</div>}
              <div className="top" style={{ marginTop: 10 }}>
                <span className="small mute">{ddmm(String(x.date).slice(0, 10))} · {x.auteur}</span>
                {done ? <span className={`pill ${x.statut === 'Appliquée' ? 'ok' : ''}`}>{x.statut}</span>
                  : <span className="chips"><button className="chip ghost" onClick={() => st(x, 'Ignorée')}>Ignorer</button><button className="chip on" onClick={() => st(x, 'Appliquée')}>Fait</button></span>}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
