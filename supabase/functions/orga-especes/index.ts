// Remise d'une enveloppe espèces depuis l'appli : enregistrée en base (à confirmer), puis le bot GroupeTreso prévient le porteur.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, nom, montant } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data: r, error } = await sb.rpc('enveloppe_remettre', { p_token: token, p_evt: evt, p_nom: nom, p_montant: montant })
    if (error) return json({ error: /depasse_encaisse/.test(error.message) ? error.message.replace(/^.*depasse_encaisse:\s*/, 'Pas assez encaissé : ') : error.message }, 400)
    if (!r.telegram) return json({ id: r.id, notifie: false, raison: 'pas relié au bot' })
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
    const { data: ps } = await adm.from('parametres').select('cle, valeur').in('cle', ['bot_secret', 'groupetreso_url'])
    const v = Object.fromEntries((ps || []).map((p: any) => [p.cle, p.valeur]))
    const n = await fetch(`${v.groupetreso_url}/api/orga/notifier`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: v.bot_secret, type: 'remise', id: r.id, telegram: r.telegram, evenement: r.evenement, par: r.par, montant }) })
      .then(x => x.json()).catch(() => ({ ok: false, erreur: 'bot injoignable' }))
    return json({ id: r.id, notifie: !!n.ok, raison: n.erreur })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
