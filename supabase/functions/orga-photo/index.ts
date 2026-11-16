// Photo d'un article du dépôt : vérifie le droit « gerer », range l'image dans le bucket public article_photos,
// met à jour l'article. L'image arrive déjà réduite par le téléphone (src/image.js).
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const URLB = Deno.env.get('SUPABASE_URL')!, SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const pub = createClient(URLB, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
  try {
    const { token, id, type, data } = await req.json()
    const ext = TYPES[type]
    if (!id || !ext || typeof data !== 'string') return json({ error: 'Photo illisible.' }, 400)
    const octets = Uint8Array.from(atob(data), c => c.charCodeAt(0))
    if (octets.length > 512000) return json({ error: 'Photo trop lourde.' }, 400)
    const { error: ed } = await pub.rpc('depot_photo_ok', { p_token: token, p_id: id })
    if (ed) return json({ error: ed.message.includes('reserve_depot') ? 'Réservé à ceux qui gèrent le catalogue du dépôt.' : 'Session expirée, reconnectez-vous.' }, 403)
    const chemin = `${id}-${Date.now()}.${ext}`
    const r = await fetch(`${URLB}/storage/v1/object/article_photos/${chemin}`, { method: 'POST', headers: { authorization: `Bearer ${SR}`, apikey: SR, 'content-type': type, 'x-upsert': 'true' }, body: octets })
    if (!r.ok) throw new Error(`Stockage : ${(await r.text()).slice(0, 200)}`)
    const url = `${URLB}/storage/v1/object/public/article_photos/${chemin}`
    const adm = createClient(URLB, SR)
    const { error } = await adm.from('articles').update({ photo_url: url, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) throw new Error(error.message)
    return json({ url })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
