// Range un fichier de l'événement (menu PDF ou photo) dans son dossier Drive, sous-dossier Organisation,
// et garde le lien dans evenements.menu.fichiers. Compte de service : secret GOOGLE_SERVICE_ACCOUNT_JSON.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const MAX = 15 * 1024 * 1024

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, nom, type, base64 } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    if (!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) return json({ error: 'Drive pas encore branché.' }, 501)
    const ev = data.evenements.find((x: any) => x.id === data.evt)
    if (!ev) return json({ error: 'Événement introuvable' }, 404)
    const octets = Uint8Array.from(atob(String(base64 || '')), c => c.charCodeAt(0))
    if (!octets.length) return json({ error: 'Fichier vide' }, 400)
    if (octets.length > MAX) return json({ error: 'Fichier trop lourd (15 Mo au plus)' }, 413)
    const mime = /^(application\/pdf|image\/(jpeg|png|heic|webp))$/.test(type) ? type : 'application/pdf'

    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
    const tok = await jetonGoogle()
    // Dossier de l'événement (créé s'il n'existe pas encore), puis Organisation
    let orgaId = ev.drive_sous?.['Organisation']
    if (!orgaId) {
      const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'drive').single()
      const parent = par?.valeur?.[ev.entite || 'Epicure'] || par?.valeur?.['Epicure']
      if (!parent) return json({ error: 'Dossier société introuvable' }, 500)
      const d = await dossierDrive(tok, parent, `${ev.date || 'date à fixer'} · ${ev.nom}`)
      const sous: Record<string, string> = {}
      for (const n of ['Pièces fournisseurs', 'Organisation', 'À revoir']) sous[n] = (await dossierDrive(tok, d.id, n)).id
      await adm.from('evenements').update({ drive_id: d.id, drive_url: d.url, drive_sous: sous }).eq('id', ev.id)
      orgaId = sous['Organisation']
    }
    const propre = String(nom || 'Menu').replace(/[\\/]/g, '-').slice(0, 120)
    const meta = { name: propre.startsWith('Menu') ? propre : `Menu · ${propre}`, parents: [orgaId] }
    const sep = 'orga' + crypto.randomUUID()
    const enc = new TextEncoder()
    const tete = enc.encode(`--${sep}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${sep}\r\nContent-Type: ${mime}\r\n\r\n`)
    const pied = enc.encode(`\r\n--${sep}--`)
    const corps = new Uint8Array(tete.length + octets.length + pied.length)
    corps.set(tete, 0); corps.set(octets, tete.length); corps.set(pied, tete.length + octets.length)
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': `multipart/related; boundary=${sep}` }, body: corps })
    const f = await r.json()
    if (!f.id) return json({ error: `Drive : ${f.error?.message || r.status}` }, 502)
    const fichier = { id: f.id, nom: f.name, url: f.webViewLink, type: mime, par: data.moi, le: new Date().toISOString() }
    const { data: e2 } = await adm.from('evenements').select('menu').eq('id', ev.id).single()
    const menu = { ...(e2?.menu || {}), fichiers: [...((e2?.menu || {}).fichiers || []), fichier] }
    await adm.from('evenements').update({ menu }).eq('id', ev.id)
    return json({ menu, fichier })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
