// Propose, pour chaque pièce fournisseur pas encore imputée, l'élément de l'organisation qu'elle paie.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const OUTIL = {
  name: 'suggestions', description: 'Pour chaque pièce, l\'élément qu\'elle paie le plus probablement.',
  input_schema: { type: 'object', required: ['suggestions'], properties: { suggestions: { type: 'array', items: { type: 'object', required: ['id', 'element_id'],
    properties: { id: { type: 'number' }, element_id: { type: 'string', description: 'Id EL-xxxx exact, ou vide si rien ne colle' }, pourquoi: { type: 'string', description: 'Cinq mots maximum' } } } } } },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, pieces } = await req.json()
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente.' }, 500)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const ps = (data.pieces || []).filter((p: any) => (pieces || []).includes(p.id) && !p.facture_id)
    if (!ps.length) return json({ suggestions: [] })
    const els = data.elements.map((e: any) => `${e.id} | ${e.zone} | ${e.element}${e.fournisseur ? ` | fournisseur ${e.fournisseur}` : ''}${e.description ? ` | ${String(e.description).slice(0, 50)}` : ''}${Number(e.cout) ? ` | prévu ${Math.round(e.cout)}` : ''}`).join('\n')
    const txt = ps.map((p: any) => `${p.id} | ${p.fournisseur ?? '?'} | ${p.type ?? ''} | ${p.montant ?? '?'} MAD`).join('\n')
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 1500, tools: [OUTIL], tool_choice: { type: 'auto' },
        system: 'Tu es le contrôleur de gestion d\'un traiteur événementiel à Marrakech. Tu réponds TOUJOURS en appelant l\'outil fourni.',
        messages: [{ role: 'user', content: `Éléments de l'organisation de l'événement (id | zone | élément | …) :\n${els}\n\nPièces fournisseurs reçues (id | fournisseur | type | montant) :\n${txt}\n\nPour chaque pièce, devine l'élément qu'elle paie d'après ce que vend ce fournisseur (poissonnier → poissons et fruits de mer du menu, location de vaisselle → art de table, transport → logistique…) et le montant prévu. Si rien ne colle, element_id vide. Appelle l'outil « suggestions ».` }] }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    let s = use?.input?.suggestions || []
    if (typeof s === 'string') { try { s = JSON.parse(s) } catch { s = [] } }
    const ids = new Set(data.elements.map((e: any) => e.id))
    s = s.filter((x: any) => ids.has(x.element_id)).map((x: any) => ({ id: Number(x.id), element_id: x.element_id, pourquoi: x.pourquoi || '' }))
    await sb.rpc('piece_suggestions', { p_token: token, p: s.map((x: any) => ({ id: x.id, suggestion: { element_id: x.element_id, pourquoi: x.pourquoi } })) })
    return json({ suggestions: s })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
