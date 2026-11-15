# Epicure · Organisation des événements

Appli téléphone (React + Vite) pour organiser les événements Epicure : plan de salle par zone, répartition dépôt / location / achat / production, délégation WhatsApp, notes dictées.

- Données : Supabase, projet Epicure-dev, schéma isolé `orga` (aucune table du schéma `public` n'est modifiée ; le stock du dépôt est seulement lu).
- Accès : code PIN par membre de l'équipe ; lien personnel sans compte pour les responsables (`/?l=<lien>`).
- Le schéma `orga` doit figurer dans Supabase > Project Settings > Data API > Exposed schemas.
- Retour arrière complet de la base : `drop schema orga cascade;`

## Tests de non-régression

- `npm test` : les calculs (montants, dates, étapes, cadrage).
- `npm run build && npm run test:e2e` : chaque écran s'ouvre sans plantage et les parcours clés marchent (Playwright, données fictives).
- `supabase/tests/regression.sql` : la base (sécurité des fonctions, RLS, enveloppes, actions, suppression). À lancer après chaque migration ; tout est annulé à la fin, le message attendu est « REGRESSION OK ».
- Les deux premiers tournent à chaque envoi sur GitHub (onglet Actions).
