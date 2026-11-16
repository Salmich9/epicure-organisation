// Avant → après d'un chiffrage : rien ne s'applique sans être coché.
// Une ligne de paramètre se compare par paramètre (tous les « Chef de rang 1…18 » ensemble) ; une ligne en plus par son identifiant.
// Verrouillé 🔒 = réglé à la main (surcharge, effectif, personne nommée, ligne retouchée) : décoché par défaut, jamais perdu sans le vouloir.
const n = v => (v === null || v === undefined || v === '' ? 0 : Number(v))
const tot = l => n(l.quantite) * n(l.prix)
const nomBase = l => String(l.element || '').replace(/ · .*$/, '').replace(/ \d+$/, '').trim()
let compteur = 0
export const nouvelId = () => `l${Date.now().toString(36)}${(compteur++).toString(36)}`

// Chaque ligne en plus reçoit un identifiant stable (pour la retrouver après une retouche ou une proposition du copilote)
export function avecIds(lignes) { return (lignes || []).map(l => (l.param || l.uid ? l : { ...l, uid: nouvelId() })) }

const cleNom = l => `z:${l.zone}|${String(l.element || '').toLowerCase().trim()}`
export function cleLigne(l) { return l.param ? `p:${l.param}` : l.uid ? `u:${l.uid}` : cleNom(l) }

export function verrouille(g, base) {
  if (g.lignes.some(l => l.verrou)) return true
  if (!g.param || !base) return false
  return !!(base.surcharges?.[g.param] || base.effectifs?.[g.param] !== undefined && base.effectifs?.[g.param] !== null || (base.personnes?.[g.param] || []).some(p => p && (p.nom || p.prix)))
}

export function regrouper(lignes) {
  const m = new Map()
  for (const l of lignes || []) {
    const k = cleLigne(l)
    let g = m.get(k)
    if (!g) m.set(k, g = { cle: k, param: l.param || null, bloc: l.param ? (l.groupe || 'divers') : 'en_plus', nom: l.param ? nomBase(l) : l.element || '', zone: l.zone, lignes: [], total: 0 })
    g.lignes.push(l); g.total += tot(l)
  }
  return m
}

// Les lignes en plus proposées sans identifiant (copilote) retrouvent celui de la ligne de même zone et même nom
function rapprocher(avant, apres) {
  const parNom = new Map((avant || []).filter(l => !l.param && l.uid).map(l => [cleNom(l), l.uid]))
  return (apres || []).map(l => (l.param || l.uid ? l : parNom.has(cleNom(l)) ? { ...l, uid: parNom.get(cleNom(l)) } : { ...l, uid: nouvelId() }))
}

export function diff(avant, apres, base) {
  apres = rapprocher(avant, apres)
  const A = regrouper(avant), B = regrouper(apres)
  const changements = []
  let inchangees = 0
  for (const k of new Set([...A.keys(), ...B.keys()])) {
    const a = A.get(k), b = B.get(k)
    const type = !a ? 'ajout' : !b ? 'retire' : 'modifie'
    if (type === 'modifie' && Math.abs(a.total - b.total) < 0.5 && a.lignes.length === b.lignes.length && a.nom === b.nom) { inchangees++; continue }
    const g = a || b
    const verrou = a ? verrouille(a, base) : false
    const staff = g.param && g.lignes.some(l => l.rang)
    changements.push({
      cle: k, type, bloc: g.bloc, nom: g.nom, verrou, coche: !verrou,
      avant: a ? { total: a.total, nb: a.lignes.length } : null, apres: b ? { total: b.total, nb: b.lignes.length } : null,
      detail: type === 'retire' ? 'retiré' : staff && a && b && a.lignes.length !== b.lignes.length ? `${a.lignes.length} → ${b.lignes.length}${b.lignes[0]?.note ? ` (${b.lignes[0].note.replace(/ × [\d  ,.]+$/, '')})` : ''}` : (b.lignes[0]?.note || ''),
    })
  }
  return { changements, inchangees, apres }
}

// Le chiffrage obtenu : les groupes cochés prennent l'« après », les autres gardent l'« avant », dans l'ordre de l'« après »
export function appliquer(avant, apres, cochees) {
  const A = regrouper(avant), B = regrouper(apres), ok = new Set(cochees)
  const out = [], faits = new Set()
  for (const l of apres) {
    const k = cleLigne(l)
    if (faits.has(k)) continue
    faits.add(k)
    if (ok.has(k)) out.push(...B.get(k).lignes)        // accepté : l'après
    else if (A.has(k)) out.push(...A.get(k).lignes)    // pas accepté : l'avant reste
  }                                                    // ajout pas accepté : rien
  for (const [k, g] of A) if (!faits.has(k) && !ok.has(k)) out.push(...g.lignes)   // retrait pas accepté : gardé
  return out
}

/* ---------- Chiffrage d'avant les paramètres : comparer bloc par bloc ---------- */
export const BLOCS_COMPARER = [
  ['moments', 'Moments', ['moments'], ['Menu', 'Cuisine traiteur']],
  ['staff', 'Staff', ['staff', 'frais_staff'], ['Staff']],
  ['transport', 'Transport', ['transport_personnel', 'transport_marchandises'], ['Logistique']],
  ['bar', 'Bar et boissons', ['bar'], ['Bar']],
  ['materiel', 'Matériel', ['materiel'], ['Art de table', 'Salle et mobilier']],
  ['divers', 'Imprévus et divers', ['divers'], []],
]
export function comparer(anciennes, moteur) {
  const somme = ls => ls.reduce((s, l) => s + tot(l), 0)
  const pris = new Set(BLOCS_COMPARER.flatMap(b => b[3]))
  return {
    blocs: BLOCS_COMPARER.map(([cle, nom, groupes, zones]) => {
      const a = (anciennes || []).filter(l => !l.param && zones.includes(l.zone)), m = (moteur || []).filter(l => groupes.includes(l.groupe))
      return { cle, nom, actuel: somme(a), params: somme(m), nbActuel: a.length, nbParams: m.length }
    }).filter(b => b.nbActuel || b.nbParams),
    enPlus: (anciennes || []).filter(l => !l.param && !pris.has(l.zone)),
  }
}
// choix : { moments: 'garder' | 'prendre', … } ; un bloc gardé reste à l'ancienne (le moteur ne le refait plus : base.blocs_manuels)
export function composer(anciennes, moteur, choix) {
  const out = [], manuels = []
  for (const [cle, , groupes, zones] of BLOCS_COMPARER) {
    if (choix[cle] === 'prendre') out.push(...(moteur || []).filter(l => groupes.includes(l.groupe)))
    else { out.push(...(anciennes || []).filter(l => !l.param && zones.includes(l.zone))); manuels.push(...groupes) }
  }
  const pris = new Set(BLOCS_COMPARER.flatMap(b => b[3]))
  out.push(...(anciennes || []).filter(l => !l.param && !pris.has(l.zone)))
  return { lignes: avecIds(out), blocs_manuels: manuels }
}
export const totalLignes = ls => (ls || []).reduce((s, l) => s + tot(l), 0)
