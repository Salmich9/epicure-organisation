import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from './api'
import { useUI } from './ui'
import { Delegues } from './equipe'

/* Cadrage : une question par écran ; à la fin, le copilote remplit la revue depuis la bibliothèque */
const has = (v, x) => Array.isArray(v) && v.includes(x)
const boissons = r => has(r.prestations, 'Boissons')
const traiteur = r => has(r.prestations, 'Traiteur')
export const QUESTIONS = [
  { k: 'prestations', q: 'On fait quoi ?', multi: true, o: ['Boissons', 'Traiteur'] },
  { k: 'repas', q: 'Quel format de repas ?', multi: true, si: traiteur, o: ['Cocktail dînatoire', 'Buffet', 'Dîner assis', 'Brunch'] },
  { k: 'bars', q: 'Combien de bars ?', si: boissons, o: ['1', '2', '3', '4 et plus'] },
  { k: 'boissons', q: 'On sert quoi au bar ?', multi: true, si: boissons, o: ['Cocktails signature', 'Verse', 'Shots', 'Softs seulement'] },
  { k: 'alcool', q: "Qui fournit l'alcool ?", si: r => boissons(r) && !has(r.boissons, 'Softs seulement'), o: ['Nous', 'Le client', 'Mixte'] },
  { k: 'gamme', q: "Quelle gamme d'alcool ?", si: r => ['Nous', 'Mixte'].includes(r.alcool), o: ['Classique', 'Middle', 'Premium'] },
  { k: 'bar', q: 'Qui fournit le bar ?', si: boissons, o: ['Nous, notre comptoir', "L'agence", 'Le lieu, construit'] },
  { k: 'emplacement', q: 'Où ça se passe ?', o: ['Intérieur', 'Extérieur', 'Les deux'] },
  { k: 'sol', q: 'Le sol côté service ?', si: r => r.emplacement && r.emplacement !== 'Intérieur', o: ['Dur', 'Gazon', 'Sable ou terre'] },
  { k: 'cuisine', q: 'Une cuisine sur place ?', si: traiteur, o: ['Oui, équipée', 'Incomplète', 'Aucune'] },
  { k: 'energie', q: "L'électricité ?", o: ['Le lieu suffit', 'Groupe électrogène'] },
  { k: 'plonge', q: 'Une plonge sur place ?', o: ['Oui, fournie', 'Un espace vide', 'Rien'] },
  { k: 'fourni', q: 'Déjà fourni par le lieu ou l\'agence', multi: true, o: ['Tables', 'Chaises', 'Nappes', 'Vaisselle', 'Rien de tout ça'] },
  { k: 'invites', q: 'Parmi les invités…', multi: true, si: traiteur, o: ['Des enfants', 'Des régimes particuliers', 'Rien de spécial'] },
  { k: 'particularite', q: "Quelque chose de différent d'habitude ?", texte: true },
]
const SEUL = ['Rien de tout ça', 'Rien de spécial', 'Softs seulement']
const court = (k, v) => {
  if (Array.isArray(v)) return v.join(', ')
  if (v === '?') return null
  return { bars: `${v} bar${v === '1' ? '' : 's'}`, alcool: `Alcool : ${v.toLowerCase()}`, bar: `Bar : ${v.toLowerCase()}`, cuisine: `Cuisine : ${v.toLowerCase()}`, plonge: `Plonge : ${v.toLowerCase()}`, gamme: `Gamme ${v.toLowerCase()}` }[k] || v
}

export function Cadrage({ data, go, fin, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [rep, setRep] = useState(ev.cadrage?.reponses || {})
  const [i, setI] = useState(0)
  const [etat, setEtat] = useState(fin ? 'fin' : 'questions')
  const [res, setRes] = useState(ev.cadrage?.resultat || null)
  const qs = useMemo(() => QUESTIONS.filter(q => !q.si || q.si(rep)), [rep])
  // Total stable : les questions encore incertaines sont comptées tant que leur réponse n'est pas donnée
  const total = useMemo(() => QUESTIONS.filter(x => !x.si || x.si({ prestations: ['Boissons', 'Traiteur'], alcool: 'Nous', emplacement: 'Extérieur', ...rep })).length, [rep])
  const q = qs[Math.min(i, qs.length - 1)]
  const v = rep[q?.k]
  const sauver = r => api.cadrageMaj(data.evt, { reponses: r }).catch(() => {})

  function choisir(o) {
    if (q.multi) {
      let l = Array.isArray(v) ? [...v] : []
      l = l.includes(o) ? l.filter(x => x !== o) : SEUL.includes(o) ? [o] : [...l.filter(x => !SEUL.includes(x)), o]
      setRep({ ...rep, [q.k]: l })
    } else {
      const r = { ...rep, [q.k]: o }; setRep(r); sauver(r)
      setTimeout(() => suivant(r), 220)
    }
  }
  function suivant(r = rep) {
    sauver(r)
    const l = QUESTIONS.filter(x => !x.si || x.si(r))
    if (i + 1 >= l.length) return preparer(r)
    setI(i + 1)
  }
  async function preparer(r) {
    setEtat('prepare')
    try {
      const d = await api.copilote('cadrage', { reponses: r })
      setRes(d.cadrage?.resultat || null); setEtat('fin'); reload?.()
    } catch (e) { setEtat('questions'); ui.bubble(e.message) }
  }

  if (etat === 'prepare') return (
    <div className="cd cd-prep">
      <motion.div className="cd-orbe" animate={{ scale: [1, 1.12, 1], opacity: [.7, 1, .7] }} transition={{ repeat: Infinity, duration: 1.6 }} />
      <div className="cd-q" style={{ marginTop: 28, textAlign: 'center' }}>Je prépare ta liste…</div>
      <div className="cd-s" style={{ textAlign: 'center' }}>Une minute environ.</div>
    </div>
  )

  if (etat === 'fin') return (
    <motion.div className="cd" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="cd-top"><button onClick={() => go('')}>‹ Plan</button><button className="m" onClick={() => { setI(0); setEtat('questions') }}>modifier</button></div>
      <div className="cd-big">{res?.ajoutes ?? 0}</div>
      <div className="cd-bt">article{res?.ajoutes > 1 ? 's' : ''} ajouté{res?.ajoutes > 1 ? 's' : ''} à ta revue</div>
      {res?.resume && <div className="cd-why"><small>PARCE QUE</small>{res.resume}</div>}
      <div className="cd-lst">
        <div><i style={{ background: 'var(--accent)' }} /><p>À nous<span>{res?.nous_txt || ' '}</span></p><b>{res?.nous ?? 0}</b></div>
        <div><i style={{ background: 'var(--mute)' }} /><p>Tiers<span>{res?.tiers_txt || 'rien chez un tiers'}</span></p><b>{res?.tiers ?? 0}</b></div>
        <div><i style={{ background: 'var(--gold)' }} /><p>À trancher<span>{res?.clarifier_txt || 'rien'}</span></p><b>{res?.clarifier ?? 0}</b></div>
      </div>
      <Delegues data={data} go={go} />
      <div className="cd-pied"><motion.button whileTap={{ scale: .97 }} className="p" onClick={() => go('revue')}>Passer en revue</motion.button></div>
    </motion.div>
  )

  const trail = qs.slice(0, i).map((x, j) => [j, court(x.k, rep[x.k])]).filter(x => x[1])
  return (
    <div className="cd">
      <div className="cd-top"><button onClick={() => (i ? setI(i - 1) : go(''))}>‹ {i ? 'Retour' : 'Plan'}</button><span>{i + 1} / {Math.max(total, qs.length)}</span></div>
      <div className="cd-dots">{Array.from({ length: Math.max(total, qs.length) }, (_, j) => <i key={j} className={j <= i ? 'on' : ''} />)}</div>
      {trail.length > 0 && <div className="cd-trail">{trail.map(([j, t]) => <button key={j} onClick={() => setI(j)}>{t}</button>)}</div>}
      <AnimatePresence mode="wait">
        <motion.div key={q.k} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: .18 }}>
          <div className="cd-q">{q.q}</div>
          {q.multi && <div className="cd-s">Plusieurs choix possibles</div>}
          {q.texte
            ? <textarea className="cd-txt" rows={3} placeholder="Ex : les invités ne veulent pas voir l'alcool" value={v || ''} onChange={x => setRep({ ...rep, [q.k]: x.target.value })} />
            : <div className="cd-opts">{q.o.map(o => {
                const on = q.multi ? has(v, o) : v === o
                return <motion.button whileTap={{ scale: .98 }} key={o} className={on ? 'on' : ''} onClick={() => choisir(o)}>{o}{on && <span>✓</span>}</motion.button>
              })}</div>}
          {!q.texte && <button className="cd-skip" onClick={() => { const r = { ...rep, [q.k]: '?' }; setRep(r); suivant(r) }}>Je ne sais pas encore</button>}
        </motion.div>
      </AnimatePresence>
      {(q.multi || q.texte) && <div className="cd-pied"><motion.button whileTap={{ scale: .97 }} className="p" disabled={q.multi && !(Array.isArray(v) && v.length)} onClick={() => suivant()}>{i + 1 >= qs.length ? 'Préparer ma liste' : 'Suivant'}</motion.button></div>}
    </div>
  )
}

/* Barre d'entrée sur le plan : tant que le cadrage n'est ni fait ni passé */
export function CadrageBarre({ data, go, reload }) {
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const c = ev.cadrage || {}
  const ui = useUI()
  if (['Réalisé', 'Clôturé', 'Perdu'].includes(ev.statut)) return <div className="cd-ok"><button onClick={() => go('staff-evt')}>Staff et notes ›</button></div>
  if (c.fait_le || c.passe) return <div className="cd-ok">{c.fait_le && <>Cadrage ✓ · <button onClick={() => go('cadrage')}>modifier</button> · </>}<button onClick={() => go('equipe')}>Équipe ›</button> · <button onClick={() => go('staff-evt')}>Staff ›</button></div>
  const nb = Object.keys(c.reponses || {}).length
  return <>
    <motion.button className="rv-entree cd-entree" whileTap={{ scale: .98 }} onClick={() => go('cadrage')}>
      <div><b>Cadrage</b><span>{nb ? 'à terminer · ' : ''}une dizaine de questions, puis ta liste se remplit</span></div><strong>{nb ? 'Reprendre' : 'Commencer'}</strong>›
    </motion.button>
    <div className="cd-ok"><button onClick={() => go('equipe')}>Équipe ›</button> · <button onClick={() => go('staff-evt')}>Staff ›</button> · <button onClick={() => api.cadrageMaj(data.evt, { passe: true }).then(reload).catch(e => ui.toast(e.message))}>passer, je remplis à la main</button></div>
  </>
}
