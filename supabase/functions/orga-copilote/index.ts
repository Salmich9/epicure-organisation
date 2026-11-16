// Copilote de l'appli Organisation : place les notes et challenge l'organisation.
// La clé Claude reste ici (secret ANTHROPIC_API_KEY), jamais sur le téléphone.
// Découpage : outils.ts (schémas), consignes.ts (personnage et contexte), ../_shared/google.ts (Drive).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { TOOLS } from './outils.ts'
import { SYSTEME, contexte } from './consignes.ts'
import { dossierDrive, jetonGoogle } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const MODEL = 'claude-sonnet-5-5'

const actu0 = (l: any) => l && l.length ? 'Garde les lignes du chiffrage actuel sauf si la consigne les change. ' : ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })
  try {
    const { token, evt, mode, note, theme, lignes, reponses } = await req.json()
    if (!['placer', 'challenge', 'planning', 'bulles', 'chiffrer', 'dossier', 'bilan', 'cadrage', 'article'].includes(mode)) return json({ error: 'mode inconnu' }, 400)

    // Le jeton de session de l'appli est vérifié par la base elle-même.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { db: { schema: 'orga' } })
    const { data, error } = await sb.rpc('donnees', { p_token: token, p_evt: evt || null })
    if (error) return json({ error: 'Session expirée, reconnecte-toi.' }, 401)
    const ev = data.evenements.find((x: any) => x.id === data.evt) || {}

    // Dossier Drive de l'événement : écrit directement par le compte de service (Gestionnaire de contenu du Drive partagé).
    if (mode === 'dossier') {
      if (!Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')) return json({ error: 'Création du dossier pas encore branchée (GOOGLE_SERVICE_ACCOUNT_JSON absent des secrets Supabase).' }, 501)
      const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
      const { data: par } = await adm.from('parametres').select('valeur').eq('cle', 'drive').single()
      const parent = par?.valeur?.[ev.entite || 'Epicure']
      if (!parent) return json({ error: 'Dossier société introuvable' }, 500)
      const tok = await jetonGoogle()
      const d = await dossierDrive(tok, parent, `${ev.date || 'date à fixer'} · ${ev.nom}`)
      const sous: Record<string, string> = {}
      for (const n of ['Pièces fournisseurs', 'Organisation', 'À revoir']) sous[n] = (await dossierDrive(tok, d.id, n)).id
      await adm.from('evenements').update({ drive_id: d.id, drive_url: d.url, drive_sous: sous }).eq('id', ev.id)
      return json({ id: d.id, url: d.url, sous })
    }
    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return json({ error: 'Clé Claude absente : ajoute ANTHROPIC_API_KEY dans les secrets Supabase.' }, 500)

    // Leçons retenues des événements passés : elles nourrissent les prochains chiffrages
    const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'orga' } })
    const lecons = mode === 'chiffrer' || mode === 'bilan'
      ? ((await adm.from('lecons').select('zone, texte, detail, evenement_id').eq('statut', 'retenue').order('id', { ascending: false }).limit(40)).data || [])
      : []
    const leconsTxt = lecons.length ? `Leçons retenues des événements passés (à appliquer) :\n${lecons.map((l: any) => `- ${l.zone ?? ''} : ${l.texte} (${l.detail ?? ''})`).join('\n')}` : ''

    // Paramètres de chiffrage de l'appli : la seule source des prix et des ratios (comme pour l'agent vocal)
    const ptxt = ['chiffrer', 'cadrage', 'challenge', 'bilan'].includes(mode)
      ? `Paramètres de chiffrage (seule source des prix, ratios et quantités repères) :\n${(await sb.rpc('chiffrage_params_texte', { p_token: token })).data || ''}` : ''

    let chiffrageTxt = '', bilanTxt = ''
    if (mode === 'bilan') {
      const c = await sb.rpc('chiffrage_contexte', { p_token: token, p_evt: data.evt })
      const cat: Record<string, any> = {}
      for (const x of (c.data?.catalogue || [])) cat[x.id] = x
      const env = (z: any) => ev.budget_zones && Object.keys(ev.budget_zones).length ? Number(ev.budget_zones[z.nom] || 0) : Number(z.enveloppe || 0) * Number(ev.invites || 0)
      bilanTxt = `Prix signé HT : ${ev.prix_signe ?? '?'} MAD, budget retenu ${ev.budget ?? '?'} MAD, ${ev.invites ?? '?'} invités, ${(ev.prestations || []).join(' + ')}, ${ev.format ?? ''}.
Par zone (prévu | engagé | facturé réel) puis éléments (quantité | coût engagé | facturé | catalogue) :
${data.zones.map((z: any) => {
  const els = data.elements.filter((e: any) => e.zone === z.nom)
  const f = els.reduce((s: number, e: any) => s + Number(e.facture || 0), 0), g = els.reduce((s: number, e: any) => s + Number(e.cout || 0), 0)
  return `## ${z.nom} : prévu ${Math.round(env(z))} | engagé ${Math.round(g)} | facturé ${Math.round(f)}\n` + els.map((e: any) => { const k = cat[e.catalogue_id]; return `  ${e.element} | qte ${e.qte_forcee ?? e.besoin ?? '?'} | engagé ${Math.round(Number(e.cout || 0))} | facturé ${Math.round(Number(e.facture || 0))}${k ? ` | cat ${k.id} q/base=${k.qpb ?? ''} achat=${k.pa ?? ''} loc=${k.pl ?? ''} prod=${k.pp ?? ''}` : ''}` }).join('\n')
}).join('\n')}
${note ? `Ce que ${data.moi} a noté après l'événement : « ${note} »` : ''}
${leconsTxt}`
    }
    let calc: any[] = []
    if (mode === 'chiffrer') {
      const c = await sb.rpc('chiffrage_contexte', { p_token: token, p_evt: data.evt })
      const cx = c.data || {}
      // Le moteur de l'appli calcule d'abord les postes couverts par les paramètres (moments, staff, transport…)
      if (!cx.chiffrage?.base) {
        const r = await sb.rpc('chiffrage_calculer', { p_token: token, p_evt: data.evt, p_base: null })
        if (r.error) return json({ error: `Chiffrage : ${r.error.message}` }, 500)
        cx.chiffrage = { ...(cx.chiffrage || {}), lignes: r.data.lignes, base: r.data.base }
      }
      const tout = (lignes && lignes.length ? lignes : cx.chiffrage?.lignes || [])
      calc = tout.filter((l: any) => l.param)
      const extras = tout.filter((l: any) => !l.param)
      const parCle: Record<string, any> = {}
      for (const l of calc) { const k = l.param; parCle[k] = parCle[k] || { nom: String(l.element).replace(/ \d+$/, '').replace(/ · .*$/, ''), n: 0, t: 0, note: l.note, zone: l.zone }; parCle[k].n++; parCle[k].t += Number(l.quantite) * Number(l.prix) }
      const calcTxt = Object.entries(parCle).map(([k, x]: any) => `${k} | ${x.zone} | ${x.nom}${x.n > 1 ? ` × ${x.n}` : ''} | ${x.note} | ${Math.round(x.t)} MAD`).join('\n')
      const cat = (cx.catalogue || []).map((x: any) => `${x.id} | ${x.zone} | ${x.el} | base=${x.base ?? ''} q/base=${x.qpb ?? ''} | ${x.mode ?? ''} | achat=${x.pa ?? ''} loc=${x.pl ?? ''} prod=${x.pp ?? ''}`).join('\n')
      const refs = (cx.references || []).map((r: any) => `${r.nom} (${r.invites} invités, ${(r.prestations || []).join('+')}, ${r.format ?? ''}) — totaux : ${JSON.stringify(r.zones)}\n  ${(r.lignes || []).map((x: string) => [x, Number(x.split(' | ').pop()) || 0] as [string, number]).sort((a: any, b: any) => b[1] - a[1]).slice(0, 35).map((x: any) => x[0]).join('\n  ')}`).join('\n')
      const b = cx.chiffrage?.base || {}
      chiffrageTxt = `Prestations : ${(ev.prestations || []).join(' + ') || '?'}, format ${ev.format ?? '?'}, ${ev.invites ?? '?'} invités, facturé par ${ev.entite ?? '?'}.
Informations de base : moments ${(b.moments || []).join(', ') || '?'}${b.hors_marrakech ? ', hors Marrakech' : ''}${b.autre_ville ? ', autre ville' : ''}${(b.alcool || []).length ? `, alcool fourni : ${b.alcool.join(', ')}` : ', alcool non fourni'}.
Zones : ${data.zones.map((z: any) => z.nom).join(', ')}.
${ptxt}
Postes déjà calculés par les paramètres (cle | zone | poste | calcul | total) :\n${calcTxt || '(aucun)'}
Lignes en plus déjà ajoutées :\n${extras.map((l: any) => `${l.zone} | ${l.element} | ${l.mode} | ${l.quantite} × ${l.prix}`).join('\n') || '(aucune)'}
Catalogue (id | zone | élément | base | mode | prix MAD) :\n${cat}
Événements passés (références de coûts réels) :\n${refs || '(aucun)'}
${leconsTxt}`
    }

    let cadrageTxt = ''
    if (mode === 'cadrage') {
      const rep = reponses || ev.cadrage?.reponses || {}
      const { data: cat } = await sb.rpc('catalogue_liste', { p_token: token })
      const deja = new Set(data.elements.map((e: any) => e.catalogue_id).filter(Boolean))
      cadrageTxt = `Cadrage de l'événement (questions → réponses ; « ? » = pas encore su) :
${Object.entries(rep).map(([k, v]) => `- ${k} : ${Array.isArray(v) ? v.join(', ') : v}`).join('\n')}
${ev.invites ?? '?'} invités, format ${ev.format ?? '?'}, lieu ${ev.lieu ?? '?'}.
Bibliothèque (id | zone | sous-famille | article | base de calcul), sans ce qui est déjà dans l'événement :
${(cat || []).filter((c: any) => !deja.has(c.id)).map((c: any) => `${c.id} | ${c.zone} | ${c.sous_zone ?? ''} | ${c.element} | ${c.base ?? ''}`).join('\n')}`
    }

    let articleTxt = ''
    if (mode === 'article') {
      const c = await sb.rpc('chiffrage_contexte', { p_token: token, p_evt: data.evt })
      const cx = c.data || {}
      const { data: cat } = await sb.rpc('catalogue_liste', { p_token: token })
      const sous: Record<string, Set<string>> = {}
      for (const x of (cat || [])) (sous[x.zone] = sous[x.zone] || new Set()).add(x.sous_zone || 'Divers')
      articleTxt = `Familles et sous-familles :\n${data.zones.map((z: any) => `${z.nom} : ${[...(sous[z.nom] || [])].join(', ')}`).join('\n')}
Bibliothèque (id | zone | sous-famille | article | base q/base | mode | achat | location | production) :
${(cat || []).map((x: any) => `${x.id} | ${x.zone} | ${x.sous_zone ?? ''} | ${x.element} | ${x.base ?? ''} ${x.qte_par_base ?? ''} | ${x.mode ?? ''} | ${x.prix_achat ?? ''} | ${x.prix_location ?? ''} | ${x.prix_production ?? ''}`).join('\n')}
Événements passés (références de coûts réels) :\n${(cx.references || []).map((r: any) => `${r.nom} : ${(r.lignes || []).slice(0, 60).join(' ; ')}`).join('\n') || '(aucun)'}`
    }

    let planningTxt = ''
    if (mode === 'planning') {
      const pl = await sb.rpc('planning_liste', { p_token: token, p_evt: data.evt })
      const rows = pl.data?.planning || []
      const acts = data.actions.map((a: any) => `${a.echeance ?? '?'} action : ${a.quoi} (${a.resp}) ${a.statut}`)
      const liv = data.elements.filter((e: any) => e.livraison).map((e: any) => `${e.livraison} livraison : ${e.element}`)
      const der = data.deroule.map((x: any) => `jour J ${x.debut ?? ''} ${x.moment}`)
      planningTxt = `Planning actuel (créneaux, actions, livraisons, déroulé) :\n` +
        [...rows.map((x: any) => `${x.date} ${x.heure ?? ''} ${x.titre} (${x.qui ?? '?'})`), ...acts, ...liv, ...der].sort().join('\n')
    }
    const demande = mode === 'bulles'
      ? `Donne au plus 4 bulles pour le tableau de bord de ${data.moi} aujourd'hui : 2 ou 3 conseils concrets (ce qu'il faut faire maintenant, avec les chiffres réels) et 1 réflexion de pro (un risque moins évident, une idée qui fait la différence le jour J). Ne répète pas les alertes évidentes (retards, éléments sans responsable) : elles sont déjà affichées. Appelle l'outil « bulles ».`
      : mode === 'chiffrer'
      ? `${chiffrageTxt}\n\n${note ? `Consigne de ${data.moi} : « ${note} »\n` : ''}Les postes déjà calculés viennent des paramètres de l'appli : ne les recopie pas et ne les recalcule pas. Ajoute seulement les lignes EN PLUS dont CET événement a besoin et que les paramètres ne couvrent pas (décor, mobilier, matériel de cuisine ou de bar spécifique, énergie, régimes, tiers…), en coût de revient, à partir du catalogue et des événements passés. Rends la liste complète des lignes en plus : elle remplace l'actuelle (garde celles qui restent utiles). Une ligne par élément : jamais deux moments ou deux postes réunis sur une même ligne. Si la consigne demande de changer un prix, un ratio ou un effectif d'un poste déjà calculé, mets-le dans « ajustements » avec sa cle (vaut pour cet événement seulement). Prix : uniquement ceux du catalogue ou des références, jamais inventés (0 si inconnu, et dis-le dans la note). Au plus 25 lignes. Note : 5 mots au plus, seulement si utile. Appelle l'outil « chiffrage ».`
      : mode === 'planning'
      ? `${planningTxt}\n\nInspecte ce planning de J-30 à J+5 : repère ce qui manque dans le temps (livraisons non planifiées pour ce qui est loué ou acheté, confirmations des tiers, arrivée et repas du staff, montage, démontage et retour des locations à J+1, paiements). Ne propose pas ce qui existe déjà. Appelle l'outil « creneaux ».`
      : mode === 'bilan'
      ? `${bilanTxt}\n\nL'événement est passé. Fais le bilan : pour chaque zone dont le facturé s'écarte du prévu de plus de 10 % ou de 3 000 MAD, dis pourquoi en citant les éléments responsables. Une zone sans facture n'est pas un écart : dis seulement que les pièces manquent. Puis au plus 5 leçons utiles pour les prochains chiffrages. Corrige le catalogue (catalogue_id, champ, valeur) seulement quand le réel le prouve clairement ; sinon laisse vide. Ne répète pas une leçon déjà retenue. Les leçons portent sur le chiffrage et l'organisation des prochains événements (quantités, prix, ratios, oublis), jamais sur la saisie des pièces ou la clôture : la check-list s'en charge. Une seule facture ne suffit pas à changer un prix du catalogue : propose une valeur prudente entre l'ancien prix et le réel. Appelle l'outil « bilan ».`
      : mode === 'cadrage'
      ? `${cadrageTxt}\n${ptxt}\n\nChoisis dans la bibliothèque la liste de ce dont CET événement a besoin, pour que rien ne soit oublié sans encombrer la revue :
- Seulement ce que les réponses rendent utile. Rien pour une prestation absente (pas de traiteur → ni Menu, ni Cuisine, ni Art de table de repas).
- Parmi des articles qui se remplacent (types de chaises, de verres, de nappes), un seul : le plus courant pour ce format.
- Pas d'animation, de fleurs, de papeterie ni de décoration de prestige si le cadrage n'en parle pas.
- Toujours le socle d'un pro : staff adapté, glace, eau, plonge, transport, talkies, sacs poubelle, repas du staff, tenues, rallonges et éclairage du back-office quand c'est pertinent.
- Ce que le client, le lieu ou l'agence fournit : perimetre Tiers avec « par ». Ce qui dépend d'une réponse « ? » ou d'un risque (sol, éclairage, énergie) : À clarifier.
- Quantité (qte) seulement quand le cadrage la fixe ; sinon 0, elle se calcule depuis la base et le nombre d'invités. Exception : pour la zone Staff, donne TOUJOURS l'effectif (qte) en appliquant les paramètres de chiffrage ci-dessus (ratios et quantités repères), jamais d'autres chiffres.
- Entre 30 et 110 articles. Ids exacts uniquement. Appelle l'outil « liste ».`
      : mode === 'article'
      ? `${articleTxt}\n\n${data.moi} vient de dicter, pendant la revue : « ${note} »\nPour chaque article dicté : s'il existe déjà dans la bibliothèque (même chose), donne son catalogue_id, son nom, sa famille et son prix. Sinon range-le dans la famille et la sous-famille qui conviennent le mieux, et propose un coût unitaire HT réaliste au Maroc (Marrakech) : d'abord celui d'un article proche de la bibliothèque, sinon des événements passés, sinon ta meilleure estimation de professionnel (source « estimation »). Mode le plus courant pour cet article. Quantité dite à l'oral dans « quantite ». Appelle l'outil « articles ».`
      : mode === 'placer'
      ? `Voici une note dictée ou écrite par ${data.moi} :\n« ${note} »\nTraduis-la en changements concrets sur l'organisation (souvent un seul). Appelle l'outil « proposer ».`
      : `Challenge ${data.moi} sur cet événement${theme ? `, thème : ${theme}` : ''}. Cherche ce qui risque d'être oublié, mal dimensionné, non délégué ou hors budget, du général au particulier. Évite ce qui est déjà bouclé. Pour chaque question, 2 à 4 réponses dont « Plus tard », avec leurs effets. Appelle l'outil « questions ».`

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: mode === 'chiffrer' || mode === 'cadrage' ? 16000 : mode === 'challenge' || mode === 'bilan' ? 8000 : 4000,
        system: SYSTEME,
        tools: [TOOLS[mode]],
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: `${contexte(data)}\n\n${mode === 'challenge' || mode === 'bilan' ? `${ptxt}\n\n` : ''}${demande}` }],
      }),
    })
    const out = await r.json()
    if (!r.ok) return json({ error: out?.error?.message || 'Erreur Claude' }, 502)
    if (out.stop_reason === 'max_tokens') return json({ error: 'Réponse du copilote coupée (trop longue), réessaie.' }, 502)
    const use = (out.content || []).find((c: any) => c.type === 'tool_use')
    if (!use) return json({ error: 'Le copilote n\'a pas su répondre, réessaie.' }, 502)
    const res: any = { ...use.input }
    for (const k of ['questions', 'changements', 'creneaux', 'bulles', 'lignes', 'pourquoi', 'lecons', 'items', 'articles', 'ajustements']) if (typeof res[k] === 'string') { try { res[k] = JSON.parse(res[k]) } catch { res[k] = [] } }
    if (Array.isArray(res.questions)) res.questions = res.questions.filter((q: any) => q?.question && Array.isArray(q.options) && q.options.length)
    if (mode === 'bulles') {
      res.bulles = (res.bulles || []).filter((b: any) => b?.texte).slice(0, 4)
      await sb.rpc('bulles_enregistrer', { p_token: token, p_evt: data.evt, p: res.bulles })
    }
    if (mode === 'bilan') {
      res.pourquoi = (Array.isArray(res.pourquoi) ? res.pourquoi : []).filter((x: any) => x?.zone && x?.texte)
      res.lecons = (Array.isArray(res.lecons) ? res.lecons : []).filter((x: any) => x?.texte).slice(0, 5)
        .map((x: any) => Number(x.valeur) > 0 && x.catalogue_id && x.champ ? x : { ...x, catalogue_id: '', champ: '', valeur: null })
      const pq: Record<string, string> = {}
      for (const x of res.pourquoi) pq[x.zone] = x.texte
      await sb.rpc('bilan_maj', { p_token: token, p_evt: data.evt, p: { pourquoi: pq, analyse_le: new Date().toISOString() } })
      const l = await sb.rpc('lecons_enregistrer', { p_token: token, p_evt: data.evt, p: res.lecons })
      if (l.error) return json({ error: `Leçons : ${l.error.message}` }, 500)
      res.lecons = l.data
    }
    if (mode === 'cadrage') {
      if (reponses) await sb.rpc('cadrage_maj', { p_token: token, p_evt: data.evt, p: { reponses } })
      const items = (Array.isArray(res.items) ? res.items : []).filter((x: any) => x?.id)
      const a = await sb.rpc('cadrage_appliquer', { p_token: token, p_evt: data.evt, p: { ...res, items } })
      if (a.error) return json({ error: `Cadrage : ${a.error.message}` }, 500)
      return json({ cadrage: a.data, usage: out.usage })
    }
    if (mode === 'article') {
      const zs = new Set(data.zones.map((z: any) => z.nom))
      res.articles = (Array.isArray(res.articles) ? res.articles : []).filter((x: any) => x?.element).map((x: any) => ({ ...x, zone: zs.has(x.zone) ? x.zone : data.zones[0]?.nom, prix: Number(x.prix) || 0, quantite: Number(x.quantite) || 0, qte_par_base: Number(x.qte_par_base) || 1 }))
    }
    if (mode === 'chiffrer') {
      const extras = (res.lignes || []).filter((l: any) => l?.element && l?.zone).map((l: any) => { const { param, ...x } = l; return { ...x, quantite: Number(l.quantite) || 0, prix: Number(l.prix) || 0 } })
      // Ajustements demandés : surcharges de l'événement (même chemin que la fenêtre « Cet événement seulement »)
      const cles = new Set(calc.map((l: any) => l.param))
      for (const a of (Array.isArray(res.ajustements) ? res.ajustements : [])) {
        if (!a?.param) continue
        const p: any = {}
        if (Number(a.valeur) > 0) p.valeur = Number(a.valeur)
        if (Number(a.ratio) > 0) p.ratio = Number(a.ratio)
        if (Number(a.effectif) >= 0 && a.effectif !== null && a.effectif !== undefined && a.effectif !== '') p.effectif = Number(a.effectif)
        if (!Object.keys(p).length) continue
        const r = await sb.rpc('chiffrage_surcharger', { p_token: token, p_evt: data.evt, p_cle: a.param, p, p_reference: false })
        if (r.error && cles.has(a.param)) return json({ error: `Ajustement ${a.param} : ${r.error.message}` }, 500)
      }
      const c2 = await sb.rpc('chiffrage_contexte', { p_token: token, p_evt: data.evt })
      const ch = c2.data?.chiffrage || {}
      const fusion = [...(ch.lignes || []).filter((l: any) => l.param), ...extras]
      await sb.rpc('chiffrage_enregistrer', { p_token: token, p_evt: data.evt, p_lignes: fusion, p_hyp: res.hypotheses || '', p_coef: ch.coef ?? null })
      res.lignes = fusion; res.base = ch.base
    }
    return json({ ...res, usage: out.usage })
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500)
  }
})
