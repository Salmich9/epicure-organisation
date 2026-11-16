// Outils (schémas JSON) que Claude doit appeler, un par mode du copilote.

export const CHAMPS = `Champs modifiables d'un élément (clé : sens) :
perimetre (À notre charge | En partie | Tiers | Pas besoin | À clarifier), fourni_par (nom du tiers), qte_forcee (nombre, quantité imposée),
stock, location, achat, production (quantités couvertes par mode), prix_location, prix_achat, prix_production (MAD l'unité), statut_prix (Estimé | Confirmé),
description, moments, choix (À décider | Arrêté), fournisseur, dispo (Inconnue | En attente | Partielle | Confirmée),
engagement (À lancer | Devis demandé | En cours | À revoir | Confirmé | Avance versée | Payé | Livré / reçu | Annulé),
livraison (AAAA-MM-JJ), reception (Reçu | Partiel | Non reçu), manque, resp (prénom), prochaine (prochaine action), echeance (AAAA-MM-JJ), note.`

const CHANGEMENT = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['modifier', 'ajouter', 'action', 'invites'] },
    element_id: { type: 'string', description: 'Pour modifier : id EL-xxxx existant' },
    zone: { type: 'string', description: 'Pour ajouter : zone existante' },
    element: { type: 'string', description: 'Pour ajouter : nom court de l\'élément' },
    champs: { type: 'object', description: 'Champs à écrire (voir liste), valeurs finales' },
    quoi: { type: 'string', description: 'Pour action : ce qu\'il faut faire' },
    resp: { type: 'string', description: 'Pour action : prénom du responsable' },
    echeance: { type: 'string', description: 'Pour action : AAAA-MM-JJ' },
    invites: { type: 'number', description: 'Pour invites : nouveau nombre d\'invités' },
    pourquoi: { type: 'string', description: 'Une phrase courte en français' },
  },
  required: ['type', 'pourquoi'],
}

export const TOOLS: Record<string, any> = {
  bulles: {
    name: 'bulles',
    description: 'Au plus 4 bulles courtes pour le tableau de bord : des conseils concrets et des réflexions de pro.',
    input_schema: {
      type: 'object',
      properties: {
        bulles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['conseil', 'reflexion'] },
              titre: { type: 'string', description: '3 à 6 mots' },
              texte: { type: 'string', description: 'Deux phrases maximum, avec les chiffres réels' },
              zone: { type: 'string', description: 'Zone concernée, ou vide' },
            },
            required: ['type', 'titre', 'texte'],
          },
        },
      },
      required: ['bulles'],
    },
  },
  chiffrer: {
    name: 'chiffrage',
    description: 'Lignes en plus des postes calculés par les paramètres de l\'appli, et ajustements de ces postes pour cet événement.',
    input_schema: {
      type: 'object',
      properties: {
        lignes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              zone: { type: 'string', description: 'Zone existante' },
              element: { type: 'string' },
              catalogue_id: { type: 'string', description: 'Id du catalogue si l\'élément y est, sinon vide' },
              mode: { type: 'string', enum: ['stock', 'location', 'achat', 'production'] },
              quantite: { type: 'number' },
              prix: { type: 'number', description: 'Coût unitaire MAD (catalogue ou référence passée)' },
              note: { type: 'string', description: 'Hypothèse courte, facultative' },
            },
            required: ['zone', 'element', 'mode', 'quantite', 'prix'],
          },
        },
        ajustements: {
          type: 'array',
          description: 'Seulement si la consigne le demande : changement d\'un poste déjà calculé, pour cet événement',
          items: { type: 'object', properties: {
            param: { type: 'string', description: 'cle du poste calculé (ex. s_chef_rang)' },
            valeur: { type: 'number', description: 'Nouveau prix unitaire, si changé' },
            ratio: { type: 'number', description: 'Nouveau ratio (1 pour N, quantité par invité, nombre), si changé' },
            effectif: { type: 'number', description: 'Nombre de personnes voulu (staff), si demandé' },
            raison: { type: 'string' },
          }, required: ['param'] },
        },
        hypotheses: { type: 'string', description: 'Les hypothèses retenues, en 2 à 4 phrases courtes' },
        question: { type: 'string', description: 'UNE question si une info manque vraiment, sinon vide' },
      },
      required: ['lignes', 'hypotheses'],
    },
  },
  placer: {
    name: 'proposer',
    description: 'Propose les changements à appliquer à l\'organisation pour tenir compte de la note.',
    input_schema: {
      type: 'object',
      properties: {
        resume: { type: 'string', description: 'Où la note est rangée, en une phrase courte' },
        changements: { type: 'array', items: CHANGEMENT },
        question: { type: 'string', description: 'Si la note est ambiguë : UNE question courte pour lever le doute, sinon vide' },
      },
      required: ['resume', 'changements'],
    },
  },
  planning: {
    name: 'creneaux',
    description: 'Propose au plus 3 créneaux manquants dans le planning, du plus risqué au moins risqué.',
    input_schema: {
      type: 'object',
      properties: {
        creneaux: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              constat: { type: 'string', description: 'Le trou repéré, en une phrase courte avec les chiffres réels' },
              titre: { type: 'string', description: 'Titre court du créneau à ajouter' },
              date: { type: 'string', description: 'AAAA-MM-JJ, entre J-30 et J+5' },
              heure: { type: 'string', description: 'HH:MM, ou vide' },
              qui: { type: 'string', description: 'Prénom du responsable' },
            },
            required: ['constat', 'titre', 'date'],
          },
        },
      },
      required: ['creneaux'],
    },
  },
  bilan: {
    name: 'bilan',
    description: 'Bilan de clôture : pourquoi les grands écarts prévu / réel, et les leçons à retenir pour les prochains chiffrages.',
    input_schema: {
      type: 'object',
      properties: {
        pourquoi: {
          type: 'array',
          description: 'Une entrée par zone dont l\'écart dépasse 10 % ou 3 000 MAD',
          items: { type: 'object', properties: { zone: { type: 'string' }, texte: { type: 'string', description: 'Deux phrases au plus : la cause probable, avec les chiffres réels (élément, quantité, prix)' } }, required: ['zone', 'texte'] },
        },
        lecons: {
          type: 'array',
          description: 'Au plus 5 leçons, de la plus chère à la moins chère',
          items: {
            type: 'object',
            properties: {
              zone: { type: 'string' },
              texte: { type: 'string', description: 'La leçon en une phrase, tutoiement (« Compte 1,4 kg de glace par invité en été »)' },
              detail: { type: 'string', description: 'Le constat chiffré qui la justifie, une phrase' },
              catalogue_id: { type: 'string', description: 'Id du catalogue à corriger si la leçon change une quantité ou un prix, sinon vide' },
              champ: { type: 'string', enum: ['', 'qte_par_base', 'prix_achat', 'prix_location', 'prix_production'] },
              valeur: { type: 'number', description: 'Nouvelle valeur du champ (par invité pour qte_par_base, MAD l\'unité pour un prix)' },
            },
            required: ['zone', 'texte', 'detail'],
          },
        },
      },
      required: ['pourquoi', 'lecons'],
    },
  },
  cadrage: {
    name: 'liste',
    description: 'Les articles de la bibliothèque dont cet événement a besoin, d\'après le cadrage.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Id CAT-xxxx exact de la bibliothèque' },
              perimetre: { type: 'string', enum: ['À notre charge', 'Tiers', 'À clarifier'] },
              par: { type: 'string', description: 'Pour Tiers : qui le fournit (Le client, Le lieu, L\'agence)' },
              qte: { type: 'number', description: 'Seulement si le cadrage fixe la quantité (nombre de bars, talkies…), sinon 0' },
              note: { type: 'string', description: 'Facultatif, 6 mots au plus' },
            },
            required: ['id', 'perimetre'],
          },
        },
        resume: { type: 'string', description: 'Les 3 à 5 faits du cadrage qui ont décidé la liste, séparés par « · » (ex : Pas de cuisine sur place · groupe électrogène · 2 bars extérieurs)' },
        nous_txt: { type: 'string', description: '4 ou 5 exemples de ce qui est à notre charge, séparés par des virgules' },
        tiers_txt: { type: 'string', description: 'Ce qui est chez un tiers, format « alcool → client · bar → agence »' },
        clarifier_txt: { type: 'string', description: 'Ce qui reste à trancher, 2 ou 3 éléments séparés par « · », ou vide' },
      },
      required: ['items', 'resume'],
    },
  },
  article: {
    name: 'articles',
    description: 'Les articles dictés, chacun rangé dans sa famille avec un prix.',
    input_schema: {
      type: 'object',
      properties: {
        articles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              catalogue_id: { type: 'string', description: 'Id CAT-xxxx si l\'article existe déjà dans la bibliothèque (même chose, même usage), sinon vide' },
              element: { type: 'string', description: 'Nom court et propre de l\'article, comme dans la bibliothèque' },
              zone: { type: 'string', description: 'Famille : une zone existante exacte' },
              sous_zone: { type: 'string', description: 'Sous-famille existante de cette zone si elle convient, sinon une nouvelle courte' },
              mode: { type: 'string', enum: ['Location', 'Achat', 'Production / sous-traitance', 'Stock'] },
              prix: { type: 'number', description: 'Coût unitaire MAD HT (0 si vraiment inconnu)' },
              source: { type: 'string', enum: ['bibliotheque', 'evenements', 'estimation'], description: 'D\'où vient le prix' },
              base: { type: 'string', enum: ['Fixe', 'Invités', 'Tables', 'Nb staff'], description: 'Sur quoi se calcule la quantité' },
              qte_par_base: { type: 'number', description: 'Quantité par unité de base (Fixe : la quantité totale)' },
              quantite: { type: 'number', description: 'Quantité dite à l\'oral pour cet événement, sinon 0' },
              unite: { type: 'string', description: 'pièce, kg, litre, forfait, personne…' },
              pourquoi: { type: 'string', description: 'Une phrase : pourquoi cette famille et ce prix (ex. « prix de la bibliothèque », « 2 événements passés à 45 MAD »)' },
            },
            required: ['element', 'zone', 'mode', 'prix', 'source', 'base', 'qte_par_base', 'pourquoi'],
          },
        },
      },
      required: ['articles'],
    },
  },
  challenge: {
    name: 'questions',
    description: 'Pose exactement 3 questions d\'inspection, de la plus risquée à la moins risquée.',
    input_schema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              theme: { type: 'string', description: 'Logistique, Technique et électricité, Art de table, Staff, Cuisine, Budget, Tiers, Délais…' },
              question: { type: 'string', description: 'Question courte, tutoiement, une seule chose à la fois' },
              conseil: { type: 'string', description: 'Une phrase de contexte ou de conseil, facultative' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    libelle: { type: 'string', description: 'Réponse courte (2 à 5 mots)' },
                    effets: { type: 'array', items: CHANGEMENT, description: 'Changements à appliquer si cette réponse est choisie (peut être vide)' },
                  },
                  required: ['libelle', 'effets'],
                },
              },
            },
            required: ['theme', 'question', 'options'],
          },
        },
      },
      required: ['questions'],
    },
  },
}
