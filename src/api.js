import { createClient } from '@supabase/supabase-js'

const URL = 'https://daehifcdzrusxtzhtuxi.supabase.co'
const KEY = 'sb_publishable_UP5yav1CuZBbkT57KrHbAA_N-9_VYps'

const sb = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'orga' } })

const MESSAGES = {
  session_expiree: 'Session expirée, reconnectez-vous.',
  code_incorrect: 'Code incorrect.',
  lien_invalide: 'Ce lien n\'est plus valide.',
  manque_obligatoire: 'Notez ce qui manque.',
  reserve_admin: 'Seuls Salmane, Hamza et Ghali peuvent supprimer un événement.',
  element_facture: 'Une facture est déjà rangée sur cet élément : retire-la d\'abord.',
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) {
    const key = Object.keys(MESSAGES).find(k => (error.message || '').includes(k))
    const e = new Error(key ? MESSAGES[key] : error.message)
    e.code = key || error.code
    throw e
  }
  return data
}

export const store = {
  get token() { try { return localStorage.getItem('orga_token') } catch { return null } },
  set token(v) { try { v ? localStorage.setItem('orga_token', v) : localStorage.removeItem('orga_token') } catch {} },
  get evt() { try { return localStorage.getItem('orga_evt') } catch { return null } },
  set evt(v) { try { localStorage.setItem('orga_evt', v) } catch {} },
}

export const api = {
  connexion: (nom, pin) => rpc('connexion', { p_nom: nom, p_pin: pin }),
  donnees: (evt) => rpc('donnees', { p_token: store.token, p_evt: evt || null }),
  majElement: (id, patch) => rpc('maj_element', { p_token: store.token, p_id: id, p: patch }),
  ajoutElement: (evt, zone, nom) => rpc('ajout_element', { p_token: store.token, p_evt: evt, p_zone: zone, p_nom: nom }),
  ajoutAction: (evt, el, quoi, resp, ech) => rpc('ajout_action', { p_token: store.token, p_evt: evt, p_element: el, p_quoi: quoi, p_resp: resp, p_echeance: ech || null }),
  majAction: (id, statut, reponse) => rpc('maj_action', { p_token: store.token, p_id: id, p_statut: statut, p_reponse: reponse ?? null }),
  ajoutNote: (evt, texte) => rpc('ajout_note', { p_token: store.token, p_evt: evt, p_texte: texte }),
  majNote: (id, statut) => rpc('maj_note', { p_token: store.token, p_id: id, p_statut: statut }),
  majInvites: (evt, n) => rpc('maj_invites', { p_token: store.token, p_evt: evt, p_n: n }),
  lienResponsable: (nom, evt) => rpc('lien_responsable', { p_token: store.token, p_nom: nom, p_evt: evt }),
  changerPin: (pin) => rpc('changer_pin', { p_token: store.token, p_pin: pin }),
  rangerNote: (id, statut, placement) => rpc('ranger_note', { p_token: store.token, p_id: id, p_statut: statut, p_placement: placement ?? null }),
  staffListe: () => rpc('staff_liste', { p_token: store.token }),
  staffFiche: (id) => rpc('staff_fiche', { p_token: store.token, p_id: id }),
  staffMaj: (id, p) => rpc('staff_maj', { p_token: store.token, p_id: id, p }),
  staffEvtListe: (evt) => rpc('staff_evt_liste', { p_token: store.token, p_evt: evt }),
  staffAffecter: (evt, staff, element, role, retirer) => rpc('staff_affecter', { p_token: store.token, p_evt: evt, p_staff: staff, p_element: element, p_role: role, p_retirer: !!retirer }),
  staffNoter: (evt, staff, note) => rpc('staff_noter', { p_token: store.token, p_evt: evt, p_staff: staff, p_note: note }),
  equipeListe: (evt) => rpc('equipe_liste', { p_token: store.token, p_evt: evt }),
  equipeMaj: (evt, role, nom, defaut) => rpc('equipe_maj', { p_token: store.token, p_evt: evt, p_role: role, p_nom: nom, p_defaut: !!defaut }),
  elementRespAuto: (id) => rpc('element_resp_auto', { p_token: store.token, p_id: id }),
  menuMaj: (evt, p) => rpc('menu_maj', { p_token: store.token, p_evt: evt, p }),
  menuFichier: async (nom, type, base64) => {
    const r = await fetch(`${URL}/functions/v1/orga-fichier`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ token: store.token, evt: store.evt, nom, type, base64 }) })
    const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Envoi impossible.'); return d
  },
  elementSupprimer: (id) => rpc('element_supprimer', { p_token: store.token, p_id: id }),
  cadrageMaj: (evt, p) => rpc('cadrage_maj', { p_token: store.token, p_evt: evt, p }),
  copilote: async (mode, extra = {}) => {
    const r = await fetch(`${URL}/functions/v1/orga-copilote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ token: store.token, evt: store.evt, mode, ...extra }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || 'Le copilote ne répond pas.')
    return d
  },
  zoho: async (mode, extra = {}) => {
    const r = await fetch(`${URL}/functions/v1/orga-zoho`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ token: store.token, evt: store.evt, mode, ...extra }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new Error(d.error || 'Zoho ne répond pas.')
    return d
  },
  pieceImputer: (id, element) => rpc('piece_imputer', { p_token: store.token, p_id: id, p_element: element }),
  suggestionsPieces: async (pieces) => {
    const r = await fetch(`${URL}/functions/v1/orga-imputer`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ token: store.token, evt: store.evt, pieces }) })
    const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Le copilote ne répond pas.'); return d
  },
  especesListe: (evt) => rpc('especes_liste', { p_token: store.token, p_evt: evt }),
  encaissementAjouter: (evt, montant, date, note, mode) => rpc('encaissement_ajouter', { p_token: store.token, p_evt: evt, p_montant: montant, p_date: date, p_note: note, p_mode: mode || 'Espèces' }),
  evenementConfirmer: (evt, prix, avance, mode, date) => rpc('evenement_confirmer', { p_token: store.token, p_evt: evt, p_prix: prix, p_avance: avance || 0, p_mode: mode, p_date: date }),
  accueil: () => rpc('accueil', { p_token: store.token }),
  elementRevoir: (id, p) => rpc('element_revoir', { p_token: store.token, p_id: id, p: p || {} }),
  catalogueListe: () => rpc('catalogue_liste', { p_token: store.token }),
  elementDepuisCatalogue: (evt, cat) => rpc('element_depuis_catalogue', { p_token: store.token, p_evt: evt, p_cat: cat }),
  catalogueCreer: (p, evt) => rpc('catalogue_creer', { p_token: store.token, p, p_evt: evt || null }),
  bilanListe: (evt) => rpc('bilan_liste', { p_token: store.token, p_evt: evt }),
  bilanMaj: (evt, p) => rpc('bilan_maj', { p_token: store.token, p_evt: evt, p }),
  leconDecider: (id, retenir, valeur) => rpc('lecon_decider', { p_token: store.token, p_id: id, p_retenir: retenir, p_valeur: valeur ?? null }),
  leconAnnuler: (id) => rpc('lecon_annuler', { p_token: store.token, p_id: id }),
  evenementCloturer: (evt, raison) => rpc('evenement_cloturer', { p_token: store.token, p_evt: evt, p_raison: raison || '' }),
  evenementStatut: (evt, statut) => rpc('evenement_statut', { p_token: store.token, p_evt: evt, p_statut: statut }),
  porteurAjouter: (nom) => rpc('porteur_ajouter', { p_token: store.token, p_nom: nom }),
  enveloppeRemettre: async (evt, nom, montant) => {
    const r = await fetch(`${URL}/functions/v1/orga-especes`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify({ token: store.token, evt, nom, montant }) })
    const d = await r.json().catch(() => ({})); if (!r.ok || d.error) throw new Error(d.error || 'Remise impossible.'); return d
  },
  planningListe: (evt) => rpc('planning_liste', { p_token: store.token, p_evt: evt }),
  planningEnregistrer: (evt, id, p) => rpc('planning_enregistrer', { p_token: store.token, p_evt: evt, p_id: id, p }),
  planningSupprimer: (id) => rpc('planning_supprimer', { p_token: store.token, p_id: id }),
  actionModifier: (id, p) => rpc('action_modifier', { p_token: store.token, p_id: id, p }),
  derouleModifier: (id, p) => rpc('deroule_modifier', { p_token: store.token, p_id: id, p }),
  evenementCreer: (p) => rpc('evenement_creer', { p_token: store.token, p }),
  evenementSupprimer: (evt) => rpc('evenement_supprimer', { p_token: store.token, p_evt: evt }),
  evenementMaj: (evt, p) => rpc('evenement_maj', { p_token: store.token, p_evt: evt, p }),
  chiffrageContexte: (evt) => rpc('chiffrage_contexte', { p_token: store.token, p_evt: evt }),
  chiffrageEnregistrer: (evt, lignes, hyp, coef) => rpc('chiffrage_enregistrer', { p_token: store.token, p_evt: evt, p_lignes: lignes, p_hyp: hyp ?? '', p_coef: coef ?? null }),
  budgetRetenir: (evt, budget, zones, prix, coef) => rpc('budget_retenir', { p_token: store.token, p_evt: evt, p_budget: budget, p_zones: zones, p_prix: prix, p_coef: coef }),
  bullesListe: (evt) => rpc('bulles_liste', { p_token: store.token, p_evt: evt }),
  listeResponsable: (lien) => rpc('liste_responsable', { p_lien: lien }),
  respAction: (lien, id, statut, reponse) => rpc('resp_action', { p_lien: lien, p_id: id, p_statut: statut, p_reponse: reponse ?? null }),
  respReception: (lien, id, reception, manque) => rpc('resp_reception', { p_lien: lien, p_id: id, p_reception: reception, p_manque: manque ?? null }),
}
