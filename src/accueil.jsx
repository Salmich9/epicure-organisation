import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api, store } from './api'
import { Info, dans, dateLongue, n, useUI } from './ui'

/* Accueil : tous les événements par étape, l'argent en jeu et ce qui presse */
const TVA = { Epicure: 20, 'Business Boys': 10 }
const mt = v => Math.round(n(v)).toLocaleString('fr-FR')
const AGENT = 'agent_7201m5t5aynbfdcsexzx82j4mprz'

function etape(e, today) {
  if (e.statut === 'Perdu') return 'perdu'
  if (e.statut === 'Clôturé') return 'cloture'
  if (e.statut === 'Réalisé' || ((e.statut === 'Confirmé' || e.statut === 'En préparation') && e.date && e.date < today)) return 'a_cloturer'
  if (e.statut === 'Confirmé' || e.statut === 'En préparation') return 'confirme'
  if (e.statut === 'Devis envoyé') return 'devis'
  return 'demande'
}
const GROUPES = [['a_cloturer', 'À clôturer'], ['confirme', 'Confirmés'], ['devis', 'Devis envoyés'], ['demande', 'Demandes à chiffrer']]
const resteTTC = e => Math.max(0, n(e.prix_signe) * (1 + (TVA[e.entite] || 0) / 100) - n(e.encaisse))

export function Accueil({ go, ouvrir }) {
  const ui = useUI()
  const [a, setA] = useState(null)
  const [voir, setVoir] = useState(false)
  useEffect(() => { api.accueil().then(setA).catch(e => ui.toast(e.message)) }, [])
  if (!a) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const today = a.aujourdhui
  const evs = a.evenements.map(e => ({ ...e, et: etape(e, today) }))
  const signe = evs.filter(e => e.et === 'confirme').reduce((s, e) => s + n(e.prix_signe), 0)
  const reste = evs.filter(e => ['confirme', 'a_cloturer'].includes(e.et)).reduce((s, e) => s + resteTTC(e), 0)
  const h = new Date().getHours()
  const fin = evs.filter(e => e.et === 'cloture' || e.et === 'perdu')
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><div className="when">{dateLongue(today)}</div><h1 style={{ fontSize: 36 }}>{h < 18 ? 'Bonjour' : 'Bonsoir'} {a.moi}</h1></div>
      <div className="ac-money">
        <div><b>{mt(signe)}</b>signé à venir HT</div>
        <div className="l"><b>{mt(reste)}</b>reste à encaisser <Info text="TTC, sur les événements confirmés et à clôturer : prix signé plus TVA, moins tout ce qui est déjà encaissé." /></div>
      </div>
      <div className="ac-acts">
        <motion.button whileTap={{ scale: .97 }} onClick={() => go('nouveau')}>+ Nouvel événement</motion.button>
        <motion.button whileTap={{ scale: .97 }} className="v" onClick={() => go('voix')}>🎙 Chiffrer à la voix</motion.button>
      </div>
      <motion.button whileTap={{ scale: .98 }} className="ac-staff" onClick={() => go('staff')}><span>👥</span><b>Staff</b><em>fiches, rôles, notes ›</em></motion.button>
      {GROUPES.map(([k, l]) => {
        const g = evs.filter(e => e.et === k)
        if (!g.length) return null
        return (
          <div key={k}>
            <div className="ac-st">{l} · {g.length}</div>
            {g.map(e => <Carte key={e.id} e={e} today={today} onClick={() => ouvrir(e.id)} />)}
          </div>
        )
      })}
      {fin.length > 0 && <>
        <button className="ac-st ac-fin" onClick={() => setVoir(!voir)}>Clôturés et perdus · {fin.length} {voir ? '▾' : '›'}</button>
        {voir && fin.map(e => <Carte key={e.id} e={e} today={today} onClick={() => ouvrir(e.id)} />)}
      </>}
    </motion.div>
  )
}

function Carte({ e, today, onClick }) {
  const tags = []
  if (e.et === 'demande' || (e.et === 'devis' && !e.chiffre)) tags.push(['o', e.chiffre ? 'Chiffré · devis à envoyer' : 'À chiffrer'])
  if (e.et === 'devis' && e.chiffre) tags.push(['', 'En attente du client'])
  if (['confirme', 'a_cloturer'].includes(e.et)) {
    tags.push(e.n_elements ? [n(e.n_revus) === n(e.n_elements) ? 'g' : 'o', `Revue ${e.n_revus} / ${e.n_elements}`] : ['o', 'Revue à commencer'])
  }
  if (n(e.pieces_a_imputer)) tags.push(['r', `${e.pieces_a_imputer} pièce${e.pieces_a_imputer > 1 ? 's' : ''} à imputer`])
  if (n(e.prix_signe) && e.et !== 'cloture') { const r = resteTTC(e); tags.push(r > 1 ? ['', `reste ${mt(r)}${TVA[e.entite] ? ' TTC' : ''}`] : ['g', 'tout encaissé']) }
  const prog = e.n_elements ? n(e.n_revus) / n(e.n_elements) : 0
  return (
    <motion.button whileTap={{ scale: .98 }} className="ac-ev" onClick={onClick}>
      <div className="t"><b>{e.nom}</b><span>{e.date ? dans(e.date, today) : 'date à fixer'}</span></div>
      <div className="m">{[e.invites ? `${e.invites} invités` : null, e.entite, n(e.prix_signe) ? `${mt(e.prix_signe)} signé` : null].filter(Boolean).join(' · ')}</div>
      {tags.length > 0 && <div className="tags">{tags.map(([c, x]) => <i key={x} className={c}>{x}</i>)}</div>}
      {['confirme', 'a_cloturer'].includes(e.et) && e.n_elements > 0 && <div className="bar"><em style={{ width: `${prog * 100}%` }} /></div>}
    </motion.button>
  )
}

/* ---------- Agent vocal : l'appel se fait dans l'appli ---------- */
export function Voix({ data, go, ouvrir }) {
  const ui = useUI()
  const [etat, setEtat] = useState('pret')
  const [mode, setMode] = useState('listening')
  const [dit, setDit] = useState('')
  const [entendu, setEntendu] = useState('')
  const [muet, setMuet] = useState(false)
  const [cree, setCree] = useState(null)
  const conv = useRef(null)
  const avant = useRef(null)
  const outil = useRef(false)
  useEffect(() => () => { conv.current?.endSession?.() }, [])
  // Après l'appel : l'événement créé par l'agent est celui qui n'existait pas avant
  useEffect(() => {
    if (etat !== 'fini' || !avant.current) return
    let essais = 0
    const chercher = () => api.accueil().then(a => {
      const nv = a.evenements.filter(e => !avant.current.has(e.id))
      if (nv.length) setCree({ evenement_id: nv[nv.length - 1].id, nom: nv[nv.length - 1].nom })
      else if (outil.current && essais++ < 5) setTimeout(chercher, 2000)
    }).catch(() => {})
    chercher()
  }, [etat])
  async function lancer() {
    setEtat('connexion')
    try {
      avant.current = new Set((await api.accueil()).evenements.map(e => e.id)); outil.current = false
      await navigator.mediaDevices.getUserMedia({ audio: true })
      const { Conversation } = await import('@elevenlabs/client')
      conv.current = await Conversation.startSession({
        agentId: AGENT, connectionType: 'webrtc',
        dynamicVariables: { orga_token: store.token || '', qui: data.moi || '' },
        onConnect: () => setEtat('appel'),
        onDisconnect: () => setEtat('fini'),
        onError: m => ui.toast(String(m)),
        onModeChange: m => setMode(m.mode),
        onMessage: m => { if (m.source === 'ai') setDit(m.message); else setEntendu(m.message) },
        onAgentToolResponse: r => { if (r?.agent_tool_response?.tool_name === 'creer_dans_appli' && !r.agent_tool_response.is_error) outil.current = true },
      })
    } catch (e) { setEtat('pret'); ui.bubble(/Permission|NotAllowed/i.test(String(e)) ? 'Autorise le micro pour parler à l\'agent.' : `L'agent ne répond pas : ${e.message || e}`) }
  }
  async function raccrocher() { try { await conv.current?.endSession() } catch {} setEtat('fini') }
  function basculerMicro() { const m = !muet; setMuet(m); try { conv.current?.setMicMuted(m) } catch {} }
  return (
    <div className="vo">
      <button className="vo-back" onClick={() => { raccrocher(); go('accueil') }}>‹ Accueil</button>
      <motion.div className={`orb ${etat === 'appel' ? mode : ''}`} animate={etat === 'appel' ? { scale: mode === 'speaking' ? [1, 1.08, 1] : [1, 1.02, 1] } : { scale: 1 }} transition={{ repeat: Infinity, duration: mode === 'speaking' ? .9 : 2.4 }} />
      {etat === 'pret' && <>
        <div className="vq">Chiffre un événement en parlant</div>
        <div className="vs">L'agent te pose les questions une par une, calcule, puis crée l'événement et le devis Zoho.</div>
        <motion.button whileTap={{ scale: .96 }} className="vo-go" onClick={lancer}>Démarrer l'appel</motion.button>
      </>}
      {etat === 'connexion' && <div className="vq">Connexion…</div>}
      {etat === 'appel' && <>
        <div className="vq">{dit || '…'}</div>
        <div className="vs">{mode === 'speaking' ? 'Coupe-lui la parole quand tu veux' : muet ? 'Micro coupé' : 'À toi'}</div>
        {entendu && <div className="vo-live">« {entendu} »</div>}
        <div className="vo-end"><button onClick={basculerMicro}>{muet ? 'Reprendre' : 'Pause'}</button><button className="r" onClick={raccrocher}>Raccrocher</button></div>
      </>}
      {etat === 'fini' && <>
        <div className="vq">{cree ? 'Événement créé' : 'Appel terminé'}</div>
        <div className="vs">{cree ? `${cree.nom} : devis en brouillon dans Zoho, le chiffrage détaillé arrive dans deux minutes.` : 'Rien n\'a été créé.'}</div>
        {cree && <motion.button whileTap={{ scale: .96 }} className="vo-go" onClick={() => ouvrir(cree.evenement_id)}>Ouvrir l'événement</motion.button>}
        <button className="vo-again" onClick={() => { setDit(''); setEntendu(''); setCree(null); setEtat('pret') }}>Nouvel appel</button>
      </>}
    </div>
  )
}
