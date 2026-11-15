// Une seule source pour TVA, imprévus et coefficient
import { describe, expect, it } from 'vitest'
import { setRegles, tva, imprevus, imprevusPct, coefDefaut } from '../../src/regles.js'

describe('règles de calcul', () => {
  it('valeurs de repli : imprévus 5 %, coef 2,4, TVA par société', () => {
    expect(imprevus()).toBe(0.05); expect(coefDefaut()).toBe(2.4)
    expect(tva('Epicure')).toBe(20); expect(tva('Business Boys')).toBe(10); expect(tva('Espèce')).toBe(0); expect(tva('Inconnue')).toBe(0)
  })
  it('les valeurs de la base remplacent le repli, sans effacer les autres sociétés', () => {
    setRegles({ imprevus_pct: 6, tva: { Epicure: 19 } })
    expect(imprevusPct()).toBe(6); expect(tva('Epicure')).toBe(19); expect(tva('Business Boys')).toBe(10)
    setRegles(null); expect(imprevusPct()).toBe(6)
  })
})
