import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, useUI } from './ui'

/* Menu de l'événement : écrit à la main, et/ou PDF et photos rangés dans le Drive (Organisation) */
const lire = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = ko; r.readAsDataURL(f) })

export function Menu({ data, go, reload }) {
  const ui = useUI()
  const ev = data.evenements.find(x => x.id === data.evt) || {}
  const [menu, setMenu] = useState(ev.menu || {})
  const [texte, setTexte] = useState(ev.menu?.texte || '')
  const [envoi, setEnvoi] = useState(null)
  const [retire, setRetire] = useState(null)
  const fichier = useRef(null)
  const change = texte !== (menu.texte || '')

  async function enregistrer() {
    try { setMenu(await api.menuMaj(data.evt, { texte })); ui.toast('Menu enregistré'); reload?.() } catch (e) { ui.toast(e.message) }
  }
  async function ajouter(liste) {
    for (const f of [...liste]) {
      if (f.size > 15 * 1024 * 1024) { ui.toast(`${f.name} : 15 Mo au plus`); continue }
      setEnvoi(f.name)
      try { const d = await api.menuFichier(f.name, f.type, await lire(f)); setMenu(d.menu); ui.toast(`${f.name} rangé dans le Drive`) } catch (e) { ui.toast(e.message) }
    }
    setEnvoi(null); if (fichier.current) fichier.current.value = ''; reload?.()
  }
  async function retirer(id) {
    if (retire !== id) { setRetire(id); return }
    try { setMenu(await api.menuMaj(data.evt, { retirer: id })); reload?.() } catch (e) { ui.toast(e.message) }
    setRetire(null)
  }
  const fichiers = menu.fichiers || []
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('')}>‹ {ev.nom}</button><h1 style={{ fontSize: 36 }}>Menu</h1>
        <div className="meta">{ev.invites ? `${ev.invites} invités` : ''} <Info text="Écris le menu ou ajoute le PDF : il est rangé dans le dossier Drive de l'événement, sous Organisation. Le coût matière se règle dans la revue, famille Menu, avec une ligne par moment (accueil, cocktail, dîner, desserts, late snack)." /></div></div>
      <div className="px">
        <textarea className="mn-txt" rows={10} value={texte} placeholder={'Cocktail : …\nEntrée : …\nPlat : …\nDessert : …'} onChange={x => setTexte(x.target.value)} />
        {change && <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="btn primary block" style={{ marginTop: 10 }} onClick={enregistrer}>Enregistrer</motion.button>}
        <div className="mn-f">{fichiers.map(f => (
          <div key={f.id} className="mn-row">
            <a href={f.url} target="_blank" rel="noreferrer"><i>{/pdf/.test(f.type) ? 'PDF' : 'IMG'}</i><span>{f.nom}</span></a>
            <button className={retire === f.id ? 'on' : ''} onClick={() => retirer(f.id)} onBlur={() => setRetire(null)}>{retire === f.id ? 'Retirer' : '✕'}</button>
          </div>
        ))}</div>
        <button className="rv-add mn-up" disabled={!!envoi} onClick={() => fichier.current?.click()}>{envoi ? `Envoi de ${envoi}…` : '📎 Ajouter un PDF ou une photo'}</button>
        <input ref={fichier} type="file" accept="application/pdf,image/*" multiple hidden onChange={x => ajouter(x.target.files)} />
        <button className="lien-perdu" onClick={() => go(`revue/${data.zones.findIndex(z => z.nom === 'Menu')}`)}>Coût matière par moment ›</button>
      </div>
    </motion.div>
  )
}
