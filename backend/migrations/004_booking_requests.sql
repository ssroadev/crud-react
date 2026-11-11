-- Solicitudes y respuestas sobre la tabla bookings existente. Ejecutar después de 003.
BEGIN;

ALTER TABLE public.caregivers ALTER COLUMN latitude DROP NOT NULL, ALTER COLUMN longitude DROP NOT NULL;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS owner_id bigint REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS caregiver_profile_id uuid REFERENCES public.caregiver_profiles(id),
  ADD COLUMN IF NOT EXISTS service_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rate_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_unit text NOT NULL DEFAULT 'hora',
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS response_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer GENERATED ALWAYS AS ((extract(epoch FROM (end_at - start_at)) / 60)::integer) STORED;

ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('requested', 'confirmed', 'rejected', 'completed', 'cancelled'));

UPDATE public.bookings b SET owner_id = p.id_owner FROM public.pets p
  WHERE b.id_pet = p.id AND b.owner_id IS NULL;
ALTER TABLE public.bookings ALTER COLUMN owner_id SET NOT NULL;
UPDATE public.bookings b SET caregiver_profile_id = cp.id
  FROM public.caregivers c JOIN public.profiles p ON p.id_user = c.id_user
  JOIN public.caregiver_profiles cp ON cp.profile_id = p.id
  WHERE b.id_caregiver = c.id AND b.caregiver_profile_id IS NULL;
UPDATE public.bookings b SET service_name = s.name FROM public.services s
  WHERE b.id_service = s.id AND b.service_name = '';

CREATE INDEX IF NOT EXISTS bookings_owner_created_idx ON public.bookings(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_profile_status_idx ON public.bookings(caregiver_profile_id, status);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bookings FROM anon, authenticated;
GRANT ALL ON public.bookings TO service_role;

CREATE OR REPLACE FUNCTION public.pawhub_schedule_covers(p_schedule jsonb, p_start timestamp, p_end timestamp)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE slot record; covered_until time := p_start::time;
BEGIN
  IF p_start::date <> p_end::date OR p_end <= p_start THEN RETURN false; END IF;
  FOR slot IN SELECT (value->>'start')::time AS starts, (value->>'end')::time AS ends
    FROM jsonb_array_elements(p_schedule)
    WHERE (value->>'day')::integer = extract(dow FROM p_start)::integer
    ORDER BY (value->>'start')::time
  LOOP
    IF slot.starts <= covered_until AND slot.ends > covered_until THEN covered_until := slot.ends; END IF;
  END LOOP;
  RETURN covered_until >= p_end::time;
END $$;

CREATE OR REPLACE FUNCTION public.pawhub_request_booking(
  p_owner_id bigint, p_caregiver_profile_id uuid, p_pet_id bigint, p_service text,
  p_date date, p_start time, p_end time, p_location text, p_notes text DEFAULT ''
) RETURNS SETOF public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  professional public.caregiver_profiles%ROWTYPE;
  caregiver_user_id bigint; caregiver_id bigint; service_id bigint; new_id bigint;
  offer jsonb; starts timestamp; ends timestamp; rate numeric; unit text; amount numeric;
BEGIN
  IF p_owner_id IS NULL OR p_caregiver_profile_id IS NULL OR p_pet_id IS NULL OR p_service IS NULL
    OR p_date IS NULL OR p_start IS NULL OR p_end IS NULL OR coalesce(length(trim(p_location)), 0) = 0
    OR length(p_location) > 250 OR length(coalesce(p_notes, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Completa los datos obligatorios de la solicitud.';
  END IF;
  starts := p_date + p_start; ends := p_date + p_end;
  IF ends <= starts OR starts <= timezone('America/Bogota', now()) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selecciona un horario futuro, con hora final posterior a la inicial.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pets WHERE id = p_pet_id AND id_owner = p_owner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Selecciona una mascota de tu cuenta.';
  END IF;

  -- Serializa creación y revisión para que dos solicitudes no ocupen la misma franja.
  SELECT * INTO professional FROM public.caregiver_profiles WHERE id = p_caregiver_profile_id FOR UPDATE;
  IF NOT FOUND OR professional.status <> 'published' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'El perfil del cuidador no está disponible.';
  END IF;
  SELECT id_user INTO caregiver_user_id FROM public.profiles WHERE id = professional.profile_id;
  IF caregiver_user_id = p_owner_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'No puedes solicitar un servicio a tu propia cuenta.';
  END IF;
  SELECT value INTO offer FROM jsonb_array_elements(professional.services) WHERE value->>'name' = p_service LIMIT 1;
  IF offer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El cuidador no ofrece el servicio seleccionado.';
  END IF;
  IF NOT public.pawhub_schedule_covers(professional.availability, starts, ends) THEN
    RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'El horario solicitado no está cubierto por la disponibilidad del cuidador.';
  END IF;

  INSERT INTO public.caregivers(id_user, years_experience, latitude, longitude, zone, bio)
    VALUES (caregiver_user_id, professional.years_experience, professional.latitude, professional.longitude, professional.zone, professional.bio)
    ON CONFLICT (id_user) DO NOTHING;
  SELECT id INTO caregiver_id FROM public.caregivers WHERE id_user = caregiver_user_id AND active = true FOR UPDATE;
  IF caregiver_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Este cuidador no está activo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id_caregiver = caregiver_id
    AND b.status IN ('requested', 'confirmed') AND b.start_at < ends AND starts < b.end_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'El cuidador ya tiene una solicitud o reserva para ese horario. Elige otra franja.';
  END IF;

  INSERT INTO public.services(name) VALUES (p_service) ON CONFLICT (name) DO NOTHING;
  SELECT id INTO service_id FROM public.services WHERE name = p_service;
  rate := (offer->>'rate')::numeric; unit := offer->>'unit';
  IF rate <= 0 OR rate IS NULL OR unit NOT IN ('hora', 'día', 'noche', 'paseo', 'visita') OR unit IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El servicio no tiene una tarifa válida.';
  END IF;
  amount := round(rate * CASE WHEN unit = 'hora' THEN extract(epoch FROM (ends - starts)) / 3600 ELSE 1 END, 2);
  INSERT INTO public.bookings(id_pet, id_caregiver, id_service, start_at, end_at, status, total_amount,
    owner_id, caregiver_profile_id, service_name, rate_amount, rate_unit, location, notes)
    VALUES (p_pet_id, caregiver_id, service_id, starts, ends, 'requested', amount,
      p_owner_id, professional.id, p_service, rate, unit, trim(p_location), trim(coalesce(p_notes, '')))
    RETURNING id INTO new_id;
  RETURN QUERY SELECT * FROM public.bookings WHERE id = new_id;
END $$;

CREATE OR REPLACE FUNCTION public.pawhub_review_booking(
  p_caregiver_user_id bigint, p_booking_id bigint, p_decision text, p_response_note text DEFAULT ''
) RETURNS SETOF public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  request public.bookings%ROWTYPE; professional public.caregiver_profiles%ROWTYPE; selected_profile_id uuid;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('confirmed', 'rejected') OR length(coalesce(p_response_note, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Selecciona aceptar o rechazar e indica una respuesta de hasta 1000 caracteres.';
  END IF;
  SELECT b.caregiver_profile_id INTO selected_profile_id FROM public.bookings b
    JOIN public.caregivers c ON c.id = b.id_caregiver
    WHERE b.id = p_booking_id AND c.id_user = p_caregiver_user_id;
  IF selected_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No se encontró esa solicitud para tu cuenta.';
  END IF;
  SELECT * INTO professional FROM public.caregiver_profiles WHERE id = selected_profile_id FOR UPDATE;
  SELECT * INTO request FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF request.status <> 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'La solicitud ya recibió una respuesta. Actualiza la lista.';
  END IF;
  IF p_decision = 'confirmed' THEN
    -- Conserva la tarifa pactada; vuelve a comprobar el horario vigente al aceptar.
    IF request.start_at <= timezone('America/Bogota', now()) OR professional.status <> 'published'
      OR NOT EXISTS (SELECT 1 FROM public.caregivers WHERE id = request.id_caregiver AND active = true)
      OR NOT public.pawhub_schedule_covers(professional.availability, request.start_at, request.end_at)
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(professional.services) AS offer
        WHERE offer->>'name' = request.service_name AND offer->>'unit' = request.rate_unit) THEN
      RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'El servicio o el horario ya no está disponible. No se confirmó la solicitud.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.id_caregiver = request.id_caregiver AND b.id <> request.id
      AND b.status IN ('requested', 'confirmed') AND b.start_at < request.end_at AND request.start_at < b.end_at) THEN
      RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'Hay un conflicto con otra solicitud o reserva. No se confirmó la solicitud.';
    END IF;
  END IF;
  UPDATE public.bookings SET status = p_decision, response_note = trim(coalesce(p_response_note, '')),
    reviewed_at = now(), owner_seen_at = NULL WHERE id = request.id;
  RETURN QUERY SELECT * FROM public.bookings WHERE id = request.id;
END $$;

REVOKE ALL ON FUNCTION public.pawhub_schedule_covers(jsonb, timestamp, timestamp) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_request_booking(bigint, uuid, bigint, text, date, time, time, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_review_booking(bigint, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pawhub_request_booking(bigint, uuid, bigint, text, date, time, time, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pawhub_review_booking(bigint, bigint, text, text) TO service_role;

COMMIT;
