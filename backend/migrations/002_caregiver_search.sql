-- Ejecutar después de 001_caregiver_profiles.sql. No ejecutar el esquema de contexto.
BEGIN;

ALTER TABLE public.caregiver_profiles
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS location_name text NOT NULL DEFAULT '';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'caregiver_profiles_coordinates_check'
      AND conrelid = 'public.caregiver_profiles'::regclass) THEN
    ALTER TABLE public.caregiver_profiles ADD CONSTRAINT caregiver_profiles_coordinates_check CHECK (
      (latitude IS NULL AND longitude IS NULL) OR
      (latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );
  END IF;
END $$;

-- Reutiliza la ubicación existente mediante profiles.id_user, no profiles.id.
UPDATE public.caregiver_profiles AS cp
SET latitude = c.latitude, longitude = c.longitude, location_name = c.zone
FROM public.profiles AS p
JOIN public.caregivers AS c ON c.id_user = p.id_user
WHERE cp.profile_id = p.id AND cp.latitude IS NULL AND cp.longitude IS NULL;

CREATE INDEX IF NOT EXISTS caregiver_profiles_coordinates_idx
  ON public.caregiver_profiles (latitude, longitude) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS bookings_caregiver_busy_idx
  ON public.bookings (id_caregiver, start_at, end_at) WHERE status IN ('requested', 'confirmed');

COMMIT;
