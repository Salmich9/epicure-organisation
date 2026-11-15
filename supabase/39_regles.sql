-- Correction n°4 de l'audit : une seule source pour TVA, imprévus et coefficient par défaut.
-- Les écrans, le devis Zoho et l'agent vocal lisent ces valeurs (reçues avec les données).
insert into orga.parametres (cle, valeur) values ('regles', jsonb_build_object(
  'tva', jsonb_build_object('Epicure', 20, 'Business Boys', 10, 'Espèce', 0),
  'imprevus_pct', 5,
  'coef_defaut', 2.4))
on conflict (cle) do nothing;

do $$
declare def text;
begin
  def := pg_get_functiondef('orga.donnees'::regproc);
  if def !~ 'regles' then
    execute replace(def, '''equipe_evt'', orga._equipe(ev),', '''equipe_evt'', orga._equipe(ev), ''regles'', (select valeur from orga.parametres where cle = ''regles''),');
  end if;
  def := pg_get_functiondef('orga.accueil'::regproc);
  if def !~ 'regles' then
    execute replace(def, 'jsonb_build_object(''moi'', me,', 'jsonb_build_object(''moi'', me, ''regles'', (select valeur from orga.parametres where cle = ''regles''),');
  end if;
end $$;
