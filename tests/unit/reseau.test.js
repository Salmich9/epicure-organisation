import { beforeEach, describe, expect, it } from 'vitest'

// Faux stockage du téléphone
const mem = new Map()
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size } }
const { apercu, copie, differer, garder, reseau, vider } = await import('../../src/reseau.js')

describe('hors connexion', () => {
  beforeEach(() => mem.clear())
  it('rend la dernière copie d\'un écran déjà vu', () => {
    garder('aujourdhui', { p_token: 'x' }, { actions: [{ id: 'A1', statut: 'À faire' }] })
    expect(copie('aujourdhui', { p_token: 'x' }).actions[0].id).toBe('A1')
    expect(copie('donnees', { p_evt: 'E1' })).toBeNull()
  })
  it('ne montre jamais la copie d\'une autre session (téléphone partagé)', () => {
    garder('aujourdhui', { p_token: 'x' }, { actions: [{ id: 'A1' }] })
    expect(copie('aujourdhui', { p_token: 'autre' })).toBeNull()
    expect(apercu('aujourdhui', { p_token: 'autre' })).toBeNull()
  })
  it('ouverture immédiate : l\'aperçu ne fait pas passer l\'appli hors ligne', () => {
    garder('accueil', { p_token: 'x' }, { evenements: [] })
    expect(apercu('accueil', { p_token: 'x' })).toEqual({ evenements: [] })
    expect(reseau.get().enLigne).toBe(true)
  })
  it('met un petit changement en attente et met la copie à jour', () => {
    garder('aujourdhui', {}, { actions: [{ id: 'A1', statut: 'À faire', resp: 'Ouadia' }] })
    expect(differer('action_enregistrer', { p_evt: 'E', p_id: 'A1', p: { fait: true, qui: 'Amina' } })).toBeTruthy()
    const a = copie('aujourdhui', {}).actions[0]
    expect([a.statut, a.resp]).toEqual(['Fait', 'Amina'])
    expect(reseau.get().attente).toBe(1)
  })
  it('refuse de différer une création ou un changement trop large', () => {
    expect(differer('action_enregistrer', { p_evt: 'E', p_id: null, p: { quoi: 'x', cout: 1 } })).toBeNull()
    expect(differer('action_enregistrer', { p_evt: 'E', p_id: 'A1', p: { quoi: 'renommée' } })).toBeNull()
    expect(differer('ligne_ajouter', { p_evt: 'E', p: { nom: 'x' } })).toBeNull()
  })
  it('envoie la file dans l\'ordre au retour du réseau', async () => {
    differer('action_enregistrer', { p_id: 'A1', p: { fait: true } })
    differer('action_enregistrer', { p_id: 'A2', p: { quand: '2026-11-20' } })
    const vus = []
    expect(await vider(async (fn, args) => vus.push(args.p_id))).toBe(2)
    expect(vus).toEqual(['A1', 'A2'])
    expect(reseau.get().attente).toBe(0)
  })
  it('garde la file si le réseau retombe pendant l\'envoi', async () => {
    differer('action_enregistrer', { p_id: 'A1', p: { fait: true } })
    await vider(async () => { throw new Error('Failed to fetch') })
    expect(reseau.get().attente).toBe(1)
  })
})
