// Notifications : réglages (direction), mes rappels (chacun), fiche d'une tâche ouverte depuis une notif.
// Le téléphone ne décide rien : la base calcule les rappels (heure de Casablanca), le serveur les envoie.
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, useUI } from './ui'

const glisse = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }
export const TYPES = [['tasting', 'Tasting'], ['briefing', 'Briefing'], ['ouverture_bar', 'Ouverture bar'], ['montage', 'Montage'], ['inventaire', 'Inventaire'],
  ['demontage', 'Démontage'], ['retour_depot', 'Retour dépôt'], ['autre', 'Autre']]
const nomType = t => (TYPES.find(x => x[0] === t) || [, t])[1]
const hh = d => new Date(d).toLocaleTimeString('fr-FR', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Casablanca' }).replace(':', ' h ').replace(' h 00', ' h')
const jourH = d => {
  const x = new Date(d), aujourd = new Date().toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' }), j = x.toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  const dem = new Date(Date.now() + 864e5).toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' })
  return `${j === aujourd ? 'Aujourd\'hui' : j === dem ? 'Demain' : x.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Africa/Casablanca' })} ${hh(d)}`
}

/* ---------- Abonnement de ce téléphone ---------- */
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const installee = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
export function pushPossible() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return ios() && !installee() ? 'installer' : 'non'
  return 'oui'
}
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)) }
export async function abonnementActuel() {
  if (pushPossible() !== 'oui') return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}
export async function abonner() {
  const p = pushPossible()
  if (p === 'installer') throw new Error('Ajoute d\'abord l\'appli à l\'écran d\'accueil (Partager › Sur l\'écran d\'accueil), puis ouvre-la depuis son icône.')
  if (p !== 'oui') throw new Error('Ce navigateur ne reçoit pas les notifications.')
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications refusées : autorise-les dans les réglages du téléphone.')
  const reg = await navigator.serviceWorker.ready
  const { cle } = await api.notifs('vapid_public')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cle) })
  await api.pushAbonner({ ...sub.toJSON(), appareil: ios() ? 'iPhone' : /android/i.test(navigator.userAgent) ? 'Android' : 'Ordinateur' })
  return sub
}
export async function desabonner() {
  const sub = await abonnementActuel()
  if (sub) { await api.pushDesabonner(sub.endpoint); await sub.unsubscribe().catch(() => {}) }
}

function Bascule({ on, onClick, titre, sous, off }) {
  return <button className="toggle" disabled={off} style={off ? { opacity: .5 } : null} onClick={onClick}>
    <span>{titre}{sous && <><br /><small style={{ fontWeight: 500, color: 'var(--mute)' }}>{sous}</small></>}</span><i className={on ? 'on' : ''} />
  </button>
}

/* ---------- Ce téléphone : interrupteur ---------- */
function CeTelephone({ apres }) {
  const ui = useUI()
  const [sub, setSub] = useState(undefined)
  const [occupe, setOccupe] = useState(false)
  useEffect(() => { abonnementActuel().then(setSub).catch(() => setSub(null)) }, [])
  const possible = pushPossible()
  async function basculer() {
    setOccupe(true)
    try { if (sub) { await desabonner(); setSub(null); ui.toast('Ce téléphone ne reçoit plus rien') } else { setSub(await abonner()); ui.toast('Ce téléphone est abonné') } apres?.() }
    catch (e) { ui.bubble(e.message) }
    finally { setOccupe(false) }
  }
  return <>
    <Bascule on={!!sub} off={occupe || sub === undefined} onClick={basculer} titre="Recevoir les notifications sur ce téléphone"
      sous={possible === 'installer' ? 'iPhone : ajoute d\'abord l\'appli à l\'écran d\'accueil' : possible === 'non' ? 'Pas possible sur ce navigateur' : sub ? 'Abonné' : 'Un toucher pour s\'abonner'} />
  </>
}

/* ---------- Mes rappels ---------- */
export function MesRappels({ go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const charger = () => api.mesRappels().then(setD).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  return (
    <motion.div {...glisse}>
      <div className="head">
        <button className="back" onClick={() => go('mapart')}>‹ Ma part</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Mes rappels <Info text="Avant chacune de tes tâches, un rappel arrive sur ce téléphone. Tu le reçois aussi si tu es suppléant. Une tâche cochée ne sonne plus." /></h1>
        {d && !d.actif && <div className="meta">Notifications coupées pour l'instant</div>}
        {d && d.actif && !d.pour_moi && <div className="meta">Pas encore ouvertes à toi : en test</div>}
      </div>
      <div className="px"><CeTelephone apres={charger} /></div>
      <div className="cf-grp">MES PROCHAINS RAPPELS</div>
      {!d && <p className="small mute px">Chargement…</p>}
      {d && !d.rappels.length && <div className="empty" style={{ padding: '18px 16px' }}>Aucune tâche à venir pour toi.</div>}
      {d && d.rappels.length > 0 && <div className="list">{d.rappels.map(r => (
        <button key={r.id} className="cf-l" onClick={() => go(`tache/${r.evt}/${r.id}`)}>
          <div className="x"><b>{r.titre}</b><span>{[r.code, hh(r.quand), r.suppleant ? 'suppléant' : null, r.critique ? 'critique' : null].filter(Boolean).join(' · ')}</span></div>
          <div className="cf-v" style={{ fontSize: 13.5 }}>🔔 {jourH(r.rappel_at)}</div>
        </button>))}</div>}
      {d?.envoyes?.length > 0 && <>
        <div className="cf-grp">REÇUS</div>
        <div className="list">{d.envoyes.map((a, k) => (
          <div key={k} className="cf-l"><div className="x"><b>{a.titre}</b><span>{jourH(a.le)}{a.statut === 'sans_abonnement' ? ' · pas arrivé : téléphone pas abonné' : a.statut === 'echec' ? ' · pas arrivé' : ''}</span></div></div>))}</div>
      </>}
    </motion.div>
  )
}

/* ---------- Réglages (direction ; Salmane change) ---------- */
const DELAIS = [10, 15, 20, 30, 45, 60]
export function ReglagesNotifs({ go }) {
  const ui = useUI()
  const [d, setD] = useState(null)
  const [occupe, setOccupe] = useState('')
  useEffect(() => { api.notifsReglages().then(setD).catch(e => ui.toast(e.message)) }, [])
  if (!d) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const r = d.reglages, ro = !d.peut_modifier
  async function changer(p) {
    if (ro) { ui.bubble('Seul un administrateur change les réglages.'); return }
    setD(x => ({ ...x, reglages: { ...x.reglages, ...p } }))
    try { setD(await api.notifsReglages(p)) } catch (e) { ui.toast(`Pas enregistré : ${e.message}`); api.notifsReglages().then(setD) }
  }
  const sous = (k, v) => changer({ [k]: { ...r[k], ...v } })
  const bascule = (liste, x) => (liste || []).includes(x) ? liste.filter(y => y !== x) : [...(liste || []), x]
  async function action(a) {
    setOccupe(a)
    try {
      const x = await api.notifs(a)
      if (a === 'test') ui.bubble(x.ok ? `Envoyée sur ${x.appareils} appareil${x.appareils > 1 ? 's' : ''}.` : x.raison || 'Pas arrivée.')
      else ui.bubble(!x.actif ? 'Interrupteur sur Arrêt : rien n\'est parti.' : x.occupe ? 'Un passage est déjà en cours.' : `${x.nouvelles} nouvelle${x.nouvelles > 1 ? 's' : ''} alerte${x.nouvelles > 1 ? 's' : ''}, ${x.envoyees} envoyée${x.envoyees > 1 ? 's' : ''}.`)
      setD(await api.notifsReglages())
    } catch (e) { ui.toast(e.message) } finally { setOccupe('') }
  }
  const F = [['timeline', 'Ma timeline', 'rappel avant chaque tâche'], ['actions', 'Mes actions', 'confiée, demain, en retard'], ['enveloppes', 'Enveloppes', 'dépassement, reste à rendre'],
    ['jourj', 'Jour J', 'le matin : tes tâches, le staff'], ['pieces', 'Pièces bloquées', 'pas encore de contrôle dans l\'appli']]
  return (
    <motion.div {...glisse}>
      <div className="head">
        <button className="back" onClick={() => go('accueil')}>‹ Événements</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Notifications <Info text="La base calcule les rappels chaque minute, à l'heure de Casablanca. Une alerte n'est dite qu'une fois ; 3 au plus d'un coup, puis « N autres »." /></h1>
        <div className="meta">{ro ? 'Lecture seule' : r.actif ? (r.ouvert_equipe ? 'En marche pour toute l\'équipe' : `En test : ${(r.testeurs || []).join(', ')}`) : 'Arrêt : rien ne part'}</div>
      </div>
      <div className="px">
        <Bascule on={r.actif} onClick={() => changer({ actif: !r.actif })} titre="Notifications" sous={r.actif ? 'Marche' : 'Arrêt : rien ne part'} />
        <div className="label">Pour qui</div>
        <div className="chips">
          <button className={`chip ${!r.ouvert_equipe ? 'on' : ''}`} onClick={() => changer({ ouvert_equipe: false })}>En test</button>
          <button className={`chip ${r.ouvert_equipe ? 'on' : ''}`} onClick={() => changer({ ouvert_equipe: true })}>Toute l'équipe</button>
        </div>
        {!r.ouvert_equipe && <div className="chips" style={{ marginTop: 8 }}>{d.membres.map(m =>
          <button key={m} className={`chip ${(r.testeurs || []).includes(m) ? 'on' : 'ghost'}`} onClick={() => changer({ testeurs: bascule(r.testeurs, m) })}>{m}</button>)}</div>}
        <CeTelephone apres={() => api.notifsReglages().then(setD)} />

        <div className="label">Familles</div>
        {F.map(([k, t, s]) => <Bascule key={k} on={!!r.familles?.[k]} off={k === 'pieces'} onClick={() => sous('familles', { [k]: !r.familles?.[k] })} titre={t} sous={s} />)}

        <div className="label">Heures calmes <Info text="En dehors de ces heures, rien ne part. Sauf « Ma timeline » et « Jour J », de la veille au lendemain de l'événement." /></div>
        <div className="chips" style={{ alignItems: 'center' }}>
          <span className="small mute">De</span>
          <button className="chip" onClick={() => sous('heures', { debut: Math.max(5, r.heures.debut - 1) })}>−</button>
          <b style={{ minWidth: 36, textAlign: 'center' }}>{r.heures.debut} h</b>
          <button className="chip" onClick={() => sous('heures', { debut: Math.min(12, r.heures.debut + 1) })}>+</button>
          <span className="small mute" style={{ marginLeft: 8 }}>à</span>
          <button className="chip" onClick={() => sous('heures', { fin: Math.max(18, r.heures.fin - 1) })}>−</button>
          <b style={{ minWidth: 36, textAlign: 'center' }}>{r.heures.fin} h</b>
          <button className="chip" onClick={() => sous('heures', { fin: Math.min(24, r.heures.fin + 1) })}>+</button>
        </div>

        <div className="label">Rappel avant une tâche</div>
        <div className="small mute" style={{ marginBottom: 6 }}>Par défaut</div>
        <div className="chips">{DELAIS.map(m => <button key={m} className={`chip ${r.delais.defaut === m ? 'on' : ''}`} onClick={() => sous('delais', { defaut: m })}>{m} min</button>)}</div>
        <div className="small mute" style={{ margin: '10px 0 6px' }}>Tâches courtes</div>
        <div className="chips">{DELAIS.slice(0, 4).map(m => <button key={m} className={`chip ${r.delais.court === m ? 'on' : ''}`} onClick={() => sous('delais', { court: m })}>{m} min</button>)}</div>
        <div className="chips" style={{ marginTop: 6 }}>{TYPES.map(([k, l]) => <button key={k} className={`chip ${(r.delais.types_courts || []).includes(k) ? 'on' : 'ghost'}`} onClick={() => sous('delais', { types_courts: bascule(r.delais.types_courts, k) })}>{l}</button>)}</div>
        <div className="small mute" style={{ margin: '10px 0 6px' }}>Tâche du matin : la veille à</div>
        <div className="chips">{['17:00', '18:00', '19:00', '20:00'].map(h => <button key={h} className={`chip ${r.delais.veille === h ? 'on' : ''}`} onClick={() => sous('delais', { veille: h })}>{h.replace(':00', ' h')}</button>)}
          <span className="small mute" style={{ alignSelf: 'center' }}>si avant</span>
          {['10:00', '11:00', '12:00'].map(h => <button key={h} className={`chip ${r.delais.matin_avant === h ? 'on' : 'ghost'}`} onClick={() => sous('delais', { matin_avant: h })}>{h.replace(':00', ' h')}</button>)}</div>

        <div className="label">Tâches critiques <Info text="Pas cochée à son heure : le coordinateur de l'événement est prévenu (Salmane s'il n'y en a pas)." /></div>
        <div className="chips">{TYPES.filter(t => t[0] !== 'autre').map(([k, l]) => <button key={k} className={`chip ${(r.critiques || []).includes(k) ? 'on' : 'ghost'}`} onClick={() => changer({ critiques: bascule(r.critiques, k) })}>{l}</button>)}</div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button className="btn" disabled={!!occupe} onClick={() => action('test')}>{occupe === 'test' ? 'Envoi…' : 'Envoyer un test à moi'}</button>
          {!ro && <button className="btn" disabled={!!occupe} onClick={() => action('verifier')}>{occupe === 'verifier' ? '…' : 'Vérifier maintenant'}</button>}
        </div>
      </div>
      <div className="cf-grp">ABONNÉS</div>
      <div className="px small" style={{ paddingBottom: 6 }}>{d.abonnes.length ? d.abonnes.map(a => `${a.nom}${a.appareils > 1 ? ` (${a.appareils})` : ''}`).join(', ') : 'Personne pour l\'instant'}</div>
      {d.derniers.length > 0 && <>
        <div className="cf-grp">DERNIERS ENVOIS</div>
        <div className="list">{d.derniers.map((a, k) => <div key={k} className="cf-l"><div className="x"><b>{a.titre}</b><span>{a.dest} · {jourH(a.le)}</span></div>
          <div className="cf-v"><span className={`nt-b ${a.statut === 'envoye' ? 'ok' : a.statut === 'a_envoyer' ? '' : 'ko'}`}>{{ envoye: 'parti', a_envoyer: 'en attente', groupe: 'groupé', sans_abonnement: 'pas abonné', echec: 'échec' }[a.statut] || a.statut}</span></div></div>)}</div>
      </>}
    </motion.div>
  )
}

/* ---------- Une tâche, ouverte depuis une notif ---------- */
export function Tache({ evt, id, go, ouvrirPlanning }) {
  const ui = useUI()
  const [t, setT] = useState(undefined)
  const [occupe, setOccupe] = useState(false)
  const charger = () => api.planningListe(evt).then(r => { const x = (r.planning || []).find(y => y.id === id); setT(x ? { ...x, evt: r.evenement || {} } : null) }).catch(e => { ui.toast(e.message); setT(null) })
  useEffect(() => { charger() }, [evt, id])
  async function fait(v) {
    setOccupe(true)
    try { await api.planningEnregistrer(evt, id, { fait: v }); setT(x => ({ ...x, fait: v })); if (v) ui.toast('C\'est noté, merci') }
    catch (e) { ui.toast(`Pas enregistré : ${e.message}`) } finally { setOccupe(false) }
  }
  if (t === undefined) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  if (!t) return <div className="empty" style={{ paddingTop: 80 }}>Cette tâche n'existe plus.<br /><button className="btn" style={{ marginTop: 16 }} onClick={() => go('mes-rappels')}>Mes rappels</button></div>
  return (
    <motion.div {...glisse}>
      <div className="head">
        <button className="back" onClick={() => go('mes-rappels')}>‹ Mes rappels</button>
        <div className="el-kicker" style={{ marginTop: 10 }}>{[t.evt.code, t.evt.entite === 'Business Boys' ? 'Business Boys' : 'Epicure', t.type ? nomType(t.type) : null, t.critique ? 'critique' : null].filter(Boolean).join(' · ')}</div>
        <h1>{t.titre}</h1>
        <div className="meta">{new Date(t.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{t.heure ? ` · ${t.heure.replace(':', ' h ')}` : ''}{t.duree_min ? ` · ${t.duree_min} min` : ''}</div>
      </div>
      <div className="list" style={{ marginTop: 10 }}>
        {(t.lieu || t.evt.lieu) && <div className="cf-l"><div className="x"><span>Où</span><b>{t.lieu || t.evt.lieu}</b></div></div>}
        <div className="cf-l"><div className="x"><span>Qui</span><b>{t.qui || 'Personne'}{t.suppleant ? ` · suppléant ${t.suppleant}` : ''}</b></div></div>
        {t.note && <div className="cf-l"><div className="x"><span>Note</span><b style={{ fontWeight: 500 }}>{t.note}</b></div></div>}
      </div>
      <div className="px" style={{ marginTop: 20 }}>
        {t.fait
          ? <><div className="nt-fait">✓ Faite</div><button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={occupe} onClick={() => fait(false)}>↩ Pas faite</button></>
          : <motion.button whileTap={{ scale: .97 }} className="btn primary nt-ok" disabled={occupe} onClick={() => fait(true)}>✓ Fait</motion.button>}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} onClick={() => ouvrirPlanning(evt)}>Voir tout le planning</button>
      </div>
    </motion.div>
  )
}

/* ---------- Pastille de rappel sur la timeline (direction) ---------- */
export function PastilleRappel({ r, fait }) {
  if (!r || fait) return null
  if (!r.dest.length) return <span className="nt-b ko">{r.sans_compte.length ? 'pas de compte' : 'personne'}</span>
  if (r.retard) return <span className="nt-b ko">en retard signalé</span>
  if (r.envoye) return <span className="nt-b ok">🔔 parti {hh(r.envoye)}</span>
  if (!r.abonnes.length) return <span className="nt-b">🔕 pas abonné</span>
  return <span className="nt-b">🔔 {hh(r.rappel_at)}</span>
}
