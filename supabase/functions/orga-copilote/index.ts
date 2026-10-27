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
    description: 'Pose 3 questions simples, de la plus importante à la moins importante.',
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
  const els = d.elements.map((e: any) => [
    e.id, e.zone, e.sous_zone, e.element, `périm=${e.perimetre ?? '?'}`, e.fourni_par ? `par=${e.fourni_par}` : '',
    `besoin=${e.besoin ?? '?'}`, `dépôt=${e.stock ?? 0} loc=${e.location ?? 0} achat=${e.achat ?? 0} prod=${e.production ?? 0}`,
    `état=${e.etat}`, e.engagement ? `eng=${e.engagement}` : '', e.resp ? `resp=${e.resp}` : '', e.echeance ? `éch=${e.echeance}` : '',
    e.moments ? `moments=${e.moments}` : '', e.description ? `desc=${String(e.description).slice(0, 80)}` : '',
  ].filter(Boolean).join(' | ')).join('\n')
  const acts = d.actions.map((a: any) => `${a.id} | ${a.quoi} | ${a.resp} | ${a.echeance ?? ''} | ${a.statut}`).join('\n')
  const der = d.deroule.map((x: any) => `${x.debut ?? ''}-${x.fin ?? ''} ${x.moment} (${x.style ?? ''}) ${x.contenu ?? ''}`).join('\n')
  const zones = d.zones.map((z: any) => `${z.nom} (resp ${z.resp}, marge ${Math.round((z.marge || 0) * 100)} %, enveloppe ${z.enveloppe} MAD/invité)`).join('\n')
  const equipe = d.intervenants.filter((i: any) => i.type === 'Équipe').map((i: any) => i.nom).join(', ')
  const tiers = d.intervenants.filter((i: any) => i.type !== 'Équipe').map((i: any) => i.nom).join(', ')
  return `Aujourd'hui : ${d.aujourdhui}. Utilisateur : ${d.moi}.
Événement : ${ev.nom}, le ${ev.date ?? 'date à fixer'}, ${ev.invites ?? '?'} invités, budget ${ev.budget ?? '?'} MAD, lieu ${ev.lieu ?? '?'}, tiers : ${ev.tiers ?? '—'}.
Équipe : ${equipe}. Autres intervenants : ${tiers}.
Zones :\n${zones}
Déroulé :\n${der || '(vide)'}
Éléments :\n${els}
Actions :\n${acts || '(aucune)'}`
}

const SYSTEME = `Tu es le copilote d'organisation d'Epicure Catering (traiteur événementiel haut de gamme à Marrakech).
Objectifs de l'utilisateur, dans l'ordre : 1) ne rien oublier, tout considérer ; 2) tenir le budget ; 3) anticiper et déléguer efficacement.
Règles : français, phrases courtes, tutoiement. Tu ne proposes que des changements utiles et sûrs, appuyés sur les données fournies.
Pour modifier un élément existant, utilise son id exact. Si l'élément n'existe pas, propose « ajouter » avec une zone existante.
Une quantité dite par l'utilisateur va dans qte_forcee. Un nouveau nombre d'invités passe par le type « invites ».
N'invente pas de prix : laisse-les vides s'ils ne sont pas donnés. Échéances au format AAAA-MM-JJ, avant la date de l'événement.
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
        max_tokens: 4000,
        system: SYSTEME,
        tools: [TOOLS[mode]],
        tool_choice: { type: 'tool', name: TOOLS[mode].name },
        messages: [{ role: 'user', content: `${contexte(data)}\n\n${demande}` }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    return json({ ...use?.input, usage: out.usage })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
