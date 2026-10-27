import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from './api'
import { ALERTE, OUVERT, envZone, n } from './ui'

/* Avertissements calculés sur place : instantanés et gratuits */
export function regles(data) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const out = []
  const auj = data.aujourdhui
  const jJ = ev.date ? Math.round((new Date(ev.date) - new Date(auj)) / 864e5) : null
  const zoneIdx = nom => data.zones.findIndex(z => z.nom === nom)

  const late = data.actions.filter(a => a.statut !== 'Fait' && a.statut !== 'Annulé' && a.echeance && a.echeance < auj)
  if (late.length) out.push({ type: 'avertissement', titre: `${late.length} action${late.length > 1 ? 's' : ''} en retard`, texte: late.slice(0, 3).map(a => `« ${a.quoi} » pour ${a.resp || '?'}`).join(', ') + (late.length > 3 ? '…' : '.'), action: { label: 'Relancer', to: 'deleguer' } })

  const mal = data.elements.filter(e => ['en_retard', 'non_recu', 'recu_partiel'].includes(e.etat))
  if (mal.length) out.push({ type: 'avertissement', titre: `${mal.length} réception${mal.length > 1 ? 's' : ''} en souffrance`, texte: mal.slice(0, 3).map(e => e.element + (e.manque ? ` (manque : ${e.manque})` : '')).join(', ') + '.', action: { label: 'Voir', to: 'decider' } })

  const depotKo = data.elements.filter(e => { const a = e.article_id && data.depot.find(d => d.id === e.article_id); return a && n(e.stock) > n(a.qte) - n((data.reserve || {})[a.id]) })
  if (depotKo.length) out.push({ type: 'avertissement', titre: 'Dépôt insuffisant', texte: depotKo.map(e => `${e.element} : ${n(e.stock)} prévus`).join(', ') + '.', action: { label: 'Voir', to: 'decider' } })

  data.zones.forEach(z => {
    const els = data.elements.filter(e => e.zone === z.nom)
    const cout = els.reduce((s, e) => s + n(e.cout), 0)
    const env = envZone(z, ev)
    if (env && cout > env * 1.05) out.push({ type: 'avertissement', zone: z.nom, titre: `${z.nom} au-dessus de l'enveloppe`, texte: `${Math.round(cout / 1000)} k engagés pour ${Math.round(env / 1000)} k prévus.`, action: { label: 'Ouvrir', to: `zone/${zoneIdx(z.nom)}` } })
    const urgent = els.filter(e => OUVERT.includes(e.etat) && e.echeance && e.echeance <= auj)
    if (urgent.length) out.push({ type: 'avertissement', zone: z.nom, titre: `${z.nom} : ${urgent.length} élément${urgent.length > 1 ? 's' : ''} à couvrir aujourd'hui`, texte: urgent.slice(0, 4).map(e => e.element).join(', ') + (urgent.length > 4 ? '…' : '.'), action: { label: 'Ouvrir', to: `zone/${zoneIdx(z.nom)}` } })
  })

  const prest = ev.prestations || []
  if (prest.includes('Bar') && !data.elements.some(e => e.zone === 'Bar')) out.push({ type: 'avertissement', zone: 'Bar', titre: 'Bar prévu, mais vide', texte: 'Une prestation Bar est prévue, mais ni glace, ni verres, ni staff bar ne figurent dans l\'organisation.', action: { label: 'Ouvrir le Bar', to: `zone/${zoneIdx('Bar')}` } })

  const flou = data.elements.filter(e => !e.perimetre || e.perimetre === 'À clarifier')
  if (flou.length) out.push({ type: 'avertissement', titre: `${flou.length} élément${flou.length > 1 ? 's' : ''} sans responsable`, texte: 'Personne ne les a pris en charge : décide qui s\'en occupe.', action: { label: 'Attribuer', to: 'perimetre/flou' } })

  const tiersKo = data.elements.filter(e => e.perimetre === 'Tiers' && !['Confirmé', 'Avance versée', 'Payé', 'Livré / reçu'].includes(e.engagement))
  if (tiersKo.length && jJ !== null && jJ <= 7) out.push({ type: 'avertissement', titre: `${tiersKo.length} fourniture${tiersKo.length > 1 ? 's' : ''} de tiers non confirmée${tiersKo.length > 1 ? 's' : ''}`, texte: `À J-${jJ}, fais confirmer par écrit : ${tiersKo.slice(0, 4).map(e => e.element).join(', ')}${tiersKo.length > 4 ? '…' : '.'}`, action: { label: 'Demander', to: 'perimetre/autres' } })
  ;(data.pieces || []).filter(x => x.statut === 'a_revoir').slice(0, 3).forEach(x => out.unshift({ type: 'avertissement', titre: `Pièce à revoir · ${x.fournisseur || 'fournisseur ?'}`,
    texte: `${x.raison || 'À vérifier'}. Déposée par ${x.depose_par || '?'}${x.montant ? `, ${Math.round(x.montant)} MAD` : ''}.`, action: x.drive_url ? { label: 'Voir la pièce', url: x.drive_url } : null }))
  return out
}

let DEMANDE = {}
/* Bulles du copilote : une série par jour et par événement, gardée en base */
export function useBulles(data) {
  const [ia, setIa] = useState([])
  useEffect(() => {
    let vivant = true
    api.bullesListe(data.evt).then(r => {
      if (!vivant) return
      setIa(r.bulles || [])
      if (r.jour !== r.aujourdhui && !DEMANDE[data.evt]) {
        DEMANDE[data.evt] = true
        api.copilote('bulles').then(x => { if (vivant) setIa(x.bulles || []) }).catch(() => {})
      }
    }).catch(() => {})
    return () => { vivant = false }
  }, [data.evt])
  return ia
}
export function rafraichirBulles() { DEMANDE = {} }

const ICONE = { avertissement: '!', conseil: 'i', reflexion: '~' }
const NOM = { avertissement: 'Avertissement', conseil: 'Conseil', reflexion: 'Réflexion' }

/* Fil de bulles : les avertissements pulsent, le reste attend qu'on l'ouvre */
export function Bulles({ items, go, compact }) {
  const [ouverte, setOuverte] = useState(null)
  const [vues, setVues] = useState(() => { try { return JSON.parse(sessionStorage.getItem('bulles_vues') || '[]') } catch { return [] } })
  const cle = b => `${b.type}|${b.titre || b.texte.slice(0, 40)}`
  const voir = b => { setOuverte(b); const v = [...new Set([...vues, cle(b)])]; setVues(v); try { sessionStorage.setItem('bulles_vues', JSON.stringify(v)) } catch {} }
  const av = items.filter(b => b.type === 'avertissement')
  const autres = items.filter(b => b.type !== 'avertissement')
  if (!items.length) return null
  return (
    <>
      <div className="bulles">
        {av.map((b, i) => (
          <motion.button key={`a${i}`} whileTap={{ scale: .98 }} className={`bulle av ${vues.includes(cle(b)) ? 'vue' : ''}`} onClick={() => voir(b)}>
            <span className="ic">!</span><span className="tx">{b.titre || b.texte}</span><span className="go">›</span>
          </motion.button>
        ))}
        {autres.length > 0 && (
          <div className={`bulles-ia ${compact ? 'compact' : ''}`}>
            {autres.map((b, i) => (
              <motion.button key={`c${i}`} whileTap={{ scale: .96 }} className={`pastille ${b.type} ${vues.includes(cle(b)) ? 'vue' : ''}`} onClick={() => voir(b)}>
                <span className="ic">{ICONE[b.type] || 'i'}</span>{b.titre || NOM[b.type]}
              </motion.button>
            ))}
          </div>
        )}
      </div>
      <AnimatePresence>
        {ouverte && (
          <motion.div className={`bulle-ouverte ${ouverte.type}`} onClick={() => setOuverte(null)}
            initial={{ opacity: 0, y: 20, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}>
            <div className="k">{NOM[ouverte.type] || 'Copilote'}{ouverte.zone ? ` · ${ouverte.zone}` : ''}</div>
            {ouverte.titre && <div className="t">{ouverte.titre}</div>}
            <div className="x">{ouverte.texte}</div>
            {ouverte.action && <div className="a"><button onClick={e => { e.stopPropagation(); setOuverte(null); ouverte.action.url ? window.open(ouverte.action.url, '_blank') : go(ouverte.action.to) }}>{ouverte.action.label}</button><button className="g">Fermer</button></div>}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
