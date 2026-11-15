// Tests de non-régression : les petits calculs dont dépendent les écrans (montants, dates, étapes, enveloppes).
import { describe, expect, it } from 'vitest'
import { n, mad, ddmm, jours, dans, dateLongue, envZone } from '../../src/ui.jsx'
import { k, modeLigne, couleur } from '../../src/postes.jsx'
import { etape } from '../../src/accueil.jsx'
import { QUESTIONS } from '../../src/cadrage.jsx'

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
  const visibles = r => QUESTIONS.filter(q => !q.si || q.si(r)).map(q => q.k)
  it('bar seul : pas de questions traiteur', () => {
    const v = visibles({ prestations: ['Boissons'] })
    expect(v).not.toContain('repas'); expect(v).not.toContain('cuisine'); expect(v).toContain('bars')
  })
  it('traiteur seul : pas de questions bar', () => {
    const v = visibles({ prestations: ['Traiteur'] })
    expect(v).toContain('repas'); expect(v).not.toContain('alcool')
  })
  it('alcool fourni par le client : pas de gamme', () => {
    expect(visibles({ prestations: ['Boissons'], alcool: 'Le client' })).not.toContain('gamme')
  })
})
