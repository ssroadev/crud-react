const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createBookingRouter } = require('./router');

async function setup(t) {
  const state = { calls: [], error: null, rows: [
    { id: 1, owner_id: 101, caregiver_profile_id: '11111111-1111-4111-8111-111111111111', status: 'confirmed', reviewed_at: '2030-01-01T10:00:00Z', owner_seen_at: null, caregiver: { id_user: 202 } },
    { id: 2, owner_id: 303, status: 'requested', caregiver: { id_user: 404 } },
  ] };
  state.profiles = [];
  const database = {
    rpc: async (name, params) => { state.calls.push({ name, params }); return { data: [{ id: 3, status: name.includes('complete') ? 'completed' : name.includes('review') ? params.p_decision : 'requested' }], error: state.error }; },
    from: (table) => {
      const filters = []; let update, one = false;
      const query = {
        select: () => query, order: () => query, range: () => query,
        eq(key, value) { filters.push((row) => String(key.split('.').reduce((item, part) => item?.[part], row)) === String(value)); return query; },
        in(key, values) { filters.push((row) => values.includes(row[key])); return query; },
        update(value) { update = value; return query; },
        maybeSingle() { one = true; return query; },
        then(resolve) {
          const rows = (table === 'caregiver_profiles' ? state.profiles : state.rows).filter((row) => filters.every((filter) => filter(row)));
          if (update) rows.forEach((row) => Object.assign(row, update));
          return Promise.resolve({ data: one ? rows[0] ?? null : rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
  const requireAccount = (req, res, next) => {
    const user = req.get('X-User');
    if (!user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.account = { id: user === 'caregiver' ? 202 : user === 'outsider' ? 999 : 101, roles: user === 'caregiver' ? ['caregiver'] : ['owner'] };
    next();
  };
  const app = express(); app.use(express.json()); app.use('/bookings', createBookingRouter(database, requireAccount));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { state, request: (path = '', { method = 'GET', body, user = 'owner' } = {}) => fetch(`http://127.0.0.1:${server.address().port}/bookings${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { 'X-User': user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }) };
}
const valid = { caregiver_profile_id: '11111111-1111-4111-8111-111111111111', pet_id: 7, service: 'Paseos', date: '2099-01-05', start_time: '09:00', end_time: '10:00', location: 'Chapinero' };

test('protege el módulo y devuelve solo las solicitudes de la sesión', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('', { user: null })).status, 401);
  const response = await api.request('?owner_id=303');
  const rows = await response.json(); assert.equal(rows.length, 1); assert.equal(rows[0].id, 1);
  assert.equal(rows[0].owner_unread, true); assert.equal(rows[0].caregiver, undefined);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await api.request('?view=received')).status, 403);
  assert.equal((await (await api.request('?view=received', { user: 'caregiver' })).json())[0].id, 1);
  assert.deepEqual(await (await api.request('', { user: 'outsider' })).json(), []);
});
test('la creación usa la identidad de sesión y siempre nace pendiente', async (t) => {
  const api = await setup(t);
  const response = await api.request('', { method: 'POST', body: { ...valid, owner_id: 999, status: 'confirmed', total_amount: 0 } });
  assert.equal(response.status, 201); assert.equal((await response.json()).booking.status, 'requested');
  assert.equal(api.state.calls[0].params.p_owner_id, 101);
  assert.equal(api.state.calls[0].params.total_amount, undefined);
  assert.equal((await api.request('', { method: 'POST', body: {} })).status, 400);
});
test('los conflictos devuelven 409 y no se presentan como confirmados', async (t) => {
  const api = await setup(t); api.state.error = { code: '23P01', message: 'El horario no está disponible.' };
  const response = await api.request('', { method: 'POST', body: valid });
  assert.equal(response.status, 409); assert.equal((await response.json()).booking, undefined);
});
test('solo el cuidador responde y su identidad no puede enviarse en el cuerpo', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/1/review', { method: 'POST', body: { decision: 'confirmed' } })).status, 403);
  const response = await api.request('/1/review', { method: 'POST', user: 'caregiver', body: { decision: 'rejected', response_note: 'No puedo atenderte.', caregiver_user_id: 999 } });
  assert.equal(response.status, 200); assert.equal((await response.json()).booking.status, 'rejected');
  assert.equal(api.state.calls[0].params.p_caregiver_user_id, 202);
  assert.equal((await api.request('/1/review', { method: 'POST', user: 'caregiver', body: { decision: 'requested' } })).status, 400);
  api.state.error = { code: 'P0002', message: 'No se encontró esa solicitud para tu cuenta.' };
  assert.equal((await api.request('/2/review', { method: 'POST', user: 'caregiver', body: { decision: 'confirmed' } })).status, 404);
});
test('cada dueño puede marcar como leídas únicamente sus respuestas', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/1/read', { method: 'POST' })).status, 204);
  assert.equal((await (await api.request()).json())[0].owner_unread, false);
  assert.equal((await api.request('/2/read', { method: 'POST' })).status, 404);
});

test('indica al cuidador si una solicitud sigue siendo compatible con su horario', async (t) => {
  const api = await setup(t);
  Object.assign(api.state.rows[0], { status: 'requested', id_caregiver: 77, service_name: 'Paseos', rate_unit: 'hora', start_at: '2099-01-05T09:00:00', end_at: '2099-01-05T10:00:00' });
  const day = new Date('2099-01-05T00:00:00Z').getUTCDay();
  api.state.profiles.push({ id: valid.caregiver_profile_id, status: 'published', services: [{ name: 'Paseos', unit: 'hora' }], availability: [{ day, start: '08:00', end: '12:00' }] });
  const first = (await (await api.request('?view=received', { user: 'caregiver' })).json())[0];
  assert.equal(first.availability_check.can_accept, true);
  api.state.profiles[0].availability = [{ day, start: '13:00', end: '18:00' }];
  const changed = (await (await api.request('?view=received', { user: 'caregiver' })).json())[0];
  assert.equal(changed.availability_check.can_accept, false);
  assert.match(changed.availability_check.reason, /disponibilidad registrada/);
  assert.equal((await (await api.request()).json())[0].availability_check, undefined);
});

test('solo el cuidador puede completar y el servidor usa su identidad de sesión', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/1/complete', { method: 'POST' })).status, 403);
  const response = await api.request('/1/complete', { method: 'POST', user: 'caregiver', body: { caregiver_user_id: 999 } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).booking.status, 'completed');
  assert.equal(api.state.calls[0].params.p_caregiver_user_id, 202);
  assert.equal((await api.request('/invalid/complete', { method: 'POST', user: 'caregiver' })).status, 400);
  api.state.error = { code: 'P0001', message: 'El servicio todavía no terminó.' };
  assert.equal((await api.request('/1/complete', { method: 'POST', user: 'caregiver' })).status, 409);
});

test('informa servicios completados aunque la reserva anterior no tenga fecha de respuesta', async (t) => {
  const api = await setup(t);
  Object.assign(api.state.rows[0], { status: 'completed', reviewed_at: null, completed_at: '2030-01-01T10:00:00Z' });
  assert.equal((await (await api.request()).json())[0].owner_unread, true);
});
