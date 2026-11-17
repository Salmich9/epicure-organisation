import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, store } from './api'
import { coefDefaut, imprevus as imprevusTaux, imprevusPct, tva as tvaDe } from './regles'
import { Icon, mad, n, useUI } from './ui'
import { estVente } from './cycle'
import { AvantApres, Comparer, Detail, InfosBase, JournalChiffrage, LigneSheet, PersonneSheet } from './chiffrage'
import { appliquer as appliquerDiff, avecIds, comparer, composer, diff, totalLignes } from './chiffrageDiff'

const ENTITES = [
  { k: 'Epicure', sous: 'TVA 20 %' },
  { k: 'Business Boys', sous: 'TVA 10 %' },
  { k: 'Espèce', sous: 'aucun nom' },
]
const FORMATS = ['Dîner assis', 'Cocktail dînatoire', 'Buffet']
export const GAMMES = [['Classique', 'le standard'], ['Premium', 'coef × 1,08'], ['Prestige', 'coef × 1,15']]
// Multiplicateur de la gamme sur le coef de taille (paramètres g_gamme_*)
export const multGamme = (g, params = {}) => g === 'Premium' ? n(params.g_gamme_premium?.valeur) || 1.08 : g === 'Prestige' ? n(params.g_gamme_prestige?.valeur) || 1.15 : 1
// Ce qui manque pour chiffrer
export const manqueDemande = ev => [!ev.date && 'date', !(n(ev.invites) > 0) && 'invités', !String(ev.lieu || '').trim() && 'lieu', !(ev.prestations || []).length && 'prestation', !ev.gamme && 'gamme'].filter(Boolean)
const DOSSIER = { Epicure: 'Evenements Epicure', 'Business Boys': 'Evenements Business Boys', 'Espèce': 'Evenements Espece' }
const glisse = { initial: { x: 40, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { type: 'spring', damping: 30, stiffness: 300 } }

/* Dictée locale (même moteur que les notes) */
function useDictee(setTexte) {
  const rec = useRef(null)
  const [actif, setActif] = useState(false)
  const basculer = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return false
    if (rec.current) { rec.current.stop(); return true }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = true; r.continuous = true
    r.onresult = ev => { let t = ''; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; setTexte(t) }
    r.onend = () => { rec.current = null; setActif(false) }
    rec.current = r; r.start(); setActif(true); return true
  }
  return [actif, basculer]
}

/* ---------- 1 · Les bases ---------- */
export function Nouveau({ data, go, onCreated }) {
  const ui = useUI()
  const [f, setF] = useState({ nom: '', client: '', date: '', invites: '', lieu: '', prestations: ['Traiteur'], format: 'Dîner assis', entite: 'Epicure', inter: 'Aucun', intermediaire: '', gamme: '', debut: '', fin: '' })
  const [envoi, setEnvoi] = useState(false)
  const [tl, setTl] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  // Combien de lignes de timeline la création posera (selon le modèle des Paramètres)
  useEffect(() => {
    if (!f.debut || !f.fin) { setTl(null); return }
    const t = setTimeout(() => api.timelineApercu({ date: f.date || null, debut: f.debut, fin: f.fin, prestations: f.prestations, invites: n(f.invites) }).then(setTl).catch(() => setTl(null)), 300)
    return () => clearTimeout(t)
  }, [f.date, f.debut, f.fin, f.prestations.join()])
  const prest = p => set('prestations', f.prestations.includes(p) ? f.prestations.filter(x => x !== p) : [...f.prestations, p])
  const nomDossier = `${f.date || 'AAAA-MM-JJ'} · ${f.nom || 'Nom'}`
  const manque = [!f.nom.trim() && 'nom', ...manqueDemande(f), (!f.debut || !f.fin) && 'horaires'].filter(Boolean)
  const ok = !manque.length

  async function creer() {
    if (!ok) { ui.bubble(`Pour chiffrer juste, il manque : ${manque.join(', ')}.`); return }
    setEnvoi(true)
    try {
      const ev = await api.evenementCreer({
        nom: f.nom.trim(), client: f.client.trim(), date: f.date, invites: n(f.invites), lieu: f.lieu.trim(),
        prestations: f.prestations, format: f.prestations.includes('Traiteur') ? f.format : '', entite: f.entite, gamme: f.gamme,
        heure_debut: f.debut, heure_fin: f.fin,
        intermediaire: f.inter === 'Aucun' ? '' : `${f.inter}${f.intermediaire.trim() ? ` : ${f.intermediaire.trim()}` : ''}`,
      })
      store.evt = ev.id
      // Le dossier Drive se crée en arrière-plan : l'événement existe même si le Drive ne répond pas.
      api.copilote('dossier').then(() => ui.toast('Dossier Drive créé')).catch(e => ui.toast(e.message.startsWith('Création du dossier pas encore') ? 'Dossier Drive : à brancher' : e.message))
      await onCreated(ev.id)
      go('chiffrer')
    } catch (e) { ui.toast(e.message); setEnvoi(false) }
  }

  return (
    <motion.div {...glisse} className="wiz">
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Annuler</button>
        <div className="when">Nouvel événement · 1 sur 3</div>
        <h1 style={{ fontSize: 38 }}>Les bases</h1>
      </div>
      <div className="px">
        <div className="label">Nom et client</div>
        <input value={f.nom} onChange={e => set('nom', e.target.value)} placeholder="Mariage Cassandra" />
        <input value={f.client} onChange={e => set('client', e.target.value)} placeholder="Client (facultatif)" style={{ marginTop: 8 }} />
        <div className="wiz-2">
          <div><div className="label">Date</div><input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></div>
          <div><div className="label">Invités</div><input inputMode="numeric" value={f.invites} onChange={e => set('invites', e.target.value.replace(/\D/g, ''))} placeholder="250" /></div>
        </div>
        <div className="wiz-2">
          <div><div className="label">Début</div><input type="time" value={f.debut} onChange={e => set('debut', e.target.value)} /></div>
          <div><div className="label">Fin</div><input type="time" value={f.fin} onChange={e => set('fin', e.target.value)} /></div>
        </div>
        {tl && tl.lignes > 0 && <div className="tl-ap">⏱ <b>{tl.lignes} lignes de timeline</b> seront posées, du J{tl.premier < 0 ? '−' + Math.abs(tl.premier) : '+' + tl.premier} au J{tl.dernier < 0 ? '−' + Math.abs(tl.dernier) : '+' + tl.dernier}.</div>}
        <div className="label">Lieu</div>
        <input value={f.lieu} list="lieux-connus" onChange={e => set('lieu', e.target.value)} placeholder="Domaine, riad, villa…" /><LieuxConnus />

        <div className="label">Prestation</div>
        <div className="chips">{['Traiteur', 'Bar'].map(p => <button key={p} className={`chip ${f.prestations.includes(p) ? 'on' : ''}`} onClick={() => prest(p)}>{p}</button>)}</div>
        {f.prestations.includes('Traiteur') && <div className="chips" style={{ marginTop: 8 }}>{FORMATS.map(p => <button key={p} className={`chip ${f.format === p ? 'on' : ''}`} onClick={() => set('format', p)}>{p}</button>)}</div>}

        <div className="label">Gamme</div>
        <div className="tiles3">{GAMMES.map(([k, sous]) => (
          <motion.button key={k} whileTap={{ scale: .96 }} className={`tile ${f.gamme === k ? 'on' : ''}`} onClick={() => set('gamme', k)}>
            <b>{k}</b><span>{sous}</span>
          </motion.button>
        ))}</div>

        <div className="label">Qui facture</div>
        <div className="tiles3">{ENTITES.map(x => (
          <motion.button key={x.k} whileTap={{ scale: .96 }} className={`tile ${f.entite === x.k ? 'on' : ''}`} onClick={() => set('entite', x.k)}>
            <b>{x.k}</b><span>{x.sous}</span>
          </motion.button>
        ))}</div>

        <div className="label">Agence ou apporteur</div>
        <div className="chips">{['Aucun', 'Agence', 'Apporteur'].map(p => <button key={p} className={`chip ${f.inter === p ? 'on' : ''}`} onClick={() => set('inter', p)}>{p}</button>)}</div>
        {f.inter !== 'Aucun' && <input value={f.intermediaire} onChange={e => set('intermediaire', e.target.value)} placeholder={`Nom de l'${f.inter.toLowerCase()}`} style={{ marginTop: 8 }} />}

        <div className="dossier">
          <span className="ic">📁</span>
          <div><div className="small mute">Le dossier se crée tout seul :</div><div className="chemin">{DOSSIER[f.entite]} › {nomDossier}</div><div className="small mute">avec Pièces fournisseurs, Organisation et À revoir.</div></div>
        </div>
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={envoi} onClick={creer}>{envoi ? 'Création…' : ok ? 'Chiffrer' : `Il manque : ${manque.join(', ')}`}</button>
      </div>
    </motion.div>
  )
}

/* ---------- 2 · Chiffrer, pré-rempli par le copilote · 3 · Retenir le budget ---------- */
export function Chiffrer({ data, go, reload, etapeInit }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [etape, setEtape] = useState(etapeInit || 'chiffrer')
  const [lignes, setLignes] = useState(null)
  const [hyp, setHyp] = useState('')
  const [question, setQuestion] = useState('')
  const [coef, setCoef] = useState(null)
  const [paliers, setPaliers] = useState([])
  const [calcul, setCalcul] = useState(false)
  const [ouverte, setOuverte] = useState(null)
  const [consigne, setConsigne] = useState('')
  const [dicte, dicter] = useDictee(setConsigne)
  const [base, setBase] = useState(null)
  const [params, setParams] = useState({})
  const [peut, setPeut] = useState(false)
  const [occupe, setOccupe] = useState(false)
  const [ligneP, setLigneP] = useState(null)
  const [personne, setPersonne] = useState(null)
  const [vue, setVue] = useState('')            // '' | avantapres | journal | comparer
  const [prop, setProp] = useState(null)        // proposition « avant → après » en cours
  const [attente, setAttente] = useState(null)  // changement d'invités à valider (bandeau)
  const [cmp, setCmp] = useState(null)          // comparaison avec les paramètres
  const [envoiV, setEnvoiV] = useState(false)
  const retouches = useRef({})                  // lignes retouchées à la main depuis le dernier enregistrement (pour le journal)
  const chargerParams = () => api.chiffrageParams().then(d => { const m = Object.fromEntries(d.params.map(p => [p.cle, p])); setParams(m); setPeut(d.peut_modifier); return m }).catch(() => ({}))
  const [incomplet, setIncomplet] = useState(false)
  const [questions, setQuestions] = useState(null)  // demande incomplète : pas de chiffrage tant qu'il manque une base
  // Réponse du moteur (calcul, surcharge, personne) : lignes et base à jour
  const appliquer = r => { setLignes(r.lignes || []); setBase(r.base || null) }
  // Plus rien ne se recalcule tout seul : un changement d'information devient une proposition « avant → après »
  const proposer = (titre, source, r, hypo) => {
    const d = diff(lignes, r.lignes || [], base)
    if (!d.changements.length) { ui.toast('Rien ne change dans le chiffrage'); if (r.base) enregistrerBase(r.base); return false }
    setProp({ titre, source, d, base: r.base || base, hyp: hypo ?? null, totalAvant: totalLignes(lignes), cochees: new Set(d.changements.filter(c => c.coche).map(c => c.cle)) })
    setVue('avantapres'); return true
  }
  const enregistrerBase = b => api.chiffrageValider(data.evt, lignes, b, null, null).then(() => setBase(b)).catch(e => ui.toast(e.message))
  const TITRES = { moments: 'Moments changés', alcool: 'Alcool changé', traiteur: 'Prestations changées', bar: 'Prestations changées', nb_bars: 'Nombre de bars changé',
    comptoir: 'Comptoir changé', alcool_client: 'Alcool du client', alcool_qui: 'Qui fournit l\'alcool', prestations: 'Prestations changées', zone: 'Lieu changé', service: 'Service du bar changé', signatures: 'Signatures changées', heures: 'Horaires changés',
    plonge: 'Plonge changée', cuisine: 'Cuisine sur place changée', electricite: 'Électricité changée', fourni: 'Fourni par le lieu changé' }
  const titreBase = chg => chg.invites !== undefined ? `Invités ${base?.invites ?? '?'} → ${chg.invites}` : TITRES[Object.keys(chg)[0]] || 'Lieu changé'
  async function recalculer(chg) {
    setOccupe(true)
    try { proposer(titreBase(chg), 'base', await api.chiffrageApercu(data.evt, { ...base, ...chg })) } catch (e) { ui.toast(e.message) }
    setOccupe(false)
  }
  async function validerProp() {
    setEnvoiV(true)
    try {
      const ok = prop.cochees, ch = prop.d.changements
      // Ce qui n'est pas accepté devient « gardé à la main » : il ne sera plus re-proposé coché
      const res = appliquerDiff(lignes, prop.d.apres, [...ok]).map(l => (ch.some(c => !ok.has(c.cle) && c.type !== 'ajout' && c.cle === (l.param ? `p:${l.param}` : `u:${l.uid}`)) ? { ...l, verrou: true } : l))
      const garde = ch.filter(c => !ok.has(c.cle) && c.type !== 'ajout').length
      await api.chiffrageValider(data.evt, res, prop.base, prop.hyp, { titre: prop.titre, source: prop.source,
        detail: `${ok.size} accepté${ok.size > 1 ? 's' : ''}${garde ? `, ${garde} gardé${garde > 1 ? 's' : ''} 🔒` : ''}`,
        changements: ch.map(c => ({ nom: c.nom, avant: c.avant?.total ?? null, apres: c.apres?.total ?? null, ok: ok.has(c.cle) })) })
      setLignes(res); setBase(prop.base); if (prop.hyp) setHyp(prop.hyp)
      if (prop.source === 'base' && attente) setAttente(null)
      setProp(null); setVue(''); ui.toast(ok.size ? 'Chiffrage mis à jour' : 'Rien n\'a changé')
    } catch (e) { ui.toast(`Pas enregistré : ${e.message}`) }
    setEnvoiV(false)
  }
  // Chiffrage d'avant les paramètres : comparer bloc par bloc, rien n'est remplacé sans choix
  async function ouvrirComparer() {
    setOccupe(true)
    try {
      const r = await api.chiffrageApercu(data.evt, null)
      const c = comparer(lignes, r.moteur)
      setCmp({ r, c, choix: Object.fromEntries(c.blocs.map(b => [b.cle, 'garder'])), totalAvant: totalLignes(lignes) }); setVue('comparer')
    } catch (e) { ui.toast(e.message) }
    setOccupe(false)
  }
  async function validerComparer() {
    setEnvoiV(true)
    try {
      const { lignes: ls, blocs_manuels } = composer(lignes, cmp.r.moteur, cmp.choix)
      const b = { ...cmp.r.base, blocs_manuels }
      const pris = cmp.c.blocs.filter(x => cmp.choix[x.cle] === 'prendre').map(x => x.nom)
      await api.chiffrageValider(data.evt, ls, b, null, { titre: 'Comparaison avec les paramètres', source: 'comparaison',
        detail: pris.length ? `pris : ${pris.join(', ')}` : 'tout gardé à l\'ancienne' })
      setLignes(ls); setBase(b); setCmp(null); setVue(''); ui.toast('Chiffrage mis à jour')
    } catch (e) { ui.toast(`Pas enregistré : ${e.message}`) }
    setEnvoiV(false)
  }
  const sauve = useRef(null)
  const [devis, setDevis] = useState(ev.zoho_devis?.numero || null)
  async function faireDevis() {
    // Le brouillon part du chiffrage tel qu'il est à l'écran : on l'enregistre d'abord
    clearTimeout(sauve.current); setDevis('…')
    try {
      await api.chiffrageEnregistrer(data.evt, lignes, hyp, coef)
      const d = await api.zoho('devis')
      setDevis(d.numero); ui.toast(`Brouillon ${d.numero} ${d.mis_a_jour ? 'mis à jour' : 'créé'} dans Zoho`)
      window.open(d.url, '_blank')
    } catch (e) { setDevis(ev.zoho_devis?.numero || null); ui.toast(e.message) }
  }

  const coefPalier = (ps, inv) => (ps.find(p => n(inv) <= n(p.jusqua)) || ps[ps.length - 1] || { coef: coefDefaut() }).coef

  async function demander(note) {
    setCalcul(true)
    try {
      if (lignes?.length && !base) { ui.bubble('Compare d\'abord ce chiffrage avec les paramètres (bouton en haut), puis demande au copilote.'); setCalcul(false); return }
      if (lignes?.length && base) {   // le copilote propose, il n'écrit pas
        const r = await api.copilote('chiffrer', { note, lignes, apercu: true })
        if (r.question && !r.lignes?.length) setQuestion(r.question)
        proposer(note ? `Copilote : ${note}` : 'Copilote', 'copilote', r, r.hypotheses || null); setConsigne('')
        setCalcul(false); return
      }
      const r = await api.copilote('chiffrer', note ? { note, lignes } : {})
      setLignes(r.lignes || []); if (r.base) setBase(r.base); setHyp(r.hypotheses || ''); setQuestion(r.question || ''); setConsigne('')
    } catch (e) { ui.toast(e.message); if (!lignes) setLignes([]) }
    setCalcul(false)
  }
  async function premierChiffrage() {
    // D'abord le moteur (instantané, avec les paramètres), puis le copilote ajoute ce qui est propre à l'événement
    try { appliquer(await api.chiffrageCalculer(data.evt, null)) } catch (e) { ui.toast(e.message); setLignes([]) }
    demander()
  }
  useEffect(() => {
    const pp = chargerParams()
    api.chiffrageQuestions().then(x => setQuestions(x.questions)).catch(() => {})
    api.chiffrageContexte(data.evt).then(async cx => {
      const ps = cx.paliers || []; setPaliers(ps)
      const c = cx.chiffrage
      const prm = await pp
      setCoef(n(c?.coef) || n(ev.coef) || Math.round(coefPalier(ps, ev.invites) * multGamme(ev.gamme, prm) * 100) / 100)
      if (c?.lignes?.length) {
        setLignes(avecIds(c.lignes)); setBase(c.base || null); setHyp(c.hypotheses || '')
        // L'événement a changé d'invités depuis le chiffrage : on prépare l'avant → après, sans rien toucher
        if (c.base && n(ev.invites) > 0 && n(c.base.invites) !== n(ev.invites)) {
          api.chiffrageApercu(data.evt, { ...c.base, invites: n(ev.invites) }).then(r => {
            const d = diff(avecIds(c.lignes), r.lignes || [], c.base)
            if (d.changements.length) setAttente({ de: n(c.base.invites), a: n(ev.invites), nb: d.changements.length, r })
          }).catch(() => {})
        }
      }
      else if (manqueDemande(ev).length) { setIncomplet(true); setLignes([]) }
      else premierChiffrage()
    }).catch(e => ui.toast(e.message))
  }, [data.evt])

  // Sauvegarde discrète après chaque retouche
  const enregistrer = (ls, cf) => { clearTimeout(sauve.current); sauve.current = setTimeout(() => api.chiffrageEnregistrer(data.evt, ls, hyp, cf).then(() => noter(ls)).catch(e => ui.toast(`Chiffrage pas enregistré : ${e.message}`)), 1200) }
  // Journal des retouches : « Caution loueur : 3 000 → 3 500 » (une entrée par ligne, regroupée sur 5 minutes)
  function noter(ls) {
    const r = retouches.current; retouches.current = {}
    const j = Object.entries(r).map(([uid, x]) => {
      const l = ls.find(y => y.uid === uid), t = l ? n(l.quantite) * n(l.prix) : 0
      if (!l) return { cle: uid, titre: `Retiré : ${x.nom || 'ligne'} (${mad(x.total)})` }
      if (x.nouvelle) return { cle: uid, titre: `Ajouté : ${l.element || 'ligne'} (${mad(t)})` }
      if (Math.round(t) === Math.round(x.total) && l.element === x.nom) return null
      return { cle: uid, titre: `${l.element || x.nom} : ${mad(x.total)} → ${mad(t)}` }
    }).filter(Boolean)
    if (j.length) api.chiffrageNoter(data.evt, j).catch(() => {})
  }
  const retenir = l => { if (l?.uid && !retouches.current[l.uid]) retouches.current[l.uid] = { nom: l.element, total: n(l.quantite) * n(l.prix), nouvelle: !l.element && !n(l.prix) } }
  // Avant de quitter l'écran : on enregistre, et on reste si ça n'est pas passé
  const fixer = async () => { clearTimeout(sauve.current); try { await api.chiffrageEnregistrer(data.evt, lignes, hyp, coef); return true } catch (e) { ui.toast(`Chiffrage pas enregistré : ${e.message}`); return false } }
  const majLigne = (i, p) => setLignes(ls => { retenir(ls[i]); const x = ls.map((l, k) => k === i ? { ...l, ...p, verrou: true } : l); enregistrer(x, coef); return x })
  const retirer = i => setLignes(ls => { retenir(ls[i]); const x = ls.filter((_, k) => k !== i); enregistrer(x, coef); return x })
  const ajouter = zone => setLignes(ls => [...ls, { zone, element: '', mode: 'achat', quantite: n(ev.invites), prix: 0, uid: avecIds([{}])[0].uid }])
  // Choisir la gamme : le coef devient palier × gamme (geste explicite, noté au journal)
  async function choisirGamme(g) {
    const v = Math.round(coefPalier(paliers, ev.invites) * multGamme(g, params) * 100) / 100
    try {
      await api.evenementMaj(data.evt, { gamme: g }); await reload()
      if (lignes?.length && v !== n(coef)) { setCoef(v); enregistrer(lignes, v); api.chiffrageNoter(data.evt, [{ cle: 'gamme', titre: `Gamme ${g} : coef ${n(coef).toFixed(2).replace('.', ',')} → ${v.toFixed(2).replace('.', ',')}` }]).catch(() => {}) }
      else setCoef(v)
    } catch (e) { ui.toast(e.message) }
  }
  const changerCoef = d => setCoef(c => { const v = Math.max(1, Math.round((n(c) + d) * 100) / 100); enregistrer(lignes, v); return v })

  const ordre = data.zones.map(z => z.nom)
  const zones = useMemo(() => {
    const g = {}
    ;(lignes || []).forEach((l, i) => { (g[l.zone] = g[l.zone] || { nom: l.zone, lignes: [], total: 0 }).lignes.push({ ...l, i }); g[l.zone].total += n(l.quantite) * n(l.prix) })
    return Object.values(g).sort((a, b) => (ordre.indexOf(a.nom) + 99 * (ordre.indexOf(a.nom) < 0)) - (ordre.indexOf(b.nom) + 99 * (ordre.indexOf(b.nom) < 0)))
  }, [lignes])
  const zonesExtra = useMemo(() => {
    const g = {}
    ;(lignes || []).forEach((l, i) => { if (l.param) return; (g[l.zone] = g[l.zone] || { nom: l.zone, lignes: [], total: 0 }).lignes.push({ ...l, i }); g[l.zone].total += n(l.quantite) * n(l.prix) })
    return Object.values(g)
  }, [lignes])
  const cout = zones.reduce((s, z) => s + z.total, 0)
  const imprevus = cout * imprevusTaux()
  const prixHT = (cout + imprevus) * n(coef)
  const tva = tvaDe(ev.entite)
  const palier = paliers.find(p => n(ev.invites) <= n(p.jusqua))
  const coefTaille = n(coefPalier(paliers, ev.invites)), mult = multGamme(ev.gamme, params)
  const coefAttendu = Math.round(coefTaille * mult * 100) / 100

  const vente = estVente(ev)
  if (vue === 'avantapres' && prop) return <AvantApres prop={prop} setProp={setProp} envoi={envoiV} valider={validerProp} retour={() => { setProp(null); setVue('') }} />
  if (vue === 'journal') return <JournalChiffrage evt={data.evt} nom={ev.nom} retour={() => setVue('')} />
  if (vue === 'comparer' && cmp) return <Comparer cmp={cmp} setCmp={setCmp} envoi={envoiV} valider={validerComparer} retour={() => { setCmp(null); setVue('') }}
    totalApres={totalLignes(composer(lignes, cmp.r.moteur, cmp.choix).lignes)} />
  if (incomplet) return <DemandeIncomplete ev={ev} go={go} onOk={async p => { await api.evenementMaj(data.evt, p); await reload(); setIncomplet(false); setLignes(null); setCoef(Math.round(coefPalier(paliers, p.invites ?? ev.invites) * multGamme(p.gamme ?? ev.gamme, params) * 100) / 100); premierChiffrage() }} />
  if (etape === 'budget' && lignes === null) return <div className="calcul"><div className="orbe" /><div>Chargement du chiffrage…</div></div>
  if (etape === 'budget') return <Budget data={data} ev={ev} zones={zones} imprevus={imprevus} prix={n(ev.prix_signe) || prixHT} coef={coef} retour={() => setEtape('chiffrer')} go={go} reload={reload} />

  return (
    <motion.div {...glisse} className="wiz">
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Événement</button>
        <div className="when">{ev.nom} · {ev.invites} invités · 2 sur 3</div>
        <h1 style={{ fontSize: 38 }}>Chiffrage</h1>
        <div className="meta">{(ev.prestations || []).join(' + ')}{ev.format ? ` · ${ev.format}` : ''} · facturé par {ev.entite}</div>
      </div>

      {(lignes === null || (calcul && !lignes?.length)) && (
        <div className="calcul"><div className="orbe" /><div>Le copilote chiffre zone par zone,<br />à partir du catalogue et de tes événements passés…</div></div>
      )}

      {lignes !== null && !(calcul && !lignes.length) && <>
        {question && <div className="question-ia" onClick={() => setQuestion('')}><b>Une question :</b> {question}</div>}
        <div className="cf-tot"><div><b>{mad(cout)}</b>coût</div><div><b>×{n(coef).toFixed(2).replace('.', ',')}</b>coef</div><div><b>{mad(prixHT)}</b>prix HT</div></div>
        {attente && <div className="aa-ban"><b className="t">🔔 {attente.nb} changement{attente.nb > 1 ? 's' : ''} à valider</b>Invités {attente.de} → {attente.a}. Rien n'a bougé tant que tu n'as pas validé.
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="chip on" onClick={() => proposer(`Invités ${attente.de} → ${attente.a}`, 'base', attente.r)}>Voir avant → après</button>
            <button className="chip" onClick={() => setAttente(null)}>Plus tard</button></div></div>}
        {base ? <InfosBase base={base} occupe={occupe} onChange={recalculer} questions={questions} />
          : lignes.length > 0 && <div className="cf-vieux"><span>Chiffré avant les paramètres</span><button className="chip on" disabled={occupe} onClick={ouvrirComparer}>{occupe ? '…' : 'Comparer avec les paramètres'}</button></div>}
        <div className="px" style={{ marginTop: 8 }}><button className="chip" onClick={() => setVue('journal')}>🕘 Historique</button></div>
        {calcul && lignes.length > 0 && <p className="small mute px" style={{ marginTop: 10 }}>Le copilote ajoute ce qui est propre à cet événement…</p>}
        <Detail lignes={lignes} params={params} base={base}
          onParam={(cle) => setLigneP({ cle })} onPersonne={(cle, x) => setPersonne({ cle, x })}
          extras={zonesExtra.length > 0 && <>
            <div className="cf-grp"><span>EN PLUS · PROPRE À L'ÉVÉNEMENT</span><b>{mad(zonesExtra.reduce((s, z) => s + z.total, 0))}</b></div>
            <div className="zones-chiffre" style={{ marginTop: 0 }}>{zonesExtra.map(z => (
          <div key={z.nom} className={`cz ${ouverte === z.nom ? 'open' : ''}`}>
            <button className="cz-top" onClick={() => setOuverte(ouverte === z.nom ? null : z.nom)}>
              <div><div className="nom">{z.nom}</div><div className="small mute">{z.lignes.slice(0, 3).map(l => l.element).join(', ')}{z.lignes.length > 3 ? '…' : ''}</div></div>
              <div className="cz-r"><span className="ia">IA</span><b>{mad(z.total)}</b></div>
            </button>
            <AnimatePresence>{ouverte === z.nom && (
              <motion.div className="cz-lignes" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {z.lignes.map(l => (
                  <div key={l.i} className="cl">
                    <div style={{ display: 'flex', alignItems: 'center' }}><input className="cl-nom" value={l.element} onChange={e => majLigne(l.i, { element: e.target.value })} placeholder="Élément" />{l.verrou && <span className="cl-lk" title="Retouché à la main">🔒</span>}</div>
                    <div className="cl-chiffres">
                      <input inputMode="decimal" value={l.quantite} onChange={e => majLigne(l.i, { quantite: e.target.value.replace(',', '.') })} />
                      <span>×</span>
                      <input inputMode="decimal" value={l.prix} onChange={e => majLigne(l.i, { prix: e.target.value.replace(',', '.') })} />
                      <span className="cl-tot">{mad(n(l.quantite) * n(l.prix))}</span>
                      <button className="cl-x" onClick={() => retirer(l.i)} aria-label="Retirer">×</button>
                    </div>
                    {l.note && <div className="small mute">{l.note}</div>}
                  </div>
                ))}
                <button className="chip" style={{ margin: '4px 0 12px' }} onClick={() => ajouter(z.nom)}>+ Ligne</button>
              </motion.div>
            )}</AnimatePresence>
          </div>
        ))}</div></>} />
        <div className="px" style={{ marginTop: 10 }}><button className="chip" onClick={() => { ajouter('Lieu technique et admin'); setOuverte('Lieu technique et admin') }}>+ Ligne en plus</button></div>
        <LigneSheet ouvert={ligneP} params={params} base={base} peut={peut} invites={base?.invites ?? ev.invites} lignes={lignes || []} onClose={() => setLigneP(null)}
          onSave={async (cle, x, ref) => { appliquer(await api.chiffrageSurcharger(data.evt, cle, x, ref)); if (ref) chargerParams(); setLigneP(null); ui.toast(ref ? 'Changé ici et dans la référence' : 'Changé pour cet événement') }} />
        <PersonneSheet ouvert={personne} params={params} onClose={() => setPersonne(null)}
          onSave={async (cle, rang, x) => { appliquer(await api.chiffragePersonne(data.evt, cle, rang, x)); setPersonne(null) }} />

        <div className="consigne">
          <input value={consigne} onChange={e => setConsigne(e.target.value)} placeholder="Dis ce qu'il faut changer…" onKeyDown={e => e.key === 'Enter' && consigne.trim() && demander(consigne.trim())} />
          <button className={`mini-mic ${dicte ? 'rec' : ''}`} onClick={() => { if (!dicter()) ui.bubble('Dictée indisponible ici : utilise le micro du clavier.') }} aria-label="Dicter">{Icon.mic}</button>
          {consigne.trim() && <button className="chip on" onClick={() => demander(consigne.trim())} disabled={calcul}>{calcul ? '…' : 'Ajuster'}</button>}
        </div>
        {hyp && <p className="small mute px" style={{ marginTop: 10 }}>{hyp}</p>}

        <div className="totaux">
          <div className="t-l"><span>Coût</span><b>{mad(cout)}</b></div>
          <div className="t-l"><span>Imprévus {imprevusPct()} %</span><b>{mad(imprevus)}</b></div>
          <div className="t-l"><span>Coef {palier ? `(palier ≤ ${palier.jusqua >= 100000 ? '∞' : palier.jusqua})` : ''}</span>
            <span className="coef"><button onClick={() => changerCoef(-0.05)}>−</button><b>× {n(coef).toFixed(2).replace('.', ',')}</b><button onClick={() => changerCoef(0.05)}>+</button></span></div>
          <div className="t-g">{GAMMES.map(([k]) => <button key={k} className={`chip ${ev.gamme === k ? 'on' : ''}`} onClick={() => choisirGamme(k)}>{k}</button>)}</div>
          <div className="t-l sous"><span>{n(coef) === coefAttendu ? `taille ${coefTaille.toFixed(2).replace('.', ',')}${mult !== 1 ? ` × ${ev.gamme} ${String(mult).replace('.', ',')}` : ''}` : `retouché (gamme : × ${coefAttendu.toFixed(2).replace('.', ',')})`}</span></div>
          <div className="t-l big"><span>Prix proposé HT</span><b>{mad(prixHT)}</b></div>
          {tva > 0 && <div className="t-l"><span>TTC (TVA {tva} %)</span><b>{mad(prixHT * (1 + tva / 100))}</b></div>}
          {n(ev.prix_signe) > 0 && <>
            <div className="t-l big"><span>Prix signé HT (contrat)</span><b>{mad(ev.prix_signe)}</b></div>
            <div className="t-l"><span>Marge avec ce chiffrage</span><b style={{ color: n(ev.prix_signe) - (cout + imprevus) < 0 ? 'var(--red)' : 'var(--accent)' }}>{mad(n(ev.prix_signe) - (cout + imprevus))} · {Math.round((1 - (cout + imprevus) / n(ev.prix_signe)) * 100)} %</b></div>
          </>}
        </div>
        <div className="px" style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {<button className={`btn ${vente ? 'primary' : ''}`} onClick={async () => { if (await fixer()) go('devis') }}>{devis ? `Devis ${devis}` : 'Devis client'}</button>}
          {vente ? <button className="btn" onClick={async () => { if (await fixer()) { await reload(); go('') } }}>Terminer</button>
            : <button className="btn primary" onClick={async () => { if (await fixer()) setEtape('budget') }}>{data.elements.length ? 'Mettre à jour le budget' : 'Retenir le budget'}</button>}
        </div>
      </>}
    </motion.div>
  )
}

/* Demande incomplète : on complète ce qui manque, puis on chiffre (rien n'est chiffré avant) */
function DemandeIncomplete({ ev, go, onOk }) {
  const ui = useUI()
  const manque0 = manqueDemande(ev)
  const [f, setF] = useState({ date: ev.date || '', invites: ev.invites || '', lieu: ev.lieu || '', prestations: ev.prestations || [], gamme: ev.gamme || '' })
  const [envoi, setEnvoi] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const reste = manqueDemande(f)
  async function ok() {
    setEnvoi(true)
    try { await onOk({ date: f.date, invites: n(f.invites), lieu: f.lieu.trim(), prestations: f.prestations, gamme: f.gamme }) } catch (e) { ui.toast(e.message); setEnvoi(false) }
  }
  return (
    <motion.div {...glisse} className="wiz">
      <div className="head"><button className="back" onClick={() => go('')}>‹ Événement</button>
        <div className="when">{ev.nom}</div><h1 style={{ fontSize: 34 }}>Avant de chiffrer</h1><div className="meta">Il manque : {manque0.join(', ')}</div></div>
      <div className="px">
        {manque0.includes('date') && <><div className="label">Date</div><input type="date" value={f.date} onChange={e => set('date', e.target.value)} /></>}
        {manque0.includes('invités') && <><div className="label">Invités</div><input inputMode="numeric" value={f.invites} onChange={e => set('invites', e.target.value.replace(/\D/g, ''))} placeholder="250" /></>}
        {manque0.includes('lieu') && <><div className="label">Lieu</div><input value={f.lieu} list="lieux-connus" onChange={e => set('lieu', e.target.value)} placeholder="Domaine, riad, villa…" /><LieuxConnus /></>}
        {manque0.includes('prestation') && <><div className="label">Prestation</div><div className="chips">{['Traiteur', 'Bar'].map(p => <button key={p} className={`chip ${f.prestations.includes(p) ? 'on' : ''}`} onClick={() => set('prestations', f.prestations.includes(p) ? f.prestations.filter(x => x !== p) : [...f.prestations, p])}>{p}</button>)}</div></>}
        {manque0.includes('gamme') && <><div className="label">Gamme</div><div className="tiles3">{GAMMES.map(([k, sous]) => (
          <motion.button key={k} whileTap={{ scale: .96 }} className={`tile ${f.gamme === k ? 'on' : ''}`} onClick={() => set('gamme', k)}><b>{k}</b><span>{sous}</span></motion.button>))}</div></>}
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={envoi || reste.length > 0} onClick={ok}>{envoi ? '…' : reste.length ? `Il manque : ${reste.join(', ')}` : 'Chiffrer'}</button>
      </div>
    </motion.div>
  )
}

function Budget({ data, ev, zones, imprevus, prix, coef, retour, go, reload }) {
  const ui = useUI()
  const [env, setEnv] = useState(() => Object.fromEntries(zones.map(z => [z.nom, Math.round(z.total)])))
  const [envoi, setEnvoi] = useState(false)
  const total = Object.values(env).reduce((s, v) => s + n(v), 0) + imprevus
  const nbLignes = zones.reduce((s, z) => s + z.lignes.length, 0)
  const inv = n(ev.invites) || 1

  const [saisie, setSaisie] = useState(null)
  function corrigerTotal(v) {
    setSaisie(null); v = Number(String(v || '').replace(/\s/g, ''))
    if (!v) return
    const base = total - imprevus, k = (v - imprevus) / (base || 1)
    setEnv(e => Object.fromEntries(Object.entries(e).map(([z, x]) => [z, Math.round(n(x) * k)])))
  }
  async function lancer() {
    setEnvoi(true)
    try {
      const k = await api.budgetRetenir(data.evt, Math.round(total), env, Math.round(prix), coef)
      ui.toast(`${k} éléments ajoutés à l'organisation`)
      await reload(); go('')
    } catch (e) { ui.toast(e.message); setEnvoi(false) }
  }

  return (
    <motion.div {...glisse} className="wiz">
      <div className="head">
        <button className="back" onClick={retour}>‹ Chiffrage</button>
        <div className="when">{ev.nom} · 3 sur 3</div>
        <h1 style={{ fontSize: 38 }}>Budget retenu</h1>
      </div>
      <button className="budget-gros" onClick={() => saisie === null && setSaisie(String(Math.round(total)))}>
        {saisie === null ? <b>{mad(total)}</b> : <input autoFocus inputMode="numeric" value={saisie} onChange={e => setSaisie(e.target.value.replace(/\D/g, ''))} onBlur={() => corrigerTotal(saisie)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />}<span>MAD de coûts</span>
        <div className="small mute">Chiffrage {mad(zones.reduce((s, z) => s + z.total, 0) + imprevus)} · touche le montant pour le corriger</div>
      </button>
      <div className="list" style={{ marginTop: 16 }}>{zones.map(z => {
        const v = n(env[z.nom]), max = Math.max(Math.round(z.total * 2), 1000)
        return (
          <div key={z.nom} className="row env">
            <div className="top"><span className="name">{z.nom}</span><span className="small"><b>{mad(v)}</b> · {Math.round(v / inv)} / invité</span></div>
            <input type="range" min="0" max={max} step={Math.max(100, Math.round(max / 200 / 100) * 100)} value={v} onChange={e => setEnv(x => ({ ...x, [z.nom]: Number(e.target.value) }))} />
          </div>
        )
      })}
        <div className="row"><div className="top"><span className="name">Imprévus</span><span className="small"><b>{mad(imprevus)}</b> · {imprevusPct()} %</span></div></div>
      </div>
      <div className="dossier" style={{ margin: '18px 14px 0' }}>
        <span className="ic ok">✓</span>
        <div>Les <b>{nbLignes} lignes chiffrées</b> deviennent la check-list d'organisation, sans ressaisie.</div>
      </div>
      <div className="px"><button className="btn primary block" style={{ marginTop: 18 }} disabled={envoi} onClick={lancer}>{envoi ? 'Lancement…' : 'Lancer l\'organisation'}</button></div>
    </motion.div>
  )
}

/* v75 · Les lieux déjà connus, proposés à la saisie : le même lieu se reconnaît même écrit autrement (accents, espaces, tirets) */
let lieuxCache = null
function LieuxConnus() {
  const [l, setL] = useState(lieuxCache || [])
  useEffect(() => { if (!lieuxCache) api.lieuxConnus().then(x => { lieuxCache = Array.isArray(x) ? x : []; setL(lieuxCache) }).catch(() => {}) }, [])
  return <datalist id="lieux-connus">{l.map(x => <option key={x} value={x} />)}</datalist>
}
