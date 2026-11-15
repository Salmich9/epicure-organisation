// Règles de calcul : une seule source, la base (orga.parametres 'regles'), reçue avec les données.
// Les valeurs ci-dessous ne servent qu'avant le premier chargement.
let R = { tva: { Epicure: 20, 'Business Boys': 10, 'Espèce': 0 }, imprevus_pct: 5, coef_defaut: 2.4 }
export const setRegles = r => { if (r) R = { ...R, ...r, tva: { ...R.tva, ...(r.tva || {}) } } }
export const tva = entite => Number(R.tva[entite] ?? 0)
export const imprevusPct = () => Number(R.imprevus_pct)
export const imprevus = () => Number(R.imprevus_pct) / 100
export const coefDefaut = () => Number(R.coef_defaut)
