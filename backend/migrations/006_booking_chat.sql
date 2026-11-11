-- Chat privado asociado a cada solicitud. Ejecutar después de 005.
BEGIN;

CREATE TABLE IF NOT EXISTS public.booking_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES public.bookings(id),
  sender_id bigint NOT NULL REFERENCES public.users(id),
  client_message_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000 AND content ~ '[^[:space:]]'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT booking_messages_delivery_key UNIQUE (booking_id, sender_id, client_message_id)
);
CREATE INDEX IF NOT EXISTS booking_messages_history_idx ON public.booking_messages(booking_id, id);
CREATE INDEX IF NOT EXISTS booking_messages_sender_rate_idx ON public.booking_messages(booking_id, sender_id, created_at);
ALTER TABLE public.booking_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_messages TO service_role;

CREATE OR REPLACE FUNCTION public.pawhub_chat_context(p_actor_id bigint, p_booking_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE context jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', b.id::text, 'status', b.status, 'service_name', b.service_name,
    'start_at', b.start_at, 'end_at', b.end_at,
    'pet', jsonb_build_object('id', pet.id::text, 'name', pet.name),
    'owner', jsonb_build_object('id', b.owner_id::text, 'first_name', op.first_name, 'last_name', op.last_name),
    'caregiver', jsonb_build_object('id', c.id_user::text, 'first_name', cp.first_name, 'last_name', cp.last_name)
  ) INTO context
  FROM public.bookings b
  JOIN public.caregivers c ON c.id = b.id_caregiver
  JOIN public.pets pet ON pet.id = b.id_pet
  LEFT JOIN public.profiles op ON op.id_user = b.owner_id
  LEFT JOIN public.profiles cp ON cp.id_user = c.id_user
  WHERE b.id = p_booking_id AND p_actor_id IN (b.owner_id, c.id_user);
  IF context IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No se encontró una conversación de esta solicitud para tu cuenta.';
  END IF;
  RETURN context;
END $$;

CREATE OR REPLACE FUNCTION public.pawhub_get_chat(
  p_actor_id bigint, p_booking_id bigint, p_after_id bigint DEFAULT NULL,
  p_before_id bigint DEFAULT NULL, p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE context jsonb; messages jsonb; first_id bigint; last_id bigint;
BEGIN
  context := public.pawhub_chat_context(p_actor_id, p_booking_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR
    (p_after_id IS NOT NULL AND p_before_id IS NOT NULL) OR p_after_id < 0 OR p_before_id < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los parámetros de la conversación no son válidos.';
  END IF;
  IF p_after_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id::text, 'sender_id', m.sender_id::text, 'client_message_id', m.client_message_id::text,
      'content', m.content, 'created_at', m.created_at) ORDER BY m.id), '[]'::jsonb), min(m.id), max(m.id)
    INTO messages, first_id, last_id FROM (
      SELECT * FROM public.booking_messages WHERE booking_id = p_booking_id AND id > p_after_id
      ORDER BY id ASC LIMIT p_limit
    ) m;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id::text, 'sender_id', m.sender_id::text, 'client_message_id', m.client_message_id::text,
      'content', m.content, 'created_at', m.created_at) ORDER BY m.id), '[]'::jsonb), min(m.id), max(m.id)
    INTO messages, first_id, last_id FROM (
      SELECT * FROM public.booking_messages WHERE booking_id = p_booking_id AND (p_before_id IS NULL OR id < p_before_id)
      ORDER BY id DESC LIMIT p_limit
    ) m;
  END IF;
  RETURN jsonb_build_object('booking', context, 'messages', messages,
    'has_older', EXISTS (SELECT 1 FROM public.booking_messages WHERE booking_id = p_booking_id AND id < first_id),
    'has_more', p_after_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.booking_messages WHERE booking_id = p_booking_id AND id > last_id));
END $$;

CREATE OR REPLACE FUNCTION public.pawhub_send_message(
  p_actor_id bigint, p_booking_id bigint, p_client_message_id uuid, p_content text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE message public.booking_messages%ROWTYPE; normalized text;
BEGIN
  -- El bloqueo ordena los envíos de esta conversación y hace seguros los reintentos.
  PERFORM b.id FROM public.bookings b JOIN public.caregivers c ON c.id = b.id_caregiver
    WHERE b.id = p_booking_id AND p_actor_id IN (b.owner_id, c.id_user) FOR UPDATE OF b;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'No se encontró una conversación de esta solicitud para tu cuenta.';
  END IF;
  normalized := regexp_replace(p_content, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  IF p_client_message_id IS NULL OR normalized IS NULL OR char_length(normalized) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Escribe un mensaje de entre 1 y 4000 caracteres.';
  END IF;
  SELECT * INTO message FROM public.booking_messages
    WHERE booking_id = p_booking_id AND sender_id = p_actor_id AND client_message_id = p_client_message_id;
  IF FOUND THEN
    IF message.content IS DISTINCT FROM normalized THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Este identificador de envío ya corresponde a otro mensaje.';
    END IF;
  ELSE
    IF (SELECT count(*) FROM public.booking_messages WHERE booking_id = p_booking_id AND sender_id = p_actor_id
      AND created_at > clock_timestamp() - interval '1 minute') >= 30 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'Estás enviando muchos mensajes. Espera un momento antes de reintentar.';
    END IF;
    INSERT INTO public.booking_messages(booking_id, sender_id, client_message_id, content)
      VALUES (p_booking_id, p_actor_id, p_client_message_id, normalized) RETURNING * INTO message;
  END IF;
  RETURN jsonb_build_object('id', message.id::text, 'sender_id', message.sender_id::text,
    'client_message_id', message.client_message_id::text, 'content', message.content, 'created_at', message.created_at);
END $$;

REVOKE ALL ON FUNCTION public.pawhub_chat_context(bigint, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_get_chat(bigint, bigint, bigint, bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pawhub_send_message(bigint, bigint, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pawhub_get_chat(bigint, bigint, bigint, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pawhub_send_message(bigint, bigint, uuid, text) TO service_role;

COMMIT;
