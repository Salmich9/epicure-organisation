-- Effectif du staff (repas, tenues, minibus) : compte l'effectif prévu tant que rien n'est encore couvert.
-- Appliqué en base par remplacement de l'expression nb_staff dans orga.v_elements (voir migration orga_30_nb_staff_besoin).
create index if not exists staff_evt_staff_idx on orga.staff_evt (staff_id);
create index if not exists staff_notes_staff_idx on orga.staff_notes (staff_id);
