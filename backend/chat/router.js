const express = require('express');
const { validId } = require('../bookings/validation');
const UUID = /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i;

function chatError(res, error) {
  const statuses = { '22023': 400, 'P0002': 404, '42501': 403, '23505': 409, 'P0001': 429 };
  const status = statuses[error.code];
  if (status === 429) res.set('Retry-After', '60');
  if (!status) console.error('Error del chat:', error.code || 'connection_error');
  return res.status(status || 503).json({ error: status ? error.message : 'No pudimos acceder al chat. Intenta de nuevo en un momento.' });
}

// Se monta dentro del router de reservas, después de verificar la sesión.
function createChatRouter(database) {
  const router = express.Router({ mergeParams: true });
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.account) return res.status(401).json({ error: 'Inicia sesión para abrir la conversación.' });
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Selecciona una solicitud válida.' });
    next();
  });
  router.get('/', async (req, res) => {
    const { after_id: after, before_id: before, limit = '50' } = req.query;
    if (after !== undefined && after !== '0' && !validId(after) || before !== undefined && !validId(before) ||
      after !== undefined && before !== undefined || typeof limit !== 'string' || !/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) {
      return res.status(400).json({ error: 'Los parámetros del historial no son válidos.' });
    }
    try {
      const { data, error } = await database.rpc('pawhub_get_chat', {
        p_actor_id: req.account.id, p_booking_id: req.params.id, p_after_id: after ?? null,
        p_before_id: before ?? null, p_limit: Number(limit),
      });
      if (error) return chatError(res, error);
      res.json(data);
    } catch (error) { chatError(res, error); }
  });
  router.post('/', async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const clientId = req.body?.client_message_id;
    if (!content || content.length > 4000 || typeof clientId !== 'string' || !UUID.test(clientId)) {
      return res.status(400).json({ error: 'Escribe un mensaje de entre 1 y 4000 caracteres e incluye un identificador de envío válido.' });
    }
    try {
      const { data, error } = await database.rpc('pawhub_send_message', {
        p_actor_id: req.account.id, p_booking_id: req.params.id, p_client_message_id: clientId, p_content: content,
      });
      if (error) return chatError(res, error);
      res.status(201).json({ message: data });
    } catch (error) { chatError(res, error); }
  });
  return router;
}

module.exports = { createChatRouter };
