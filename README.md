# Epicure · Organisation des événements

Appli téléphone (React + Vite) pour organiser les événements Epicure : plan de salle par zone, répartition dépôt / location / achat / production, délégation WhatsApp, notes dictées.

- Données : Supabase, projet Epicure-dev, schéma isolé `orga` (aucune table du schéma `public` n'est modifiée ; le stock du dépôt est seulement lu).
- Accès : code PIN par membre de l'équipe ; lien personnel sans compte pour les responsables (`/?l=<lien>`).
- Le schéma `orga` doit figurer dans Supabase > Project Settings > Data API > Exposed schemas.
- Retour arrière complet de la base : `drop schema orga cascade;`
