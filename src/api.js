import { PostgrestClient } from '@supabase/postgrest-js'
import { apercu, copie, differer, estCoupure, garder, vider } from './reseau'
import { MESSAGES, traduire } from './erreurs'

const URL = 'https://daehifcdzrusxtzhtuxi.supabase.co'
const KEY = 'sb_publishable_UP5yav1CuZBbkT57KrHbAA_N-9_VYps'

// L'appli n'appelle que des fonctions de la base : le client léger suffit (pas de connexion Supabase, de stockage ni de temps réel)
const sb = new PostgrestClient(`${URL}/rest/v1`, { schema: 'orga', headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })


async function brut(fn, args) {
  let r
  try { r = await sb.rpc(fn, args) } catch (e) { r = { error: e } }
  const { data, error } = r
  if (error) {
    if (estCoupure(error)) { const e = new Error('Pas de réseau : ce changement n\'est pas parti, refais-le quand le réseau revient.'); e.code = 'hors_ligne'; throw e }
    // Code exact renvoyé par la base → phrase lisible ; le texte d'origine part au journal
    const t = traduire(error)
    const e = new Error(t.texte)
    e.code = t.code; e.brut = t.brut
    throw e
  }
  return data
}
// Journal des erreurs : les pannes (pas les refus normaux) partent vers orga.journal, sans jamais bloquer l'écran
const dejaNote = new Map()
export function noter(source, message, detail) {
  try {
    const cle = source + '|' + message, t = Date.now()
    if (!store.token || t - (dejaNote.get(cle) || 0) < 60000) return
    dejaNote.set(cle, t)
    sb.rpc('journal_ecrire', { p_token: store.token, p_source: String(source).slice(0, 60), p_message: String(message || '?').slice(0, 300),
      p_detail: { ...(detail || {}), ecran: location.hash.slice(0, 80), version: import.meta.env?.VITE_VERSION || null } }).then(() => {}, () => {})
  } catch {}
}
const LECTURE = /^(donnees|aujourdhui|accueil|historique|corbeille_liste|catalogue_liste|.*_liste|bulles.*)$/
async function rpc(fn, args) {
  try { const data = await brut(fn, args); garder(fn, args, data); return data }
  catch (e) {
    if (e.code !== 'hors_ligne') { if (!(e.code in MESSAGES) && fn !== 'journal_ecrire') noter(`rpc:${fn}`, e.brut || e.message, { code: e.code }); throw e }
    const c = copie(fn, args); if (c !== null) return c
    const d = differer(fn, args); if (d) return d
    if (LECTURE.test(fn)) { const l = new Error('Pas de réseau, et cet écran n\'a pas encore été ouvert sur ce téléphone.'); l.code = 'hors_ligne'; throw l }
    throw e
  }
}
// Retour du réseau : la file d'attente part toute seule
export const synchroniser = () => vider(brut)
if (typeof window !== 'undefined') { addEventListener('online', synchroniser); setInterval(synchroniser, 30000) }

// Appel d'une fonction de l'appli (copilote, Zoho, Drive…) : une panne serveur ou réseau est notée au journal
async function fonction(nom, body, defaut) {
  let r
  try { r = await fetch(`${URL}/functions/v1/${nom}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: JSON.stringify(body) }) }
  catch (e) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('Pas de réseau.')
    noter(nom, 'injoignable', { erreur: String(e?.message || e) }); throw new Error(defaut)
  }
  const d = await r.json().catch(() => ({}))
  if (r.status >= 500) noter(nom, d.error || `erreur ${r.status}`, { statut: r.status })
  if (!r.ok || d.error) throw new Error(d.error || defaut)
  return d
}

export const store = {
  get token() { try { return localStorage.getItem('orga_token') } catch { return null } },
  set token(v) {
    try {
      if (v) localStorage.setItem('orga_token', v)
      else { // déconnexion : on efface aussi les copies gardées sur ce téléphone
        localStorage.removeItem('orga_token')
        Object.keys(localStorage).filter(k => k.startsWith('orga_cache:')).forEach(k => localStorage.removeItem(k))
      }
    } catch {}
  },
  get evt() { try { return localStorage.getItem('orga_evt') } catch { return null } },
  set evt(v) { try { localStorage.setItem('orga_evt', v) } catch {} },
}

// Dernière version gardée sur le téléphone, pour afficher un écran tout de suite (null si rien)
export const vite = {
  donnees: (evt) => apercu('donnees', { p_token: store.token, p_evt: evt || null }),
  accueil: () => apercu('accueil', { p_token: store.token }),
  aujourdhui: () => apercu('aujourdhui', { p_token: store.token }),
}

export const api = {
  connexion: async (nom, pin) => {
    const r = await rpc('connexion', { p_nom: nom, p_pin: pin })
    if (r?.erreur) { const e = new Error(MESSAGES[r.erreur] || r.erreur); e.code = r.erreur; throw e }
    return r
  },
  deconnexion: () => rpc('deconnexion', { p_token: store.token }),
  sessionVoix: () => rpc('session_voix', { p_token: store.token }),
  sessionVoixFin: (t) => rpc('session_voix_fin', { p_token: t }),
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
  menuFichier: (nom, type, base64) => fonction('orga-fichier', { token: store.token, evt: store.evt, nom, type, base64 }, 'Envoi impossible.'),
  elementSupprimer: (id) => rpc('element_supprimer', { p_token: store.token, p_id: id }),
  cadrageMaj: (evt, p) => rpc('cadrage_maj', { p_token: store.token, p_evt: evt, p }),
  cadrageContexte: (evt) => rpc('cadrage_contexte', { p_token: store.token, p_evt: evt }),
  partsAssocies: (annee) => rpc('parts_associes', { p_token: store.token, p_annee: annee ?? null }),
  partsEvtMaj: (evt, p) => rpc('parts_evt_maj', { p_token: store.token, p_evt: evt, p }),
  partsVerser: (p) => rpc('parts_verser', { p_token: store.token, p }),
  lieuxConnus: () => rpc('lieux_connus', { p_token: store.token }),
  cadrageIA: (questions, repris) => fonction('orga-cadrage-ia', { token: store.token, evt: store.evt, questions, repris }, 'L\'IA ne répond pas.'),
  copilote: (mode, extra = {}) => fonction('orga-copilote', { token: store.token, evt: store.evt, mode, ...extra }, 'Le copilote ne répond pas.'),
  zoho: (mode, extra = {}) => fonction('orga-zoho', { token: store.token, evt: store.evt, mode, ...extra }, 'Zoho ne répond pas.'),
  pieceImputer: (id, element) => rpc('piece_imputer', { p_token: store.token, p_id: id, p_element: element }),
  suggestionsPieces: (pieces) => fonction('orga-imputer', { token: store.token, evt: store.evt, pieces }, 'Le copilote ne répond pas.'),
  especesListe: (evt) => rpc('especes_liste', { p_token: store.token, p_evt: evt }),
  encaissementAjouter: (evt, montant, date, note, mode) => rpc('encaissement_ajouter', { p_token: store.token, p_evt: evt, p_montant: montant, p_date: date, p_note: note, p_mode: mode || 'Espèces' }),
  evenementConfirmer: (evt, prix, avance, mode, date) => rpc('evenement_confirmer', { p_token: store.token, p_evt: evt, p_prix: prix, p_avance: avance || 0, p_mode: mode, p_date: date }),
  accueil: () => rpc('accueil', { p_token: store.token }),
  aujourdhui: () => rpc('aujourdhui', { p_token: store.token }),
  posteMaj: (evt, cle, p) => rpc('poste_maj', { p_token: store.token, p_evt: evt, p_cle: cle, p }),
  ligneAjouter: (evt, p) => rpc('ligne_ajouter', { p_token: store.token, p_evt: evt, p }),
  actionEnregistrer: (evt, id, p) => rpc('action_enregistrer', { p_token: store.token, p_evt: evt, p_id: id || null, p }),
  actionSupprimer: (id) => rpc('action_supprimer', { p_token: store.token, p_id: id }),
  objetSupprimer: (type, id, evt) => rpc('objet_supprimer', { p_token: store.token, p_type: type, p_id: id, p_evt: evt || null }),
  objetRestaurer: (cid) => rpc('objet_restaurer', { p_token: store.token, p_corbeille: cid }),
  corbeilleListe: (evt) => rpc('corbeille_liste', { p_token: store.token, p_evt: evt || null }),
  historique: (evt) => rpc('historique', { p_token: store.token, p_evt: evt }),
  comptesListe: () => rpc('comptes_liste', { p_token: store.token }),
  compteCreer: (nom, role) => rpc('compte_creer', { p_token: store.token, p_nom: nom, p_role: role }),
  compteMaj: (nom, p) => rpc('compte_maj', { p_token: store.token, p_nom: nom, p }),
  compteNouveauCode: (nom) => rpc('compte_nouveau_code', { p_token: store.token, p_nom: nom }),
  compteRetirer: (nom) => rpc('compte_retirer', { p_token: store.token, p_nom: nom }),
  actionMerci: (id) => rpc('action_merci', { p_token: store.token, p_id: id }),
  maJournee: () => rpc('ma_journee', { p_token: store.token }),
  ligneTerrain: (id, p) => rpc('ligne_terrain', { p_token: store.token, p_id: id, p }),
  brief: (evt) => rpc('brief', { p_token: store.token, p_evt: evt }),
  filListe: (type, id) => rpc('fil_liste', { p_token: store.token, p_type: type, p_id: id }),
  filAjouter: (type, id, texte, photo) => rpc('fil_ajouter', { p_token: store.token, p_type: type, p_id: id, p_texte: texte || null, p_photo: photo || null }),
  pourToi: () => rpc('pour_toi', { p_token: store.token }),
  pourToiVu: () => rpc('pour_toi_vu', { p_token: store.token }),
  relais: (evt, de, a, mot, actions, postes) => rpc('relais', { p_token: store.token, p_evt: evt, p_de: de, p_a: a, p_mot: mot || null, p_actions: actions || null, p_postes: postes || null }),
  objetDupliquer: (type, id) => rpc('objet_dupliquer', { p_token: store.token, p_type: type, p_id: id }),
  ligneDeplacer: (id, poste) => rpc('ligne_deplacer', { p_token: store.token, p_id: id, p_poste: poste }),
  posteCreer: (evt, nom, type) => rpc('poste_creer', { p_token: store.token, p_evt: evt, p_nom: nom, p_type: type || 'achat' }),
  dicter: (texte, poste, cible, evt) => fonction('orga-dicter', { token: store.token, evt: evt || store.evt, texte, poste, cible }, 'Dictée non comprise.'),
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
  enveloppeRemettre: (evt, nom, montant) => fonction('orga-especes', { token: store.token, evt, nom, montant }, 'Remise impossible.'),
  // Dépôt (stock d'epicure-app) : le pont, selon les droits de chacun
  depotStock: () => rpc('depot_stock', { p_token: store.token }),
  depotArticle: (id) => rpc('depot_article', { p_token: store.token, p_id: id }),
  depotReferentiels: () => rpc('depot_referentiels', { p_token: store.token }),
  depotAchat: (p) => rpc('depot_achat', { p_token: store.token, p }),
  depotAchatAnnuler: (id, motif) => rpc('depot_achat_annuler', { p_token: store.token, p_id: id, p_motif: motif }),
  depotInventaires: () => rpc('depot_inventaires', { p_token: store.token }),
  depotInventaireCreer: (libelle, date) => rpc('depot_inventaire_creer', { p_token: store.token, p_libelle: libelle, p_date: date }),
  depotInventaire: (id) => rpc('depot_inventaire', { p_token: store.token, p_id: id }),
  depotInventaireCompter: (id, article, qte) => rpc('depot_inventaire_compter', { p_token: store.token, p_id: id, p_article: article, p_qte: qte }),
  depotReglages: () => rpc('depot_reglages', { p_token: store.token }),
  depotReglageMaj: (type, id, p) => rpc('depot_reglage_maj', { p_token: store.token, p_type: type, p_id: id, p }),
  depotArticleMaj: (id, p) => rpc('depot_article_maj', { p_token: store.token, p_id: id, p }),
  depotTransfert: (p) => rpc('depot_transfert', { p_token: store.token, p }),
  depotPieces: () => rpc('depot_pieces', { p_token: store.token }),
  depotPieceMaj: (id, p) => rpc('depot_piece_maj', { p_token: store.token, p_id: id, p }),
  depotPieceValider: (id, refuser = false) => rpc('depot_piece_valider', { p_token: store.token, p_id: id, p_refuser: refuser }),
  depotHistorique: (p) => rpc('depot_historique', { p_token: store.token, p }),
  depotInventaireValider: (id, responsable) => rpc('depot_inventaire_valider', { p_token: store.token, p_id: id, p_responsable: responsable }),
  bonContexte: (evt) => rpc('bon_contexte', { p_token: store.token, p_evt: evt || null }),
  bonCreer: (p) => rpc('bon_creer', { p_token: store.token, p }),
  depotPhoto: async (id, blob) => {
    const b = new Uint8Array(await blob.arrayBuffer()); let t = ''; for (let i = 0; i < b.length; i += 8192) t += String.fromCharCode(...b.subarray(i, i + 8192))
    return fonction('orga-photo', { token: store.token, id, type: blob.type, data: btoa(t) }, 'La photo n\'a pas pu être envoyée.')
  },
  bonPdf: (id) => fonction('orga-bon', { token: store.token, id }, 'Le bon n\'a pas pu être rangé dans Drive.'),
  depotListe: () => rpc('depot_liste', { p_token: store.token }),
  santeEtat: () => rpc('sante_etat', { p_token: store.token }),
  santeVerifier: () => fonction('orga-sante', { token: store.token }, 'Le contrôle n\'a pas pu se faire.'),
  planningListe: (evt) => rpc('planning_liste', { p_token: store.token, p_evt: evt }),
  planningEnregistrer: (evt, id, p) => rpc('planning_enregistrer', { p_token: store.token, p_evt: evt, p_id: id, p }),
  budgetValider: (evt, resp) => rpc('budget_valider', { p_token: store.token, p_evt: evt, p_resp: resp }),
  enveloppesEvt: (evt) => rpc('enveloppes_evt', { p_token: store.token, p_evt: evt }),
  monEnveloppe: (evt) => rpc('mon_enveloppe', { p_token: store.token, p_evt: evt }),
  mesEnveloppes: () => rpc('mes_enveloppes', { p_token: store.token }),
  pieceVerifier: (id) => rpc('piece_verifier', { p_token: store.token, p_id: id }),
  pieceSignaler: (id, raison) => rpc('piece_signaler', { p_token: store.token, p_id: id, p_raison: raison || null }),
  especesEvt: (evt) => rpc('especes_evt', { p_token: store.token, p_evt: evt }),
  especesLancer: (evt, lignes) => rpc('especes_lancer', { p_token: store.token, p_evt: evt, p_lignes: lignes }),
  especesPreparer: (id, fournisseur) => rpc('especes_preparer', { p_token: store.token, p_id: id, p_fournisseur: fournisseur }),
  especesValider: (id, ok, raison) => rpc('especes_valider', { p_token: store.token, p_id: id, p_ok: ok, p_raison: raison || null }),
  especesRecu: (id, montant) => rpc('especes_recu', { p_token: store.token, p_id: id, p_montant: montant }),
  especesRemettre: (id, dest, montant) => rpc('especes_remettre', { p_token: store.token, p_id: id, p_dest: dest, p_montant: montant }),
  especesConfirmer: (mvt, ok) => rpc('especes_confirmer', { p_token: store.token, p_mvt: mvt, p_ok: ok }),
  especesEcartRegler: (id) => rpc('especes_ecart_regler', { p_token: store.token, p_id: id }),
  mesEspeces: () => rpc('mes_especes', { p_token: store.token }),
  especesRelaisVoir: (id) => rpc('especes_relais_voir', { p_token: store.token, p_id: id }),
  especesReglages: (p = null) => rpc('especes_reglages', { p_token: store.token, p }),
  devisVersions: (evt) => rpc('devis_versions_liste', { p_token: store.token, p_evt: evt }),
  devisEnvoyer: (evt, p) => rpc('devis_envoyer', { p_token: store.token, p_evt: evt, p }),
  chiffrageQuestions: () => rpc('chiffrage_questions_liste', { p_token: store.token }),
  chiffrageQuestionMaj: (cle, p) => rpc('chiffrage_question_maj', { p_token: store.token, p_cle: cle, p }),
  chiffragePosteRegler: (cle, p) => rpc('chiffrage_poste_regler', { p_token: store.token, p_cle: cle, p }),
  chiffragePosteCreer: (p) => rpc('chiffrage_poste_creer', { p_token: store.token, p }),
  chiffrageDevisReglages: (p) => rpc('chiffrage_devis_reglages', { p_token: store.token, p }),
  challengeReglages: (p = null) => rpc('challenge_reglages', { p_token: store.token, p }),
  notifsReglages: (p = null) => rpc('notifs_reglages', { p_token: store.token, p }),
  mesRappels: () => rpc('mes_rappels', { p_token: store.token }),
  rappelsEvenement: (evt) => rpc('rappels_evenement', { p_token: store.token, p_evt: evt }),
  pushAbonner: (p) => rpc('push_abonner', { p_token: store.token, p }),
  pushDesabonner: (endpoint) => rpc('push_desabonner', { p_token: store.token, p_endpoint: endpoint }),
  notifs: (action) => fonction('orga-notifs', { token: store.token, action }, 'Les notifications ne répondent pas.'),
  planningSupprimer: (id) =>rpc('planning_supprimer', { p_token: store.token, p_id: id }),
  actionModifier: (id, p) => rpc('action_modifier', { p_token: store.token, p_id: id, p }),
  derouleModifier: (id, p) => rpc('deroule_modifier', { p_token: store.token, p_id: id, p }),
  evenementCreer: (p) => rpc('evenement_creer', { p_token: store.token, p }),
  evenementSupprimer: (evt) => rpc('evenement_supprimer', { p_token: store.token, p_evt: evt }),
  evenementMaj: (evt, p) => rpc('evenement_maj', { p_token: store.token, p_evt: evt, p }),
  chiffrageContexte: (evt) => rpc('chiffrage_contexte', { p_token: store.token, p_evt: evt }),
  chiffrageEnregistrer: (evt, lignes, hyp, coef) => rpc('chiffrage_enregistrer', { p_token: store.token, p_evt: evt, p_lignes: lignes, p_hyp: hyp ?? '', p_coef: coef ?? null }),
  chiffrageApercu: (evt, base) => rpc('chiffrage_apercu', { p_token: store.token, p_evt: evt, p_base: base }),
  chiffrageValider: (evt, lignes, base, hyp, journal) => rpc('chiffrage_valider', { p_token: store.token, p_evt: evt, p_lignes: lignes, p_base: base, p_hyp: hyp ?? null, p_journal: journal }),
  chiffrageNoter: (evt, journal) => rpc('chiffrage_noter', { p_token: store.token, p_evt: evt, p_journal: journal }),
  chiffrageJournal: (evt) => rpc('chiffrage_journal_liste', { p_token: store.token, p_evt: evt }),
  chiffrageCalculer: (evt, base) => rpc('chiffrage_calculer', { p_token: store.token, p_evt: evt, p_base: base ?? null }),
  chiffrageParams: () => rpc('chiffrage_params', { p_token: store.token }),
  chiffrageParamMaj: (cle, p) => rpc('chiffrage_param_maj', { p_token: store.token, p_cle: cle, p }),
  chiffrageSurcharger: (evt, cle, p, reference) => rpc('chiffrage_surcharger', { p_token: store.token, p_evt: evt, p_cle: cle, p, p_reference: !!reference }),
  chiffragePersonne: (evt, cle, rang, p) => rpc('chiffrage_personne', { p_token: store.token, p_evt: evt, p_cle: cle, p_rang: rang, p }),
  propositionsListe: (evt) => rpc('propositions_liste', { p_token: store.token, p_evt: evt }),
  propositionDecider: (id, decision, valeur, raison) => rpc('proposition_decider', { p_token: store.token, p_id: id, p_decision: decision, p_valeur: valeur ?? null, p_raison: raison ?? '' }),
  budgetRetenir: (evt, budget, zones, prix, coef) => rpc('budget_retenir', { p_token: store.token, p_evt: evt, p_budget: budget, p_zones: zones, p_prix: prix, p_coef: coef }),
  bullesListe: (evt) => rpc('bulles_liste', { p_token: store.token, p_evt: evt }),
  listeResponsable: (lien) => rpc('liste_responsable', { p_lien: lien }),
  respAction: (lien, id, statut, reponse) => rpc('resp_action', { p_lien: lien, p_id: id, p_statut: statut, p_reponse: reponse ?? null }),
  respReception: (lien, id, reception, manque) => rpc('resp_reception', { p_lien: lien, p_id: id, p_reception: reception, p_manque: manque ?? null }),
}
