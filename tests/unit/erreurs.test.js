import { describe, expect, it } from 'vitest'
import { traduire } from '../../src/erreurs'

describe('codes d\'erreur stables', () => {
  it('reconnaît le code exact, sans confondre les codes voisins', () => {
    expect(traduire({ code: 'P0001', message: 'element_introuvable' }).code).toBe('element_introuvable')
    expect(traduire({ code: 'P0001', message: 'introuvable' }).texte).toMatch(/supprimé entre-temps/)
  })
  it('garde le code de session pour la déconnexion', () => {
    expect(traduire({ code: 'P0001', message: 'session_expiree' }).code).toBe('session_expiree')
  })
  it('code avec détail', () => {
    expect(traduire({ code: 'P0001', message: 'depasse_encaisse: il ne reste que 300 MAD encaissés' }).texte).toBe('Pas assez encaissé : il ne reste que 300 MAD encaissés')
  })
  it('code inconnu : refus générique, pas de texte technique', () => {
    const t = traduire({ code: 'P0001', message: 'nouveau_code' })
    expect(t.code).toBe('nouveau_code'); expect(t.texte).toBe('Action refusée par la base.')
  })
  it('erreur technique : phrase lisible, texte d\'origine gardé', () => {
    const t = traduire({ code: '57014', message: 'canceling statement due to statement timeout' })
    expect(t.texte).toMatch(/réessaie/); expect(t.brut).toMatch(/timeout/)
  })
  it('message libre en français conservé', () => {
    expect(traduire({ code: 'P0001', message: 'Ce poste est déjà pris.' }).texte).toBe('Ce poste est déjà pris.')
  })
})
