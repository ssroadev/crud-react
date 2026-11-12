const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createBookingRouter } = require('../bookings/router');
const sharp = require('sharp');

async function setup(t) {
  const state = { calls: [], error: null, offline: false, objects: new Map(), messages: new Map(), uploadError: null };
  const database = { rpc: async (name, params) => {
    state.calls.push({ name, params });
    if (state.offline) throw new Error('Database unavailable');
    const data = name === 'pawhub_get_chat' ? { messages: [], booking: { id: '7' } } : { id: '12', content: params.p_content, ...(params.p_image_path ? { image_path: params.p_image_path } : {}) };
    if (name === 'pawhub_send_message' && !state.error) state.messages.set(`${params.p_booking_id}/12`, data);
    return { data, error: state.error };
  }, storage: { from(bucket) {
    assert.equal(bucket, 'booking-chat-photos');
    return {
      async upload(path, bytes, options) {
        if (state.uploadError) return { error: state.uploadError };
        assert.equal(options.upsert, false); assert.equal(options.contentType, 'image/webp');
        if (state.objects.has(path)) return { error: { statusCode: '409' } };
        state.objects.set(path, bytes); return { data: { path } };
      },
      async download(path) { return { data: new Blob([state.objects.get(path)]) }; },
    };
  } }, from(table) {
    assert.equal(table, 'booking_messages');
    const filters = {};
    return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      async maybeSingle() { return { data: state.messages.get(`${filters.booking_id}/${filters.id}`) || null }; },
    };
  } };
  const app = express(); app.use(express.json());
  app.use('/bookings', createBookingRouter(database, (req, res, next) => {
    if (!req.get('X-User')) return res.status(401).json({ error: 'Inicia sesión.' });
    req.account = { id: Number(req.get('X-User')), roles: ['owner'] }; next();
  }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const request = (path = '/7/chat', body, user = '101') => fetch(`http://127.0.0.1:${server.address().port}/bookings${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(user ? { 'X-User': user } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const rawRequest = (path, options = {}, user = '101') => fetch(`http://127.0.0.1:${server.address().port}/bookings${path}`, {
    ...options, headers: { ...(user ? { 'X-User': user } : {}), ...options.headers },
  });
  return { state, request, rawRequest };
}
const message = { client_message_id: '11111111-1111-4111-8111-111111111111', content: ' ¿Cómo está Coco? ' };

test('chat HTTP: requiere sesión y usa exclusivamente la identidad autenticada', async (t) => {
  const { state, request } = await setup(t);
  assert.equal((await request('/7/chat', null, null)).status, 401);
  assert.equal((await request('/7/chat', message, null)).status, 401);
  const response = await request('/7/chat?actor_id=999');
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(state.calls[0].params.p_actor_id, 101);
  const sent = await request('/7/chat', { ...message, sender_id: 999, created_at: '1990-01-01', booking_id: 8 });
  assert.equal(sent.status, 201); assert.equal((await sent.json()).message.content, '¿Cómo está Coco?');
  assert.deepEqual(state.calls[1], { name: 'pawhub_send_message', params: { p_actor_id: 101, p_booking_id: '7', p_client_message_id: message.client_message_id, p_content: '¿Cómo está Coco?' } });
  await request('/7/chat', message, '202'); assert.equal(state.calls[2].params.p_actor_id, 202);
});
test('chat HTTP: rechaza IDs, cursores y mensajes inválidos antes de acceder a la base', async (t) => {
  const { state, request } = await setup(t);
  for (const path of ['/0/chat', '/no/chat', '/7/chat?after_id=-1', '/7/chat?before_id=0', '/7/chat?after_id=1&before_id=2', '/7/chat?limit=101', '/7/chat?after_id=1&after_id=2', '/7/chat?limit=0']) assert.equal((await request(path)).status, 400, path);
  for (const body of [{}, { ...message, content: ' \n ' }, { ...message, content: 'a'.repeat(4001) }, { ...message, content: 42 }, { ...message, client_message_id: 'not-uuid' }]) assert.equal((await request('/7/chat', body)).status, 400);
  assert.equal(state.calls.length, 0);
  assert.equal((await request('/7/chat?after_id=0&limit=100')).status, 200);
  assert.equal(state.calls[0].params.p_after_id, '0'); assert.equal(state.calls[0].params.p_limit, 100);
});
test('chat HTTP: acceso ajeno y fallos de envío tienen respuestas explícitas', async (t) => {
  const { state, request } = await setup(t);
  for (const [code, status] of [['P0002', 404], ['42501', 403], ['22023', 400], ['23505', 409], ['P0001', 429]]) {
    state.error = { code, message: 'No se pudo completar el envío.' };
    const response = await request('/7/chat', message);
    assert.equal(response.status, status); assert.equal((await response.json()).message, undefined);
    if (status === 429) assert.equal(response.headers.get('Retry-After'), '60');
  }
  state.error = { code: 'P0002', message: 'Conversación no disponible.' };
  assert.equal((await request()).status, 404);
  state.offline = true;
  const failure = await request('/7/chat', message);
  assert.equal(failure.status, 503); assert.match((await failure.json()).error, /Intenta de nuevo/);
});

const photoForm = (bytes, content = '', type = 'image/png') => {
  const body = new FormData();
  body.append('client_message_id', message.client_message_id);
  body.append('content', content);
  body.append('photo', new Blob([bytes], { type }), 'mascota.png');
  return body;
};
const photoBytes = () => sharp({ create: { width: 12, height: 8, channels: 3, background: '#238c92' } }).png().toBuffer();

test('chat fotos: admite foto sola y con texto, la convierte y reintenta sin sobrescribir archivos', async (t) => {
  const { state, rawRequest } = await setup(t);
  const bytes = await photoBytes();
  const send = (content = '') => rawRequest('/7/chat', { method: 'POST', body: photoForm(bytes, content) });
  const first = await send();
  assert.equal(first.status, 201);
  const saved = (await first.json()).message;
  assert.equal(saved.content, '');
  assert.match(saved.image_path, /^7\/101\/11111111-1111-4111-8111-111111111111-[a-f0-9]{64}\.webp$/);
  assert.equal((await sharp(state.objects.get(saved.image_path)).metadata()).format, 'webp');
  assert.equal((await send()).status, 201);
  assert.equal(state.objects.size, 1);
  assert.equal((await send('Coco está bien')).status, 201);
  const downloaded = await rawRequest('/7/chat/12/photo');
  assert.equal(downloaded.status, 200); assert.equal(downloaded.headers.get('Content-Type'), 'image/webp');
  assert.equal(downloaded.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), state.objects.get(saved.image_path));
  assert.equal((await rawRequest('/8/chat/12/photo')).status, 404);
  assert.equal((await rawRequest('/7/chat/0/photo')).status, 400);
  state.error = { code: 'P0002', message: 'Conversación no disponible.' };
  assert.equal((await rawRequest('/7/chat/12/photo')).status, 404);
  assert.equal((await send()).status, 404);
  assert.equal(state.objects.size, 1);
});

test('chat fotos: valida sesión, formato real, tamaño, múltiples archivos y errores de Storage', async (t) => {
  const { state, rawRequest } = await setup(t);
  const send = (body, user) => rawRequest('/7/chat', { method: 'POST', body }, user);
  const bytes = await photoBytes();
  assert.equal((await send(photoForm(bytes), null)).status, 401);
  assert.equal((await send(photoForm('<svg></svg>'))).status, 400);
  assert.equal((await send(photoForm(bytes, '', 'image/svg+xml'))).status, 400);
  assert.equal((await send(photoForm(Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
  const multiple = photoForm(bytes); multiple.append('photo', new Blob([bytes], { type: 'image/png' }), 'otra.png');
  assert.equal((await send(multiple)).status, 400);
  assert.equal(state.objects.size, 0);
  state.uploadError = { statusCode: '500', message: 'No disponible' };
  assert.equal((await send(photoForm(bytes))).status, 503);
  assert.equal(state.calls.filter((call) => call.name === 'pawhub_send_message').length, 0);
});

test('chat tiempo real: protege el stream y notifica solo los envíos de la conversación abierta', async (t) => {
  const { state, request, rawRequest } = await setup(t);
  assert.equal((await rawRequest('/7/chat/events', {}, null)).status, 401);
  state.error = { code: 'P0002', message: 'Conversación no disponible.' };
  assert.equal((await rawRequest('/7/chat/events')).status, 404);
  state.error = null;
  const controller = new AbortController(); t.after(() => controller.abort());
  const stream = await rawRequest('/7/chat/events', { signal: controller.signal });
  assert.match(stream.headers.get('Content-Type'), /^text\/event-stream/);
  assert.equal(stream.headers.get('X-Accel-Buffering'), 'no');
  const reader = stream.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /event: sync/);
  await request('/8/chat', message);
  await request('/7/chat', message, '202');
  const next = await reader.read();
  assert.equal(new TextDecoder().decode(next.value), 'event: sync\ndata: {}\n\n');
  controller.abort();
});
