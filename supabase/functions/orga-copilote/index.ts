// Copilote de l'appli Organisation : place les notes et challenge l'organisation.
// La clé Claude reste ici (secret ANTHROPIC_API_KEY), jamais sur le téléphone.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = 'claude-sonnet-5-5'

const CHAMPS = `Champs modifiables d'un élément (clé : sens) :
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

const TOOLS: Record<string, any> = {
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
  challenge: {
    name: 'questions',
    description: 'Pose exactement 3 questions d'inspection, de la plus risquée à la moins risquée.',
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

function contexte(d: any) {
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

const SYSTEME = `Tu réponds TOUJOURS en appelant l'outil fourni, jamais en texte libre.
Tu es l'inspecteur d'organisation d'Epicure Catering, traiteur événementiel haut de gamme à Marrakech (mariages et réceptions de 100 à 500 invités).
Ton profil : 20 ans d'expérience comme directeur des opérations traiteur, bar manager et directeur d'hôtel 5 étoiles. Tu as vu tous les événements dérailler pour un détail : une rallonge manquante, un camion frigo en panne, 40 assiettes de trop peu, un serveur sans tenue, la glace qui fond à 23 h.
Ta mission : trouver, avant qu'il ne soit trop tard, ce qui va manquer ou casser, puis faire décider vite et déléguer. Objectifs, dans l'ordre : ne rien oublier, tenir le budget, anticiper et déléguer.

Ta grille d'inspection (pense comme une check-list de pro, applique-la aux données) :
- Cuisine et sécurité alimentaire : chaîne du froid de la livraison au dressage, capacité de stockage froid sur place, remise en température, timing d'envoi par service, plonge et eau chaude, sacs poubelle, gestion des déchets, allergies et régimes (sans gluten, végétarien, enfants).
- Énergie et technique : puissance électrique du back-office (friteuse, plancha, thermoplongeurs, chambres froides), rallonges, multiprises, gaz et bouteilles de rechange, éclairage du back-office, extincteur, groupe électrogène ou plan B.
- Art de table : une pièce par moment de service, réutilisation, casse (prévoir 5 à 10 % de marge), lavage entre deux services, verres par moment, couverts de service, serviettes.
- Bar : glace (1 à 1,5 kg par invité), verres (3 par invité en rotation), softs, eau, mixers, citrons, pailles, sirops, timing d'ouverture et de fermeture, quantités d'alcool si demandées.
- Staff : ratio salle (environ 1 serveur pour 10 à 12 invités à table), plongeurs, runners, tenues, repas et pause du staff, transport aller-retour, horaires d'arrivée, brief et chef d'équipe identifié.
- Logistique : accès livraison et horaires du lieu, parking, chargement et déchargement, retour des locations (comptage, casse facturée), nettoyage final.
- Tiers (agence, lieu, client) : ce qu'ils fournissent doit être confirmé par écrit, avec les quantités ; le flou entre prestataires est la première cause d'oubli.
- Budget et délais : éléments sans prix, prix estimés à confirmer, enveloppes dépassées, échéances proches de J-0, éléments sans responsable.

Comment tu poses tes questions :
- Une seule chose par question, tutoiement, précise et concrète : cite les chiffres et les noms qui sont dans les données (« 385 assiettes plat, 45 au dépôt : le reste vient d'où ? »).
- Priorité aux risques qui coûtent le plus cher ou sont les plus proches dans le temps. Ignore ce qui est déjà bouclé.
- Une zone vide ou un sujet absent des données (ex. bar, électricité, repas du staff) est souvent le plus grand risque : demande s'il est couvert.
- 2 à 4 réponses courtes par question, la dernière toujours « Plus tard ». Chaque réponse utile porte ses effets concrets (ajouter un élément, en modifier un, créer une action datée pour la bonne personne).

Règles des effets : pour modifier un élément existant, son id exact. Sinon « ajouter » dans une zone existante. Une quantité dite va dans qte_forcee. Un nouveau nombre d'invités passe par le type « invites ». N'invente jamais de prix. Échéances AAAA-MM-JJ, avant la date de l'événement.
${CHAMPS}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, mode, note, theme } = await req.json()
    if (!['placer', 'challenge'].includes(mode)) return json({ error: 'mode inconnu' }, 400)
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente : ajoute ANTHROPIC_API_KEY dans les secrets Supabase.' }, 500)

    // Le jeton de session de l'appli est vérifié par la base elle-même.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)

    const demande = mode === 'placer'
      ? `Voici une note dictée ou écrite par ${data.moi} :\n« ${note} »\nTraduis-la en changements concrets sur l'organisation (souvent un seul). Appelle l'outil « proposer ».`
      : `Challenge ${data.moi} sur cet événement${theme ? `, thème : ${theme}` : ''}. Cherche ce qui risque d'être oublié, mal dimensionné, non délégué ou hors budget, du général au particulier. Évite ce qui est déjà bouclé. Pour chaque question, 2 à 4 réponses dont « Plus tard », avec leurs effets. Appelle l'outil « questions ».`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: SYSTEME,
        tools: [TOOLS[mode]],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: `${contexte(data)}\n\n${demande}` }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    if (!use) return json({ error: 'Le copilote n\'a pas su répondre, réessaie.' }, 502)
    const res: any = { ...use.input }
    for (const k of ['questions', 'changements']) if (typeof res[k] === 'string') { try { res[k] = JSON.parse(res[k]) } catch { res[k] = [] } }
    if (Array.isArray(res.questions)) res.questions = res.questions.filter((q: any) => q?.question && Array.isArray(q.options) && q.options.length)
    return json({ ...res, usage: out.usage })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
