import { describe, expect, it } from 'vitest'
import { pret } from '../../src/envie.jsx'

const data = {
  postes: [{ cle: 'materiel', lignes: ['L1', 'L2', 'L3'], actions: ['A1', 'A2'] }, { cle: 'staff', lignes: [], actions: ['A3'] }],
  elements: [{ id: 'L1', mode_ligne: 'louer', reception: 'Reçu' }, { id: 'L2', mode_ligne: 'acheter' }, { id: 'L3', mode_ligne: 'prelever' }],
  actions: [{ id: 'A1', statut: 'Fait' }, { id: 'A2', statut: 'À faire' }, { id: 'A3', statut: 'Fait' }],
}
describe('jauge prêt', () => {
  it('compte les actions cochées et les lignes reçues, pas ce qu\'on prélève au dépôt', () => {
    expect(pret(data)).toMatchObject({ fait: 3, total: 5 })
  })
  it('se limite aux enveloppes demandées', () => {
    expect(pret(data, ['staff'])).toMatchObject({ fait: 1, total: 1, v: 1 })
  })
  it('compte les retours une fois l\'événement passé', () => {
    const passe = { ...data, evt: 'E', aujourdhui: '2026-11-02', evenements: [{ id: 'E', date: '2026-11-01' }], elements: data.elements.map(e => e.id === 'L1' ? { ...e, revenu: 200 } : e) }
    expect(pret(passe)).toMatchObject({ fait: 4, total: 7 })
  })
  it('vaut 0 sans rien à faire', () => {
    expect(pret({ postes: [], elements: [], actions: [] }).v).toBe(0)
  })
})
