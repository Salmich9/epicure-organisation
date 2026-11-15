-- Chantier 5 : « + Ligne » peut reprendre une idée déjà présente dans l'événement (pas de doublon)
do $$
declare def text;
begin
  def := pg_get_functiondef('orga.ligne_ajouter'::regproc);
  if def !~ 'element_id' then
    execute replace(def, '  if nullif(p->>''catalogue_id'', '''') is not null and exists',
      '  if nullif(p->>''element_id'', '''') is not null and exists (select 1 from orga.elements where id = p->>''element_id'' and evenement_id = p_evt) then
    nid := p->>''element_id'';
    update orga.elements set element = coalesce(nullif(trim(p->>''nom''), ''''), element) where id = nid;
  elsif nullif(p->>''catalogue_id'', '''') is not null and exists');
  end if;
end $$;
