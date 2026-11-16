// Notifications push. Réveillée chaque minute par la base (pg_cron, secret maison), ou par l'appli (test, vérifier, clé publique).
// La base décide quoi dire (orga._notifs_passage) ; ici on envoie, 3 notifs au plus par personne et par passage.
// La clé privée VAPID ne sort jamais du serveur : variables de la fonction si présentes, sinon fabriquée une fois et gardée dans une table fermée.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const CONTACT = 'mailto:contact@epicure.ma'

type Abo = { id: number; endpoint: string; p256dh: string; auth: string }
type Alerte = { cle: string; dest: string; titre: string; corps: string; url: string; tag: string; famille: string; abonnements: Abo[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
  const param = async (cle: string) => (await adm.from('parametres').select('valeur').eq('cle', cle).maybeSingle()).data?.valeur as any

  async function cles() {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY')
    if (pub && priv) return { pub, priv }
    let v = await param('notifs_vapid')
    if (!v?.pub) {
      const k = webpush.generateVAPIDKeys()
      await adm.from('parametres').upsert({ cle: 'notifs_vapid', valeur: { pub: k.publicKey, priv: k.privateKey } }, { onConflict: 'cle', ignoreDuplicates: true })
      v = await param('notifs_vapid')   // si deux appels se croisent, on garde celle qui est écrite
    }
    return { pub: v.pub as string, priv: v.priv as string }
  }

  async function envoyer(alertes: Alerte[], max: number) {
    const k = await cles()
    webpush.setVapidDetails(CONTACT, k.pub, k.priv)
    const faits: { cle: string; statut: string }[] = [], morts = new Set<number>(), vivants = new Set<number>()
    const parDest = new Map<string, Alerte[]>()
    for (const a of alertes) parDest.set(a.dest, [...(parDest.get(a.dest) || []), a])
    for (const [, liste] of parDest) {
      // Anti-bruit : au-delà de 3, les 2 premières puis « N autres »
      let aDire = liste, groupees: Alerte[] = []
      if (liste.length > max) { aDire = liste.slice(0, max - 1); groupees = liste.slice(max - 1) }
      const messages = aDire.map(a => ({ a, p: { title: a.titre, body: a.corps, url: a.url, tag: a.tag } }))
      if (groupees.length) messages.push({ a: groupees[0], p: { title: `${groupees.length} autres rappels`, body: 'Touche : voir mes rappels', url: '/#/mes-rappels', tag: 'autres' } })
      for (const { a, p } of messages) {
        if (!a.abonnements.length) continue
        let ok = false
        for (const s of a.abonnements) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(p), { TTL: 3600, urgency: 'high', topic: String(p.tag).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined })
            ok = true; vivants.add(s.id)
          } catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) morts.add(s.id) }
        }
        if (p.tag !== 'autres') faits.push({ cle: a.cle, statut: ok ? 'envoye' : 'echec' })
        else for (const g of groupees) faits.push({ cle: g.cle, statut: ok ? 'groupe' : 'echec' })
      }
      for (const a of liste) if (!a.abonnements.length) faits.push({ cle: a.cle, statut: 'sans_abonnement' })
    }
    await adm.rpc('_notifs_marquer', { p: { faits, morts: [...morts], vivants: [...vivants] } })
    return faits
  }

  async function membre(token: string | undefined) {
    if (!token) return null
    const { data } = await adm.from('sessions').select('nom, expire_le, portee').eq('token', token).maybeSingle()
    if (!data || data.portee !== 'complet' || new Date(data.expire_le) < new Date()) return null
    const { data: m } = await adm.from('membres').select('nom, admin').eq('nom', data.nom).maybeSingle()
    return m as { nom: string; admin: boolean } | null
  }

  async function passage() {
    const cfg = await param('notifs')
    if (!cfg?.actif) return { actif: false, nouvelles: 0, envoyees: 0 }
    const { data: pris } = await adm.rpc('_notifs_verrou', { p_prendre: true })
    if (!pris) return { actif: true, occupe: true }
    try {
      const { data: n, error } = await adm.rpc('_notifs_passage', { p_now: new Date().toISOString() })
      if (error) throw new Error(error.message)
      const { data: liste } = await adm.rpc('_notifs_a_envoyer')
      const faits = (liste as Alerte[])?.length ? await envoyer(liste as Alerte[], Number(cfg.max_par_passage) || 3) : []
      return { actif: true, nouvelles: n, envoyees: faits.filter(f => f.statut === 'envoye').length }
    } finally { await adm.rpc('_notifs_verrou', { p_prendre: false }) }
  }

  try {
    const corps = await req.json().catch(() => ({})) as any
    const action = corps.action
    if (action === 'passage') {
      const secret = await param('notifs_secret')
      if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Refusé.' }, 403)
      return json(await passage())
    }
    if (action === 'vapid_public') return json({ cle: (await cles()).pub })
    const m = await membre(corps.token)
    if (!m) return json({ error: 'Connexion expirée : reconnecte-toi.' }, 401)
    if (action === 'test') {
      const { data: cle } = await adm.rpc('_notifs_test', { p_nom: m.nom })
      const { data: liste } = await adm.rpc('_notifs_a_envoyer')
      const a = (liste as Alerte[]).filter(x => x.cle === cle)
      if (!a[0]?.abonnements.length) { await adm.rpc('_notifs_marquer', { p: { faits: [{ cle, statut: 'sans_abonnement' }] } }); return json({ ok: false, raison: 'Ce téléphone n\'est pas abonné.' }) }
      const f = await envoyer(a, 3)
      return json({ ok: f.some(x => x.statut === 'envoye'), appareils: a[0].abonnements.length })
    }
    if (action === 'verifier') {
      if (!m.admin) return json({ error: 'Réservé aux administrateurs.' }, 403)
      return json(await passage())
    }
    return json({ error: 'Action inconnue.' }, 400)
  } catch (e) {
    return json({ error: 'Les notifications n\'ont pas pu partir.', detail: String((e as any)?.message || e).slice(0, 200) }, 500)
  }
})
