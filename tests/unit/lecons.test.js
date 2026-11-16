import { describe, expect, it } from 'vitest'
import { LECONS, leconDuJour } from '../../src/lecons'

describe('leçon du jour', () => {
  it('la même toute la journée, une autre le lendemain', () => {
    expect(leconDuJour('2026-11-16')).toBe(leconDuJour('2026-11-16'))
    expect(leconDuJour('2026-11-17')).not.toBe(leconDuJour('2026-11-16'))
  })
  it('chaque leçon a un texte, un auteur et un thème', () => {
    for (const l of LECONS) expect(l.t && l.a && l.c && l.p).toBeTruthy()
  })
})

import { enLettres } from '../../src/bon'
describe('montant en lettres du bon', () => {
  it('écrit les montants comme sur un bon', () => {
    expect(enLettres(187)).toBe('cent quatre-vingt-sept')
    expect(enLettres(1250)).toBe('mille deux cent cinquante')
    expect(enLettres(71)).toBe('soixante et onze')
    expect(enLettres(80)).toBe('quatre-vingts')
  })
})
