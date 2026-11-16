// v75 · Cadrage : l'IA propose une réponse seulement quand le devis et l'événement la rendent très probable.
// Appelée en dernier, pour les questions que ni le même lieu ni les événements proches n'ont tranchées.
// La clé Claude reste ici (secret ANTHROPIC_API_KEY). Aucun prix n'est envoyé.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const MODEL = 'claude-sonnet-5-5'
const OUTIL = {
  name: 'reponses',
  description: 'Les réponses que les données rendent très probables. Aucune si rien n\'est sûr.',
  input_schema: { type: 'object', required: ['propositions'], properties: { propositions: { type: 'array', items: { type: 'object', required: ['cle', 'valeur', 'pourquoi'], properties: {
    cle: { type: 'string', description: 'La clé exacte de la question' },
    valeur: { type: 'string', description: 'La clé exacte d\'une réponse ; plusieurs choix : clés séparées par des virgules ; un nombre : le nombre' },
    pourquoi: { type: 'string', description: 'Le fait des données qui le dit, 12 mots au plus' },
  } } } } },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, questions, repris } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}
    const qs = (Array.isArray(questions) ? questions : []).filter((q: any) => q?.cle && Array.isArray(q.choix)).slice(0, 30)
    const ia0 = ev.cadrage?.ia || {}
    if (!qs.length) return json({ ia: ia0 })
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente' }, 500)

    const elements = (data.elements || []).map((e: any) => `${e.zone} : ${e.element}${e.fourni_par ? ` (fourni par ${e.fourni_par})` : ''}${e.description ? ` · ${String(e.description).slice(0, 50)}` : ''}`).slice(0, 120).join('\n')
    const deroule = (data.deroule || []).map((x: any) => `${x.debut ?? ''} ${x.moment} ${x.contenu ?? ''}`).join('\n')
    const texte = `Événement : ${ev.nom}, le ${ev.date ?? '?'}, ${ev.invites ?? '?'} invités, lieu ${ev.lieu ?? '?'}, gamme ${ev.gamme ?? '?'}, ${(ev.prestations || []).join(' + ')}, ${ev.format ?? ''}.
Notes : ${String(ev.note || '').slice(0, 600) || '(aucune)'}
Ce que le devis signé a tranché :
${(Array.isArray(repris) ? repris : []).map((x: any) => `- ${x.texte} : ${x.valeur}`).join('\n') || '(rien)'}
Éléments de l'organisation :
${elements || '(aucun)'}
Déroulé :
${deroule || '(vide)'}

Questions encore ouvertes (clé | question | type | réponses clé=libellé) :
${qs.map((q: any) => `${q.cle} | ${q.texte} | ${q.type} | ${q.choix.map((c: any) => `${c.cle}=${c.libelle}`).join(', ')}`).join('\n')}

Pour chaque question ouverte, propose une réponse SEULEMENT si un fait précis ci-dessus la rend très probable. Au moindre doute, rien pour cette question : une mauvaise proposition coûte plus cher qu'une question posée. Clés exactes uniquement. Appelle l'outil « reponses ».`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, tools: [OUTIL], tool_choice: { type: 'auto' },
        system: 'Tu es directeur des opérations d\'un traiteur événementiel haut de gamme à Marrakech. Tu réponds toujours en appelant l\'outil, en français.',
        messages: [{ role: 'user', content: texte }] }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    let liste = use?.input?.propositions
    if (typeof liste === 'string') { try { liste = JSON.parse(liste) } catch { liste = [] } }

    // Seulement des réponses qui existent dans la question
    const props: Record<string, any> = {}
    for (const x of (Array.isArray(liste) ? liste : [])) {
      const q = qs.find((y: any) => y.cle === x?.cle)
      if (!q || !x.pourquoi) continue
      const ok = (c: string) => q.choix.some((y: any) => y.cle === c)
      let v: any = String(x.valeur ?? '').trim()
      if (q.type === 'multi') { v = v.split(',').map((c: string) => c.trim()).filter(ok); if (!v.length) continue }
      else if (q.type === 'nombre') { v = Number(v); if (!(v >= 0)) continue }
      else if (!ok(v)) continue
      props[q.cle] = { valeur: v, source: 'ia', pourquoi: String(x.pourquoi).replace(/\.$/, '').slice(0, 120) }
    }
    const ia = { le: new Date().toISOString(), vues: [...new Set([...(ia0.vues || []), ...qs.map((q: any) => q.cle)])], propositions: { ...(ia0.propositions || {}), ...props } }
    const m = await sb.rpc('cadrage_maj', { p_token: token, p_evt: data.evt, p: { ia } })
    if (m.error) return json({ error: m.error.message }, 500)
    return json({ ia })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
