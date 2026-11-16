// Codes d'erreur stables renvoyés par la base (raise exception 'code' ou 'code: détail').
// La base et l'appli parlent par code exact ; la phrase affichée ne vit qu'ici.
// Un nouveau code dans la base sans phrase ici fait échouer le test de régression n°11.
export const MESSAGES = {
  session_expiree: 'Session expirée, reconnectez-vous.',
  code_incorrect: 'Code incorrect.',
  compte_bloque: 'Trop d\'essais : réessaie dans 15 minutes.',
  code_trop_court: 'Le code doit avoir 6 chiffres.',
  lien_invalide: 'Ce lien n\'est plus valide.',
  manque_obligatoire: 'Il manque une information obligatoire.',
  reserve_admin: 'Réservé aux administrateurs.',
  reserve_direction: 'Réservé à la direction.',
  reserve_depot: 'Il te faut le droit dépôt pour ça (voir avec la direction).',
  nom_pris: 'Ce prénom a déjà un compte.',
  photo_trop_lourde: 'Photo trop lourde, réessaie.',
  merci_impossible: 'On remercie quelqu\'un d\'autre, pour une action faite.',
  element_facture: 'Une facture est déjà rangée sur cet élément : retire-la d\'abord.',
  enveloppe_non_vide: 'Déplace ou supprime d\'abord ses lignes et ses actions.',
  introuvable: 'Introuvable : il a peut-être été supprimé entre-temps.',
  element_introuvable: 'Cette ligne n\'existe plus : elle a peut-être été supprimée.',
  evenement_introuvable: 'Cet événement n\'existe plus.',
  piece_introuvable: 'Cette pièce n\'existe plus.',
  lecon_introuvable: 'Cette leçon n\'existe plus.',
  article_introuvable: 'Cet article n\'est plus dans la bibliothèque.',
  article_existe_deja: 'Cet article est déjà dans la bibliothèque.',
  nom_ou_zone_manquant: 'Il manque le nom ou la zone.',
  deja_present: 'Il est déjà revenu : rien à restaurer.',
  depasse_encaisse: 'Pas assez encaissé pour cette remise.',
  montant_invalide: 'Montant invalide.',
  prix_invalide: 'Prix invalide.',
  role_inconnu: 'Rôle inconnu.',
  statut_inconnu: 'Statut inconnu.',
  type_inconnu: 'Type inconnu.',
}
// Codes propres au bot Telegram : jamais vus dans l'appli, connus pour le test
export const CODES_BOT = ['mouvement_introuvable', 'non_autorise', 'pas_porteur', 'pas_pour_toi', 'reserve_salmane', 'transfert_impossible']

// Traduit une erreur de la base en { code, texte, brut }
export function traduire(error) {
  const brut = String(error?.message || '')
  const m = /^([a-z][a-z_]*)(?::\s*(.*))?$/s.exec(brut.trim())
  if (m && MESSAGES[m[1]]) return { code: m[1], texte: m[1] === 'depasse_encaisse' && m[2] ? `Pas assez encaissé : ${m[2]}` : MESSAGES[m[1]], brut }
  if (m && (!error?.code || error.code === 'P0001')) return { code: m[1], texte: 'Action refusée par la base.', brut }
  if (error?.code && error.code !== 'P0001') return { code: error.code, texte: 'Le serveur a eu un souci, réessaie dans un instant.', brut }
  return { code: error?.code || null, texte: brut || 'Erreur inattendue.', brut }
}
