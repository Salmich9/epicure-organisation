// Bon d'achat espèces : fabrique le PDF du bon signé et le range dans le Drive
// (événement › Pièces fournisseurs, ou Epicure › Dépôt › Bons espèces pour un réassort).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { dossierDrive, jetonGoogle } from '../_shared/google.ts'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const SOC: Record<string, string> = { BB: 'Business Boys', EPI: 'Epicure' }
const mad = (v: number) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[\u202f\u00a0]/g, ' ')
const U = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const D = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
const cent = (x: number): string => x < 17 ? U[x] : x < 20 ? 'dix-' + U[x - 10] : (() => { const d = Math.floor(x / 10), u = x % 10
  if (d === 7 || d === 9) return D[d] + (u === 1 && d === 7 ? ' et ' : '-') + cent(10 + u)
  return D[d] + (u === 0 ? (d === 8 ? 's' : '') : u === 1 && d !== 8 ? ' et un' : '-' + U[u]) })()
const mil = (x: number) => { const c = Math.floor(x / 100), r = x % 100; return [c ? (c === 1 ? 'cent' : U[c] + ' cent' + (r === 0 ? 's' : '')) : '', r ? cent(r) : ''].filter(Boolean).join(' ') }
const entier = (e: number) => { if (!e) return 'zéro'; const m = Math.floor(e / 1000), r = e % 1000; return [m ? (m === 1 ? 'mille' : mil(m) + ' mille') : '', r ? mil(r) : ''].filter(Boolean).join(' ') }
const lettres = (v: number) => { const c = Math.round(v * 100), e = Math.floor(c / 100), ct = c % 100; return `${entier(e)} dirhams${ct ? ` et ${entier(ct)} centimes` : ''}` }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const URLB = Deno.env.get('SUPABASE_URL')!
  const adm = createClient(URLB, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
  const pub = createClient(URLB, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
  try {
    const { token, id } = await req.json()
    const { data: ctx, error: ec } = await pub.rpc('bon_contexte', { p_token: token, p_evt: null })
    if (ec) return json({ error: 'Session expirée, reconnectez-vous.' }, 401)
    const { data: b, error } = await adm.rpc('_bon_pour_pdf', { p_id: id })
    if (error || !b) return json({ error: 'Bon introuvable.' }, 404)
    if (b.payeur !== (ctx as any).moi) return json({ error: 'Ce bon n\'est pas le tien.' }, 403)
    if (b.drive_url) return json({ url: b.drive_url })

    // Le PDF (A5, sans en-tête de société pour le moment)
    const pdf = await PDFDocument.create(), page = pdf.addPage([420, 595])
    const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold)
    const encre = rgb(.11, .17, .14), gris = rgb(.47, .51, .49), vert = rgb(.12, .44, .42)
    const t = (s: string, x: number, y: number, o: any = {}) => page.drawText(s, { x, y, size: o.size || 10, font: o.b ? fb : f, color: o.c || encre })
    const droite = (s: string, x: number, y: number, o: any = {}) => t(s, x - (o.b ? fb : f).widthOfTextAtSize(s, o.size || 10), y, o)
    let y = 550
    t('BON D\'ACHAT ESPÈCES', 30, y, { b: true, size: 9, c: vert }); droite(`N° ${b.num}`, 390, y, { b: true, size: 13 })
    y -= 16; t(`Société : ${SOC[b.societe] || b.societe}`, 30, y, { c: gris, size: 9 })
    droite(new Date(b.cree_le).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), 390, y, { c: gris, size: 9 })
    y -= 10; page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: 1.5, color: encre })
    y -= 22; t('Pour : ', 30, y); t(b.pour, 30 + f.widthOfTextAtSize('Pour : ', 10), y, { b: true })
    y -= 24; t('Désignation', 30, y, { c: gris, size: 8.5 }); droite('Qté', 260, y, { c: gris, size: 8.5 }); droite('P.U.', 320, y, { c: gris, size: 8.5 }); droite('Total', 390, y, { c: gris, size: 8.5 })
    y -= 6; page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: .5, color: gris })
    for (const l of b.lignes) {
      y -= 17; t(String(l.nom).slice(0, 42), 30, y); droite(String(l.qte), 260, y); droite(mad(l.prix), 320, y); droite(mad(l.qte * l.prix), 390, y)
    }
    y -= 10; page.drawLine({ start: { x: 30, y }, end: { x: 390, y }, thickness: .5, color: gris })
    y -= 22; t('Total payé en espèces', 30, y); droite(`${mad(b.total)} MAD`, 390, y, { b: true, size: 14 })
    y -= 18; t(`Arrêté le présent bon à la somme de ${lettres(Number(b.total))}.`.slice(0, 110), 30, y, { size: 8.5, c: gris })
    y -= 34; t('PAYÉ PAR', 30, y, { size: 8, c: gris }); t('REÇU PAR', 200, y, { size: 8, c: gris })
    y -= 14; t(b.payeur, 30, y, { b: true }); t(String(b.vendeur).slice(0, 34), 200, y, { b: true })
    const png = await pdf.embedPng(Uint8Array.from(atob(String(b.signature).split(',')[1]), c => c.charCodeAt(0)))
    const w = 190, h = Math.min(90, png.height * (w / png.width))
    page.drawImage(png, { x: 200, y: y - 8 - h, width: w, height: h })
    t('Bon établi depuis l\'appli Epicure · signature du vendeur sur l\'écran.', 30, 30, { size: 7.5, c: gris })
    const octets = await pdf.save()

    // Drive : dossier de l'événement, sinon dossier dépôt
    const tok = await jetonGoogle()
    const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'drive').single()
    const drv = (par?.valeur || {}) as Record<string, string>
    let dossier: string
    if (b.evenement_id) {
      dossier = b.drive_sous?.['Pièces fournisseurs']
      if (!dossier) {
        const parent = drv[b.entite || 'Epicure'] || drv.Epicure
        const d = await dossierDrive(tok, parent, `${b.evt_date || 'date à fixer'} · ${b.evt_nom}`)
        const sous: Record<string, string> = {}
        for (const n of ['Pièces fournisseurs', 'Organisation', 'À revoir']) sous[n] = (await dossierDrive(tok, d.id, n)).id
        await adm.from('evenements').update({ drive_id: d.id, drive_url: d.url, drive_sous: sous }).eq('id', b.evenement_id)
        dossier = sous['Pièces fournisseurs']
      }
    } else {
      dossier = (await dossierDrive(tok, (await dossierDrive(tok, drv.Epicure, 'Dépôt')).id, 'Bons espèces')).id
    }
    const sep = 'bon' + crypto.randomUUID(), enc = new TextEncoder()
    const tete = enc.encode(`--${sep}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: `Bon ${b.num} · ${b.vendeur}.pdf`, parents: [dossier] })}\r\n--${sep}\r\nContent-Type: application/pdf\r\n\r\n`)
    const pied = enc.encode(`\r\n--${sep}--`), corps = new Uint8Array(tete.length + octets.length + pied.length)
    corps.set(tete, 0); corps.set(octets, tete.length); corps.set(pied, tete.length + octets.length)
    const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
      method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': `multipart/related; boundary=${sep}` }, body: corps })
    const fi = await r.json()
    if (!fi.id) throw new Error(`Drive : ${fi.error?.message || r.status}`)
    await adm.from('bons').update({ drive_url: fi.webViewLink }).eq('id', id)
    return json({ url: fi.webViewLink })
  } catch (e) {
    return json({ error: String((e as any)?.message || e) }, 500)
  }
})
