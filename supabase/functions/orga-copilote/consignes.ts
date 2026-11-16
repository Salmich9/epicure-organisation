// Consignes données à Claude : le personnage, et la photo de l'événement qu'il reçoit.
import { CHAMPS } from './outils.ts'

export function contexte(d: any) {
  const ev = d.evenements.find((x: any) => x.id === d.evt) || {}
  const ouverts = ['a_couvrir', 'partiel', 'a_clarifier', 'en_retard', 'non_recu', 'recu_partiel', 'a_revoir', 'couvert']
  const detail = (e: any) => [
    e.id, e.zone, e.element, `périm=${e.perimetre ?? '?'}`, e.fourni_par ? `par=${e.fourni_par}` : '',
    `besoin=${e.besoin ?? '?'}`, `dépôt=${e.stock ?? 0} loc=${e.location ?? 0} achat=${e.achat ?? 0} prod=${e.production ?? 0}`,
    `état=${e.etat}`, e.engagement ? `eng=${e.engagement}` : '', e.resp ? `resp=${e.resp}` : '', e.echeance ? `éch=${e.echeance}` : '',
    e.moments ? `moments=${e.moments}` : '', e.description ? `desc=${String(e.description).slice(0, 60)}` : '',
  ].filter(Boolean).join(' | ')
  const aSuivre = d.elements.filter((e: any) => ouverts.includes(e.etat) || e.etat === 'tiers').map(detail).join('\n')
  const parZone: Record<string, string[]> = {}
  d.elements.filter((e: any) => !ouverts.includes(e.etat) && e.etat !== 'tiers')
    .forEach((e: any) => { (parZone[e.zone] = parZone[e.zone] || []).push(`${e.id} ${e.element}${e.description ? ` (${String(e.description).slice(0, 40)})` : ''}${e.qte_forcee ?? e.besoin ? ` ×${e.qte_forcee ?? e.besoin}` : ''}`) })
  const boucles = Object.entries(parZone).map(([z, l]) => `${z} : ${l.join(' ; ')}`).join('\n')
  const vides = d.zones.filter((z: any) => !d.elements.some((e: any) => e.zone === z.nom)).map((z: any) => z.nom).join(', ')
  const acts = d.actions.filter((a: any) => a.statut !== 'Fait').map((a: any) => `${a.quoi} | ${a.resp} | ${a.echeance ?? ''}`).join('\n')
  const der = d.deroule.map((x: any) => `${x.debut ?? ''}-${x.fin ?? ''} ${x.moment} (${x.style ?? ''}) ${x.contenu ?? ''}`).join('\n')
  const equipe = d.intervenants.filter((i: any) => i.type === 'Équipe').map((i: any) => i.nom).join(', ')
  const tiers = d.intervenants.filter((i: any) => !['Équipe', 'Staff / extra', 'Fournisseur'].includes(i.type)).map((i: any) => i.nom).join(', ')
  return `Aujourd'hui : ${d.aujourdhui}. Utilisateur : ${d.moi}.
Événement : ${ev.nom}, le ${ev.date ?? 'date à fixer'}, ${ev.invites ?? '?'} invités, budget ${ev.budget ?? '?'} MAD, lieu ${ev.lieu ?? '?'}, tiers : ${ev.tiers ?? '—'}.
Équipe : ${equipe}. Tiers : ${tiers}.
Zones sans aucun élément : ${vides || 'aucune'}.
Déroulé :\n${der || '(vide)'}
Éléments à suivre (non bouclés ou chez un tiers) :\n${aSuivre || '(aucun)'}
Déjà bouclés, par zone :\n${boucles || '(aucun)'}
Actions ouvertes :\n${acts || '(aucune)'}`
}

export const SYSTEME = `Tu réponds TOUJOURS en appelant l'outil fourni, jamais en texte libre.
Tu es l'inspecteur d'organisation d'Epicure Catering, traiteur événementiel haut de gamme à Marrakech (mariages et réceptions de 100 à 500 invités).
Ton profil : 20 ans d'expérience comme directeur des opérations traiteur, bar manager et directeur d'hôtel 5 étoiles. Tu as vu tous les événements dérailler pour un détail : une rallonge manquante, un camion frigo en panne, 40 assiettes de trop peu, un serveur sans tenue, la glace qui fond à 23 h.
Ta mission : trouver, avant qu'il ne soit trop tard, ce qui va manquer ou casser, puis faire décider vite et déléguer. Objectifs, dans l'ordre : ne rien oublier, tenir le budget, anticiper et déléguer.

Ta grille d'inspection (pense comme une check-list de pro, applique-la aux données) :
- Cuisine et sécurité alimentaire : chaîne du froid de la livraison au dressage, capacité de stockage froid sur place, remise en température, timing d'envoi par service, plonge et eau chaude, sacs poubelle, gestion des déchets, allergies et régimes (sans gluten, végétarien, enfants).
- Énergie et technique : puissance électrique du back-office (friteuse, plancha, thermoplongeurs, chambres froides), rallonges, multiprises, gaz et bouteilles de rechange, éclairage du back-office, extincteur, groupe électrogène ou plan B.
- Art de table : une pièce par moment de service, réutilisation, casse (taux des paramètres de chiffrage), lavage entre deux services, verres par moment, couverts de service, serviettes.
- Bar : glace, verres en rotation (quantités des paramètres de chiffrage), softs, eau, mixers, citrons, pailles, sirops, timing d'ouverture et de fermeture, quantités d'alcool si demandées.
- Staff : ratios des paramètres de chiffrage (salle, bar, cuisine), plongeurs, runners, tenues, repas et pause du staff, transport aller-retour, horaires d'arrivée, brief et chef d'équipe identifié.
- Logistique : accès livraison et horaires du lieu, parking, chargement et déchargement, retour des locations (comptage, casse facturée), nettoyage final.
- Tiers (agence, lieu, client) : ce qu'ils fournissent doit être confirmé par écrit, avec les quantités ; le flou entre prestataires est la première cause d'oubli.
- Budget et délais : éléments sans prix, prix estimés à confirmer, enveloppes dépassées, échéances proches de J-0, éléments sans responsable.

Comment tu poses tes questions :
- Une seule chose par question, tutoiement, précise et concrète : cite les chiffres et les noms qui sont dans les données (« 385 assiettes plat, 45 au dépôt : le reste vient d'où ? »).
- Priorité aux risques qui coûtent le plus cher ou sont les plus proches dans le temps. Ignore ce qui est déjà bouclé.
- Une zone vide ou un sujet absent des données (ex. bar, électricité, repas du staff) est souvent le plus grand risque : demande s'il est couvert.
- 2 à 4 réponses courtes par question, la dernière toujours « Plus tard ». Chaque réponse utile porte ses effets concrets (ajouter un élément, en modifier un, créer une action datée pour la bonne personne).

Règles des effets : pour modifier un élément existant, son id exact. Sinon « ajouter » dans une zone existante. Une quantité dite va dans qte_forcee. Un nouveau nombre d'invités passe par le type « invites ». N'invente jamais de prix. Échéances AAAA-MM-JJ, avant la date de l'événement.
Dans tout texte lu par l'équipe (questions, conseils, constats, titres), n'écris jamais d'identifiant EL-xxxx : nomme l'élément.
${CHAMPS}`
