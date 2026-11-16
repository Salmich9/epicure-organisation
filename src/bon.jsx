import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, n as num, useUI } from './ui'
const n = v => num(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/* Achat payé en espèces sans bon : l'appli fabrique un bon récapitulatif, le vendeur signe sur l'écran. (maquette) */
export const SOCIETES = {
  BB: { court: 'Business Boys' },
  EPI: { court: 'Epicure' },
}
const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const DIZ = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
function cent(x) {
  if (x < 17) return UNITES[x]
  if (x < 20) return 'dix-' + UNITES[x - 10]
  const d = Math.floor(x / 10), u = x % 10
  if (d === 7 || d === 9) return DIZ[d] + (u === 1 && d === 7 ? ' et ' : '-') + cent(10 + u)
  return DIZ[d] + (u === 0 ? (d === 8 ? 's' : '') : u === 1 && d !== 8 ? ' et un' : '-' + UNITES[u])
}
function mille(x) {
  const c = Math.floor(x / 100), r = x % 100
  return [c ? (c === 1 ? 'cent' : UNITES[c] + ' cent' + (r === 0 ? 's' : '')) : '', r ? cent(r) : ''].filter(Boolean).join(' ')
}
export function enLettres(v) {
  const e = Math.floor(v); if (e === 0) return 'zéro'
  const m = Math.floor(e / 1000), r = e % 1000
  return [m ? (m === 1 ? 'mille' : mille(m) + ' mille') : '', r ? mille(r) : ''].filter(Boolean).join(' ')
}
const centimes = v => { const c = Math.round(v * 100) % 100; return c ? ` et ${enLettres(c)} centimes` : '' }

// Zone de signature au doigt
export function Signature({ onTrace, exporter }) {
  const c = useRef(null), dessin = useRef(false), vide = useRef(true)
  useEffect(() => {
    const cv = c.current, r = cv.getBoundingClientRect(), d = devicePixelRatio || 1
    cv.width = r.width * d; cv.height = r.height * d
    const x = cv.getContext('2d'); x.scale(d, d); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1D2B24'
  }, [])
  if (exporter) exporter.current = () => c.current.toDataURL('image/png')
  const pos = e => { const r = c.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const bas = e => { e.preventDefault(); c.current.setPointerCapture(e.pointerId); dessin.current = true; const x = c.current.getContext('2d'); x.beginPath(); x.moveTo(...pos(e)) }
  const bouge = e => { if (!dessin.current) return; const x = c.current.getContext('2d'); x.lineTo(...pos(e)); x.stroke(); if (vide.current) { vide.current = false; onTrace?.(true) } }
  const haut = () => { dessin.current = false }
  const effacer = () => { const cv = c.current; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); vide.current = true; onTrace?.(false) }
  return (
    <div className="bn-sig">
      <canvas ref={c} onPointerDown={bas} onPointerMove={bouge} onPointerUp={haut} onPointerCancel={haut} />
      <span className="bn-sig-l">Signez ici</span>
      <button className="bn-sig-x" onClick={effacer}>Effacer</button>
    </div>
  )
}

// Le bon tel qu'il sera imprimé en PDF
export function Bon({ b, signe, children }) {
  const s = SOCIETES[b.societe], total = b.lignes.reduce((t, l) => t + num(l.qte) * num(l.prix), 0)
  return (
    <div className="bn">
      <div className="bn-tete"><div className="bn-num" style={{ textAlign: 'left' }}><em>Bon d'achat espèces</em><b>N° {b.num || '…'}</b></div><div className="bn-num"><em>{s.court}</em><span>{b.date}</span></div></div>
      <div className="bn-pour">Pour : <b>{b.pour}</b></div>
      <table className="bn-t"><thead><tr><th>Désignation</th><th>Qté</th><th>P.U.</th><th>Total</th></tr></thead>
        <tbody>{b.lignes.map((l, i) => <tr key={i}><td>{l.nom}</td><td>{l.qte}</td><td>{n(l.prix)}</td><td>{n(l.qte * l.prix)}</td></tr>)}</tbody></table>
      <div className="bn-tot"><span>Total payé en espèces</span><b>{n(total)} MAD</b></div>
      <div className="bn-let">Arrêté le présent bon à la somme de <i>{enLettres(total)} dirhams{centimes(total)}</i>.</div>
      <div className="bn-sigs">
        <div><em>Payé par</em><b>{b.payeur}</b></div>
        <div><em>Reçu par</em><b>{b.vendeur || '…'}</b>{signe ? <div className="bn-sig-img">{signe}</div> : children}</div>
      </div>
    </div>
  )
}

// L'écran : 1 la saisie, 2 la signature du vendeur, 3 c'est fait
export function AchatEspeces({ go, evt: evt0 }) {
  const ui = useUI()
  const [ctx, setCtx] = useState(null)
  const [stock, setStock] = useState([])
  const [refs, setRefs] = useState(null)
  const [f, setF] = useState({ evt: evt0 || null, societe: null, vendeur: '', lignes: [], paye_par: 'enveloppe' })
  const [etape, setEtape] = useState(1)
  const [ligne, setLigne] = useState(null)      // la ligne en cours d'ajout
  const [trace, setTrace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fait, setFait] = useState(null)
  const sigRef = useRef(null)
  useEffect(() => {
    api.bonContexte(f.evt).then(c => { setCtx(c); if (!f.societe) { const e = c.evenements.find(x => x.id === f.evt); setF(v => ({ ...v, societe: e?.entite === 'Business Boys' ? 'BB' : 'EPI' })) } }).catch(e => ui.toast(e.message))
  }, [f.evt])
  useEffect(() => { api.depotStock().then(s => setStock(s.articles)).catch(e => ui.toast(e.message)); api.depotReferentiels().then(setRefs).catch(() => {}) }, [])
  const total = f.lignes.reduce((t, l) => t + num(l.qte) * num(l.prix), 0)
  const evNom = ctx?.evenements.find(x => x.id === f.evt)?.nom
  const env = f.evt ? ctx?.enveloppe : null
  const pret = f.vendeur.trim() && f.lignes.length && f.societe

  async function valider() {
    setBusy(true)
    try {
      const r = await api.bonCreer({ societe: f.societe, evenement_id: f.evt, paye_par: f.evt ? f.paye_par : 'enveloppe', vendeur: f.vendeur.trim(), signature: sigRef.current(),
        lignes: f.lignes.map(l => ({ article_id: l.article_id || null, nom: l.article_id ? null : l.nom, cat_id: l.cat_id || null, unite_id: l.unite_id || null, qte: num(l.qte), prix: num(l.prix) })) })
      setFait({ ...r, drive: null }); setEtape(3)
      api.bonPdf(r.id).then(d => setFait(x => ({ ...x, drive: d.url }))).catch(e => setFait(x => ({ ...x, drive: false, err: e.message })))
    } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }

  if (!ctx) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  if (etape === 3) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran bn-fini">
      <div className="bn-ok">✓</div>
      <h1>Bon signé</h1>
      <div className="meta">N° {fait.num} · {n(fait.total)} MAD</div>
      <div className="list bn-l" style={{ marginTop: 22 }}>
        <div className="row"><div className="x"><b>Stock</b><span>{f.lignes.length} article{f.lignes.length > 1 ? 's' : ''} entré{f.lignes.length > 1 ? 's' : ''} au dépôt{evNom ? ` pour ${evNom}` : ''}</span></div><span className="bn-v">✓</span></div>
        {fait.reste != null && <div className="row"><div className="x"><b>Ton enveloppe</b><span>{fait.reste < 0 ? `La société te doit ${n(-fait.reste)} MAD` : `${n(fait.reste)} MAD restants`}</span></div><span className="bn-v">✓</span></div>}
        <div className="row"><div className="x"><b>Drive</b><span>{fait.drive ? `${evNom || 'Dépôt'} › ${f.evt ? 'Pièces fournisseurs' : 'Bons espèces'}` : fait.drive === false ? `Pas rangé : ${fait.err}` : 'Rangement…'}</span></div><span className="bn-v">{fait.drive ? '✓' : fait.drive === false ? '!' : '…'}</span></div>
      </div>
      <div className="px" style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        {fait.drive && <a className="btn block" href={fait.drive} target="_blank" rel="noreferrer">Voir le PDF</a>}
        {fait.drive === false && <button className="btn block" onClick={() => api.bonPdf(fait.id).then(d => setFait(x => ({ ...x, drive: d.url }))).catch(e => ui.toast(e.message))}>Réessayer le rangement</button>}
        <button className="btn primary block" onClick={() => go(f.evt ? '' : 'aujourdhui')}>Terminé</button>
      </div>
    </motion.div>
  )
  if (etape === 2) return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran">
      <div className="head"><button className="back" onClick={() => setEtape(1)}>‹ Modifier</button><h1 style={{ fontSize: 30 }}>Faire signer</h1><div className="meta">Tends le téléphone au vendeur.</div></div>
      <div className="px">
        <Bon b={{ societe: f.societe, num: null, date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }), pour: evNom || 'Dépôt (réassort)', payeur: ctx.moi, vendeur: f.vendeur.trim(),
          lignes: f.lignes.map(l => ({ nom: l.nom, qte: num(l.qte), prix: num(l.prix) })) }}><Signature onTrace={setTrace} exporter={sigRef} /></Bon>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={!trace || busy} onClick={valider}>{busy ? 'Enregistrement…' : 'Valider le bon signé'}</button>
      </div>
    </motion.div>
  )
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran">
      <div className="head"><button className="back" onClick={() => go(evt0 ? '' : 'aujourdhui')}>‹ Retour</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Achat en espèces<Info text="Pour un achat payé en liquide sans facture : le vendeur signe le bon sur ton téléphone. Les articles entrent au dépôt, le montant sort de ton enveloppe, le bon part dans le Drive." /></h1></div>
      <div className="px">
        <div className="as-l">POUR</div>
        <div className="chips">{ctx.evenements.map(e => <button key={e.id} className={`chip ${f.evt === e.id ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, evt: e.id, societe: e.entite === 'Business Boys' ? 'BB' : 'EPI' }))}>{e.nom}</button>)}
          <button className={`chip ${!f.evt ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, evt: null }))}>Dépôt (réassort)</button></div>
        {f.evt ? <>
          <div className="as-l">PAYÉ PAR</div>
          <div className="chips"><button className={`chip ${f.paye_par === 'enveloppe' ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, paye_par: 'enveloppe' }))}>Enveloppe de l'événement</button>
            {Object.entries(SOCIETES).map(([k, s]) => <button key={k} className={`chip ${f.paye_par === 'caisse' && f.societe === k ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, paye_par: 'caisse', societe: k }))}>Caisse {s.court}</button>)}</div>
          {f.paye_par === 'enveloppe' && <><div className="as-l">AU NOM DE</div>
            <div className="chips">{Object.entries(SOCIETES).map(([k, s]) => <button key={k} className={`chip ${f.societe === k ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, societe: k }))}>{s.court}</button>)}</div></>}
        </> : <>
          <div className="as-l">PAYÉ PAR LA SOCIÉTÉ</div>
          <div className="chips">{Object.entries(SOCIETES).map(([k, s]) => <button key={k} className={`chip ${f.societe === k ? 'on' : ''}`} onClick={() => setF(v => ({ ...v, societe: k }))}>{s.court}</button>)}</div>
        </>}
        <div className="as-l">VENDEUR</div>
        <input className="bn-in" style={{ width: '100%', font: 'inherit' }} placeholder="Nom du vendeur" value={f.vendeur} onChange={e => setF(v => ({ ...v, vendeur: e.target.value }))} />
        <div className="as-l">CE QUI A ÉTÉ ACHETÉ</div>
        <div className="list bn-l">{f.lignes.map((l, i) => <div key={i} className="row" onClick={() => setLigne({ ...l, i })}><div className="x"><b>{l.nom}{!l.article_id && <em className="bn-neuf"> nouveau</em>}</b><span>{l.qte} × {n(l.prix)} MAD</span></div><b>{n(num(l.qte) * num(l.prix))}</b></div>)}
          <button className="row bn-plus" onClick={() => setLigne({ q: '', qte: '', prix: '' })}>+ Ajouter une ligne</button></div>
        {env != null && !(f.evt && f.paye_par === 'caisse') && (env - total < 0
          ? <div className="bn-env"><span>Ton enveloppe {n(env)} MAD<Info text="Tu avances la différence : elle apparaît dans Espèces comme « on lui doit », et on te rembourse avec Confier." /></span><b>On te devra {n(total - env)} MAD</b></div>
          : <div className="bn-env"><span>Ton enveloppe espèces</span><b>{n(env)} → {n(env - total)} MAD</b></div>)}
        <button className="btn primary block" style={{ marginTop: 16 }} disabled={!pret} onClick={() => { setTrace(false); setEtape(2) }}>{pret ? `Faire signer le bon · ${n(total)} MAD` : 'Vendeur et au moins une ligne'}</button>
      </div>
      <Sheet open={!!ligne} onClose={() => setLigne(null)} foot={ligne && <button className="btn primary" disabled={!(ligne.nom && num(ligne.qte) > 0 && ligne.prix !== '' && (ligne.article_id || (ligne.cat_id && ligne.unite_id)))}
          onClick={() => { setF(v => ({ ...v, lignes: ligne.i != null ? v.lignes.map((x, k) => k === ligne.i ? ligne : x) : [...v.lignes, ligne] })); setLigne(null) }}>{ligne.i != null ? 'Modifier la ligne' : 'Ajouter'}</button>}>
        {ligne && <LigneBon l={ligne} set={setLigne} stock={stock} refs={refs} retirer={ligne.i != null ? () => { setF(v => ({ ...v, lignes: v.lignes.filter((_, k) => k !== ligne.i) })); setLigne(null) } : null} />}
      </Sheet>
    </motion.div>
  )
}

// Une ligne du bon : un article du dépôt (recherche) ou un nouvel article
function LigneBon({ l, set, stock, refs, retirer }) {
  const q = (l.q ?? '').trim().toLowerCase()
  const trouves = q.length >= 2 && !l.nom ? stock.filter(a => a.nom.toLowerCase().includes(q)).slice(0, 6) : []
  return <>
    <div className="el-name" style={{ fontSize: 24 }}>{l.nom || 'Quel article ?'}</div>
    {!l.nom ? <>
      <input autoFocus className="bn-in" style={{ width: '100%', font: 'inherit', marginTop: 10 }} placeholder="Chercher dans le dépôt" value={l.q || ''} onChange={e => set({ ...l, q: e.target.value })} />
      <div className="list bn-l" style={{ marginTop: 8 }}>{trouves.map(a => <button key={a.id} className="row" onClick={() => set({ ...l, article_id: a.id, nom: a.nom })}><div className="x"><b>{a.nom}</b><span>{a.cat} · {Number(a.qte)} {a.unite || ''} en stock</span></div></button>)}
        {q.length >= 2 && <button className="row bn-plus" onClick={() => set({ ...l, nom: l.q.trim(), article_id: null })}>+ Nouvel article « {l.q.trim()} »</button>}</div>
    </> : <>
      {!l.article_id && refs && <>
        <div className="as-l">CATÉGORIE</div><div className="chips">{refs.categories.map(c => <button key={c.id} className={`chip ${l.cat_id === c.id ? 'on' : ''}`} onClick={() => set({ ...l, cat_id: c.id })}>{c.nom}</button>)}</div>
        <div className="as-l">UNITÉ</div><div className="chips">{refs.unites.map(u => <button key={u.id} className={`chip ${l.unite_id === u.id ? 'on' : ''}`} onClick={() => set({ ...l, unite_id: u.id })}>{u.nom}</button>)}</div>
      </>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
        <label><div className="as-l">QUANTITÉ</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="decimal" value={l.qte} onChange={e => set({ ...l, qte: e.target.value.replace(',', '.') })} /></label>
        <label><div className="as-l">PRIX UNITAIRE (MAD)</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="decimal" value={l.prix} onChange={e => set({ ...l, prix: e.target.value.replace(',', '.') })} /></label>
      </div>
      <div className="ee-menu">{l.i == null && <button onClick={() => set({ q: l.nom, qte: l.qte, prix: l.prix })}>Changer d'article<span>›</span></button>}{retirer && <button className="danger" onClick={retirer}>Retirer la ligne</button>}</div>
    </>}
  </>
}
