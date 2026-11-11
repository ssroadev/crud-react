-- Ejecutar después de 004_booking_requests.sql.
BEGIN;

ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS completed_at timestamptz;
CREATE INDEX IF NOT EXISTS bookings_caregiver_agenda_idx ON public.bookings(id_caregiver, start_at)
  WHERE status = 'confirmed';

CREATE OR REPLACE FUNCTION public.pawhub_complete_booking(p_caregiver_user_id bigint, p_booking_id bigint)
RETURNS SETOF public.bookings LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE request public.bookings%ROWTYPE;
BEGIN
  SELECT b.* INTO request FROM public.bookings b
    JOIN public.caregivers c ON c.id = b.id_caregiver
    WHERE b.id = p_booking_id AND c.id_user = p_caregiver_user_id
    FOR UPDATE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No se encontró esa reserva para tu cuenta.';
  END IF;
  IF request.status <> 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Solo puedes completar una reserva aceptada que siga confirmada.';
  END IF;
  IF request.end_at > timezone('America/Bogota', now()) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Puedes completar el servicio cuando haya terminado su horario.';
  END IF;
  UPDATE public.bookings SET status = 'completed', completed_at = now(), owner_seen_at = NULL
    WHERE id = request.id;
  RETURN QUERY SELECT * FROM public.bookings WHERE id = request.id;
END $$;

REVOKE ALL ON FUNCTION public.pawhub_complete_booking(bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pawhub_complete_booking(bigint, bigint) TO service_role;

COMMIT;
