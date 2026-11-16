// Sauvegarde vers Google Drive : toutes les tables du dépôt (public) et de l'appli Événements (orga) en un fichier JSON daté,
// rangé dans « Sauvegardes appli » du dossier Epicure. Sans codes, jetons, secrets, CIN ni téléphones du staff.
// Appel réservé : en-tête x-sante (secret maison), comme le contrôle du matin.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { dossierDrive, jetonGoogle } from '../_shared/google.ts'

const EXCLUES = new Set(['orga.sessions', 'orga.connexion_essais', 'orga.parametres', 'public.depot_sessions', 'public.depot_essais'])
const SANS = ['pin_hash', 'cin', 'tel', 'token', 'telegram']

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
  const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
  try {
    const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'sante').maybeSingle()
    if (!(par?.valeur as any)?.secret || req.headers.get('x-sante') !== (par?.valeur as any).secret) return json({ error: 'refusé' }, 403)
    const { data: tables, error: et } = await adm.rpc('_tables_sauvegarde')
    if (et) throw new Error(et.message)
    const sortie: Record<string, unknown[]> = {}, comptes: Record<string, number> = {}
    for (const { s, t } of tables as { s: string; t: string }[]) {
      if (EXCLUES.has(`${s}.${t}`) || t.startsWith('sauv_')) continue
      const lignes: any[] = []
      for (let i = 0; ; i += 1000) {
        const { data, error } = await adm.schema(s).from(t).select('*').range(i, i + 999)
        if (error) throw new Error(`${s}.${t} : ${error.message}`)
        lignes.push(...(data || [])); if (!data || data.length < 1000) break
      }
      sortie[`${s}.${t}`] = lignes.map(l => { const c = { ...l }; for (const k of SANS) delete c[k]; return c })
      comptes[`${s}.${t}`] = lignes.length
    }
    const tok = await jetonGoogle()
    const { data: dr } = await adm.from('parametres').select('valeur').eq('cle', 'drive').single()
    const parent = (dr?.valeur as any)?.Epicure
    if (!parent) throw new Error('Dossier Epicure introuvable')
    const dossier = await dossierDrive(tok, parent, 'Sauvegardes appli')
    const nom = `Sauvegarde ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.json`
    const sep = 'sv' + crypto.randomUUID()
    const corps = `--${sep}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nom, parents: [dossier.id] })}\r\n--${sep}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ quand: new Date().toISOString(), comptes, tables: sortie })}\r\n--${sep}--`
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink,size', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': `multipart/related; boundary=${sep}` }, body: corps })
    const f = await r.json()
    if (!f.id) throw new Error(`Drive : ${f.error?.message || r.status}`)
    return json({ ok: true, fichier: f.name, url: f.webViewLink, taille: f.size, dossier: dossier.url, comptes })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
