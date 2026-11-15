/* Hors connexion : on garde la dernière copie de ce qu'on a vu, et les petits changements
   (cocher, repousser, confier, coût, payé) attendent dans une file jusqu'au retour du réseau. */

const LECTURES = ['donnees', 'aujourdhui', 'accueil', 'historique', 'corbeille_liste', 'catalogue_liste']
const DIFFERABLES = { action_enregistrer: ['fait', 'quand', 'qui', 'cout', 'paye', 'heure'] }

const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d } catch { return d } }
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
const cle = (fn, args) => `orga_cache:${fn}:${JSON.stringify({ ...args, p_token: undefined })}`

// État partagé, lu par le bandeau
let etat = { enLigne: typeof navigator === 'undefined' ? true : navigator.onLine, attente: lire('orga_file', []).length, vuLe: null, envoi: false }
const abonnes = new Set()
const changer = p => { etat = { ...etat, ...p }; abonnes.forEach(f => f()) }
export const reseau = { get: () => etat, abonner: f => { abonnes.add(f); return () => abonnes.delete(f) } }

export const estCoupure = err => (typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|load failed|ERR_INTERNET|connexion/i.test(String(err?.message || err))

// Une lecture réussie est gardée ; une lecture sans réseau rend la dernière copie
// La copie est liée à la session qui l'a lue : sur un téléphone partagé, personne ne voit la copie d'un autre
const sceau = t => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) | 0; return h }
export function garder(fn, args, data) { if (LECTURES.includes(fn)) ecrire(cle(fn, args), { t: Date.now(), s: sceau(args?.p_token), data }); if (!etat.enLigne) changer({ enLigne: true }) }
const lireCopie = (fn, args) => { const c = LECTURES.includes(fn) ? lire(cle(fn, args), null) : null; return c && c.s === sceau(args?.p_token) ? c : null }
// Ouverture immédiate : la dernière copie s'affiche pendant que la version fraîche arrive (sans passer en « hors ligne »)
export function apercu(fn, args) { return lireCopie(fn, args)?.data ?? null }
export function copie(fn, args) {
  const c = lireCopie(fn, args)
  if (!c) return null
  changer({ enLigne: false, vuLe: c.t })
  return c.data
}

// Un petit changement sans réseau part dans la file, et la copie locale est mise à jour tout de suite
export function differer(fn, args) {
  const ok = DIFFERABLES[fn]
  if (!ok || !args.p_id || !args.p || Object.keys(args.p).some(k => !ok.includes(k))) return null
  const file = [...lire('orga_file', []), { fn, args, t: Date.now() }]
  ecrire('orga_file', file); changer({ enLigne: false, attente: file.length })
  const p = args.p, maj = a => a.id !== args.p_id ? a : { ...a,
    ...('fait' in p ? { statut: p.fait ? 'Fait' : 'À faire' } : {}), ...('quand' in p ? { echeance: p.quand } : {}), ...('qui' in p ? { resp: p.qui } : {}),
    ...('cout' in p ? { cout: p.cout } : {}), ...('paye' in p ? { paye: p.paye } : {}), ...('heure' in p ? { heure: p.heure } : {}) }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!/^orga_cache:(donnees|aujourdhui):/.test(k)) continue
      const c = lire(k, null); if (!c?.data?.actions) continue
      ecrire(k, { ...c, data: { ...c.data, actions: c.data.actions.map(maj) } })
    }
  } catch {}
  return { id: args.p_id, _differe: true }
}

// Au retour du réseau : on envoie la file dans l'ordre
export async function vider(envoyer) {
  let file = lire('orga_file', [])
  if (!file.length || etat.envoi) return 0
  changer({ envoi: true })
  let n = 0
  try {
    while (file.length) {
      try { await envoyer(file[0].fn, file[0].args) } catch (e) { if (estCoupure(e)) break }   // refus du serveur : on n'insiste pas
      file = file.slice(1); ecrire('orga_file', file); n++
      changer({ attente: file.length })
    }
  } finally { changer({ envoi: false, enLigne: !file.length || etat.enLigne }) }
  return n
}
