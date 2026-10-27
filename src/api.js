import { createClient } from '@supabase/supabase-js'

const URL = 'https://daehifcdzrusxtzhtuxi.supabase.co'
const KEY = 'sb_publishable_UP5yav1CuZBbkT57KrHbAA_N-9_VYps'

const sb = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: 'orga' } })

const MESSAGES = {
  session_expiree: 'Session expirée, reconnectez-vous.',
  code_incorrect: 'Code incorrect.',
  lien_invalide: 'Ce lien n\'est plus valide.',
  manque_obligatoire: 'Notez ce qui manque.',
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
  planningListe: (evt) => rpc('planning_liste', { p_token: store.token, p_evt: evt }),
  planningEnregistrer: (evt, id, p) => rpc('planning_enregistrer', { p_token: store.token, p_evt: evt, p_id: id, p }),
  planningSupprimer: (id) => rpc('planning_supprimer', { p_token: store.token, p_id: id }),
  actionModifier: (id, p) => rpc('action_modifier', { p_token: store.token, p_id: id, p }),
  derouleModifier: (id, p) => rpc('deroule_modifier', { p_token: store.token, p_id: id, p }),
  evenementCreer: (p) => rpc('evenement_creer', { p_token: store.token, p }),
  evenementMaj: (evt, p) => rpc('evenement_maj', { p_token: store.token, p_evt: evt, p }),
  chiffrageContexte: (evt) => rpc('chiffrage_contexte', { p_token: store.token, p_evt: evt }),
  chiffrageEnregistrer: (evt, lignes, hyp, coef) => rpc('chiffrage_enregistrer', { p_token: store.token, p_evt: evt, p_lignes: lignes, p_hyp: hyp ?? '', p_coef: coef ?? null }),
  budgetRetenir: (evt, budget, zones, prix, coef) => rpc('budget_retenir', { p_token: store.token, p_evt: evt, p_budget: budget, p_zones: zones, p_prix: prix, p_coef: coef }),
  bullesListe: (evt) => rpc('bulles_liste', { p_token: store.token, p_evt: evt }),
  listeResponsable: (lien) => rpc('liste_responsable', { p_lien: lien }),
  respAction: (lien, id, statut, reponse) => rpc('resp_action', { p_lien: lien, p_id: id, p_statut: statut, p_reponse: reponse ?? null }),
  respReception: (lien, id, reception, manque) => rpc('resp_reception', { p_lien: lien, p_id: id, p_reception: reception, p_manque: manque ?? null }),
}
