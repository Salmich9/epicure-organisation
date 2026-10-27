import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, store } from './api'
import { Icon, mad, n, useUI } from './ui'
import { estVente } from './cycle'

const ENTITES = [
  { k: 'Epicure', tva: 20, sous: 'TVA 20 %' },
  { k: 'Business Boys', tva: 10, sous: 'TVA 10 %' },
  { k: 'Espèce', tva: 0, sous: 'aucun nom' },
]
const FORMATS = ['Dîner assis', 'Cocktail dînatoire', 'Buffet']
const DOSSIER = { Epicure: 'Evenements Epicure', 'Business Boys': 'Evenements Business Boys', 'Espèce': 'Evenements Espece' }
const IMPREVUS = 0.03
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
  const [f, setF] = useState({ nom: '', client: '', date: '', invites: '', lieu: '', prestations: ['Traiteur'], format: 'Dîner assis', entite: 'Epicure', inter: 'Aucun', intermediaire: '' })
  const [envoi, setEnvoi] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const prest = p => set('prestations', f.prestations.includes(p) ? f.prestations.filter(x => x !== p) : [...f.prestations, p])
  const nomDossier = `${f.date || 'AAAA-MM-JJ'} · ${f.nom || 'Nom'}`
  const ok = f.nom.trim() && f.date && n(f.invites) > 0 && f.prestations.length

  async function creer() {
    if (!ok) { ui.bubble('Il me faut au moins le nom, la date, les invités et une prestation.'); return }
    setEnvoi(true)
    try {
      const ev = await api.evenementCreer({
        nom: f.nom.trim(), client: f.client.trim(), date: f.date, invites: n(f.invites), lieu: f.lieu.trim(),
        prestations: f.prestations, format: f.prestations.includes('Traiteur') ? f.format : '', entite: f.entite,
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
        <div className="label">Lieu</div>
        <input value={f.lieu} onChange={e => set('lieu', e.target.value)} placeholder="Domaine, riad, villa…" />

        <div className="label">Prestation</div>
        <div className="chips">{['Traiteur', 'Bar'].map(p => <button key={p} className={`chip ${f.prestations.includes(p) ? 'on' : ''}`} onClick={() => prest(p)}>{p}</button>)}</div>
        {f.prestations.includes('Traiteur') && <div className="chips" style={{ marginTop: 8 }}>{FORMATS.map(p => <button key={p} className={`chip ${f.format === p ? 'on' : ''}`} onClick={() => set('format', p)}>{p}</button>)}</div>}

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
        <button className="btn primary block" style={{ marginTop: 22 }} disabled={envoi} onClick={creer}>{envoi ? 'Création…' : 'Chiffrer'}</button>
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

  const coefPalier = (ps, inv) => (ps.find(p => n(inv) <= n(p.jusqua)) || ps[ps.length - 1] || { coef: 2.4 }).coef

  async function demander(note) {
    setCalcul(true)
    try {
      const r = await api.copilote('chiffrer', note ? { note, lignes } : {})
      setLignes(r.lignes || []); setHyp(r.hypotheses || ''); setQuestion(r.question || ''); setConsigne('')
    } catch (e) { ui.toast(e.message); if (!lignes) setLignes([]) }
    setCalcul(false)
  }
  useEffect(() => {
    api.chiffrageContexte(data.evt).then(cx => {
      const ps = cx.paliers || []; setPaliers(ps)
      const c = cx.chiffrage
      setCoef(n(c?.coef) || n(ev.coef) || coefPalier(ps, ev.invites))
      if (c?.lignes?.length) { setLignes(c.lignes); setHyp(c.hypotheses || '') } else demander()
    }).catch(e => ui.toast(e.message))
  }, [data.evt])

  // Sauvegarde discrète après chaque retouche
  const enregistrer = (ls, cf) => { clearTimeout(sauve.current); sauve.current = setTimeout(() => api.chiffrageEnregistrer(data.evt, ls, hyp, cf).catch(() => {}), 1200) }
  const majLigne = (i, p) => setLignes(ls => { const x = ls.map((l, k) => k === i ? { ...l, ...p } : l); enregistrer(x, coef); return x })
  const retirer = i => setLignes(ls => { const x = ls.filter((_, k) => k !== i); enregistrer(x, coef); return x })
  const ajouter = zone => setLignes(ls => [...ls, { zone, element: '', mode: 'achat', quantite: n(ev.invites), prix: 0 }])
  const changerCoef = d => setCoef(c => { const v = Math.max(1, Math.round((n(c) + d) * 100) / 100); enregistrer(lignes, v); return v })

  const ordre = data.zones.map(z => z.nom)
  const zones = useMemo(() => {
    const g = {}
    ;(lignes || []).forEach((l, i) => { (g[l.zone] = g[l.zone] || { nom: l.zone, lignes: [], total: 0 }).lignes.push({ ...l, i }); g[l.zone].total += n(l.quantite) * n(l.prix) })
    return Object.values(g).sort((a, b) => (ordre.indexOf(a.nom) + 99 * (ordre.indexOf(a.nom) < 0)) - (ordre.indexOf(b.nom) + 99 * (ordre.indexOf(b.nom) < 0)))
  }, [lignes])
  const cout = zones.reduce((s, z) => s + z.total, 0)
  const imprevus = cout * IMPREVUS
  const prixHT = (cout + imprevus) * n(coef)
  const tva = (ENTITES.find(x => x.k === ev.entite) || {}).tva || 0
  const palier = paliers.find(p => n(ev.invites) <= n(p.jusqua))

  const vente = estVente(ev)
  if (etape === 'budget' && lignes === null) return <div className="calcul"><div className="orbe" /><div>Chargement du chiffrage…</div></div>
  if (etape === 'budget') return <Budget data={data} ev={ev} zones={zones} imprevus={imprevus} prix={n(ev.prix_signe) || prixHT} coef={coef} retour={() => setEtape('chiffrer')} go={go} reload={reload} />

  return (
    <motion.div {...glisse} className="wiz">
      <div className="head">
        <button className="back" onClick={() => go('')}>‹ Plan</button>
        <div className="when">{ev.nom} · {ev.invites} invités · 2 sur 3</div>
        <h1 style={{ fontSize: 38 }}>Chiffrage</h1>
        <div className="meta">{(ev.prestations || []).join(' + ')}{ev.format ? ` · ${ev.format}` : ''} · facturé par {ev.entite}</div>
      </div>

      {(lignes === null || (calcul && !lignes?.length)) && (
        <div className="calcul"><div className="orbe" /><div>Le copilote chiffre zone par zone,<br />à partir du catalogue et de tes événements passés…</div></div>
      )}

      {lignes !== null && !(calcul && !lignes.length) && <>
        {question && <div className="question-ia" onClick={() => setQuestion('')}><b>Une question :</b> {question}</div>}
        <div className="zones-chiffre">{zones.map(z => (
          <div key={z.nom} className={`cz ${ouverte === z.nom ? 'open' : ''}`}>
            <button className="cz-top" onClick={() => setOuverte(ouverte === z.nom ? null : z.nom)}>
              <div><div className="nom">{z.nom}</div><div className="small mute">{z.lignes.slice(0, 3).map(l => l.element).join(', ')}{z.lignes.length > 3 ? '…' : ''}</div></div>
              <div className="cz-r"><span className="ia">IA</span><b>{mad(z.total)}</b></div>
            </button>
            <AnimatePresence>{ouverte === z.nom && (
              <motion.div className="cz-lignes" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {z.lignes.map(l => (
                  <div key={l.i} className="cl">
                    <input className="cl-nom" value={l.element} onChange={e => majLigne(l.i, { element: e.target.value })} placeholder="Élément" />
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
        ))}</div>

        <div className="consigne">
          <input value={consigne} onChange={e => setConsigne(e.target.value)} placeholder="Dis ce qu'il faut changer…" onKeyDown={e => e.key === 'Enter' && consigne.trim() && demander(consigne.trim())} />
          <button className={`mini-mic ${dicte ? 'rec' : ''}`} onClick={() => { if (!dicter()) ui.bubble('Dictée indisponible ici : utilise le micro du clavier.') }} aria-label="Dicter">{Icon.mic}</button>
          {consigne.trim() && <button className="chip on" onClick={() => demander(consigne.trim())} disabled={calcul}>{calcul ? '…' : 'Ajuster'}</button>}
        </div>
        {hyp && <p className="small mute px" style={{ marginTop: 10 }}>{hyp}</p>}

        <div className="totaux">
          <div className="t-l"><span>Coût</span><b>{mad(cout)}</b></div>
          <div className="t-l"><span>Imprévus 3 %</span><b>{mad(imprevus)}</b></div>
          <div className="t-l"><span>Coef {palier ? `(palier ≤ ${palier.jusqua >= 100000 ? '∞' : palier.jusqua})` : ''}</span>
            <span className="coef"><button onClick={() => changerCoef(-0.05)}>−</button><b>× {n(coef).toFixed(2).replace('.', ',')}</b><button onClick={() => changerCoef(0.05)}>+</button></span></div>
          <div className="t-l big"><span>Prix proposé HT</span><b>{mad(prixHT)}</b></div>
          {tva > 0 && <div className="t-l"><span>TTC (TVA {tva} %)</span><b>{mad(prixHT * (1 + tva / 100))}</b></div>}
          {n(ev.prix_signe) > 0 && <>
            <div className="t-l big"><span>Prix signé HT (contrat)</span><b>{mad(ev.prix_signe)}</b></div>
            <div className="t-l"><span>Marge avec ce chiffrage</span><b style={{ color: n(ev.prix_signe) - (cout + imprevus) < 0 ? 'var(--red)' : 'var(--accent)' }}>{mad(n(ev.prix_signe) - (cout + imprevus))} · {Math.round((1 - (cout + imprevus) / n(ev.prix_signe)) * 100)} %</b></div>
          </>}
        </div>
        <div className="px" style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {ev.entite !== 'Espèce' && <button className={`btn ${vente ? 'primary' : ''}`} onClick={async () => { clearTimeout(sauve.current); await api.chiffrageEnregistrer(data.evt, lignes, hyp, coef).catch(() => {}); go('devis') }}>{devis ? `Devis ${devis}` : 'Devis client'}</button>}
          {vente ? <button className="btn" onClick={async () => { clearTimeout(sauve.current); await api.chiffrageEnregistrer(data.evt, lignes, hyp, coef).catch(() => {}); await reload(); go('') }}>Terminer</button>
            : <button className="btn primary" onClick={() => { clearTimeout(sauve.current); api.chiffrageEnregistrer(data.evt, lignes, hyp, coef).catch(() => {}); setEtape('budget') }}>{data.elements.length ? 'Mettre à jour le budget' : 'Retenir le budget'}</button>}
        </div>
      </>}
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
        <div className="row"><div className="top"><span className="name">Imprévus</span><span className="small"><b>{mad(imprevus)}</b> · 3 %</span></div></div>
      </div>
      <div className="dossier" style={{ margin: '18px 14px 0' }}>
        <span className="ic ok">✓</span>
        <div>Les <b>{nbLignes} lignes chiffrées</b> deviennent la check-list d'organisation, sans ressaisie.</div>
      </div>
      <div className="px"><button className="btn primary block" style={{ marginTop: 18 }} disabled={envoi} onClick={lancer}>{envoi ? 'Lancement…' : 'Lancer l\'organisation'}</button></div>
    </motion.div>
  )
}
