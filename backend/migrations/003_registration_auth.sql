-- Ejecutar después de 001 y 002 desde el editor SQL de Supabase.
-- Conserva los IDs bigint existentes y sus relaciones.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

INSERT INTO public.roles (name, description) VALUES
  ('owner', 'Dueño de mascota'), ('caregiver', 'Cuidador de mascotas')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.pawhub_create_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  new_user_id bigint;
  chosen_role text;
BEGIN
  INSERT INTO public.users (email, auth_user_id) VALUES (lower(NEW.email), NEW.id)
    RETURNING id INTO new_user_id;

  INSERT INTO public.profiles (id_user, first_name, last_name, phone)
  VALUES (new_user_id,
    coalesce(nullif(trim(left(NEW.raw_user_meta_data->>'first_name', 80)), ''), 'Usuario'),
    coalesce(nullif(trim(left(NEW.raw_user_meta_data->>'last_name', 80)), ''), 'PawHub'),
    nullif(left(NEW.raw_user_meta_data->>'phone', 25), ''));

  chosen_role := CASE WHEN NEW.raw_user_meta_data->>'role' = 'caregiver' THEN 'caregiver' ELSE 'owner' END;
  INSERT INTO public.user_roles (id_user, id_role)
    SELECT new_user_id, id FROM public.roles WHERE name = chosen_role;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pawhub_create_account() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pawhub_on_auth_user_created ON auth.users;
CREATE TRIGGER pawhub_on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.pawhub_create_account();

-- El backend comprueba identidad y propiedad con su clave de servidor.
-- Las claves públicas no pueden consultar ni modificar datos privados directamente.
DO $$
DECLARE target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'users', 'profiles', 'pets', 'roles', 'user_roles', 'caregivers',
    'caregiver_profiles', 'caregiver_services', 'caregiver_availability',
    'bookings', 'reviews', 'services'
  ] LOOP
    IF to_regclass('public.' || target_table) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', target_table);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', target_table);
    END IF;
  END LOOP;
END $$;

COMMIT;
