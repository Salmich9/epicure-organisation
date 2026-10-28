// Devis Zoho Books de l'appli Organisation : brouillon créé depuis le chiffrage (Epicure TVA 20 %, Business Boys TVA 10 %).
// Secrets : ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET (Self Client). Le jeton longue durée est gardé dans orga.parametres('zoho'),
// lisible seulement côté serveur. Droits demandés : devis, contacts, réglages (lecture). Rien sur factures, paiements ou banque.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const COMPTES = 'https://accounts.zoho.com'
const NOMS: Record<string, RegExp> = { Epicure: /epicure/i, 'Business Boys': /business\s*boys|barom/i }
const TVA: Record<string, number> = { Epicure: 20, 'Business Boys': 10 }
const IMPREVUS = 0.03
// Conditions maison, reprises telles quelles sur chaque devis (sauf autres conditions dictées)
const CONDITIONS = "Devis H.T /Le bon pour accord de ce devis moyennant une avance de 50% vient acter la phase de prestation.\nLe solde de 50% est dû à J-7 avant l'événement.\nLorsque le devis est validé, sa totalité est due.\nDevis valable 15 jours.\nZone de 5x5m mise à disposition en back office + arrivée d'eau et éléctricité."
// Une seule ligne de devis : Zoho accepte au moins 4 865 caractères (testé le 28/10). Au-delà, la suite part sur une ligne à 0 MAD juste en dessous
const MAXDESC = 4800
const decouper = (t: string) => { const out: string[] = []; let cur = ''; for (const l of t.split('\n')) { if (cur && (cur + '\n' + l).length > MAXDESC) { out.push(cur); cur = l } else cur = cur ? cur + '\n' + l : l } if (cur) out.push(cur); return out.length ? out : [''] }

// Le client voit des prestations, jamais la structure de coûts : les zones sont regroupées,
// la logistique et le lieu répartis au prorata. Le total vaut le prix signé (ou proposé tant que rien n'est signé).
const GROUPES: { nom: (ev: any) => string; zones: string[]; description: (ev: any, inv: number) => string }[] = [
  { nom: ev => ev.format || 'Prestation traiteur', zones: ['Menu', 'Cuisine traiteur', 'Salle et mobilier', 'Décoration et ambiance'], description: (ev, inv) => `${inv} couverts${ev.format ? ` · ${ev.format.toLowerCase()}` : ''} · cuisine sur place, mobilier et décoration de table` },
  { nom: () => 'Bar', zones: ['Bar'], description: () => 'Bar : boissons, glace, verrerie et barmen' },
  { nom: () => 'Service et art de table', zones: ['Staff', 'Art de table'], description: () => 'Maîtres d\'hôtel et serveurs, vaisselle, verrerie, nappage' },
]
const REPARTIS = ['Logistique', 'Lieu, technique et admin']
function prestations(ev: any, lignes: any[], coef: number, presentation: string) {
  const inv = Number(ev.invites) || 1
  const zone: Record<string, number> = {}
  for (const l of lignes) zone[l.zone] = (zone[l.zone] || 0) + (Number(l.quantite) || 0) * (Number(l.prix) || 0)
  const cout = Object.values(zone).reduce((a, b) => a + b, 0)
  const total = Math.round(Number(ev.prix_signe) || cout * 1.03 * coef)
  if (presentation === 'forfait' || !cout) return { total, lignes: [{ nom: `Prestation ${(ev.prestations || ['traiteur']).join(' et ').toLowerCase()}`, description: `${ev.nom} · ${inv} invités${ev.format ? ` · ${ev.format}` : ''}${ev.date ? ` · le ${String(ev.date).split('-').reverse().join('/')}` : ''}`, montant: total }] }
  const connus = new Set(GROUPES.flatMap(g => g.zones).concat(REPARTIS))
  const g = GROUPES.map(x => ({ nom: x.nom(ev), description: x.description(ev, inv), base: x.zones.reduce((a, z) => a + (zone[z] || 0), 0) }))
  g[0].base += Object.entries(zone).filter(([z]) => !connus.has(z)).reduce((a, [, v]) => a + v, 0)   // zone inconnue : avec la prestation principale
  const utiles = g.filter(x => x.base > 0), somme = utiles.reduce((a, x) => a + x.base, 0) || 1
  let reste = total
  const out = utiles.map((x, i) => { const m = i === utiles.length - 1 ? reste : Math.round(total * x.base / somme); reste -= m; return { nom: x.nom, description: x.description, montant: m } })
  return { total, lignes: out }
}

type Zoho = { refresh: string; api: string; orgs: Record<string, string> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, mode, code, presentation: pres, lignes_client, conditions, objet } = await req.json()
    const id = Deno.env.get('ZOHO_CLIENT_ID'), secret = Deno.env.get('ZOHO_CLIENT_SECRET')
    if (!id || !secret) return json({ error: 'Zoho pas encore branché (ZOHO_CLIENT_ID et ZOHO_CLIENT_SECRET).' }, 501)
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })

    // ---------- branchement : le code du Self Client contre un jeton longue durée ----------
    if (mode === 'init') {
      if (data.moi !== 'Salmane') return json({ error: 'Réservé à Salmane.' }, 403)
      const r = await fetch(`${COMPTES}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', client_id: id, client_secret: secret, code: String(code || '').trim() }) })
      const o = await r.json()
      if (!o.refresh_token) return json({ error: `Zoho refuse le code : ${o.error || r.status}` }, 400)
      const api = o.api_domain || 'https://www.zohoapis.com'
      const l = await (await fetch(`${api}/books/v3/organizations`, { headers: { authorization: `Zoho-oauthtoken ${o.access_token}` } })).json()
      const orgs: Record<string, string> = {}
      for (const org of l.organizations || []) for (const [k, re] of Object.entries(NOMS)) if (re.test(org.name) && !orgs[k]) orgs[k] = String(org.organization_id)
      await adm.from('parametres').upsert({ cle: 'zoho', valeur: { refresh: o.refresh_token, api, orgs } })
      return json({ ok: true, organisations: (l.organizations || []).map((x: any) => x.name), reliees: orgs })
    }

    if (mode !== 'devis' && mode !== 'apercu') return json({ error: 'mode inconnu' }, 400)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}
    const presentation = pres || ev.presentation || 'prestation'
    // Lignes dictées à l'agent vocal : reprises telles quelles (première ligne = intitulé)
    const parle = Array.isArray(lignes_client) && lignes_client.length
      ? lignes_client.map((l: any) => { const t = String(l.description || '').split('\n'); return { nom: t[0].trim() || 'Prestation', description: t.slice(1).join('\n').trim(), montant: Math.round(Number(l.montant) || 0), unite: true } })
      : null
    const { data: ch } = await adm.from('chiffrages').select('lignes, coef').eq('evenement_id', ev.id).maybeSingle()
    const lignes: any[] = ch?.lignes || []
    if (!parle && !lignes.length) return json({ error: 'Chiffre d\'abord l\'événement.' }, 400)
    const prest = parle ? { total: parle.reduce((a: number, l: any) => a + l.montant, 0), lignes: parle } : prestations(ev, lignes, Number(ch?.coef || ev.coef) || 2.4, presentation)
    // Sans facture (espèces) : le devis est quand même fait chez Epicure, TVA affichée
    const soc = TVA[ev.entite] ? ev.entite : 'Epicure'
    if (mode === 'apercu') return json({ presentation, lignes: prest.lignes, total: prest.total, tva: TVA[soc] })
    const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'zoho').single()
    const z = par?.valeur as Zoho | undefined
    if (!z?.refresh) return json({ error: 'Zoho pas encore branché : le code du Self Client reste à échanger.' }, 501)
    const org = z.orgs?.[soc]
    if (!org) return json({ error: `Organisation Zoho « ${soc} » introuvable.` }, 500)
    const t = await (await fetch(`${COMPTES}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: z.refresh }) })).json()
    if (!t.access_token) return json({ error: `Zoho : ${t.error || 'jeton refusé'}` }, 502)
    const zo = async (chemin: string, init: RequestInit = {}) => {
      const r = await fetch(`${z.api}/books/v3/${chemin}${chemin.includes('?') ? '&' : '?'}organization_id=${org}`, { ...init, headers: { authorization: `Zoho-oauthtoken ${t.access_token}`, 'content-type': 'application/json', ...(init.headers || {}) } })
      const o = await r.json(); if (o.code !== 0) throw new Error(`Zoho : ${o.message || r.status}`); return o
    }

    // TVA de la société, client (créé s'il n'existe pas)
    const taxes = (await zo('settings/taxes')).taxes || []
    const tax = taxes.find((x: any) => Number(x.tax_percentage) === TVA[soc])
    const nomClient = (ev.client || ev.nom).trim()
    const cs = (await zo(`contacts?contact_name_contains=${encodeURIComponent(nomClient)}&contact_type=customer`)).contacts || []
    const client = cs.find((c: any) => c.contact_name.toLowerCase() === nomClient.toLowerCase()) || (await zo('contacts', { method: 'POST', body: JSON.stringify({ contact_name: nomClient, contact_type: 'customer' }) })).contact

    const inv = Number(ev.invites) || 1
    const lignesDevis = prest.lignes.flatMap((l: any) => decouper(String(l.description || '')).map((d, i) => ({ name: i ? `${l.nom} (suite)` : l.nom, description: d,
      rate: i ? 0 : l.unite ? l.montant : Math.round((l.montant / inv) * 100) / 100, quantity: i || l.unite ? 1 : inv, ...(tax ? { tax_id: tax.tax_id } : {}) })))
    const dateFr = ev.date ? String(ev.date).split('-').reverse().join('/') : ''
    const sujet = String(objet || '').trim() || [`${ev.nom || 'Événement'}${ev.invites ? ` ${ev.invites} pax` : ''}`, nomClient, dateFr, ev.lieu].filter(Boolean).join(' / ')
    const corps = { customer_id: client.contact_id, date: data.aujourdhui, reference_number: ev.id, line_items: lignesDevis,
      notes: `${(ev.prestations || []).join(' + ')}${ev.format ? ` · ${ev.format}` : ''}${ev.lieu ? ` · ${ev.lieu}` : ''}${ev.date ? ` · le ${ev.date.split('-').reverse().join('/')}` : ''}`,
      expiry_date: new Date(new Date(data.aujourdhui).getTime() + 15 * 864e5).toISOString().slice(0, 10), terms: String(conditions || '').trim() || CONDITIONS, subject_content: sujet.slice(0, 250) }
    // Un seul devis par événement : remis à jour s'il existe déjà en brouillon
    const deja = ev.zoho_devis?.id
    const o = deja ? await zo(`estimates/${deja}`, { method: 'PUT', body: JSON.stringify(corps) }).catch(() => null) : null
    const d = (o || await zo('estimates', { method: 'POST', body: JSON.stringify(corps) })).estimate
    const url = `https://books.zoho.com/app/${org}#/quotes/${d.estimate_id}`
    await adm.from('evenements').update({ zoho_devis: { id: d.estimate_id, numero: d.estimate_number, total: d.total, url, le: new Date().toISOString() }, presentation, ...(['Demande', null, ''].includes(ev.statut) ? { statut: 'Devis envoyé' } : {}) }).eq('id', ev.id)
    return json({ numero: d.estimate_number, total: d.total, url, tva: tax ? TVA[soc] : null, mis_a_jour: !!o })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
