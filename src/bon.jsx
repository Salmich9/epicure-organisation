import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { n as num } from './ui'
const n = v => Math.round(num(v)).toLocaleString('fr-FR')

/* Achat payé en espèces sans bon : l'appli fabrique un bon récapitulatif, le vendeur signe sur l'écran. (maquette) */
export const SOCIETES = {
  BB: { nom: 'Business Boys SARL', ligne: 'Rue Moulay Ali, Résidence El Houda, Guéliz, Marrakech', pre: 'BB' },
  EPI: { nom: 'Epicure Catering SARL', ligne: 'Marrakech', pre: 'EPI' },
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

// Zone de signature au doigt
export function Signature({ onTrace }) {
  const c = useRef(null), dessin = useRef(false), vide = useRef(true)
  useEffect(() => {
    const cv = c.current, r = cv.getBoundingClientRect(), d = devicePixelRatio || 1
    cv.width = r.width * d; cv.height = r.height * d
    const x = cv.getContext('2d'); x.scale(d, d); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#1D2B24'
  }, [])
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
      <div className="bn-tete"><div><b>{s.nom}</b><span>{s.ligne}</span></div><div className="bn-num"><em>Bon d'achat espèces</em><b>N° {b.num}</b><span>{b.date}</span></div></div>
      <div className="bn-pour">Pour : <b>{b.pour}</b></div>
      <table className="bn-t"><thead><tr><th>Désignation</th><th>Qté</th><th>P.U.</th><th>Total</th></tr></thead>
        <tbody>{b.lignes.map((l, i) => <tr key={i}><td>{l.nom}</td><td>{l.qte}</td><td>{n(l.prix)}</td><td>{n(l.qte * l.prix)}</td></tr>)}</tbody></table>
      <div className="bn-tot"><span>Total payé en espèces</span><b>{n(total)} MAD</b></div>
      <div className="bn-let">Arrêté le présent bon à la somme de <i>{enLettres(total)} dirhams</i>.</div>
      <div className="bn-sigs">
        <div><em>Payé par</em><b>{b.payeur}</b></div>
        <div><em>Reçu par</em><b>{b.vendeur || '…'}</b>{signe ? <div className="bn-sig-img">{signe}</div> : children}</div>
      </div>
    </div>
  )
}

// Maquettes : 1 la saisie, 2 le bon à signer, 3 c'est fait
export function BonMaquette({ etape = '1' }) {
  const [trace, setTrace] = useState(false)
  const b = { societe: 'EPI', num: 'EPI-2026-0042', date: '16 nov. 2026', pour: 'Mariage Test · 19 nov.', payeur: 'Ouadia', vendeur: 'Hassan (souk Semmarine)',
    lignes: [{ nom: 'Citrons verts (kg)', qte: 12, prix: 18 }, { nom: 'Menthe fraîche (botte)', qte: 30, prix: 5 }, { nom: 'Glace pilée (sac 10 kg)', qte: 8, prix: 35 }] }
  const total = b.lignes.reduce((t, l) => t + num(l.qte) * num(l.prix), 0)
  if (etape === '1') return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran">
      <div className="head"><button className="back">‹ Dépôt</button><h1>Achat en espèces</h1></div>
      <div className="px">
        <div className="as-l">POUR</div>
        <div className="chips"><button className="chip on">Mariage Test</button><button className="chip">Dépôt (réassort)</button></div>
        <div className="as-l">PAYÉ PAR LA SOCIÉTÉ</div>
        <div className="chips"><button className="chip">Business Boys</button><button className="chip on">Epicure</button></div>
        <div className="as-l">VENDEUR</div>
        <div className="bn-in">Hassan (souk Semmarine)</div>
        <div className="as-l" style={{ display: 'flex', justifyContent: 'space-between' }}>CE QUI A ÉTÉ ACHETÉ<span className="bn-mic">🎙 dicter</span></div>
        <div className="list bn-l">{b.lignes.map((l, i) => <div key={i} className="row"><div className="x"><b>{l.nom}</b><span>{l.qte} × {n(l.prix)} MAD</span></div><b>{n(l.qte * l.prix)}</b></div>)}
          <div className="row bn-plus">+ Ajouter une ligne</div></div>
        <div className="bn-env"><span>Ton enveloppe espèces</span><b>1 250 → {n(1250 - total)} MAD</b></div>
        <button className="btn primary block" style={{ marginTop: 16 }}>Faire signer le bon · {n(total)} MAD</button>
      </div>
    </motion.div>
  )
  if (etape === '2') return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran">
      <div className="head"><button className="back">‹ Modifier</button><h1 style={{ fontSize: 30 }}>Faire signer</h1><div className="meta">Tends le téléphone au vendeur.</div></div>
      <div className="px">
        <Bon b={b}><Signature onTrace={setTrace} /></Bon>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={!trace}>Valider le bon signé</button>
      </div>
    </motion.div>
  )
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bn-ecran bn-fini">
      <div className="bn-ok">✓</div>
      <h1>Bon signé</h1>
      <div className="meta">N° {b.num} · {n(total)} MAD</div>
      <div className="list bn-l" style={{ marginTop: 22 }}>
        <div className="row"><div className="x"><b>Stock</b><span>3 articles entrés, réservés au Mariage Test</span></div><span className="bn-v">✓</span></div>
        <div className="row"><div className="x"><b>Ton enveloppe</b><span>1 250 → {n(1250 - total)} MAD</span></div><span className="bn-v">✓</span></div>
        <div className="row"><div className="x"><b>Drive</b><span>Mariage Test › Pièces fournisseurs</span></div><span className="bn-v">✓</span></div>
      </div>
      <div className="px" style={{ marginTop: 18 }}><button className="btn block">Voir le PDF</button></div>
    </motion.div>
  )
}
