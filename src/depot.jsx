import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, ddmm, n, useUI } from './ui'

/* Le dépôt dans l'appli : stock (et tableau de bord en tête), fiche article, achat, bon de commande, inventaire, historique.
   Les prix et la valeur ne viennent que si la base les envoie (droit « prix », la direction). */
const qt = v => Number(n(v).toFixed(3)).toLocaleString('fr-FR')
const mad = v => Math.round(n(v)).toLocaleString('fr-FR')
const madk = v => (n(v) >= 10000 ? `${Math.round(n(v) / 1000).toLocaleString('fr-FR')} k` : mad(v))
const TYPES = { achat: ['Achat', '+'], prelevement: ['Sortie', '−'], retour: ['Retour', '+'], inventaire: ['Inventaire', '='], inventaire_initial: ['Inventaire', '='], ajustement: ['Écart inventaire', '±'], perte: ['Perte', '−'], correction: ['Correction', '±'], annulation: ['Annulé', '−'] }
const Photo = ({ a, size }) => a.photo ? <img src={a.photo} alt="" loading="lazy" style={size ? { width: size, height: size } : null} /> : <div className="ph" style={size ? { width: size, height: size } : null}>{(a.nom || '?')[0]}</div>

const vu = { stock: null }
const chargerStock = () => api.depotStock().then(s => (vu.stock = s))

export function Depot({ go, droits = [] }) {
  const ui = useUI()
  const [s, setS] = useState(vu.stock)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(null)
  const [alerte, setAlerte] = useState(false)
  const [achat, setAchat] = useState(null)
  const [act, setAct] = useState(null)
  useEffect(() => { chargerStock().then(setS).catch(e => ui.toast(e.message)); api.depotHistorique({ limite: 4 }).then(h => setAct(h.lignes)).catch(() => setAct([])) }, [])
  const cats = useMemo(() => s ? [...new Map(s.articles.map(a => [a.cat_id, { id: a.cat_id, nom: a.cat, o: a.cat_ordre }])).values()].sort((a, b) => a.o - b.o) : [], [s])
  if (!s) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const peut = d => droits.includes(d)
  const nAlerte = s.articles.filter(a => a.alerte).length, nCmd = s.articles.filter(a => n(a.a_commander) > 0).length
  const mot = q.trim().toLowerCase()
  const liste = s.articles.filter(a => (!cat || a.cat_id === cat) && (!alerte || a.alerte) && (!mot || a.nom.toLowerCase().includes(mot)))
  const groupes = cats.map(c => [c, liste.filter(a => a.cat_id === c.id)]).filter(([, l]) => l.length)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><h1>Dépôt</h1><div className="meta">{s.articles.length} articles</div></div>
      <div className="esp-k dp-k">
        {s.prix && <div><b>{madk(s.valeur)}</b>valeur du stock <Info text="Quantité × coût moyen d'achat de chaque article." /></div>}
        <button className={alerte ? 'on' : ''} onClick={() => setAlerte(!alerte)}><b className={nAlerte ? 'neg' : ''}>{nAlerte}</b>sous le seuil</button>
        <button onClick={() => go('depot/commande')}><b>{nCmd}</b>à commander ›</button>
        <button onClick={() => go('depot/inventaire')}><b>{s.inventaire ? ddmm(s.inventaire) : '—'}</b>dernier inventaire ›</button>
      </div>
      <div className="dp-act">
        {peut('acheter') && <button className="p" onClick={() => setAchat({})}>+ Achat</button>}
        <button onClick={() => go('depot/historique')}>Historique</button>
        {peut('gerer') && <button className="dp-ic" onClick={() => go('depot/reglages')} aria-label="Réglages du dépôt">⚙︎</button>}
      </div>

      <div className="px" style={{ marginTop: 14 }}>
        <input className="dp-q" placeholder="Chercher un article" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips dp-cats"><button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat(null)}>Tout</button>
          {cats.map(c => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(cat === c.id ? null : c.id)}>{c.nom}</button>)}</div>
      </div>
      {!liste.length && <div className="empty">Aucun article.</div>}
      {groupes.map(([c, l]) => <div key={c.id}>
        <div className="group">{c.nom}</div>
        <div className="list">{l.map(a => (
          <button key={a.id} className="row dp-a" onClick={() => go(`depot/article/${a.id}`)}>
            <Photo a={a} />
            <div className="x"><b>{a.nom}</b><span>{a.seuil != null ? `seuil ${qt(a.seuil)}` : a.nature === 'retournable' ? 'retournable' : ''}</span></div>
            <div className={`dp-n ${a.alerte ? 'neg' : ''}`}>{qt(a.qte)}<em>{a.unite}</em></div>
          </button>))}</div>
      </div>)}

      {act?.length > 0 && <>
        <div className="group">Derniers mouvements</div>
        <div className="list">{act.map(m => <Mvt key={m.id} m={m} avecArticle />)}</div>
        <button className="dp-plus" onClick={() => go('depot/historique')}>Tout l'historique ›</button>
      </>}
      <div style={{ height: 120 }} />
      <AchatSheet open={!!achat} init={achat} stock={s.articles} prix={s.prix} onClose={() => setAchat(null)} onFait={() => chargerStock().then(setS)} />
    </motion.div>
  )
}

function Mvt({ m, avecArticle }) {
  const [lib, sg] = TYPES[m.type] || [m.type, '']
  const neg = n(m.qte) < 0
  return (
    <div className="row dp-m">
      <div className="x"><b>{avecArticle ? m.article : lib}{m.evt ? <em> · {m.evt.trim()}</em> : m.fournisseur ? <em> · {m.fournisseur}</em> : null}</b>
        <span>{avecArticle ? `${lib} · ` : ''}{m.qui ? m.qui.split(' ')[0] : ''} · {ddmm(String(m.quand).slice(0, 10))}{m.note ? ` · ${m.note}` : ''}</span></div>
      <div className={`dp-d ${neg ? 'neg-s' : ''}`}>{m.type === 'inventaire' || m.type === 'inventaire_initial' ? '=' : neg ? '−' : '+'}{qt(Math.abs(n(m.qte)))}</div>
    </div>
  )
}

export function DepotArticle({ id, go, droits = [] }) {
  const ui = useUI()
  const [a, setA] = useState(null)
  const [achat, setAchat] = useState(null)
  const [edit, setEdit] = useState(null)
  const base = vu.stock?.articles.find(x => x.id === id)
  const charger = () => api.depotArticle(id).then(setA).catch(e => ui.toast(e.message))
  const [, maj] = useState(0)
  useEffect(() => { charger(); if (!vu.stock) chargerStock().then(() => maj(x => x + 1)).catch(() => {}) }, [id])
  const art = base || {}
  if (!base) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const prix = art.cout != null
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}>
      <div className="head"><button className="back" onClick={() => go('depot')}>‹ Dépôt</button></div>
      <div className="dp-fiche">
        <Photo a={art} size={92} />
        <div><div className="el-kicker">{art.cat}</div><h1 className="dp-t">{art.nom}</h1></div>
      </div>
      <div className="esp-k">
        <div className="main"><b className={art.alerte ? 'neg' : ''}>{qt(art.qte)} {art.unite}</b>en stock{art.seuil != null ? ` · seuil ${qt(art.seuil)}` : ''}</div>
        {prix && <><div><b>{mad(art.cout)}</b>coût moyen <Info text="Moyenne des prix d'achat, pondérée par les quantités." /></div>
          <div><b>{mad(art.valeur)}</b>valeur</div></>}
      </div>
      {(droits.includes('acheter') || droits.includes('gerer')) && <div className="dp-act">
        {droits.includes('acheter') && <button className="p" onClick={() => setAchat({ article: art })}>+ Achat</button>}
        {droits.includes('gerer') && <button onClick={() => setEdit(art)}>Modifier</button>}</div>}
      <div className="group">Mouvements</div>
      {!a ? <div className="empty">Chargement…</div> : !a.mouvements.length ? <div className="empty">Aucun mouvement.</div>
        : <div className="list">{a.mouvements.map(m => <Mvt key={m.id} m={m} />)}</div>}
      {a?.achats?.length > 0 && <>
        <div className="group">Achats</div>
        <div className="list">{a.achats.map(x => <div key={x.id} className={`row dp-m ${x.annule ? 'dp-annule' : ''}`}><div className="x"><b>{qt(x.qte)} {art.unite}{x.fournisseur ? <em> · {x.fournisseur}</em> : ''}</b><span>{ddmm(x.date)}{x.annule ? ' · annulé' : ''}</span></div>{x.prix != null && <div className="dp-d">{mad(x.prix)}<em> /u</em></div>}</div>)}</div>
      </>}
      <div style={{ height: 120 }} />
      <AchatSheet open={!!achat} init={achat} stock={vu.stock?.articles || [art]} prix={prix} onClose={() => setAchat(null)} onFait={() => { charger(); chargerStock() }} />
      <ArticleSheet a={edit} onClose={() => setEdit(null)} onFait={archive => chargerStock().then(() => { maj(x => x + 1); if (archive) go('depot') })} />
    </motion.div>
  )
}

// Un achat au dépôt : l'article (cherché), le fournisseur, la quantité, le prix payé
function AchatSheet({ open, init, stock, onClose, onFait }) {
  const ui = useUI()
  const [f, setF] = useState({})
  const [refs, setRefs] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) { setF({ article: init?.article || null, q: '', qte: '', prix: '', four: null, fq: '' }); if (!refs) api.depotReferentiels().then(setRefs).catch(() => {}) } }, [open])
  const mot = (f.q || '').trim().toLowerCase(), fm = (f.fq || '').trim().toLowerCase()
  const trouves = mot.length >= 2 ? stock.filter(a => a.nom.toLowerCase().includes(mot)).slice(0, 6) : []
  const fours = (refs?.fournisseurs || []).filter(x => !fm || x.nom.toLowerCase().includes(fm)).slice(0, 8)
  const total = n(f.qte) * n(f.prix), pret = f.article && n(f.qte) > 0 && f.prix !== ''
  async function enregistrer() {
    setBusy(true)
    try {
      await api.depotAchat({ article_id: f.article.id, qte: n(f.qte), prix: n(f.prix), fournisseur_id: f.four?.id || null, note: !f.four && f.fq.trim() ? `Fournisseur : ${f.fq.trim()}` : null })
      ui.toast(`${qt(f.qte)} ${f.article.unite || ''} ${f.article.nom} au dépôt`); onFait?.(); onClose()
    } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  return (
    <Sheet open={open} onClose={onClose} foot={<button className="btn primary" disabled={!pret || busy} onClick={enregistrer}>{busy ? '…' : pret ? `Enregistrer · ${mad(total)} MAD` : 'Article, quantité et prix'}</button>}>
      <div className="el-kicker">Achat au dépôt</div>
      <div className="el-name" style={{ fontSize: 26 }}>{f.article?.nom || 'Quel article ?'}</div>
      {!f.article ? <>
        <input autoFocus className="bn-in" style={{ width: '100%', font: 'inherit', marginTop: 10 }} placeholder="Chercher dans le dépôt" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        <div className="list bn-l" style={{ marginTop: 8 }}>{trouves.map(a => <button key={a.id} className="row" onClick={() => setF({ ...f, article: a })}><div className="x"><b>{a.nom}</b><span>{qt(a.qte)} {a.unite} en stock</span></div></button>)}</div>
      </> : <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
          <label><div className="as-l">QUANTITÉ ({f.article.unite})</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="decimal" value={f.qte} onChange={e => setF({ ...f, qte: e.target.value.replace(',', '.') })} /></label>
          <label><div className="as-l">PRIX UNITAIRE (MAD)</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="decimal" value={f.prix} onChange={e => setF({ ...f, prix: e.target.value.replace(',', '.') })} /></label>
        </div>
        <div className="as-l">FOURNISSEUR</div>
        {f.four ? <div className="chips"><button className="chip on" onClick={() => setF({ ...f, four: null })}>{f.four.nom} ✕</button></div> : <>
          <input className="bn-in" style={{ width: '100%', font: 'inherit' }} placeholder="Chercher ou taper un nom" value={f.fq} onChange={e => setF({ ...f, fq: e.target.value })} />
          <div className="chips" style={{ marginTop: 8 }}>{fours.map(x => <button key={x.id} className="chip" onClick={() => setF({ ...f, four: x })}>{x.nom}</button>)}</div>
        </>}
        {!init?.article && <div className="ee-menu"><button onClick={() => setF({ ...f, article: null })}>Changer d'article<span>›</span></button></div>}
      </>}
    </Sheet>
  )
}

// Bon de commande : ce qui est sous son seuil, la quantité pour revenir au seuil, à partager
export function DepotCommande({ go }) {
  const ui = useUI()
  const [s, setS] = useState(vu.stock)
  const [qte, setQte] = useState({})
  useEffect(() => { chargerStock().then(setS).catch(e => ui.toast(e.message)) }, [])
  if (!s) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const l = s.articles.filter(a => n(a.a_commander) > 0)
  const q = a => qte[a.id] ?? a.a_commander
  const est = l.reduce((t, a) => t + n(q(a)) * n(a.dernier_prix), 0)
  const texte = `Commande dépôt Epicure · ${new Date().toLocaleDateString('fr-FR')}\n` + l.filter(a => n(q(a)) > 0).map(a => `• ${a.nom} : ${qt(q(a))} ${a.unite || ''}`).join('\n')
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('depot')}>‹ Dépôt</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>À commander<Info text="Les articles sous leur seuil, avec la quantité pour y revenir. Tu peux changer chaque quantité avant de partager." /></h1>
        {s.prix && l.length > 0 && <div className="meta">≈ {mad(est)} MAD au dernier prix payé</div>}</div>
      {!l.length ? <div className="empty" style={{ paddingTop: 40 }}>Rien à commander aujourd'hui.</div> : <>
        <div className="list" style={{ marginTop: 18 }}>{l.map(a => (
          <div key={a.id} className="row dp-a"><Photo a={a} />
            <div className="x"><b>{a.nom}</b><span>{qt(a.qte)} en stock · seuil {qt(a.seuil)}</span></div>
            <div className="dp-st"><button onClick={() => setQte({ ...qte, [a.id]: Math.max(0, n(q(a)) - 1) })}>−</button><b>{qt(q(a))}</b><button onClick={() => setQte({ ...qte, [a.id]: n(q(a)) + 1 })}>+</button></div>
          </div>))}</div>
        <div className="px" style={{ marginTop: 16 }}>
          <a className="btn primary block" href={`https://wa.me/?text=${encodeURIComponent(texte)}`} target="_blank" rel="noreferrer">Partager sur WhatsApp</a>
        </div>
      </>}
    </motion.div>
  )
}

// Inventaires : la liste, puis le comptage article par article (l'écart se voit tout de suite)
export function DepotInventaires({ go, droits = [] }) {
  const ui = useUI()
  const [l, setL] = useState(null)
  const [nouv, setNouv] = useState(null)
  useEffect(() => { api.depotInventaires().then(setL).catch(e => ui.toast(e.message)) }, [])
  async function creer() {
    try { const r = await api.depotInventaireCreer(nouv.libelle.trim(), nouv.date); go(`depot/inventaire/${r.id}`) } catch (e) { ui.toast(e.message) }
  }
  if (!l) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('depot')}>‹ Dépôt</button><h1>Inventaires</h1></div>
      {droits.includes('inventaire') && <div className="dp-act"><button className="p" onClick={() => setNouv({ libelle: `Inventaire ${new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`, date: new Date().toLocaleDateString('sv') })}>+ Nouvel inventaire</button></div>}
      <div className="list" style={{ marginTop: 14 }}>{l.map(i => (
        <button key={i.id} className="row dp-m" onClick={() => go(`depot/inventaire/${i.id}`)}>
          <div className="x"><b>{i.libelle.trim()}{i.statut === 'brouillon' && <span className="pend">EN COURS</span>}</b><span>{ddmm(i.date)} · {i.lignes} articles · {(i.responsable || i.par || '').split(' ')[0]}</span></div>
          {i.valeur != null && <div className="dp-d">{madk(i.valeur)}</div>}
        </button>))}</div>
      <Sheet open={!!nouv} onClose={() => setNouv(null)} foot={<button className="btn primary" disabled={!nouv?.libelle?.trim()} onClick={creer}>Commencer le comptage</button>}>
        {nouv && <><div className="el-name" style={{ fontSize: 26 }}>Nouvel inventaire</div>
          <div className="as-l">NOM</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} value={nouv.libelle} onChange={e => setNouv({ ...nouv, libelle: e.target.value })} />
          <div className="as-l">DATE</div><input type="date" className="bn-in" style={{ width: '100%', font: 'inherit' }} value={nouv.date} onChange={e => setNouv({ ...nouv, date: e.target.value })} /></>}
      </Sheet>
    </motion.div>
  )
}

export function DepotInventaire({ id, go, droits = [] }) {
  const ui = useUI()
  const [inv, setInv] = useState(null)
  const [q, setQ] = useState('')
  const [reste, setReste] = useState(false)
  const [fin, setFin] = useState(null)
  const [stk, setStk] = useState(vu.stock)
  useEffect(() => { api.depotInventaire(id).then(setInv).catch(e => ui.toast(e.message)); chargerStock().then(setStk).catch(() => {}) }, [id])
  if (!inv || !stk) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const ouvert = inv.statut === 'brouillon' && droits.includes('inventaire')
  const lignes = stk.articles.map(a => ({ article_id: a.id, nom: a.nom, unite: a.unite, stock: a.qte, compte: inv.comptes[a.id] ?? null }))
  const comptes = lignes.filter(x => x.compte != null).length
  const ecarts = lignes.filter(x => x.compte != null && n(x.compte) !== n(x.stock))
  const mot = q.trim().toLowerCase()
  const vues = lignes.filter(x => (!mot || x.nom.toLowerCase().includes(mot)) && (!reste || x.compte == null))
  function compter(x, v) {
    const val = v === '' ? null : n(String(v).replace(',', '.'))
    setInv(i => ({ ...i, comptes: { ...i.comptes, [x.article_id]: val } }))
    if (val != null) api.depotInventaireCompter(id, x.article_id, val).catch(e => ui.toast(e.message))
  }
  async function valider() {
    try { await api.depotInventaireValider(id, fin.trim()); ui.toast('Inventaire validé : le stock est remis aux quantités comptées'); go('depot/inventaire') } catch (e) { ui.toast(e.message) }
  }
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('depot/inventaire')}>‹ Inventaires</button>
        <h1 style={{ fontSize: 32 }}>{inv.libelle.trim()}</h1>
        <div className="meta">{ddmm(inv.date)} · {inv.statut === 'brouillon' ? 'en cours' : 'validé'}</div></div>
      <div className="dp-prog"><div><b>{comptes}</b> / {lignes.length} comptés</div><div className={ecarts.length ? 'neg' : ''}><b>{ecarts.length}</b> écart{ecarts.length > 1 ? 's' : ''}</div><i style={{ width: `${(comptes / Math.max(1, lignes.length)) * 100}%` }} /></div>
      <div className="px" style={{ marginTop: 12 }}>
        <input className="dp-q" placeholder="Chercher un article" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips dp-cats"><button className={`chip ${!reste ? 'on' : ''}`} onClick={() => setReste(false)}>Tout</button><button className={`chip ${reste ? 'on' : ''}`} onClick={() => setReste(true)}>Pas encore compté</button></div>
      </div>
      <div className="list" style={{ marginTop: 10 }}>{vues.map(x => {
        const e = x.compte != null ? n(x.compte) - n(x.stock) : null
        return (
          <div key={x.article_id} className="row dp-a dp-inv">
            <div className="x"><b>{x.nom}</b><span>attendu {qt(x.stock)} {x.unite}{e ? <em className={e < 0 ? 'neg-s' : 'pos'}> · {e > 0 ? '+' : '−'}{qt(Math.abs(e))}</em> : e === 0 ? <em className="pos"> · juste</em> : null}</span></div>
            {ouvert ? <input inputMode="decimal" placeholder="—" defaultValue={x.compte ?? ''} onBlur={ev => compter(x, ev.target.value)} />
              : <div className="dp-d">{x.compte != null ? qt(x.compte) : '—'}</div>}
          </div>)
      })}</div>
      {ouvert && <div className="px" style={{ marginTop: 16 }}><button className="btn primary block" disabled={!comptes} onClick={() => setFin('')}>Valider l'inventaire</button></div>}
      <div style={{ height: 120 }} />
      <Sheet open={fin != null} onClose={() => setFin(null)} foot={<button className="btn primary" disabled={!fin?.trim()} onClick={valider}>Signer et valider</button>}>
        <div className="el-name" style={{ fontSize: 26 }}>Valider l'inventaire</div>
        <div className="el-sub">{comptes} articles comptés · {ecarts.length} écart{ecarts.length > 1 ? 's' : ''}{lignes.length - comptes ? ` · ${lignes.length - comptes} pas comptés (gardent leur stock)` : ''}</div>
        <div className="as-l">RESPONSABLE DU COMPTAGE</div><input autoFocus className="bn-in" style={{ width: '100%', font: 'inherit' }} placeholder="Prénom Nom" value={fin || ''} onChange={e => setFin(e.target.value)} />
      </Sheet>
    </motion.div>
  )
}

// Historique : tous les mouvements du dépôt, filtrables
const FILTRES = [['', 'Tout'], ['achat', 'Achats'], ['prelevement', 'Sorties'], ['retour', 'Retours'], ['inventaire', 'Inventaires']]
export function DepotHistorique({ go }) {
  const ui = useUI()
  const [t, setT] = useState('')
  const [q, setQ] = useState('')
  const [h, setH] = useState(null)
  useEffect(() => { setH(null); api.depotHistorique({ type: t || null, q: q.trim() || null, limite: 80 }).then(setH).catch(e => ui.toast(e.message)) }, [t, q])
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('depot')}>‹ Dépôt</button><h1>Historique</h1></div>
      <div className="px" style={{ marginTop: 12 }}>
        <input className="dp-q" placeholder="Article, fournisseur, événement" value={q} onChange={e => setQ(e.target.value)} />
        <div className="chips dp-cats">{FILTRES.map(([k, l]) => <button key={k} className={`chip ${t === k ? 'on' : ''}`} onClick={() => setT(k)}>{l}</button>)}</div>
      </div>
      {!h ? <div className="empty">Chargement…</div> : !h.lignes.length ? <div className="empty">Rien trouvé.</div>
        : <div className="list" style={{ marginTop: 10 }}>{h.lignes.map(m => <Mvt key={m.id} m={m} avecArticle />)}</div>}
      <div style={{ height: 120 }} />
    </motion.div>
  )
}

// Un article : créer ou modifier (nom, catégorie, unité, type, seuil d'alerte), l'archiver
export function ArticleSheet({ a, onClose, onFait }) {
  const ui = useUI()
  const [f, setF] = useState({})
  const [refs, setRefs] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (a) { setF({ nom: a.nom || '', cat_id: a.cat_id || null, unite_id: a.unite_id || null, unite: a.unite, nature: a.nature || 'consommable', seuil: a.seuil ?? '' }); if (!refs) api.depotReferentiels().then(setRefs).catch(() => {}) } }, [a])
  const unite = f.unite_id || refs?.unites.find(u => u.abr === f.unite || u.nom === f.unite)?.id
  const pret = f.nom?.trim() && f.cat_id && unite
  async function envoyer(champs, msg) {
    setBusy(true)
    try { await api.depotArticleMaj(a.id || null, champs); ui.toast(msg); onFait?.(champs.actif === false); onClose() } catch (e) { ui.toast(e.message) }
    setBusy(false)
  }
  const enregistrer = () => envoyer({ nom: f.nom.trim(), cat_id: f.cat_id, unite_id: unite, nature: f.nature, seuil: f.seuil === '' ? null : n(f.seuil) }, a.id ? 'Article modifié' : 'Article créé')
  return (
    <Sheet open={!!a} onClose={onClose} foot={<button className="btn primary" disabled={!pret || busy} onClick={enregistrer}>{a?.id ? 'Enregistrer' : 'Créer l\'article'}</button>}>
      {a && <>
        <div className="el-kicker">{a.id ? 'Modifier l\'article' : 'Nouvel article'}</div>
        <input className="bn-in dp-nom" placeholder="Nom de l'article" value={f.nom} onChange={e => setF({ ...f, nom: e.target.value })} />
        <div className="as-l">CATÉGORIE</div><div className="chips">{refs?.categories.map(c => <button key={c.id} className={`chip ${f.cat_id === c.id ? 'on' : ''}`} onClick={() => setF({ ...f, cat_id: c.id })}>{c.nom}</button>)}</div>
        <div className="as-l">UNITÉ</div><div className="chips">{refs?.unites.map(u => <button key={u.id} className={`chip ${unite === u.id ? 'on' : ''}`} onClick={() => setF({ ...f, unite_id: u.id })}>{u.nom}</button>)}</div>
        <div className="as-l" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>TYPE<Info text="Retournable : revient du terrain (verres, matériel). Consommable : part et ne revient pas." /></div>
        <div className="chips">{[['consommable', 'Consommable'], ['retournable', 'Retournable']].map(([k, l]) => <button key={k} className={`chip ${f.nature === k ? 'on' : ''}`} onClick={() => setF({ ...f, nature: k })}>{l}</button>)}</div>
        <div className="as-l" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>SEUIL D'ALERTE<Info text="En dessous, l'article passe en rouge et entre dans « À commander ». Vide : pas d'alerte." /></div>
        <input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="decimal" placeholder="Pas d'alerte" value={f.seuil} onChange={e => setF({ ...f, seuil: e.target.value.replace(',', '.') })} />
        {a.id && <div className="ee-menu"><button className="danger" disabled={busy} onClick={() => envoyer({ actif: false }, 'Article archivé')}>Archiver l'article<span>›</span></button></div>}
      </>}
    </Sheet>
  )
}

// Réglages du dépôt (droit « gérer ») : catégories, unités, fournisseurs, motifs d'écart, articles archivés
const LISTES = [['categorie', 'Catégories'], ['unite', 'Unités'], ['fournisseur', 'Fournisseurs'], ['motif', 'Motifs d\'écart'], ['archive', 'Archivés']]
export function DepotReglages({ go }) {
  const ui = useUI()
  const [r, setR] = useState(null)
  const [t, setT] = useState('categorie')
  const [ed, setEd] = useState(null)
  const [neuf, setNeuf] = useState(null)
  const charger = () => api.depotReglages().then(setR).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  if (!r) return <div className="empty" style={{ paddingTop: 80 }}>Chargement…</div>
  const L = { categorie: r.categories, unite: r.unites, fournisseur: r.fournisseurs, motif: r.motifs, archive: r.archives }[t]
  async function envoyer(champs, msg) {
    try { await api.depotReglageMaj(ed.type, ed.id || null, champs); ui.toast(msg); setEd(null); charger() } catch (e) { ui.toast(e.message) }
  }
  async function deplacer(x, sens) {
    const l = [...r.categories], i = l.findIndex(c => c.id === x.id), j = i + sens; if (j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]]; setR({ ...r, categories: l })
    try { await api.depotReglageMaj('categorie', null, { ordre: l.map(c => c.id) }) } catch (e) { ui.toast(e.message); charger() }
  }
  const sous = x => t === 'categorie' ? `${x.n} article${x.n > 1 ? 's' : ''}` : t === 'unite' ? x.abr : t === 'fournisseur' ? [x.tel, x.note].filter(Boolean).join(' · ') : t === 'motif' ? (x.perte ? 'perte' : 'sortie normale') : x.cat
  return (
    <motion.div initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('depot')}>‹ Dépôt</button><h1>Réglages</h1></div>
      <div className="dp-act"><button className="p" onClick={() => setNeuf({})}>+ Nouvel article</button></div>
      <div className="px" style={{ marginTop: 14 }}><div className="chips dp-cats">{LISTES.map(([k, l]) => <button key={k} className={`chip ${t === k ? 'on' : ''}`} onClick={() => setT(k)}>{l}</button>)}</div></div>
      <div className="list" style={{ marginTop: 10 }}>
        {L.map((x, i) => (
          <div key={x.id} className="row dp-m">
            <button className="x" style={{ textAlign: 'left' }} onClick={() => t === 'archive' ? null : setEd({ type: t, ...x })}><b>{x.nom}</b><span>{sous(x)}</span></button>
            {t === 'categorie' && <div className="dp-st"><button disabled={!i} onClick={() => deplacer(x, -1)}>↑</button><button disabled={i === L.length - 1} onClick={() => deplacer(x, 1)}>↓</button></div>}
            {t === 'archive' && <button className="chip" onClick={() => api.depotArticleMaj(x.id, { actif: true }).then(() => { ui.toast(`${x.nom} remis au dépôt`); charger(); chargerStock() }).catch(e => ui.toast(e.message))}>Remettre</button>}
          </div>))}
        {t !== 'archive' && <button className="row bn-plus" onClick={() => setEd({ type: t, nom: '' })}>+ Ajouter</button>}
        {t === 'archive' && !L.length && <div className="empty">Aucun article archivé.</div>}
      </div>
      <div style={{ height: 120 }} />
      <Sheet open={!!ed} onClose={() => setEd(null)} foot={ed && <button className="btn primary" disabled={!ed.nom?.trim() || (ed.type === 'unite' && !ed.abr?.trim())}
          onClick={() => envoyer({ nom: ed.nom.trim(), abr: ed.abr?.trim(), tel: ed.tel?.trim(), note: ed.note?.trim(), perte: ed.perte }, ed.id ? 'Modifié' : 'Ajouté')}>{ed.id ? 'Enregistrer' : 'Ajouter'}</button>}>
        {ed && <>
          <div className="el-kicker">{LISTES.find(x => x[0] === ed.type)[1]}</div>
          <input autoFocus className="bn-in dp-nom" placeholder="Nom" value={ed.nom} onChange={e => setEd({ ...ed, nom: e.target.value })} />
          {ed.type === 'unite' && <><div className="as-l">ABRÉVIATION</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} placeholder="btl" value={ed.abr || ''} onChange={e => setEd({ ...ed, abr: e.target.value })} /></>}
          {ed.type === 'fournisseur' && <><div className="as-l">TÉLÉPHONE</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} inputMode="tel" placeholder="06…" value={ed.tel || ''} onChange={e => setEd({ ...ed, tel: e.target.value })} />
            <div className="as-l">NOTE</div><input className="bn-in" style={{ width: '100%', font: 'inherit' }} placeholder="Livre le mardi" value={ed.note || ''} onChange={e => setEd({ ...ed, note: e.target.value })} /></>}
          {ed.type === 'motif' && <><div className="as-l" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>COMPTE COMME<Info text="Une perte compte dans les écarts du mois. Une sortie normale (ex : consommée) non." /></div>
            <div className="chips">{[[true, 'Perte'], [false, 'Sortie normale']].map(([k, l]) => <button key={l} className={`chip ${!!ed.perte === k ? 'on' : ''}`} onClick={() => setEd({ ...ed, perte: k })}>{l}</button>)}</div></>}
          {ed.id && <div className="ee-menu"><button className="danger" onClick={() => envoyer({ actif: false }, 'Retiré')}>Retirer<span>›</span></button></div>}
        </>}
      </Sheet>
      <ArticleSheet a={neuf} onClose={() => setNeuf(null)} onFait={() => { charger(); chargerStock() }} />
    </motion.div>
  )
}
