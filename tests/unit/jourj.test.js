import { describe, expect, it } from 'vitest'
import { frise } from '../../src/jourj.jsx'

const J = '2026-11-20'
const data = { evt: 'E', evenements: [{ id: 'E', date: J }],
  actions: [{ id: 'A1', echeance: J, heure: '17:30', quoi: 'Glace', logistique: { mode: 'livre' } }, { id: 'A2', echeance: '2026-11-19', heure: '10:00', quoi: 'Veille' }, { id: 'A3', echeance: J, quoi: 'Sans heure' }],
  deroule: [{ id: 1, moment: 'Late snack', debut: '00:30' }, { id: 2, moment: 'Dîner', debut: '21:00' }] }
describe('frise du jour J', () => {
  const f = frise(data, [{ id: 'P', date: J, heure: '14:00', titre: 'Mise en place' }])
  it('ne garde que le jour J', () => expect(f.map(i => i.titre)).not.toContain('Veille'))
  it('range après minuit à la fin, et sans heure tout au bout', () => expect(f.map(i => i.titre)).toEqual(['Mise en place', 'Glace', 'Dîner', 'Late snack', 'Sans heure']))
  it('reconnaît une livraison', () => expect(f.find(i => i.titre === 'Glace').type).toBe('livraison'))
})
