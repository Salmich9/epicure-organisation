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
    description: 'Chiffrage complet de l\'événement, zone par zone, à partir du catalogue et des événements passés.',
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

// ---------- Google Drive (compte de service, jeton signé ici) ----------
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
async function jetonGoogle(): Promise<string> {
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!)
  const t = Math.floor(Date.now() / 1000), enc = new TextEncoder()
  const corps = `${b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${b64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 })))}`
  const der = Uint8Array.from(atob(String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s/g, '')), c => c.charCodeAt(0))
  const cle = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, enc.encode(corps)))
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${corps}.${b64url(sig)}` }) })
  const o = await r.json()
  if (!o.access_token) throw new Error(`Google refuse le compte de service : ${o.error_description || o.error || r.status}`)
  return o.access_token
}
// Retrouve ou crée un dossier (jamais de doublon si on relance)
async function dossierDrive(tok: string, parent: string, nom: string): Promise<{ id: string; url: string }> {
  const h = { authorization: `Bearer ${tok}` }, opt = 'supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,webViewLink)'
  const q = encodeURIComponent(`'${parent}' in parents and name = '${nom.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
  const l = await (await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&${opt}`, { headers: h })).json()
  if (l.files?.length) return { id: l.files[0].id, url: l.files[0].webViewLink }
  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink', { method: 'POST', headers: { ...h, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nom, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }) })
  const o = await r.json()
  if (!o.id) throw new Error(`Drive : ${o.error?.message || r.status}`)
  return { id: o.id, url: o.webViewLink }
}

const actu0 = (l: any) => l && l.length ? 'Garde les lignes du chiffrage actuel sauf si la consigne les change. ' : ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, mode, note, theme, lignes } = await req.json()
    if (!['placer', 'challenge', 'planning', 'bulles', 'chiffrer', 'dossier'].includes(mode)) return json({ error: 'mode inconnu' }, 400)

    // Le jeton de session de l'appli est vérifié par la base elle-même.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}

    // Dossier Drive de l'événement : écrit directement par le compte de service (Gestionnaire de contenu du Drive partagé).
    if (mode === 'dossier') {
      if (!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) return json({ error: 'Création du dossier pas encore branchée (GOOGLE_SERVICE_ACCOUNT_JSON absent des secrets Supabase).' }, 501)
      const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
      const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'drive').single()
      const parent = par?.valeur?.[ev.entite || 'Epicure']
      if (!parent) return json({ error: 'Dossier société introuvable' }, 500)
      const tok = await jetonGoogle()
      const d = await dossierDrive(tok, parent, `${ev.date || 'date à fixer'} · ${ev.nom}`)
      const sous: Record<string, string> = {}
      for (const n of ['Pièces fournisseurs', 'Organisation', 'À revoir']) sous[n] = (await dossierDrive(tok, d.id, n)).id
      await adm.from('evenements').update({ drive_id: d.id, drive_url: d.url, drive_sous: sous }).eq('id', ev.id)
      return json({ id: d.id, url: d.url, sous })
    }
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente : ajoute ANTHROPIC_API_KEY dans les secrets Supabase.' }, 500)

    let chiffrageTxt = ''
    if (mode === 'chiffrer') {
      const c = await sb.rpc('chiffrage_contexte', { p_token: token, p_evt: data.evt })
      const cx = c.data || {}
      const cat = (cx.catalogue || []).map((x: any) => `${x.id} | ${x.zone} | ${x.el} | base=${x.base ?? ''} q/base=${x.qpb ?? ''} | ${x.mode ?? ''} | achat=${x.pa ?? ''} loc=${x.pl ?? ''} prod=${x.pp ?? ''}`).join('\n')
      const refs = (cx.references || []).map((r: any) => `${r.nom} (${r.invites} invités, ${(r.prestations || []).join('+')}, ${r.format ?? ''}) — totaux : ${JSON.stringify(r.zones)}\n  ${(r.lignes || []).map((x: string) => [x, Number(x.split(' | ').pop()) || 0] as [string, number]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 35).map((x: any) => x[0]).join('\n  ')}`).join('\n')
      const actu = (lignes && lignes.length ? lignes : cx.chiffrage?.lignes || []).map((l: any) => `${l.zone} | ${l.element} | ${l.mode} | ${l.quantite} × ${l.prix}`).join('\n')
      chiffrageTxt = `Prestations : ${(ev.prestations || []).join(' + ') || '?'}, format ${ev.format ?? '?'}, ${ev.invites ?? '?'} invités, facturé par ${ev.entite ?? '?'}.
Zones : ${data.zones.map((z: any) => z.nom).join(', ')}.
Catalogue (id | zone | élément | base | mode | prix MAD) :\n${cat}
Événements passés (références de coûts réels) :\n${refs || '(aucun)'}
${actu ? `Chiffrage actuel :\n${actu}` : ''}`
    }

    let planningTxt = ''
    if (mode === 'planning') {
      const pl = await sb.rpc('planning_liste', { p_token: token, p_evt: data.evt })
      const rows = pl.data?.planning || []
      const acts = data.actions.map((a: any) => `${a.echeance ?? '?'} action : ${a.quoi} (${a.resp}) ${a.statut}`)
      const liv = data.elements.filter((e: any) => e.livraison).map((e: any) => `${e.livraison} livraison : ${e.element}`)
      const der = data.deroule.map((x: any) => `jour J ${x.debut ?? ''} ${x.moment}`)
      planningTxt = `Planning actuel (créneaux, actions, livraisons, déroulé) :\n` +
        [...rows.map((x: any) => `${x.date} ${x.heure ?? ''} ${x.titre} (${x.qui ?? '?'})`), ...acts, ...liv, ...der].sort().join('\n')
    }
    const demande = mode === 'bulles'
      ? `Donne au plus 4 bulles pour le tableau de bord de ${data.moi} aujourd'hui : 2 ou 3 conseils concrets (ce qu'il faut faire maintenant, avec les chiffres réels) et 1 réflexion de pro (un risque moins évident, une idée qui fait la différence le jour J). Ne répète pas les alertes évidentes (retards, éléments sans responsable) : elles sont déjà affichées. Appelle l'outil « bulles ».`
      : mode === 'chiffrer'
      ? `${chiffrageTxt}\n\n${note ? `Consigne de ${data.moi} : « ${note} »\n` : ''}Chiffre cet événement zone par zone, en coût de revient (pas en prix de vente). Pars des quantités du catalogue (qte par base × invités), corrige avec les événements passés de taille proche, n'oublie aucune zone utile pour ces prestations (staff, logistique, art de table, bar si prévu). ${actu0(lignes)}Prix : uniquement ceux du catalogue ou des références, jamais inventés (0 si inconnu, et dis-le dans la note). Au plus 40 lignes : regroupe les petites fournitures d'une même zone. Note : 5 mots au plus, seulement si utile. Appelle l'outil « chiffrage ».`
      : mode === 'planning'
      ? `${planningTxt}\n\nInspecte ce planning de J-30 à J+5 : repère ce qui manque dans le temps (livraisons non planifiées pour ce qui est loué ou acheté, confirmations des tiers, arrivée et repas du staff, montage, démontage et retour des locations à J+1, paiements). Ne propose pas ce qui existe déjà. Appelle l'outil « creneaux ».`
      : mode === 'placer'
      ? `Voici une note dictée ou écrite par ${data.moi} :\n« ${note} »\nTraduis-la en changements concrets sur l'organisation (souvent un seul). Appelle l'outil « proposer ».`
      : `Challenge ${data.moi} sur cet événement${theme ? `, thème : ${theme}` : ''}. Cherche ce qui risque d'être oublié, mal dimensionné, non délégué ou hors budget, du général au particulier. Évite ce qui est déjà bouclé. Pour chaque question, 2 à 4 réponses dont « Plus tard », avec leurs effets. Appelle l'outil « questions ».`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === 'chiffrer' ? 16000 : 3000,
        system: SYSTEME,
        tools: [TOOLS[mode]],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: `${contexte(data)}\n\n${demande}` }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    if (out.stop_reason === 'max_tokens') return json({ error: 'Réponse du copilote coupée (trop longue), réessaie.' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    if (!use) return json({ error: 'Le copilote n\'a pas su répondre, réessaie.' }, 502)
    const res: any = { ...use.input }
    for (const k of ['questions', 'changements', 'creneaux', 'bulles', 'lignes']) if (typeof res[k] === 'string') { try { res[k] = JSON.parse(res[k]) } catch { res[k] = [] } }
    if (Array.isArray(res.questions)) res.questions = res.questions.filter((q: any) => q?.question && Array.isArray(q.options) && q.options.length)
    if (mode === 'bulles') {
      res.bulles = (res.bulles || []).filter((b: any) => b?.texte).slice(0, 4)
      await sb.rpc('bulles_enregistrer', { p_token: token, p_evt: data.evt, p: res.bulles })
    }
    if (mode === 'chiffrer') {
      res.lignes = (res.lignes || []).filter((l: any) => l?.element && l?.zone).map((l: any) => ({ ...l, quantite: Number(l.quantite) || 0, prix: Number(l.prix) || 0 }))
      await sb.rpc('chiffrage_enregistrer', { p_token: token, p_evt: data.evt, p_lignes: res.lignes, p_hyp: res.hypotheses || '', p_coef: null })
    }
    return json({ ...res, usage: out.usage })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
