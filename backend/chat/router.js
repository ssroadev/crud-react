const express = require('express');
const { validId } = require('../bookings/validation');
const { createChatRealtime } = require('./realtime');
const { PHOTO_BUCKET, parsePhoto, preparePhoto } = require('./photos');
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
  const realtime = createChatRealtime(database);
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.account) return res.status(401).json({ error: 'Inicia sesión para abrir la conversación.' });
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Selecciona una solicitud válida.' });
    next();
  });
  router.get('/events', async (req, res) => {
    try {
      const { error } = await database.rpc('pawhub_chat_context', { p_actor_id: req.account.id, p_booking_id: req.params.id });
      if (res.destroyed) return;
      if (error) return chatError(res, error);
      res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      const sync = () => { if (!res.destroyed) res.write('event: sync\ndata: {}\n\n'); };
      const stop = realtime.watch(req.params.id, sync);
      res.write('retry: 1000\n\n');
      sync();
      const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
      // La reconexión vuelve a verificar sesión y pertenencia antes de abrir otro stream.
      const expiry = setTimeout(() => res.end(), 55000);
      res.on('close', () => { clearInterval(heartbeat); clearTimeout(expiry); stop(); });
    } catch (error) {
      if (res.headersSent) res.end();
      else if (!res.destroyed) chatError(res, error);
    }
  });
  router.get('/:messageId/photo', async (req, res) => {
    if (!validId(req.params.messageId)) return res.status(400).json({ error: 'Selecciona una foto válida.' });
    try {
      const context = await database.rpc('pawhub_chat_context', { p_actor_id: req.account.id, p_booking_id: req.params.id });
      if (context.error) return chatError(res, context.error);
      const { data: message, error } = await database.from('booking_messages').select('image_path')
        .eq('booking_id', req.params.id).eq('id', req.params.messageId).maybeSingle();
      if (error) return chatError(res, error);
      if (!message?.image_path) return res.status(404).json({ error: 'Esta foto no está disponible.' });
      const photo = await database.storage.from(PHOTO_BUCKET).download(message.image_path);
      if (photo.error) return chatError(res, photo.error);
      res.set({ 'Content-Type': 'image/webp', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="foto.webp"' });
      res.send(Buffer.from(await photo.data.arrayBuffer()));
    } catch (error) { chatError(res, error); }
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
  router.post('/', parsePhoto, async (req, res) => {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const clientId = req.body?.client_message_id;
    if ((!content && !req.file) || content.length > 4000 || typeof clientId !== 'string' || !UUID.test(clientId) || req.body.content !== undefined && typeof req.body.content !== 'string') {
      return res.status(400).json({ error: 'Escribe un mensaje o adjunta una foto e incluye un identificador de envío válido (máximo 4000 caracteres).' });
    }
    try {
      let imagePath;
      if (req.file) {
        const context = await database.rpc('pawhub_chat_context', { p_actor_id: req.account.id, p_booking_id: req.params.id });
        if (context.error) return chatError(res, context.error);
        const photo = await preparePhoto(req.file, req.params.id, req.account.id, clientId);
        const stored = await database.storage.from(PHOTO_BUCKET).upload(photo.path, photo.bytes, { contentType: 'image/webp', upsert: false });
        // Una misma foto y clave de envío comparten ruta, incluidos reintentos concurrentes.
        if (stored.error && String(stored.error.statusCode) !== '409') return chatError(res, stored.error);
        imagePath = photo.path;
      }
      const { data, error } = await database.rpc('pawhub_send_message', {
        p_actor_id: req.account.id, p_booking_id: req.params.id, p_client_message_id: clientId, p_content: content,
        ...(imagePath ? { p_image_path: imagePath } : {}),
      });
      if (error) return chatError(res, error);
      realtime.notify(req.params.id);
      res.status(201).json({ message: data });
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      chatError(res, error);
    }
  });
  return router;
}

module.exports = { createChatRouter };
