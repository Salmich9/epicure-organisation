// Google Drive avec le compte de service (jeton signé ici, jamais sur le téléphone).
// Partagé par les fonctions de l'appli.
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
export async function jetonGoogle(): Promise<string> {
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
export async function dossierDrive(tok: string, parent: string, nom: string): Promise<{ id: string; url: string }> {
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
