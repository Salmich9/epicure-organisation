import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, useUI } from './ui'

/* État de l'appli (admins) : chaque matin un contrôle vérifie que chaque brique répond ; les pannes vécues par l'équipe s'y ajoutent. */
const depuis = q => {
  const m = Math.round((Date.now() - new Date(q)) / 60000)
  if (m < 2) return 'à l\'instant'
  if (m < 60) return `il y a ${m} min`
  if (m < 24 * 60) return `il y a ${Math.round(m / 60)} h`
  return new Date(q).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}
const heure = q => new Date(q).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')
const SOURCES = { ecran: 'Un écran a planté', appli: 'Erreur dans l\'appli', 'orga-copilote': 'Copilote', 'orga-zoho': 'Zoho', 'orga-fichier': 'Google Drive', 'orga-dicter': 'Dictée', 'orga-imputer': 'Pièces', 'orga-especes': 'Espèces', 'orga-voix': 'Voix', 'orga-sante': 'Contrôle' }
const gens = x => (x.qui || []).filter(q => q !== 'matin' && q !== 'demande')
const source = s => s.startsWith('rpc:') ? `Base · ${s.slice(4)}` : s.startsWith('sante:') ? 'Contrôle du matin' : SOURCES[s] || s

export function Sante({ go }) {
  const ui = useUI()
  const [e, setE] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [fiche, setFiche] = useState(null)
  const charger = () => api.santeEtat().then(setE).catch(x => ui.toast(x.message))
  useEffect(() => { charger() }, [])
  async function verifier() {
    setEnCours(true)
    try { const r = await api.santeVerifier(); ui.toast(r.ok ? 'Tout répond' : 'Un souci trouvé'); await charger() } catch (x) { ui.toast(x.message) }
    setEnCours(false)
  }
  const d = e?.dernier, res = d?.resultats || []
  const ko = res.filter(r => r.ok === false)
  const vieux = d && Date.now() - new Date(d.quand) > 36 * 3600e3
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('accueil')}>‹ Événements</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>État de l'appli<Info text="Chaque matin à 7 h, l'appli vérifie que la base, Claude, Zoho, Google Drive et ses fonctions répondent. Les erreurs vécues par l'équipe sont notées ici aussi, sans les montants ni les données personnelles." /></h1></div>
      {!e ? <div className="empty">Chargement…</div> : <>
        <div className={`sa-etat ${!d ? '' : ko.length ? 'ko' : vieux ? 'vx' : 'ok'}`}>
          <span className="sa-gros">{!d ? '…' : ko.length ? '!' : '✓'}</span>
          <div><b>{!d ? 'Pas encore vérifié' : ko.length ? `${ko.length} brique${ko.length > 1 ? 's' : ''} en panne` : 'Tout fonctionne'}</b>
            <span>{d ? `${d.origine === 'matin' ? 'Contrôle du matin' : 'Vérifié'} ${depuis(d.quand) === 'à l\'instant' ? 'à l\'instant' : `à ${heure(d.quand)}`}${vieux ? ' · trop ancien' : ''}` : 'Lance le premier contrôle'}</span></div>
        </div>
        {res.length > 0 && <div className="list sa-l">{res.map(r => (
          <div key={r.cle} className="row">
            <span className={`sa-pt ${r.ok === false ? 'ko' : r.ok === null ? 'nb' : 'ok'}`} />
            <div className="x"><b>{r.nom}</b><span className={r.ok === false ? 'sa-err' : ''}>{r.detail}{r.ok && r.ms > 3000 ? ` · lent (${(r.ms / 1000).toFixed(1)} s)` : ''}</span></div>
          </div>))}</div>}
        <div className="px"><motion.button whileTap={{ scale: .97 }} className="btn block" style={{ marginTop: 14 }} disabled={enCours} onClick={verifier}>{enCours ? 'Vérification…' : 'Vérifier maintenant'}</motion.button></div>

        <div className="group" style={{ marginTop: 26 }}>Erreurs · 7 jours{e.erreurs.length ? ` · ${e.erreurs.reduce((s, x) => s + Number(x.nb), 0)}` : ''}</div>
        {!e.erreurs.length ? <div className="empty" style={{ padding: '14px 20px' }}>Aucune erreur cette semaine.</div>
          : <div className="list sa-l">{e.erreurs.map((x, i) => (
            <button key={i} className="row" onClick={() => setFiche(x)}>
              <div className="x"><b>{x.message}</b><span>{source(x.source)} · {depuis(x.dernier)}{gens(x).length ? ` · ${gens(x).join(', ')}` : ''}</span></div>
              {Number(x.nb) > 1 && <span className="sa-nb">×{x.nb}</span>}
            </button>))}</div>}
      </>}
      <Sheet open={!!fiche} onClose={() => setFiche(null)}>
        {fiche && <>
          <div className="as-l">{source(fiche.source).toUpperCase()}</div>
          <div className="el-name" style={{ fontSize: 22 }}>{fiche.message}</div>
          <p className="small mute">{fiche.nb} fois · dernière {depuis(fiche.dernier)}{gens(fiche).length ? ` · vécue par ${gens(fiche).join(', ')}` : ''}</p>
          <p className="small" style={{ marginTop: 14 }}>{fiche.source.startsWith('sante:') ? 'Le contrôle du matin n\'a pas pu joindre ce service. Si ça dure, vérifie son accès (clé, mot de passe ou connexion).' : 'Envoie-moi cette erreur dans la conversation : je saurai d\'où elle vient.'}</p>
        </>}
      </Sheet>
    </motion.div>
  )
}

// Bandeau d'alerte sur l'accueil des admins
export function AlerteSante({ s, go }) {
  if (!s) return null
  const p = s.pannes || [], n = Number(s.erreurs_24h || 0)
  if (!p.length && n < 5) return null
  return (
    <motion.button initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} whileTap={{ scale: .98 }} className="sa-ban" onClick={() => go('sante')}>
      <span>!</span><div><b>{p.length ? `${p.join(', ')} ne répond${p.length > 1 ? 'ent' : ''} plus` : `${n} erreurs depuis hier`}</b><em>voir l'état de l'appli ›</em></div>
    </motion.button>
  )
}
