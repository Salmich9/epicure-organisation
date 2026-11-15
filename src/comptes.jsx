import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { api } from './api'
import { Info, Sheet, useUI } from './ui'
import { Av } from './postes'

/* Comptes de l'équipe : qui peut entrer, avec quel rôle. Le code n'est montré qu'une fois. */
const ROLES = [['equipe', 'Équipe', 'ses actions et ses enveloppes, sans prix de vente ni marge'], ['direction', 'Direction', 'tout, prix et marges compris']]

export function Comptes({ go }) {
  const ui = useUI()
  const [l, setL] = useState(null)
  const [nouv, setNouv] = useState(null)       // { nom, role }
  const [code, setCode] = useState(null)       // { nom, pin } montré une seule fois
  const [fiche, setFiche] = useState(null)
  const charger = () => api.comptesListe().then(setL).catch(e => ui.toast(e.message))
  useEffect(() => { charger() }, [])
  async function creer() {
    try { const r = await api.compteCreer(nouv.nom.trim(), nouv.role); setNouv(null); setCode({ nom: nouv.nom.trim(), pin: r.pin }); charger() } catch (e) { ui.toast(e.message) }
  }
  async function role(c, r) { try { await api.compteMaj(c.nom, { role: r }); setFiche(null); charger(); ui.toast(`${c.nom} : ${r === 'equipe' ? 'Équipe' : 'Direction'}`) } catch (e) { ui.toast(e.message) } }
  async function nouveauCode(c) { try { const r = await api.compteNouveauCode(c.nom); setFiche(null); setCode({ nom: c.nom, pin: r.pin }) } catch (e) { ui.toast(e.message) } }
  async function retirer(c) { try { await api.compteRetirer(c.nom); setFiche(null); charger(); ui.toast(`${c.nom} ne peut plus entrer`) } catch (e) { ui.toast(e.message) } }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="head"><button className="back" onClick={() => go('accueil')}>‹ Événements</button>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>Comptes<Info text="Chacun entre avec son prénom et son code à 6 chiffres. Équipe : voit et coche ses actions, ajoute des lignes et des actions, voit les montants de ses enveloppes ; jamais le prix de vente ni la marge." /></h1></div>
      {!l ? <div className="empty">Chargement…</div> : ROLES.map(([r, t]) => {
        const g = l.filter(c => c.role === r)
        return g.length > 0 && <div key={r}>
          <div className="group">{t} · {g.length}</div>
          <div className="list cp-l">{g.map(c => (
            <button key={c.nom} className="row" onClick={() => setFiche(c)}>
              <Av nom={c.nom} size={34} />
              <div className="x"><b>{c.nom}{c.admin ? ' · admin' : ''}</b><span>{c.vu_le ? `vu ${new Date(c.vu_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : 'jamais connecté'}</span></div>
              <span className="mute">›</span>
            </button>))}</div>
        </div>
      })}
      <div className="px"><motion.button whileTap={{ scale: .97 }} className="btn primary block" style={{ marginTop: 22 }} onClick={() => setNouv({ nom: '', role: 'equipe' })}>+ Ajouter quelqu'un</motion.button></div>

      <Sheet open={!!nouv} onClose={() => setNouv(null)} foot={<button className="btn primary" disabled={!nouv?.nom?.trim()} onClick={creer}>{nouv?.nom?.trim() ? `Créer le compte de ${nouv.nom.trim()}` : 'Il manque : prénom'}</button>}>
        <div className="el-name" style={{ fontSize: 26 }}>Nouveau compte</div>
        <div className="as-l">PRÉNOM</div>
        <input autoFocus value={nouv?.nom || ''} onChange={x => setNouv(v => ({ ...v, nom: x.target.value }))} placeholder="Salima, Amina, Ouadia…" />
        <div className="as-l">RÔLE</div>
        <div className="ee-menu" style={{ marginTop: 0 }}>{ROLES.map(([r, t, d]) => <button key={r} className={nouv?.role === r ? 'on' : ''} onClick={() => setNouv(v => ({ ...v, role: r }))}><span style={{ textAlign: 'left' }}><b style={{ display: 'block' }}>{t}</b><small className="mute">{d}</small></span><span>{nouv?.role === r ? '✓' : ''}</span></button>)}</div>
      </Sheet>

      <Sheet open={!!code} onClose={() => setCode(null)} foot={<button className="btn primary" onClick={() => setCode(null)}>C'est noté</button>}>
        <div className="el-name" style={{ fontSize: 26 }}>Code de {code?.nom}</div>
        <div className="cp-pin">{code?.pin?.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
        <p className="small mute" style={{ textAlign: 'center' }}>Donne-le de vive voix. Il ne sera plus affiché.</p>
      </Sheet>

      <Sheet open={!!fiche} onClose={() => setFiche(null)}>
        {fiche && <>
          <div className="el-name" style={{ fontSize: 26 }}>{fiche.nom}</div>
          <div className="as-l">RÔLE</div>
          <div className="chips">{ROLES.map(([r, t]) => <button key={r} className={`chip ${fiche.role === r ? 'on' : ''}`} onClick={() => fiche.role !== r && role(fiche, r)}>{t}</button>)}</div>
          <div className="ee-menu">
            <button onClick={() => nouveauCode(fiche)}>Nouveau code<span>›</span></button>
            {!fiche.admin && <button className="danger" onClick={() => retirer(fiche)}>Retirer l'accès</button>}
          </div>
        </>}
      </Sheet>
    </motion.div>
  )
}
