-- Ejecutar una vez en el editor SQL del proyecto Supabase.
-- Conserva el tipo real del ID de profiles (entero o UUID).
DO $$
DECLARE profile_id_type text;
BEGIN
  SELECT format_type(atttypid, atttypmod) INTO profile_id_type
  FROM pg_attribute WHERE attrelid = 'public.profiles'::regclass
    AND attname = 'id' AND NOT attisdropped;
  IF profile_id_type IS NULL THEN
    RAISE EXCEPTION 'Debe existir la tabla public.profiles con una columna id.';
  END IF;
  EXECUTE format($table$
    CREATE TABLE IF NOT EXISTS public.caregiver_profiles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      profile_id %s NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
      bio text NOT NULL DEFAULT '',
      experience text NOT NULL DEFAULT '',
      years_experience integer NOT NULL DEFAULT 0 CHECK (years_experience BETWEEN 0 AND 100),
      zone text NOT NULL DEFAULT '',
      species jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(species) = 'array'),
      specialties jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specialties) = 'array'),
      services jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(services) = 'array'),
      availability jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(availability) = 'array'),
      photos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(photos) = 'array'),
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT caregiver_publication_complete CHECK (
        status = 'draft' OR (
          length(trim(bio)) > 0 AND length(trim(experience)) > 0 AND length(trim(zone)) > 0
          AND jsonb_array_length(species) > 0 AND jsonb_array_length(services) > 0
          AND jsonb_array_length(availability) > 0
        )
      )
    )
  $table$, profile_id_type);
END $$;

CREATE INDEX IF NOT EXISTS caregiver_profiles_public_updated_idx
  ON public.caregiver_profiles (updated_at DESC) WHERE status = 'published';

ALTER TABLE public.caregiver_profiles ENABLE ROW LEVEL SECURITY;
-- Las escrituras pasan por Express con SUPABASE_KEY de servidor (service_role).
-- No se exponen borradores directamente con la clave pública de Supabase.
