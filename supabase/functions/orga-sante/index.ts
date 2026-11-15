// Contrôle de santé : chaque matin (pg_cron) et à la demande d'un admin, on vérifie que chaque brique répond.
// Base, Claude, Zoho, Google Drive, les fonctions de l'appli, le site. Résultat gardé dans orga.sante ;
// chaque panne part aussi dans orga.journal. Aucun secret n'est renvoyé.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sante', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const FONCTIONS = ['orga-copilote', 'orga-dicter', 'orga-especes', 'orga-fichier', 'orga-imputer', 'orga-voix', 'orga-zoho']
const SITE = 'https://epicure-organisation.vercel.app'

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
  if (!o.access_token) throw new Error(`compte de service refusé (${o.error || r.status})`)
  return o.access_token
}

type Res = { cle: string; nom: string; ok: boolean | null; detail: string; ms: number }
async function verifier(cle: string, nom: string, f: () => Promise<string | null>): Promise<Res> {
  const t = Date.now()
  try {
    const d = await Promise.race([f(), new Promise<never>((_, ko) => setTimeout(() => ko(new Error('pas de réponse en 15 s')), 15000))])
    return d === null ? { cle, nom, ok: null, detail: 'pas encore branché', ms: Date.now() - t } : { cle, nom, ok: true, detail: d || 'répond', ms: Date.now() - t }
  } catch (e) { return { cle, nom, ok: false, detail: String((e as any)?.message || e).slice(0, 200), ms: Date.now() - t } }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const URLB = Deno.env.get('SUPABASE_URL')!
  const adm = createClient(URLB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
  try {
    // Qui demande : le réveil du matin (secret maison) ou un admin connecté
    const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'sante').maybeSingle()
    const secret = (par?.valeur as any)?.secret
    let origine = 'matin'
    if (!secret || req.headers.get('x-sante') !== secret) {
      const { token } = await req.json().catch(() => ({}))
      const pub = createClient(URLB, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
      const { error } = await pub.rpc('sante_autorise', { p_token: token })
      if (error) return json({ error: 'Réservé aux administrateurs.' }, 403)
      origine = 'demande'
    }

    const res: Res[] = await Promise.all([
      verifier('base', 'Base de données', async () => { const { error } = await adm.from('parametres').select('cle').limit(1); if (error) throw new Error(error.message); return '' }),
      verifier('claude', 'Claude (copilote, dictée)', async () => {
        const k = Deno.env.get('ANTHROPIC_API_KEY'); if (!k) throw new Error('clé absente')
        const r = await fetch('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } })
        if (!r.ok) throw new Error(`refus ${r.status}`); return ''
      }),
      verifier('zoho', 'Zoho Books (devis)', async () => {
        const id = Deno.env.get('ZOHO_CLIENT_ID'), sec = Deno.env.get('ZOHO_CLIENT_SECRET')
        const { data: z } = await adm.from('parametres').select('valeur').eq('cle', 'zoho').maybeSingle()
        const refresh = (z?.valeur as any)?.refresh
        if (!id || !sec || !refresh) return null
        const o = await (await fetch('https://accounts.zoho.com/oauth/v2/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: sec, refresh_token: refresh }) })).json()
        if (!o.access_token) throw new Error(`jeton refusé (${o.error || '?'})`); return ''
      }),
      verifier('drive', 'Google Drive (dossiers, menus)', async () => { if (!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) return null; await jetonGoogle(); return '' }),
      verifier('fonctions', 'Fonctions de l\'appli', async () => {
        const ko: string[] = []
        await Promise.all(FONCTIONS.map(async f => { try { const r = await fetch(`${URLB}/functions/v1/${f}`, { method: 'OPTIONS' }); if (!r.ok) ko.push(`${f} (${r.status})`) } catch { ko.push(f) } }))
        if (ko.length) throw new Error(`hors service : ${ko.join(', ')}`); return `${FONCTIONS.length} sur ${FONCTIONS.length}`
      }),
      verifier('site', 'Site de l\'appli', async () => { const r = await fetch(SITE, { redirect: 'manual' }); if (r.status >= 500) throw new Error(`erreur ${r.status}`); return r.status === 401 || r.status === 403 ? 'en ligne (protégé)' : 'en ligne' }),
    ])
    const ok = res.every(r => r.ok !== false)
    const { error: ko } = await adm.from('sante').insert({ resultats: res, ok, origine })
    if (ko) throw new Error(`résultat non enregistré : ${ko.message}`)
    const pannes = res.filter(r => r.ok === false)
    if (pannes.length) await adm.from('journal').insert(pannes.map(r => ({ source: `sante:${r.cle}`, message: `${r.nom} : ${r.detail}`, qui: origine })))
    return json({ ok, resultats: res, quand: new Date().toISOString() })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
