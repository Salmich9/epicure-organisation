import { describe, expect, it } from 'vitest'
import { appliquer, avecIds, comparer, composer, diff, totalLignes } from '../../src/chiffrageDiff'

const P = (param, groupe, element, quantite, prix, extra = {}) => ({ param, groupe, zone: 'Z', element, quantite, prix, note: `${quantite} × ${prix}`, ...extra })
const staff = (nb, prix = 600) => Array.from({ length: nb }, (_, i) => P('s_chef', 'staff', `Chef de rang ${i + 1}`, 1, prix, { rang: i + 1 }))
const avant = avecIds([P('m_diner', 'moments', 'Dîner assis', 150, 150), P('m_cocktail', 'moments', 'Cocktail', 1050, 6), ...staff(15),
  { zone: 'Lieu', element: 'Caution loueur', quantite: 1, prix: 3000 }])
const apres = [P('m_diner', 'moments', 'Dîner assis', 180, 150), P('m_cocktail', 'moments', 'Cocktail', 1260, 6), ...staff(18),
  { zone: 'Lieu', element: 'Caution loueur', quantite: 1, prix: 3000 }]

describe('avant → après', () => {
  it('ne montre que ce qui change, staff regroupé par rôle', () => {
    const d = diff(avant, apres, {})
    expect(d.changements.map(c => c.nom)).toEqual(['Dîner assis', 'Cocktail', 'Chef de rang'])
    expect(d.inchangees).toBe(1)
    const ch = d.changements.find(c => c.nom === 'Chef de rang')
    expect(ch.avant.nb).toBe(15); expect(ch.apres.nb).toBe(18); expect(ch.detail.startsWith('15 → 18')).toBe(true)
  })
  it('réglé à la main = verrouillé et décoché', () => {
    const d = diff(avant, apres, { surcharges: { m_cocktail: { valeur: 6 } }, effectifs: { s_chef: 15 } })
    expect(d.changements.find(c => c.nom === 'Cocktail')).toMatchObject({ verrou: true, coche: false })
    expect(d.changements.find(c => c.nom === 'Chef de rang')).toMatchObject({ verrou: true, coche: false })
    expect(d.changements.find(c => c.nom === 'Dîner assis')).toMatchObject({ verrou: false, coche: true })
  })
  it('une ligne en plus retouchée à la main est verrouillée', () => {
    const av = avant.map(l => (l.element === 'Caution loueur' ? { ...l, prix: 3500, verrou: true } : l))
    const d = diff(av, apres, {})
    expect(d.changements.find(c => c.nom === 'Caution loueur')).toMatchObject({ verrou: true, coche: false })
  })
  it('seul ce qui est coché s\'applique ; le reste garde l\'avant', () => {
    const d = diff(avant, apres, {})
    const r = appliquer(avant, d.apres, ['p:m_diner'])
    expect(r.find(l => l.param === 'm_diner').quantite).toBe(180)
    expect(r.find(l => l.param === 'm_cocktail').quantite).toBe(1050)
    expect(r.filter(l => l.param === 's_chef')).toHaveLength(15)
    expect(r.find(l => l.element === 'Caution loueur')).toBeTruthy()
  })
  it('tout accepter = l\'après exactement', () => {
    const d = diff(avant, apres, {})
    const r = appliquer(avant, d.apres, d.changements.map(c => c.cle))
    expect(totalLignes(r)).toBe(totalLignes(apres))
  })
  it('un ajout refusé n\'entre pas, un retrait refusé reste', () => {
    const ap = [...apres.filter(l => l.element !== 'Caution loueur'), { zone: 'Lieu', element: 'Nettoyage', quantite: 1, prix: 800 }]
    const d = diff(avant, ap, {})
    expect(d.changements.map(c => c.type).sort()).toEqual(['ajout', 'modifie', 'modifie', 'modifie', 'retire'])
    const r = appliquer(avant, d.apres, [])
    expect(r.some(l => l.element === 'Nettoyage')).toBe(false)
    expect(r.some(l => l.element === 'Caution loueur')).toBe(true)
    expect(totalLignes(r)).toBe(totalLignes(avant))
  })
  it('le copilote qui renvoie la même ligne sans identifiant la retrouve', () => {
    const ap = [...apres.slice(0, -1), { zone: 'Lieu', element: 'Caution loueur', quantite: 1, prix: 4000 }]
    const d = diff(avant, ap, {})
    const c = d.changements.find(x => x.nom === 'Caution loueur')
    expect(c.type).toBe('modifie')
    expect(c.avant.total).toBe(3000); expect(c.apres.total).toBe(4000)
  })
})

describe('chiffrage d\'avant les paramètres', () => {
  const anciennes = [{ zone: 'Menu', element: 'Dîner', quantite: 150, prix: 140 }, { zone: 'Staff', element: 'Serveurs', quantite: 12, prix: 500 },
    { zone: 'Décoration et ambiance', element: 'Fleurs', quantite: 15, prix: 250 }]
  const moteur = [P('m_diner', 'moments', 'Dîner assis', 150, 150), ...staff(15)]
  it('compare bloc par bloc, ce qui est propre à l\'événement à part', () => {
    const c = comparer(anciennes, moteur)
    expect(c.blocs.map(b => [b.cle, b.actuel, b.params])).toEqual([['moments', 21000, 22500], ['staff', 6000, 9000]])
    expect(c.enPlus.map(l => l.element)).toEqual(['Fleurs'])
  })
  it('garder un bloc le laisse à l\'ancienne et le moteur ne le refait plus', () => {
    const r = composer(anciennes, moteur, { moments: 'prendre', staff: 'garder' })
    expect(r.lignes.map(l => l.element)).toEqual(['Dîner assis', 'Serveurs', 'Fleurs'])
    expect(r.blocs_manuels).toContain('staff')
    expect(r.blocs_manuels).not.toContain('moments')
  })
})
