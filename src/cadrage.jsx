import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from './api'
import { Info, useUI } from './ui'
import { Delegues } from './equipe'
import { couleur, k } from './postes'
import { n } from './ui'
import { planCadrage, libelleValeur, titreCourt } from './questions'

/* Cadrage (v74) : il affine, il ne reprend pas. Ce que le devis a dit est repris d'un coup d'œil ;
   ce qu'il a laissé au défaut revient pré-choisi ; puis les questions du cadrage (Paramètres › Questions). */
const SEUL = ['rien']
const SOURCES = { lieu: 'même lieu', proches: 'événements proches', ia: 'IA', defaut: 'par défaut du devis' }
const vide = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)

export function Cadrage({ data, go, fin, reload }) {
  const ui = useUI()
  const [ctx, setCtx] = useState(null)
  const [af, setAf0] = useState({})
  const afR = useRef({})
  const setAf = r => { afR.current = r; setAf0(r) }
  const [i, setI] = useState(-1)            // -1 = l'accueil (repris du devis)
  const [corr, setCorr] = useState(null)    // une question reprise qu'on corrige
  const [vu, setVu] = useState(false)       // liste « repris » dépliée
  const [etat, setEtat] = useState(fin ? 'fin' : 'questions')
  const [txt, setTxt] = useState('')
  useEffect(() => { api.cadrageContexte(data.evt).then(c => { const x = c && typeof c === 'object' ? c : { base: {}, questions: [] }; setCtx(x); setAf(x.affine || {}) }).catch(e => ui.toast(e.message)) }, [data.evt])
  const props = useMemo(() => ctx ? { ...(ctx.ia?.propositions || {}), ...(ctx.propositions || {}) } : {}, [ctx])
  const plan = useMemo(() => ctx ? planCadrage(ctx.base, ctx.questions, af, props) : null, [ctx, af, props])
  const [iaEnCours, setIa] = useState(false)
  // L'IA en dernier : seulement les questions à choix que ni le lieu, ni les proches n'ont tranchées, et qu'elle n'a pas déjà vues
  useEffect(() => {
    if (!ctx?.ia_actif || !plan || iaEnCours) return
    const vues = new Set(ctx.ia?.vues || [])
    const qs = plan.etapes.filter(x => ['choix', 'multi', 'oui_non', 'nombre'].includes(x.q.type) && !['lieu', 'proches'].includes(x.source) && af[x.q.cle] === undefined && !vues.has(x.q.cle))
    if (!qs.length) return
    setIa(true)
    api.cadrageIA(
      qs.map(x => ({ cle: x.q.cle, texte: x.q.texte, type: x.q.type, choix: x.q.type === 'oui_non' ? [{ cle: 'oui', libelle: 'Oui' }, { cle: 'non', libelle: 'Non' }] : x.q.choix || [] })),
      plan.repris.map(x => ({ texte: titreCourt(x.q), valeur: libelleValeur(x.q, x.v) })),
    ).then(r => { if (r?.ia) setCtx(c => ({ ...c, ia: r.ia })); else throw new Error() })
      .catch(() => setCtx(c => ({ ...c, ia: { ...(c.ia || {}), vues: [...(c.ia?.vues || []), ...qs.map(x => x.q.cle)] } })))
      .finally(() => setIa(false))
  }, [ctx?.ia, ctx?.ia_actif, !!plan])
  const cur = corr || (plan && i >= 0 ? plan.etapes[Math.min(i, plan.etapes.length - 1)] : null)
  const q = cur?.q
  const v = q ? (af[q.cle] !== undefined ? af[q.cle] : corr ? cur.v : cur.propose) : undefined
  const propose = q && af[q.cle] === undefined && !vide(v)
  useEffect(() => { if (q && q.type === 'texte') setTxt(typeof v === 'string' && v !== '?' ? v : '') }, [q?.cle])
  const sauver = r => api.cadrageMaj(data.evt, { affine: r }).catch(e => ui.toast(`Réponse pas enregistrée : ${e.message}`))

  function poser(val) {
    const r = { ...afR.current, [q.cle]: val }; setAf(r); sauver(r)
    return r
  }
  function choisir(c) {
    if (q.type === 'multi') {
      const l = Array.isArray(v) ? v : []
      const nl = l.includes(c) ? l.filter(x => x !== c) : SEUL.includes(c) ? [c] : [...l.filter(x => !SEUL.includes(x)), c]
      setAf({ ...afR.current, [q.cle]: nl })
    } else { poser(c); setTimeout(() => suivant(), 220) }
  }
  function suivant() {
    if (corr) { setCorr(null); return }
    if (i + 1 >= planCadrage(ctx.base, ctx.questions, afR.current, props).etapes.length) return preparer()
    setI(i + 1)
  }
  async function preparer() {
    setEtat('prepare')
    try { await api.cadrageMaj(data.evt, { affine: afR.current, fait_le: new Date().toISOString() }); await reload?.(); setEtat('fin') }
    catch (e) { setEtat('questions'); ui.bubble(e.message) }
  }

  if (etat === 'prepare') return (
    <div className="cd cd-prep">
      <motion.div className="cd-orbe" animate={{ scale: [1, 1.12, 1], opacity: [.7, 1, .7] }} transition={{ repeat: Infinity, duration: 1.6 }} />
      <div className="cd-q" style={{ marginTop: 28, textAlign: 'center' }}>Je pose les enveloppes…</div>
    </div>
  )

  if (etat === 'fin') {
    const ps = data.postes || []
    const tot = ps.reduce((s, p) => s + n(p.prevu), 0)
    return (
    <motion.div className="cd" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="cd-top"><button onClick={() => go('')}>‹ Événement</button><button className="m" onClick={() => { setI(-1); setEtat('questions') }}>modifier</button></div>
      <div className="cd-big">{ps.length}</div>
      <div className="cd-bt">enveloppes posées · {k(tot)} MAD prévus</div>
      <div className="cd-lst">{ps.map(p => <div key={p.cle}><i style={{ background: couleur(p.resp) }} /><p>{p.type === 'matiere' ? `Matière ${p.nom.toLowerCase()}` : p.nom}<span>{p.resp || 'à attribuer'}</span></p><b>{k(p.prevu)}</b></div>)}</div>
      <Delegues data={data} go={go} />
      <div className="cd-pied"><motion.button whileTap={{ scale: .97 }} className="p" onClick={() => go('')}>Voir les enveloppes</motion.button></div>
    </motion.div>
  ) }

  if (!plan) return <div className="cd"><div className="cd-top"><button onClick={() => go('')}>‹ Événement</button></div><p className="cd-s" style={{ marginTop: 40 }}>Chargement…</p></div>

  // Accueil : ce que le devis a déjà tranché, puis « Affiner »
  if (!q) {
    const nbA = plan.etapes.length
    return (
      <div className="cd">
        <div className="cd-top"><button onClick={() => go('')}>‹ Événement</button><span>Cadrage</span></div>
        <div className="cd-q">{nbA ? `${nbA} question${nbA > 1 ? 's' : ''} pour affiner` : 'Tout est déjà dit'}</div>
        <div className="cd-s">{ctx.a_chiffrage ? 'Le reste vient du devis : je ne le repose pas.' : 'Pas encore de chiffrage : je pars de l’événement.'}</div>
        {nbA > 0 && <div className="cd-pros">{(() => { const np = plan.etapes.filter(x => ['lieu', 'proches', 'ia'].includes(x.source)).length
          return <>{np ? <span>✦ {np} déjà proposée{np > 1 ? 's' : ''}</span> : null}{iaEnCours && <span className="ia">L’IA cherche…</span>}</> })()}</div>}
        {plan.repris.length > 0 && <div className="cd-rep">
          <button className="cd-rep-t" onClick={() => setVu(!vu)}><b>Repris du devis</b><span>{plan.repris.length}{plan.repris.some(x => x.corrige) ? ' · corrigé' : ''}</span><i>{vu ? '⌃' : '⌄'}</i></button>
          {vu && plan.repris.map(x => <button key={x.q.cle} className="cd-rep-l" onClick={() => setCorr(x)}>
            <span>{titreCourt(x.q)}</span><b>{libelleValeur(x.q, x.v)}</b>{x.corrige && <em>corrigé</em>}</button>)}
          {vu && <p className="cd-rep-n">Touche une ligne pour corriger. Le prix signé ne bouge pas.</p>}
        </div>}
        <div className="cd-pied"><motion.button whileTap={{ scale: .97 }} className="p" onClick={() => (nbA ? setI(Math.max(0, plan.etapes.findIndex(x => af[x.q.cle] === undefined))) : preparer())}>{!nbA ? 'Poser les enveloppes' : plan.etapes.some(x => af[x.q.cle] !== undefined) && plan.etapes.some(x => af[x.q.cle] === undefined) ? 'Reprendre' : 'Affiner'}</motion.button></div>
      </div>
    )
  }

  const total = plan.etapes.length
  const opts = q.type === 'oui_non' ? [{ cle: 'oui', libelle: 'Oui' }, { cle: 'non', libelle: 'Non' }] : q.choix || []
  const trail = corr ? [] : plan.etapes.slice(0, i).map((x, j) => [j, af[x.q.cle] === '?' ? null : libelleValeur(x.q, af[x.q.cle] ?? x.propose)]).filter(x => x[1] && x[1] !== '?')
  const fini = corr || i + 1 >= total
  return (
    <div className="cd">
      <div className="cd-top"><button onClick={() => (corr ? setCorr(null) : setI(i - 1))}>‹ Retour</button><span>{corr ? 'Correction' : `${i + 1} / ${total}`}</span></div>
      {!corr && <div className="cd-dots">{Array.from({ length: total }, (_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}</div>}
      {trail.length > 0 && <div className="cd-trail">{trail.map(([j, t]) => <button key={j} onClick={() => setI(j)}>{t}</button>)}</div>}
      <AnimatePresence mode="wait">
        <motion.div key={q.cle} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: .18 }}>
          <div className="cd-q">{q.texte}</div>
          {propose && <div className={`cd-pro ${corr ? '' : cur.source || ''}`}>Proposé · {corr ? 'au devis' : SOURCES[cur.source] || 'par défaut du devis'}
            {!corr && cur.pourquoi && <Info text={[`${cur.pourquoi}.`, cur.autre && `Les proches disent plutôt ${libelleValeur(q, cur.autre.valeur)} : ${cur.autre.pourquoi}.`].filter(Boolean).join(' ')} />}</div>}
          {!propose && q.type === 'multi' && <div className="cd-s">Plusieurs choix possibles</div>}
          {q.type === 'texte'
            ? <textarea className="cd-txt" rows={3} placeholder={q.aide || ''} value={txt} onChange={x => setTxt(x.target.value)} />
            : q.type === 'nombre'
            ? <div className="cd-opts cd-nb">{[1, 2, 3, 4, 5, 6].map(o => <motion.button whileTap={{ scale: .98 }} key={o} className={n(v) === o ? 'on' : ''} onClick={() => { poser(o); setTimeout(() => suivant(), 220) }}>{o}</motion.button>)}</div>
            : <div className="cd-opts">{opts.map(o => {
                const on = q.type === 'multi' ? Array.isArray(v) && v.includes(o.cle) : v === o.cle
                return <motion.button whileTap={{ scale: .98 }} key={o.cle} className={on ? 'on' : ''} onClick={() => choisir(o.cle)}>{o.libelle}{on && <span>✓</span>}</motion.button>
              })}</div>}
          {!corr && <button className="cd-skip" onClick={() => { poser('?'); setTimeout(() => suivant(), 0) }}>Je ne sais pas encore</button>}
        </motion.div>
      </AnimatePresence>
      {(q.type === 'multi' || q.type === 'texte' || propose) && <div className="cd-pied"><motion.button whileTap={{ scale: .97 }} className="p"
        disabled={q.type === 'multi' && vide(v)}
        onClick={() => { if (q.type === 'texte') poser(txt.trim()); else if (q.type === 'multi' || propose) poser(v); suivant() }}>
        {propose && q.type !== 'multi' && q.type !== 'texte' ? 'C’est ça' : fini ? (corr ? 'Corriger' : 'Poser les enveloppes') : 'Suivant'}</motion.button></div>}
    </div>
  )
}

/* Barre d'entrée sur le plan : tant que le cadrage n'est ni fait ni passé */
export function CadrageBarre({ data, go, reload }) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const c = ev.cadrage || {}
  const ui = useUI()
  if (['Réalisé', 'Clôturé', 'Perdu'].includes(ev.statut)) return <div className="cd-ok"><button onClick={() => go('staff-evt')}>Staff et notes ›</button></div>
  if (c.fait_le || c.passe) return <div className="cd-ok">{c.fait_le && <>Cadrage ✓ · <button onClick={() => go('cadrage')}>modifier</button> · </>}<button onClick={() => go('menu')}>Menu ›</button> · <button onClick={() => go('equipe')}>Équipe ›</button> · <button onClick={() => go('staff-evt')}>Staff ›</button></div>
  const nb = Object.keys(c.affine || {}).length
  return <>
    <motion.button className="rv-entree cd-entree" whileTap={{ scale: .98 }} onClick={() => go('cadrage')}>
      <div><b>Cadrage</b><span>{nb ? 'à terminer · ' : ''}j'affine ce que le devis n'a pas dit, puis les enveloppes se posent</span></div><strong>{nb ? 'Reprendre' : 'Commencer'}</strong>›
    </motion.button>
    <div className="cd-ok"><button onClick={() => go('menu')}>Menu ›</button> · <button onClick={() => go('equipe')}>Équipe ›</button> · <button onClick={() => go('staff-evt')}>Staff ›</button> · <button onClick={() => api.cadrageMaj(data.evt, { passe: true }).then(reload).catch(e => ui.toast(e.message))}>passer, je remplis à la main</button></div>
  </>
}
