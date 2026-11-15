// Données fictives (aucun vrai client) pour les tests d'écrans.
const J = '2026-10-28'
const evt = { id: 'EVT-T-001', nom: 'Mariage Test', date: '2026-10-31', invites: 200, statut: 'Confirmé', entite: 'Epicure', prestations: ['Boissons', 'Traiteur'],
  prix_signe: 300000, budget: 120000, budget_zones: {}, cadrage: { fait_le: '2026-10-20', reponses: { prestations: ['Boissons', 'Traiteur'] } }, menu: {}, equipe: {} }
const evt2 = { ...evt, id: 'EVT-T-002', nom: 'Soirée Espèce', entite: 'Espèce', statut: 'Devis envoyé', prix_signe: null, date: '2026-12-05' }
const zones = ['Menu', 'Bar', 'Art de table', 'Staff', 'Logistique'].map((nom, i) => ({ nom, ordre: i, active: true, enveloppe: 50, marge: 0 }))
const el = (id, zone, element, extra = {}) => ({ id, evenement_id: evt.id, zone, element, perimetre: 'À notre charge', besoin: 10, stock: 0, location: 0, achat: 0, production: 0, cout: 0, facture: 0, etat: 'a_couvrir', reste: 10, ...extra })
const elements = [
  el('EL-1', 'Art de table', 'Assiettes plates', { location: 200, prix_location: 10, cout: 2000, etat: 'couvert', mode_ligne: 'louer', poste: 'materiel', fournisseur: 'Loueur A' }),
  el('EL-2', 'Art de table', 'Plateaux miroir', { stock: 12, cout: 0, etat: 'couvert', mode_ligne: 'prelever', poste: 'materiel' }),
  el('EL-3', 'Bar', 'Glace'),
  el('EL-4', 'Menu', 'Matière dîner (par couvert)', { production: 200, prix_production: 150, cout: 30000, etat: 'couvert' }),
]
const actions = [
  { id: 'ACT-1', evenement_id: evt.id, quoi: 'Vernir les plateaux', resp: 'Ouadia', echeance: J, cout: 400, poste: 'materiel', element_id: 'EL-2', statut: 'À faire', logistique: {}, paye: false },
  { id: 'ACT-2', evenement_id: evt.id, quoi: 'Commander le pain', resp: 'Salmane', echeance: '2026-10-29', cout: 1500, poste: 'diner', statut: 'À faire', logistique: { mode: 'livre' }, paye: false },
]
const poste = (cle, type, nom, resp, prevu, engage, lignes = [], acts = [], extra = {}) => ({ cle, type, nom, resp, prevu, engage, reel: 0, source: 'calcul', lignes, actions: acts, ...extra })
const postes = [
  poste('cocktail', 'matiere', 'Cocktail', 'Salima', 7700, 0, [], [], { prix_couvert: 38.5 }),
  poste('diner', 'matiere', 'Dîner', 'Salima', 30000, 31500, ['EL-4'], ['ACT-2'], { prix_couvert: 150 }),
  poste('materiel', 'achat', 'Matériel et équipement', 'Ouadia', 22000, 2400, ['EL-1', 'EL-2'], ['ACT-1']),
  poste('consommables', 'achat', 'Consommables', 'Amina', 9000, 0, ['EL-3']),
  poste('staff', 'achat', 'Staff', 'Ghali', 40000, 0),
  poste('logistique', 'achat', 'Logistique et transport', 'Ouadia', 6000, 0),
]
export const donnees = {
  moi: 'Salmane', aujourdhui: J, evt: evt.id, evenements: [evt, evt2], zones, listes: {},
  intervenants: ['Salmane', 'Ghali', 'Salima', 'Amina', 'Ouadia'].map(nom => ({ nom, type: 'Équipe', tel: null })),
  elements, actions, postes, equipe_evt: { cuisine: 'Salima', achats: 'Amina', production: 'Ouadia', coordination: 'Ghali' },
  notes: [], deroule: [], pieces: [], factures: [], depot: [], reserve: {},
}
export const aujourdhui = { moi: 'Salmane', aujourdhui: J, actions: actions.map(a => ({ ...a, evt_nom: evt.nom, evt_date: evt.date, poste_nom: postes.find(p => p.cle === a.poste).nom })), evenements: [], intervenants: [] }
export const accueil = { moi: 'Salmane', aujourdhui: J, evenements: [evt, evt2].map(e => ({ ...e, n_elements: 4, n_revus: 1, pieces_a_imputer: 0, encaisse: 0, chiffre: true })) }
