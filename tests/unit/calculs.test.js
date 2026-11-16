// Tests de non-régression : les petits calculs dont dépendent les écrans (montants, dates, étapes, enveloppes).
import { describe, expect, it } from 'vitest'
import { n, mad, ddmm, jours, dans, dateLongue, envZone } from '../../src/ui.jsx'
import { k, modeLigne, couleur } from '../../src/postes.jsx'
import { etape } from '../../src/accueil.jsx'
import { planCadrage } from '../../src/questions.jsx'

const sp = s => s.replace(/ | /g, ' ')

describe('nombres et montants', () => {
  it('n() traite vide, null et texte', () => {
    expect(n(null)).toBe(0); expect(n(undefined)).toBe(0); expect(n('')).toBe(0); expect(n('12.5')).toBe(12.5)
  })
  it('mad() abrège au-delà de 10 000', () => {
    expect(sp(mad(9999))).toBe('9 999'); expect(mad(12400)).toBe('12 k'); expect(mad(null)).toBe('0')
  })
  it('k() garde une décimale sous 100 k, aucune au-delà', () => {
    expect(sp(k(24335))).toBe('24,3 k'); expect(sp(k(196400))).toBe('196 k'); expect(sp(k(1500))).toBe('1 500'); expect(sp(k(-12500))).toBe('-12,5 k')
  })
})

describe('dates', () => {
  it('ddmm et jours', () => {
    expect(ddmm('2026-10-31')).toBe('31/10'); expect(ddmm(null)).toBe('')
    expect(jours('2026-10-31', '2026-10-28')).toBe(3); expect(jours(null, '2026-10-28')).toBe(null)
  })
  it('dans() parle comme l\'équipe', () => {
    expect(dans('2026-10-28', '2026-10-28')).toBe("aujourd'hui"); expect(dans('2026-10-29', '2026-10-28')).toBe('demain')
    expect(dans('2026-10-25', '2026-10-28')).toBe('il y a 3 jours'); expect(dans('2026-11-07', '2026-10-28')).toBe('dans 10 jours')
  })
  it('dateLongue', () => {
    expect(dateLongue('2026-10-31')).toMatch(/31 octobre/i); expect(dateLongue(null)).toBe('Date à fixer')
  })
})

describe('budget par zone', () => {
  it('prend le budget retenu, sinon l\'enveloppe par invité', () => {
    expect(envZone({ nom: 'Bar', enveloppe: 60 }, { invites: 100, budget_zones: {} })).toBe(6000)
    expect(envZone({ nom: 'Bar', enveloppe: 60 }, { invites: 100, budget_zones: { Bar: 9000 } })).toBe(9000)
  })
})

describe('lignes et enveloppes', () => {
  it('modeLigne lit le mode choisi, sinon la plus grosse quantité', () => {
    expect(modeLigne({ mode_ligne: 'rafistoler' })).toBe('rafistoler')
    expect(modeLigne({ stock: 2, location: 10 })).toBe('louer')
    expect(modeLigne({ achat: 5 })).toBe('acheter')
    expect(modeLigne({})).toBe(null)
  })
  it('couleur est stable pour une même personne', () => {
    expect(couleur('Salima')).toBe(couleur('Salima'))
  })
})

describe('étapes des événements (écran Événements)', () => {
  const t = '2026-10-28'
  it.each([
    [{ statut: 'Perdu' }, 'perdu'],
    [{ statut: 'Clôturé' }, 'cloture'],
    [{ statut: 'Confirmé', date: '2026-10-20' }, 'a_cloturer'],
    [{ statut: 'Confirmé', date: '2026-11-20' }, 'confirme'],
    [{ statut: 'Devis envoyé' }, 'devis'],
    [{ statut: 'Demande' }, 'demande'],
  ])('%o → %s', (e, attendu) => expect(etape(e, t)).toBe(attendu))
})

describe('cadrage', () => {
  const Q = [
    { cle: 'prestations', section: 'cadrage', type: 'multi', choix: [{ cle: 'bar', libelle: 'Bar' }, { cle: 'traiteur', libelle: 'Traiteur' }], defaut: ['bar', 'traiteur'], quand: [], actif: true, ordre: 80 },
    { cle: 'client', section: 'cadrage', type: 'texte', choix: [], quand: [], actif: true, ordre: 20 },
    { cle: 'nb_bars', section: 'bar', type: 'nombre', choix: [], defaut: 1, quand: ['prestations:bar'], actif: true, ordre: 110 },
    { cle: 'cuisine', section: 'traiteur', type: 'choix', choix: [{ cle: 'equipee', libelle: 'Équipée' }, { cle: 'rien', libelle: 'Rien' }], defaut: 'equipee', quand: ['prestations:traiteur'], actif: true, ordre: 220 },
    { cle: 'plonge', section: 'sur_place', type: 'choix', choix: [{ cle: 'fournie', libelle: 'Fournie' }, { cle: 'rien', libelle: 'Rien' }], defaut: 'fournie', quand: [], actif: true, ordre: 310 },
    { cle: 'emplacement', section: 'organisation', type: 'choix', choix: [{ cle: 'interieur', libelle: 'Intérieur' }, { cle: 'exterieur', libelle: 'Extérieur' }], quand: [], actif: true, ordre: 510 },
    { cle: 'sol', section: 'organisation', type: 'choix', choix: [{ cle: 'dur', libelle: 'Dur' }], quand: ['emplacement:exterieur'], actif: true, ordre: 520 },
  ]
  const cles = l => l.map(x => x.q.cle)
  it('ce que le devis a dit est repris, jamais reposé', () => {
    const p = planCadrage({ prestations: ['bar', 'traiteur'], nb_bars: 2, plonge: 'rien' }, Q, {})
    expect(cles(p.repris)).toEqual(['prestations', 'nb_bars', 'plonge'])
    expect(cles(p.etapes)).toEqual(['cuisine', 'emplacement'])
  })
  it('le défaut du devis revient pré-choisi', () => {
    const p = planCadrage({ prestations: ['traiteur'] }, Q, {})
    expect(p.etapes.find(x => x.q.cle === 'cuisine').propose).toBe('equipee')
    expect(cles(p.etapes)).not.toContain('nb_bars')
  })
  it('une réponse du cadrage ouvre la suite et marque la correction', () => {
    const p = planCadrage({ prestations: ['bar'], plonge: 'rien' }, Q, { emplacement: 'exterieur', plonge: 'fournie' })
    expect(cles(p.etapes)).toContain('sol')
    expect(p.repris.find(x => x.q.cle === 'plonge')).toMatchObject({ v: 'fournie', corrige: true })
  })
  it('« je ne sais pas » laisse la question ouverte', () => {
    const p = planCadrage({ prestations: ['bar'] }, Q, { emplacement: '?' })
    expect(cles(p.etapes)).not.toContain('sol')
    expect(p.r.emplacement).toBeUndefined()
  })
})

describe('cadrage · propositions', () => {
  const Q = [
    { cle: 'prestations', section: 'cadrage', type: 'multi', choix: [{ cle: 'traiteur', libelle: 'Traiteur' }], quand: [], actif: true, ordre: 80 },
    { cle: 'cuisine', section: 'traiteur', type: 'choix', choix: [{ cle: 'equipee', libelle: 'Équipée' }, { cle: 'rien', libelle: 'Rien' }], defaut: 'equipee', quand: [], actif: true, ordre: 220 },
    { cle: 'sol', section: 'organisation', type: 'choix', choix: [{ cle: 'gazon', libelle: 'Gazon' }], quand: [], actif: true, ordre: 520 },
    { cle: 'theme', section: 'organisation', type: 'texte', choix: [], quand: [], actif: true, ordre: 550 },
  ]
  it('une règle passe avant le défaut du devis', () => {
    const p = planCadrage({ prestations: ['traiteur'] }, Q, {}, { cuisine: { valeur: 'rien', source: 'lieu', pourquoi: 'Même lieu' } })
    expect(p.etapes.find(x => x.q.cle === 'cuisine')).toMatchObject({ propose: 'rien', source: 'lieu' })
  })
  it('sans règle : le défaut, ou rien pour une question du cadrage', () => {
    const p = planCadrage({ prestations: ['traiteur'] }, Q, {}, {})
    expect(p.etapes.find(x => x.q.cle === 'cuisine')).toMatchObject({ propose: 'equipee', source: 'defaut' })
    expect(p.etapes.find(x => x.q.cle === 'sol')).toMatchObject({ propose: undefined, source: null })
  })
  it('jamais de proposition sur du texte', () => {
    const p = planCadrage({}, Q, {}, { theme: { valeur: 'x', source: 'ia' } })
    expect(p.etapes.find(x => x.q.cle === 'theme').source).toBe(null)
  })
})
