const express = require('express');
const { validateBooking, validId } = require('./validation');
const { readAll } = require('../caregivers/directory');
const { assessAvailability, bookingTimestamp } = require('./management');
const { createChatRouter } = require('../chat/router');

const selection = `*, pet:pets!bookings_id_pet_fkey(id,name,size,breed,birth_date,notes),
  caregiver_profile:caregiver_profiles!bookings_caregiver_profile_id_fkey(id,profile:profiles(first_name,last_name)),
  owner:users!bookings_owner_id_fkey(profile:profiles(first_name,last_name,phone)),
  caregiver:caregivers!bookings_id_caregiver_fkey!inner(id_user,active)`;

function bookingError(res, error) {
  const statuses = { '22023': 400, '42501': 403, 'P0002': 404, '23P01': 409, 'P0001': 409, '23505': 409 };
  const status = statuses[error.code];
  if (!status) console.error('Error de solicitudes:', error.code, error.message);
  return res.status(status || 503).json({ error: status ? error.message : 'No se pudieron cargar o guardar las solicitudes. Verifica la conexión y la migración de reservas.' });
}

function createBookingRouter(database, requireAccount) {
  const router = express.Router();
  router.use(requireAccount);
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use('/:id/chat', createChatRouter(database));

  router.get('/', async (req, res) => {
    const view = req.query.view || 'sent';
    if (!['sent', 'received'].includes(view)) return res.status(400).json({ error: 'Selecciona solicitudes enviadas o recibidas.' });
    if (view === 'received' && !req.account.roles.includes('caregiver')) return res.status(403).json({ error: 'Las solicitudes recibidas requieren una cuenta de cuidador.' });
    try {
      const rows = await readAll(() => database.from('bookings').select(selection)
        .eq(view === 'sent' ? 'owner_id' : 'caregiver.id_user', req.account.id).order('created_at', { ascending: false }).order('id'));
      const profiles = [];
      if (view === 'received') {
        const ids = [...new Set(rows.filter((row) => row.status === 'requested' && row.caregiver_profile_id).map((row) => row.caregiver_profile_id))];
        for (let index = 0; index < ids.length; index += 100) {
          profiles.push(...await readAll(() => database.from('caregiver_profiles').select('id,status,services,availability').in('id', ids.slice(index, index + 100)).order('id')));
        }
      }
      const byId = new Map(profiles.map((profile) => [profile.id, profile]));
      const now = Date.now();
      res.json(rows.map((row) => {
        const { caregiver: _internal, ...booking } = row;
        return {
          ...booking, owner_unread: view === 'sent' && !!(booking.reviewed_at || booking.completed_at) && !booking.owner_seen_at,
          ...(view === 'received' ? {
            availability_check: assessAvailability(row, byId.get(row.caregiver_profile_id), rows, now),
            can_complete: row.status === 'confirmed' && bookingTimestamp(row.end_at) <= now,
          } : {}),
        };
      }));
    } catch (error) { bookingError(res, error); }
  });

  router.post('/', async (req, res) => {
    const { data, errors } = validateBooking(req.body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Revisa los datos de la solicitud.', errors });
    const { data: rows, error } = await database.rpc('pawhub_request_booking', { ...data, p_owner_id: req.account.id });
    if (error) return bookingError(res, error);
    res.status(201).json({ booking: rows[0], message: 'Solicitud enviada. Está pendiente de respuesta; todavía no es una reserva confirmada.' });
  });

  router.post('/:id/review', async (req, res) => {
    if (!req.account.roles.includes('caregiver')) return res.status(403).json({ error: 'Solo el cuidador puede responder esta solicitud.' });
    if (!validId(req.params.id) || !['confirmed', 'rejected'].includes(req.body?.decision) ||
      (req.body.response_note !== undefined && (typeof req.body.response_note !== 'string' || req.body.response_note.length > 1000))) {
      return res.status(400).json({ error: 'Selecciona aceptar o rechazar e indica una respuesta de hasta 1000 caracteres.' });
    }
    const { data: rows, error } = await database.rpc('pawhub_review_booking', {
      p_caregiver_user_id: req.account.id, p_booking_id: req.params.id,
      p_decision: req.body.decision, p_response_note: req.body.response_note?.trim() || '',
    });
    if (error) return bookingError(res, error);
    res.json({ booking: rows[0], message: req.body.decision === 'confirmed' ? 'Aceptaste la solicitud. La reserva está confirmada.' : 'Rechazaste la solicitud. El dueño verá tu respuesta.' });
  });

  router.post('/:id/read', async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Solicitud inválida.' });
    const { data, error } = await database.from('bookings').update({ owner_seen_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('owner_id', req.account.id).select('id').maybeSingle();
    if (error) return bookingError(res, error);
    if (!data) return res.status(404).json({ error: 'No se encontró esa solicitud en tu cuenta.' });
    res.status(204).end();
  });

  router.post('/:id/complete', async (req, res) => {
    if (!req.account.roles.includes('caregiver')) return res.status(403).json({ error: 'Solo el cuidador puede completar el servicio.' });
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Selecciona una reserva válida.' });
    const { data: rows, error } = await database.rpc('pawhub_complete_booking', {
      p_caregiver_user_id: req.account.id, p_booking_id: req.params.id,
    });
    if (error) return bookingError(res, error);
    res.json({ booking: rows[0], message: 'Servicio completado. Ya aparece en tu historial y el dueño podrá ver la actualización.' });
  });
  return router;
}

module.exports = { createBookingRouter };
