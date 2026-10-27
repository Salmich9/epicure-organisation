import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { ETATS, Info, MODES, Sheet, ddmm, mad, n, useUI } from './ui'

const PERIMETRES = [['À notre charge', 'Nous'], ['En partie', 'En partie'], ['Tiers', 'Un tiers'], ['Pas besoin', 'Pas besoin'], ['À clarifier', '?']]

/* Choix dans une longue liste (fournisseur, tiers, responsable) */
export function Picker({ open, onClose, title, items, value, onPick }) {
  const [q, setQ] = useState('')
  const list = items.filter(x => x.toLowerCase().includes(q.toLowerCase()))
  return (
    <Sheet open={open} onClose={onClose} z={1}>
      <div className="el-name" style={{ fontSize: 26 }}>{title}</div>
      <input placeholder="Rechercher ou écrire" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '14px 0' }} />
      <div className="list" style={{ margin: 0 }}>
        {value && <button className="row" onClick={() => { onPick(''); onClose() }}><span className="mute">Retirer « {value} »</span></button>}
        {list.map(x => <button key={x} className="row" onClick={() => { onPick(x); onClose() }}><span className="name" style={{ fontWeight: x === value ? 800 : 500 }}>{x}</span></button>)}
        {q && !items.includes(q) && <button className="row" onClick={() => { onPick(q); onClose() }}>Utiliser « {q} »</button>}
      </div>
    </Sheet>
  )
}

/* Articles du dépôt */
function words(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2) }
export function DepotPicker({ open, onClose, depot, reserve, element, onPick, linked }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const key = words(element)
    let l = depot.map(a => {
      const w = words(a.nom); let sc = 0
      key.forEach(k => w.forEach(x => { if (x === k) sc += 2; else if (x.startsWith(k) || k.startsWith(x)) sc += 1 }))
      return { a, sc }
    })
    if (q) { const qq = words(q); l = l.filter(x => { const w = words(x.a.nom + ' ' + x.a.cat).join(' '); return qq.every(k => w.includes(k)) }) }
    return l.sort((x, y) => y.sc - x.sc || n(y.a.qte) - n(x.a.qte)).slice(0, 50)
  }, [depot, element, q])
  return (
    <Sheet open={open} onClose={onClose} z={1}>
      <div className="el-name" style={{ fontSize: 26 }}>Dépôt Epicure</div>
      <input placeholder="Rechercher (ex : assiette 27)" value={q} onChange={e => setQ(e.target.value)} style={{ margin: '14px 0' }} />
      <div className="list" style={{ margin: 0 }}>
        {!depot.length && <div className="empty">Le dépôt n'est pas joignable pour l'instant.</div>}
        {list.map(({ a }) => {
          const res = n(reserve[a.id])
          return (
            <button key={a.id} className="art" onClick={() => { onPick(a); onClose() }}>
              {a.photo ? <img src={a.photo} alt="" loading="lazy" /> : <div className="ph" />}
              <div style={{ flex: 1 }}><div style={{ fontWeight: 650 }}>{a.nom}</div><div className="small mute">{a.cat}{res ? ` · ${res} prévus ailleurs` : ''}</div></div>
              <div className="q">{n(a.qte)}</div>
            </button>
          )
        })}
      </div>
      {linked && <button className="btn block" style={{ marginTop: 12 }} onClick={() => { onPick(null); onClose() }}>Délier l'article</button>}
    </Sheet>
  )
}

/* Fiche d'un élément */
export function ElementSheet({ el, data, onClose, onSaved }) {
  const ui = useUI()
  const [e, setE] = useState(el)
  const [chg, setChg] = useState({})
  const [mode, setMode] = useState('location')
  const [picker, setPicker] = useState(null)
  const [suivi, setSuivi] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forcer, setForcer] = useState(false)
  useEffect(() => {
    setE(el); setChg({}); setSuivi(false)
    if (el) setMode(MODES.find(m => n(el[m.k]) > 0)?.k || (el.article_id ? 'stock' : 'location'))
  }, [el?.id])
  if (!el) return <Sheet open={false} onClose={onClose} />

  const set = (k, v) => { setE(x => ({ ...x, [k]: v })); setChg(c => ({ ...c, [k]: v })) }
  const besoin = e.qte_forcee !== null && e.qte_forcee !== undefined && e.qte_forcee !== '' ? n(e.qte_forcee) : (e.qte_calc === null ? null : n(e.qte_calc))
  const couvert = MODES.reduce((s, m) => s + n(e[m.k]), 0)
  const reste = besoin === null ? null : besoin - couvert
  const cout = MODES.reduce((s, m) => s + (m.p ? n(e[m.k]) * n(e[m.p]) : 0), 0)
  const tiers = ['Tiers', 'Pas besoin'].includes(e.perimetre)
  const L = data.listes || {}
  const noms = data.intervenants.map(i => i.nom)
  const equipe = data.intervenants.filter(i => i.type === 'Équipe').map(i => i.nom)
  const art = e.article_id ? data.depot.find(a => a.id === e.article_id) : null
  const dispoNet = art ? n(art.qte) - n(data.reserve[art.id]) : null
  const m = MODES.find(x => x.k === mode)
  const setQ = v => set(mode, v === '' ? null : Math.max(0, Number(v) || 0))

  async function save(close = true) {
    if (['Partiel', 'Non reçu'].includes(e.reception) && !e.manque) { ui.bubble('Réception incomplète : notez ce qui manque avant de valider.'); setSuivi(true); return null }
    if (!Object.keys(chg).length) { if (close) onClose(); return el }
    setBusy(true)
    try {
      const fresh = await api.majElement(e.id, chg)
      onSaved(fresh); setChg({}); ui.toast('Enregistré')
      if (close) onClose()
      return fresh
    } catch (err) { ui.toast(err.message); return null } finally { setBusy(false) }
  }
  async function delegate() {
    const resp = e.resp
    if (!resp) { setPicker('resp'); ui.bubble('Choisissez d\'abord qui s\'en occupe.'); return }
    const fresh = await save(false); if (!fresh) return
    const quoi = e.prochaine || `S'occuper de : ${e.element}`
    try {
      const a = await api.ajoutAction(data.evt, e.id, quoi, resp, e.echeance)
      onSaved(fresh, a); onClose()
      sendWa(data, a)
    } catch (err) { ui.toast(err.message) }
  }

  const etat = ETATS[e.etat] || { l: e.etat, c: '' }
  return (
    <>
      <Sheet open onClose={() => save(true)}
        foot={<><button className="btn" onClick={delegate}>Déléguer{e.resp ? ` à ${e.resp}` : ''}</button><button className="btn primary" disabled={busy} onClick={() => save(true)}>{busy ? '…' : 'Valider'}</button></>}>
        <div className="el-kicker">{e.zone}{e.sous_zone ? ` · ${e.sous_zone}` : ''}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div className="el-name">{e.element}</div>
          <span className={`pill ${etat.c}`} style={{ marginTop: 12 }}>{etat.l}</span>
        </div>
        {(e.description || e.moments) && <div className="el-sub">{[e.moments, e.description].filter(Boolean).join(' · ')}</div>}

        <div className="label">Qui s'en charge ?</div>
        <div className="chips">{PERIMETRES.map(([v, l]) => <button key={v} className={`chip ${e.perimetre === v ? 'on' : ''}`} onClick={() => set('perimetre', v)}>{l}</button>)}</div>
        {e.perimetre === 'Tiers' && <button className="chip" style={{ marginTop: 10 }} onClick={() => setPicker('tiers')}>{e.fourni_par ? `Fourni par ${e.fourni_par}` : 'Choisir qui le fournit'}</button>}

        {!tiers && <>
          <div className="need">
            {forcer
              ? <input autoFocus inputMode="numeric" defaultValue={e.qte_forcee ?? besoin ?? ''} style={{ width: 130, fontFamily: 'var(--display)', fontSize: 44, padding: '2px 10px' }}
                  onBlur={ev => { const v = ev.target.value.trim(); set('qte_forcee', v === '' || Number(v) === n(e.qte_calc) ? null : Number(v)); setForcer(false) }}
                  onKeyDown={ev => ev.key === 'Enter' && ev.target.blur()} />
              : <b onClick={() => setForcer(true)}>{besoin ?? '?'}</b>}
            <span>à couvrir{e.qte_forcee !== null && e.qte_forcee !== undefined && e.qte_forcee !== '' ? ' ✎' : ''} <Info text="Calculé depuis les invités et la marge de la zone. Touchez le chiffre pour le forcer : votre valeur ne sera jamais écrasée." /></span>
          </div>
          <div className="bigbar">{MODES.map(x => n(e[x.k]) > 0 && <i key={x.k} style={{ width: `${Math.min(100, (n(e[x.k]) / (besoin || couvert || 1)) * 100)}%`, background: x.c }} />)}</div>
          <div className="barleg">
            <span>{MODES.filter(x => n(e[x.k]) > 0).map(x => `${n(e[x.k])} ${x.l.toLowerCase()}`).join(' · ') || 'Rien de réparti'}</span>
            {reste === null ? <b>quantité ?</b> : reste > 0 ? <b>{reste} restent</b> : reste < 0 ? <b>+{-reste} en trop</b> : <b className="ok">Bouclé</b>}
          </div>

          <div className="modes">
            {MODES.map(x => (
              <motion.button whileTap={{ scale: .95 }} key={x.k} className={`mode ${mode === x.k ? 'on' : ''}`} onClick={() => setMode(x.k)}>
                <b>{n(e[x.k])}</b><span><i className="dot" style={{ background: x.c }} />{x.l}</span>
              </motion.button>
            ))}
          </div>
          <div className="stepper">
            <motion.button whileTap={{ scale: .9 }} className="pm" onClick={() => setQ(n(e[mode]) - 1)}>−</motion.button>
            <input inputMode="numeric" value={e[mode] ?? ''} placeholder="0" onChange={ev => setQ(ev.target.value)} />
            <motion.button whileTap={{ scale: .9 }} className="pm" onClick={() => setQ(n(e[mode]) + 1)}>+</motion.button>
          </div>
          <div className="quick">
            {reste > 0 && <button className="chip" onClick={() => setQ(n(e[mode]) + reste)}>+ les {reste} restants</button>}
            {n(e[mode]) > 0 && <button className="chip ghost" onClick={() => setQ(0)}>Remettre à 0</button>}
          </div>
          {m.p && <div className="price">Prix unitaire <input inputMode="decimal" value={e[m.p] ?? ''} placeholder="—" onChange={ev => set(m.p, ev.target.value === '' ? null : Number(ev.target.value.replace(',', '.')))} /> MAD
            <button className={`chip ${e.statut_prix === 'Confirmé' ? 'on' : 'ghost'}`} style={{ padding: '6px 10px' }} onClick={() => set('statut_prix', e.statut_prix === 'Confirmé' ? 'Estimé' : 'Confirmé')}>{e.statut_prix === 'Confirmé' ? 'confirmé' : 'estimé'}</button></div>}
          {cout > 0 && <div className="price" style={{ marginTop: 6 }}>Coût engagé <b style={{ color: 'var(--ink)' }}>{mad(cout)} MAD</b></div>}
          {(() => { const fs = (data.factures || []).filter(f => f.element_id === e.id); const t = fs.reduce((s, f) => s + n(f.montant), 0); return fs.length > 0 && <>
            <div className="price" style={{ marginTop: 6 }}>Facturé <b style={{ color: cout && t > cout * 1.05 ? 'var(--red)' : 'var(--ink)' }}>{mad(t)} MAD</b>{cout > 0 && ` · ${t > cout ? '+' : ''}${Math.round((t / cout - 1) * 100)} % sur l'engagé`}</div>
            <div className="chips" style={{ marginTop: 8 }}>{fs.map(f => f.lien ? <a key={f.id} className="chip" href={f.lien} target="_blank" rel="noreferrer">📎 {f.fournisseur || 'Pièce'} · {mad(f.montant)}</a> : <span key={f.id} className="chip ghost">{f.fournisseur || 'Pièce'} · {mad(f.montant)}</span>)}</div>
          </> })()}

          {(mode === 'stock' || art) && (
            <button className={`depot ${art && n(e.stock) > dispoNet ? 'bad' : ''}`} onClick={() => setPicker('depot')}>
              {art?.photo ? <img src={art.photo} alt="" /> : <div className="ph" />}
              <p>{art ? art.nom : 'Lier un article du dépôt'}<span>{art ? (n(data.reserve[art.id]) ? `${n(data.reserve[art.id])} prévus sur un autre événement` : 'Rien de prévu ailleurs') : `${data.depot.length} articles disponibles`}{art && n(e.stock) > dispoNet ? ` · il n'en reste que ${Math.max(0, dispoNet)}` : ''}</span></p>
              {art && <div className="q">{n(art.qte)}</div>}
            </button>
          )}
        </>}

        <div className="fold">
          <button onClick={() => setSuivi(s => !s)} style={{ textAlign: 'left' }}><span><span style={{ display: 'block' }}>Suivi et délégation</span><span className="mute small" style={{ fontWeight: 500 }}>{[e.resp, e.echeance && `avant le ${ddmm(e.echeance)}`, e.engagement].filter(Boolean).join(' · ') || 'Personne n\'est désigné'}</span></span><span className="mute">{suivi ? '▴' : '▾'}</span></button>
          {suivi && <div className="in">
            <div className="field"><span>Qui s'en occupe</span><div className="chips">{equipe.map(x => <button key={x} className={`chip ${e.resp === x ? 'on' : ''}`} onClick={() => set('resp', x)}>{x}</button>)}<button className="chip ghost" onClick={() => setPicker('resp')}>Autre…</button></div></div>
            <div className="field"><span>Prochaine action</span><input value={e.prochaine || ''} onChange={ev => set('prochaine', ev.target.value)} placeholder="ex : relancer le fournisseur" /></div>
            <div className="field"><span>Pour quand</span><input type="date" value={e.echeance || ''} onChange={ev => set('echeance', ev.target.value || null)} /></div>
            {!tiers && <>
              <div className="field"><span>Fournisseur</span><button className="chip" onClick={() => setPicker('fournisseur')}>{e.fournisseur || 'Choisir'}</button></div>
              <div className="field"><span>Modèle</span><div className="chips">{(L['Choix'] || []).map(v => <button key={v} className={`chip ${e.choix === v ? 'on' : ''}`} onClick={() => set('choix', v)}>{v}</button>)}</div></div>
              <div className="field"><span>Disponibilité</span><div className="chips">{(L['Disponibilité'] || []).map(v => <button key={v} className={`chip ${e.dispo === v ? 'on' : ''}`} onClick={() => set('dispo', v)}>{v}</button>)}</div></div>
              <div className="field"><span>Engagement</span><div className="chips">{(L['Engagement'] || []).map(v => <button key={v} className={`chip ${e.engagement === v ? 'on' : ''}`} onClick={() => set('engagement', v)}>{v}</button>)}</div></div>
              <div className="field"><span>Livraison prévue</span><input type="date" value={e.livraison || ''} onChange={ev => set('livraison', ev.target.value || null)} /></div>
              <div className="field"><span>Réception</span><div className="chips">{['Reçu', 'Partiel', 'Non reçu'].map(v => <button key={v} className={`chip ${e.reception === v ? 'on' : ''}`} onClick={() => set('reception', e.reception === v ? null : v)}>{v}</button>)}</div></div>
              {['Partiel', 'Non reçu'].includes(e.reception) && <div className="field"><span>Ce qui manque</span><input value={e.manque || ''} onChange={ev => set('manque', ev.target.value)} placeholder="ex : 40 tasses" /></div>}
            </>}
            <div className="field"><span>Note</span><textarea rows={2} value={e.note || ''} onChange={ev => set('note', ev.target.value)} /></div>
            {e.piece && <div className="field"><a className="chip" href={e.piece} target="_blank" rel="noreferrer">Voir la pièce</a></div>}
          </div>}
        </div>
      </Sheet>

      <Picker open={picker === 'fournisseur'} onClose={() => setPicker(null)} title="Fournisseur" items={noms} value={e.fournisseur} onPick={v => set('fournisseur', v || null)} />
      <Picker open={picker === 'tiers'} onClose={() => setPicker(null)} title="Fourni par" items={noms} value={e.fourni_par} onPick={v => set('fourni_par', v || null)} />
      <Picker open={picker === 'resp'} onClose={() => setPicker(null)} title="Qui s'en occupe" items={noms} value={e.resp} onPick={v => set('resp', v || null)} />
      <DepotPicker open={picker === 'depot'} onClose={() => setPicker(null)} depot={data.depot} reserve={data.reserve} element={e.element} linked={!!art}
        onPick={a => {
          if (!a) { set('article_id', null); set('article_nom', null); return }
          set('article_id', a.id); set('article_nom', a.nom)
          if (!n(e.stock) && besoin) {
            const net = Math.max(0, n(a.qte) - n(data.reserve[a.id]))
            const manque = besoin - n(e.achat) - n(e.location) - n(e.production)
            const q = Math.max(0, Math.min(net, manque)); if (q) set('stock', q)
          }
          setMode('stock')
        }} />
    </>
  )
}

export function waMessage(data, a) {
  const ev = data.evenements.find(x => x.id === data.evt)
  return `Salam ${a.resp}, pour ${ev?.nom || 'l\'événement'} : ${a.quoi}${a.echeance ? `. À faire avant le ${ddmm(a.echeance)}` : ''}. Merci de me confirmer 🙏`
}
export function sendWa(data, a, text) {
  const tel = data.intervenants.find(i => i.nom === a.resp)?.tel
  window.open(`https://wa.me/${tel || ''}?text=${encodeURIComponent(text || waMessage(data, a))}`, '_blank')
}
