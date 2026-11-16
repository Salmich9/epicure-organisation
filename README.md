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
- `tests/sql/notifs.sql` : les rappels (heures de Casablanca, veille 18 h, changement, réaffectation, retard une fois, critique, heures calmes, pas de prix). Finit par une erreur volontaire « RESULTATS 25 / 25 : tout passe » : rien n'est gardé.

## Notifications push (v65)

- Réglages : Événements › 🔔 Notifications (direction ; seul un admin change). Interrupteur sur Arrêt par défaut, puis « En test » (testeurs) avant « Toute l'équipe ». Valeurs dans `orga.parametres` clé `notifs`.
- Chacun : Ma part › 🔔 = Mes rappels (abonner ce téléphone, prochains rappels, reçus). Une notif ouvre `#/tache/<evt>/<id>` avec « ✓ Fait » ; elle ne coche jamais rien d'elle-même.
- Chaîne : pg_cron `orga-notifs` chaque minute → `orga._notifs_reveil()` → fonction `orga-notifs` (secret `notifs_secret`) → `orga._notifs_passage(now)` décide et note dans `orga.alertes_envoyees` → envoi web-push, 3 notifs au plus par personne (puis « N autres »), abonnements 404/410 retirés.
- Clés VAPID : variables `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` de la fonction si présentes, sinon fabriquées une fois et gardées dans `orga.parametres` `notifs_vapid` (table fermée) ; la privée ne sort jamais du serveur.
- Tables fermées (RLS sans règle) : `orga.push_abonnements`, `orga.alertes_envoyees`. Code d'événement : `orga.evenements.code` (AHMED1501), rempli tout seul, modifiable.
- « À confirmer » des enveloppes reste sur Telegram (le bot le fait déjà, avec ses boutons) : un seul canal. « Pièces bloquées » : pas encore de source dans l'appli.
- Arrêt d'urgence : interrupteur sur Arrêt ; ou `select cron.unschedule('orga-notifs')` ; ou copier `public/sw-retrait.js` sur `public/sw.js` (le téléphone désinstalle le service worker).
- iPhone : iOS 16.4 ou plus, appli ajoutée à l'écran d'accueil et ouverte depuis l'icône (connexion propre à l'icône), puis s'abonner d'un toucher. Un abonnement est lié à l'adresse : se réabonner sur l'adresse de production.
