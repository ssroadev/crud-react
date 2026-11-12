-- Ejecutar después de 007_pet_breeds.sql. Conserva las opiniones anteriores.
BEGIN;

ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS author_id bigint REFERENCES public.users(id);
-- No asigna una fecha inventada a opiniones históricas sin fecha registrada.
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.reviews ALTER COLUMN created_at SET DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_booking_idx ON public.reviews(id_booking);
CREATE INDEX IF NOT EXISTS bookings_completed_reviews_idx ON public.bookings(id_caregiver, id DESC) WHERE status = 'completed';

CREATE OR REPLACE FUNCTION public.pawhub_validate_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE service public.bookings%ROWTYPE; pet_owner bigint; caregiver_user bigint;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.id_booking IS DISTINCT FROM OLD.id_booking OR NEW.author_id IS DISTINCT FROM OLD.author_id) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No puedes cambiar el servicio ni el autor de una opinión.';
  END IF;
  SELECT b.* INTO service FROM public.bookings b WHERE b.id = NEW.id_booking FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La opinión necesita un servicio real.'; END IF;
  SELECT p.id_owner INTO pet_owner FROM public.pets p WHERE p.id = service.id_pet;
  SELECT c.id_user INTO caregiver_user FROM public.caregivers c WHERE c.id = service.id_caregiver;
  IF NEW.author_id IS NULL OR NEW.author_id IS DISTINCT FROM service.owner_id OR NEW.author_id IS DISTINCT FROM pet_owner OR NEW.author_id = caregiver_user THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el dueño de esta mascota y solicitud puede valorar el servicio.';
  END IF;
  IF service.status <> 'completed' OR service.end_at > timezone('America/Bogota', now()) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo puedes valorar un servicio completado cuyo horario haya terminado.';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Elige una puntuación entre 1 y 5 estrellas.';
  END IF;
  NEW.comment := nullif(trim(NEW.comment), '');
  IF length(NEW.comment) > 2000 THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El comentario admite hasta 2000 caracteres.'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pawhub_review_conditions ON public.reviews;
CREATE TRIGGER pawhub_review_conditions BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.pawhub_validate_review();

CREATE OR REPLACE FUNCTION public.pawhub_publish_review(p_owner_id bigint, p_booking_id bigint, p_rating integer, p_comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE service public.bookings%ROWTYPE; existing public.reviews%ROWTYPE; saved public.reviews%ROWTYPE; normalized text;
BEGIN
  SELECT b.* INTO service FROM public.bookings b WHERE b.id = p_booking_id AND b.owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No se encontró ese servicio en tu cuenta.'; END IF;
  IF service.status <> 'completed' OR service.end_at > timezone('America/Bogota', now()) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo puedes valorar un servicio completado cuyo horario haya terminado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pets p WHERE p.id = service.id_pet AND p.id_owner = p_owner_id)
    OR EXISTS (SELECT 1 FROM public.caregivers c WHERE c.id = service.id_caregiver AND c.id_user = p_owner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Solo el dueño de esta mascota puede valorar el servicio de otro cuidador.';
  END IF;
  normalized := nullif(trim(p_comment), '');
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR length(normalized) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Elige entre 1 y 5 estrellas y escribe hasta 2000 caracteres.';
  END IF;
  SELECT r.* INTO existing FROM public.reviews r WHERE r.id_booking = p_booking_id;
  IF FOUND THEN
    -- Recupera un envío exitoso cuya respuesta se perdió, sin publicar un duplicado.
    IF existing.author_id = p_owner_id AND existing.rating = p_rating AND existing.comment IS NOT DISTINCT FROM normalized THEN
      RETURN jsonb_build_object('created', false, 'review', jsonb_build_object('id', existing.id::text, 'rating', existing.rating, 'comment', existing.comment, 'created_at', existing.created_at));
    END IF;
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Este servicio ya tiene una valoración publicada.';
  END IF;
  INSERT INTO public.reviews(id_booking,author_id,rating,comment) VALUES (p_booking_id,p_owner_id,p_rating,normalized) RETURNING * INTO saved;
  RETURN jsonb_build_object('created', true, 'review', jsonb_build_object('id', saved.id::text, 'rating', saved.rating, 'comment', saved.comment, 'created_at', saved.created_at));
END $$;

CREATE OR REPLACE FUNCTION public.pawhub_caregiver_reviews(p_profile_id uuid, p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 5)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE caregiver_id bigint; result jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 OR (p_before_id IS NOT NULL AND p_before_id < 1) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'La página de opiniones no es válida.';
  END IF;
  SELECT c.id INTO caregiver_id FROM public.caregiver_profiles cp
    JOIN public.profiles p ON p.id = cp.profile_id LEFT JOIN public.caregivers c ON c.id_user = p.id_user
    WHERE cp.id = p_profile_id AND cp.status = 'published' AND c.active IS DISTINCT FROM false;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Este perfil no está publicado o no existe.'; END IF;
  WITH eligible AS (
    SELECT r.id,r.rating,r.comment,r.created_at,r.author_id,coalesce(nullif(b.service_name,''),s.name,'Servicio de cuidado') AS service_name
    FROM public.reviews r JOIN public.bookings b ON b.id = r.id_booking
      LEFT JOIN public.services s ON s.id = b.id_service
    WHERE b.id_caregiver = caregiver_id AND b.status = 'completed' AND r.rating BETWEEN 1 AND 5
  ), summary AS (
    SELECT count(*)::integer AS review_count, round(avg(rating),1) AS rating,
      jsonb_build_object('1',count(*) FILTER (WHERE rating=1),'2',count(*) FILTER (WHERE rating=2),
        '3',count(*) FILTER (WHERE rating=3),'4',count(*) FILTER (WHERE rating=4),'5',count(*) FILTER (WHERE rating=5)) AS distribution
    FROM eligible
  ), page AS (
    SELECT * FROM eligible WHERE p_before_id IS NULL OR id < p_before_id ORDER BY id DESC LIMIT p_limit + 1
  ), shown AS (
    SELECT * FROM page ORDER BY id DESC LIMIT p_limit
  )
  SELECT jsonb_build_object('summary', (SELECT to_jsonb(summary) FROM summary),
    'reviews', coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id::text,'rating',r.rating,'comment',r.comment,'created_at',r.created_at,
      'author_name',coalesce(nullif(trim(a.first_name),''),'Dueño de una mascota'),'service_name',r.service_name) ORDER BY r.id DESC)
      FROM shown r LEFT JOIN public.profiles a ON a.id_user = r.author_id), '[]'::jsonb),
    'has_more', (SELECT count(*) > p_limit FROM page),
    'next_cursor', CASE WHEN (SELECT count(*) > p_limit FROM page) THEN (SELECT min(id)::text FROM shown) ELSE NULL END)
  INTO result;
  RETURN result;
END $$;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.reviews FROM service_role;
GRANT SELECT ON public.reviews TO service_role;
REVOKE ALL ON FUNCTION public.pawhub_validate_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_publish_review(bigint,bigint,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_caregiver_reviews(uuid,bigint,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pawhub_publish_review(bigint,bigint,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pawhub_caregiver_reviews(uuid,bigint,integer) TO service_role;

COMMIT;
