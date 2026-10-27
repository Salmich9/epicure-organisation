// Devis Zoho Books de l'appli Organisation : brouillon créé depuis le chiffrage (Epicure TVA 20 %, Business Boys TVA 10 %).
// Secrets : ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET (Self Client). Le jeton longue durée est gardé dans orga.parametres('zoho'),
// lisible seulement côté serveur. Droits demandés : devis, contacts, réglages (lecture). Rien sur factures, paiements ou banque.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const COMPTES = 'https://accounts.zoho.com'
const NOMS: Record<string, RegExp> = { Epicure: /epicure/i, 'Business Boys': /business\s*boys|barom/i }
const TVA: Record<string, number> = { Epicure: 20, 'Business Boys': 10 }
const IMPREVUS = 0.03

type Zoho = { refresh: string; api: string; orgs: Record<string, string> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, mode, code } = await req.json()
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

    if (mode !== 'devis') return json({ error: 'mode inconnu' }, 400)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}
    if (!TVA[ev.entite]) return json({ error: 'Pas de devis Zoho pour un événement en espèces.' }, 400)
    const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'zoho').single()
    const z = par?.valeur as Zoho | undefined
    if (!z?.refresh) return json({ error: 'Zoho pas encore branché : le code du Self Client reste à échanger.' }, 501)
    const org = z.orgs?.[ev.entite]
    if (!org) return json({ error: `Organisation Zoho « ${ev.entite} » introuvable.` }, 500)
    const t = await (await fetch(`${COMPTES}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: z.refresh }) })).json()
    if (!t.access_token) return json({ error: `Zoho : ${t.error || 'jeton refusé'}` }, 502)
    const zo = async (chemin: string, init: RequestInit = {}) => {
      const r = await fetch(`${z.api}/books/v3/${chemin}${chemin.includes('?') ? '&' : '?'}organization_id=${org}`, { ...init, headers: { authorization: `Zoho-oauthtoken ${t.access_token}`, 'content-type': 'application/json', ...(init.headers || {}) } })
      const o = await r.json(); if (o.code !== 0) throw new Error(`Zoho : ${o.message || r.status}`); return o
    }

    // Chiffrage : coût par zone → prix de vente (imprévus 3 %, coef) réparti par invité
    const { data: ch } = await adm.from('chiffrages').select('lignes, coef').eq('evenement_id', ev.id).maybeSingle()
    const lignes: any[] = ch?.lignes || []
    if (!lignes.length) return json({ error: 'Chiffre d\'abord l\'événement.' }, 400)
    const coef = Number(ch?.coef || ev.coef) || 2.4, inv = Number(ev.invites) || 1
    const zones: Record<string, number> = {}
    for (const l of lignes) zones[l.zone] = (zones[l.zone] || 0) + (Number(l.quantite) || 0) * (Number(l.prix) || 0)
    const ordre = data.zones.map((x: any) => x.nom)

    // TVA de la société, client (créé s'il n'existe pas)
    const taxes = (await zo('settings/taxes')).taxes || []
    const tax = taxes.find((x: any) => Number(x.tax_percentage) === TVA[ev.entite])
    const nomClient = (ev.client || ev.nom).trim()
    const cs = (await zo(`contacts?contact_name_contains=${encodeURIComponent(nomClient)}&contact_type=customer`)).contacts || []
    const client = cs.find((c: any) => c.contact_name.toLowerCase() === nomClient.toLowerCase()) || (await zo('contacts', { method: 'POST', body: JSON.stringify({ contact_name: nomClient, contact_type: 'customer' }) })).contact

    const lignesDevis = Object.entries(zones).filter(([, v]) => v > 0)
      .sort(([a], [b]) => ordre.indexOf(a) - ordre.indexOf(b))
      .map(([zone, cout]) => ({ name: zone, description: `${ev.nom} · ${inv} invités${ev.format && zone === 'Menu' ? ` · ${ev.format}` : ''}`,
        rate: Math.round((cout * (1 + IMPREVUS) * coef / inv) * 100) / 100, quantity: inv, ...(tax ? { tax_id: tax.tax_id } : {}) }))
    const corps = { customer_id: client.contact_id, date: data.aujourdhui, reference_number: ev.id, line_items: lignesDevis,
      notes: `${(ev.prestations || []).join(' + ')}${ev.format ? ` · ${ev.format}` : ''}${ev.lieu ? ` · ${ev.lieu}` : ''}${ev.date ? ` · le ${ev.date.split('-').reverse().join('/')}` : ''}`,
      ...(ev.date ? { expiry_date: ev.date } : {}) }
    // Un seul devis par événement : remis à jour s'il existe déjà en brouillon
    const deja = ev.zoho_devis?.id
    const o = deja ? await zo(`estimates/${deja}`, { method: 'PUT', body: JSON.stringify(corps) }).catch(() => null) : null
    const d = (o || await zo('estimates', { method: 'POST', body: JSON.stringify(corps) })).estimate
    const url = `https://books.zoho.com/app/${org}#/quotes/${d.estimate_id}`
    await adm.from('evenements').update({ zoho_devis: { id: d.estimate_id, numero: d.estimate_number, total: d.total, url, le: new Date().toISOString() } }).eq('id', ev.id)
    return json({ numero: d.estimate_number, total: d.total, url, tva: tax ? TVA[ev.entite] : null, mis_a_jour: !!o })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
