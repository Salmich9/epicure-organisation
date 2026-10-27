// Agent vocal « Epicure · Chiffrage devis » branché sur l'appli Organisation.
// L'appli lance l'appel avec le jeton de session (variable orga_token) : rien ne s'écrit sans lui.
// En fin d'appel : l'événement est créé, le devis Zoho brouillon reprend les lignes validées à l'oral,
// puis le dossier Drive et le chiffrage détaillé (lignes d'organisation) se font en arrière-plan.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const PRESTA: Record<string, string[]> = { 'Bar seul': ['Bar'], 'Traiteur seul': ['Traiteur'], 'Bar + traiteur': ['Traiteur', 'Bar'] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const p = await req.json()
    const token = String(p.token || '').trim()
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ ok: false, message: "Pas de session de l'appli : ouvre l'agent depuis l'appli Organisation (bouton Chiffrer à la voix) pour créer l'événement." })
    const URL = Deno.env.get('SUPABASE_URL')!, ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const sb = createClient(URL, ANON, { db: { schema: 'orga' } })
    const d0 = await sb.rpc('donnees', { p_token: token, p_evt: null })
    if (d0.error) return json({ ok: false, message: 'Session expirée : reconnecte-toi dans l\'appli puis relance l\'agent.' })

    const lignes = (Array.isArray(p.lignes) ? p.lignes : []).filter((l: any) => l && Number(l.montant) > 0)
    const prix = Number(p.prix_ht) || lignes.reduce((s: number, l: any) => s + Number(l.montant), 0)
    const cout = Number(p.cout_total) || 0
    const note = [
      p.inclus && `Inclus : ${p.inclus}`,
      p.heures && `${p.heures} h de service`,
      cout && `Coût estimé à l'appel : ${Math.round(cout)} MAD`,
      p.mode_encaissement && `Encaissement : ${p.mode_encaissement}`,
      Array.isArray(p.operateurs) && p.operateurs.length && `Sur place : ${p.operateurs.join(', ')}`,
      p.apporteur_nom && `Apporteur : ${p.apporteur_nom}`,
      p.agence_pct && `Commission agence : ${Math.round(Number(p.agence_pct) * 100)} %`,
      'Chiffré à la voix',
    ].filter(Boolean).join(' · ')

    const c = await sb.rpc('evenement_creer', { p_token: token, p: {
      nom: p.evenement || p.client || 'Événement', date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : null, lieu: p.lieu || '',
      invites: Number(p.pax) || null, client: p.client || '', prestations: PRESTA[p.format] || ['Traiteur'], format: '',
      entite: p.societe === 'Business Boys' ? 'Business Boys' : 'Epicure', intermediaire: Number(p.agence_pct) > 0 ? 'Agence' : '', note,
    } })
    if (c.error) return json({ ok: false, message: `Création refusée : ${c.error.message}` })
    const evt = c.data.id
    await sb.rpc('evenement_maj', { p_token: token, p_evt: evt, p: { prix, ...(cout > 0 && prix > 0 ? { coef: Math.round((prix / (cout * 1.03)) * 100) / 100 } : {}) } })

    // Devis Zoho brouillon avec les lignes validées pendant l'appel
    let devis: any = null
    if (lignes.length) {
      const r = await fetch(`${URL}/functions/v1/orga-zoho`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON },
        body: JSON.stringify({ token, evt, mode: 'devis', presentation: 'forfait', lignes_client: lignes, conditions: p.conditions || '', objet: p.objet || '' }) })
      devis = await r.json().catch(() => ({ error: 'réponse illisible' }))
    }

    // En arrière-plan : dossier Drive puis chiffrage détaillé pour la revue
    const suite = (async () => {
      const call = (body: any) => fetch(`${URL}/functions/v1/orga-copilote`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON }, body: JSON.stringify({ token, evt, ...body }) }).catch(() => null)
      await call({ mode: 'dossier' })
      await call({ mode: 'chiffrer', note: `Chiffrage fait à la voix : ${p.format || ''}, ${p.pax || '?'} invités, ${p.heures || '?'} h. ${p.inclus || ''} Lignes du devis : ${lignes.map((l: any) => `${String(l.description).split('\n')[0]} ${Math.round(l.montant)} MAD`).join(' ; ')}. Coût total estimé ${Math.round(cout)} MAD : reste cohérent avec ce montant.` })
    })()
    // @ts-ignore EdgeRuntime existe sur Supabase
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(suite)

    return json({ ok: true, evenement_id: evt, devis_numero: devis?.numero || null, devis_erreur: devis?.error || null,
      message: devis?.numero ? `Événement créé dans l'appli et devis ${devis.numero} en brouillon dans Zoho. Le chiffrage détaillé arrive dans l'appli d'ici deux minutes.`
        : `Événement créé dans l'appli${devis?.error ? `, mais le devis Zoho a échoué : ${devis.error}` : ''}. Le chiffrage détaillé arrive d'ici deux minutes.` })
  } catch (e) {
    return json({ ok: false, message: String(e?.message || e) }, 500)
  }
})
