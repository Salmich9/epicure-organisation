// Micro unique : ce qui est dit s'applique à l'objet touché avant de parler.
// - sans cible : une nouvelle action (« le pain, 350 pers., 1 500 dh, Salima, livré jeudi 16 h »)
// - cible action : ce qui change sur cette action (« repousse à vendredi, confie à Amina »)
// - cible ligne : ce qui change sur cette ligne (« 200 nappes louées à 45 chez Atelier Lin »)
// Clé Claude côté serveur (secret ANTHROPIC_API_KEY).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const MODEL = 'claude-haiku-5-5'
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

const OUTIL = {
  name: 'action',
  description: "Remplit la fiche d'une action à partir de ce qui a été dit. Ne mets que ce qui est dit ou évident ; laisse vide sinon.",
  input_schema: {
    type: 'object',
    properties: {
      quoi: { type: 'string', description: "Verbe d'action + objet, court (ex : « Commander le pain · 350 pers. »)" },
      cout: { type: 'number', description: 'Coût en MAD (0 si gratuit, vide si inconnu)' },
      qui: { type: 'string', description: 'Prénom de la personne qui s\'en occupe, pris dans la liste' },
      quand: { type: 'string', description: 'Date AAAA-MM-JJ' },
      heure: { type: 'string', description: 'Heure HH:MM si dite' },
      poste: { type: 'string', description: 'Clé de l\'enveloppe parmi la liste' },
      element_id: { type: 'string', description: 'Id de la ligne concernée si l\'action porte clairement sur une ligne existante' },
      livraison: { type: 'string', enum: ['livre', 'recuperer', ''], description: 'livré au lieu, ou à récupérer' },
      lieu: { type: 'string', description: 'Lieu de livraison ou de récupération' },
      vehicule: { type: 'string', description: 'Véhicule ou qui transporte' },
      retour_j1: { type: 'boolean', description: 'Retour du matériel à J+1' },
      contact: { type: 'string', description: 'Fournisseur ou contact' },
      paiement: { type: 'string', enum: ['virement', 'caisse', 'carte', ''] },
    },
    required: ['quoi'],
  },
}
const OUTIL_LIGNE = {
  name: 'ligne',
  description: "Ce qui change sur une ligne du budget. Ne mets que ce qui est dit.",
  input_schema: {
    type: 'object',
    properties: {
      nom: { type: 'string', description: 'Nouveau nom, seulement si on le renomme' },
      mode: { type: 'string', enum: ['prelever', 'louer', 'acheter', 'produire', ''], description: 'prélevé au dépôt, loué, acheté ou produit / sous-traité' },
      qte: { type: 'number', description: 'Quantité' },
      prix: { type: 'number', description: 'Prix unitaire en MAD' },
      fournisseur: { type: 'string', description: 'Loueur, fournisseur ou qui produit' },
      resp: { type: 'string', description: 'Prénom de la personne qui s\'en occupe, pris dans la liste' },
      note: { type: 'string', description: 'Remarque à garder' },
    },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, texte, poste, cible } = await req.json()
    if (!String(texte || '').trim()) return json({ error: 'Rien entendu.' }, 400)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente.' }, 500)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}
    const auj = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sem = Array.from({ length: 10 }, (_, i) => { const d = new Date(auj); d.setDate(d.getDate() + i); return `${JOURS[d.getDay()]} ${iso(d)}` }).join(', ')
    const gens = [...new Set([...Object.values(data.equipe_evt || {}), ...data.intervenants.filter((i: any) => ['Équipe', 'Staff / extra'].includes(i.type)).map((i: any) => i.nom)])]
    const postes = (data.postes || []).map((p: any) => `${p.cle} = ${p.nom} (responsable ${p.resp || '?'})`).join('\n')
    const lignes = (data.elements || []).filter((e: any) => e.mode_ligne || Number(e.cout) > 0).slice(0, 80).map((e: any) => `${e.id} ${e.element}`).join('\n')
    const ctx = `Événement : ${ev.nom}, le ${ev.date || '?'}, ${ev.invites || '?'} invités, lieu ${ev.lieu || '?'}.
Aujourd'hui : ${iso(auj)}. Jours à venir : ${sem}. « J-3 » = 3 jours avant l'événement.
Personnes : ${gens.join(', ')}.
Enveloppes :\n${postes}
${poste ? `L'utilisateur est dans l'enveloppe « ${poste} » : prends-la par défaut.` : ''}
Lignes existantes :\n${lignes || '(aucune)'}
Si personne n'est nommé, prends le responsable de l'enveloppe. « dh » = MAD.`
    let outil: any = OUTIL, consigne = ''
    if (cible?.type === 'action' && cible.a) {
      const a = cible.a
      consigne = `\n\nOn MODIFIE l'action existante : « ${a.quoi} », coût ${a.cout ?? '?'}, pour ${a.resp || '?'}, le ${a.echeance || '?'}${a.heure ? ` à ${a.heure}` : ''}.
Ne renvoie que les champs qui changent ; « quoi » seulement si on la renomme (sinon renvoie le même texte). « repousse de 2 jours » part de la date actuelle.`
    } else if (cible?.type === 'ligne' && cible.e) {
      const e = cible.e
      outil = OUTIL_LIGNE
      consigne = `\n\nOn MODIFIE la ligne existante : « ${e.element} », mode ${e.mode_ligne || '?'}, quantité ${e.qte ?? '?'}, prix ${e.prix ?? '?'}, fournisseur ${e.fournisseur || '?'}, responsable ${e.resp || '?'}. Ne renvoie que ce qui change.`
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, tools: [outil], tool_choice: { type: 'tool', name: outil.name },
        messages: [{ role: 'user', content: `${ctx}${consigne}\n\nDicté : « ${texte} »` }] }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    if (!use) return json({ error: 'Pas compris, réessaie.' }, 502)
    return json(use.input)
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
