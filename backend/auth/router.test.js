const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAuthService } = require('./service');
const { createAuthRouter } = require('./router');
const { createPetRouter } = require('../pets/router');
const { createCaregiverRouter } = require('../caregivers/router');

function fixture() {
  const tables = {
    users: [{ id: 101, auth_user_id: 'auth-ana', email: 'ana@example.com' }],
    profiles: [{ id: 7, id_user: 101, first_name: 'Ana', last_name: 'Pérez', phone: null, bio: null }],
    user_roles: [{ id_user: 101, role: { name: 'owner' } }],
    pets: [{ id: 1, id_owner: 101, name: 'Coco', size: 'mediano' }, { id: 2, id_owner: 202, name: 'Milo', size: 'grande' }],
  };
  let refreshes = 0;
  const session = { access_token: 'valid-access', refresh_token: 'valid-refresh' };
  const state = { calls: [], signUpError: null, signInError: null, recoveryError: null, verifyError: null, updatePasswordError: null, duplicate: false, confirmEmail: false, revoked: false };
  const database = {
    auth: { admin: { signOut: async (token, scope) => { state.revoked = true; state.calls.push({ type: 'signOut', token, scope }); return { error: null }; } } },
    from(table) {
      const filters = []; let one = false; let update; let insert; let remove = false;
      const query = {
        select: () => query,
        eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return query; },
        order: () => query,
        single() { one = true; return query; },
        maybeSingle() { one = true; return query; },
        update(data) { update = data; return query; },
        insert(data) { insert = data; return query; },
        delete() { remove = true; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (insert) tables[table].push(...insert.map((row) => ({ id: 3, ...row })));
            const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
            if (update) for (const row of rows) Object.assign(row, Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)));
            if (remove) tables[table] = tables[table].filter((row) => !rows.includes(row));
            return { data: one ? rows[0] ?? null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const clientFactory = () => ({ auth: {
    signUp: async (body) => { state.calls.push({ type: 'signUp', body }); return { data: { user: { id: 'auth-ana', identities: state.duplicate ? [] : [{}] }, session: state.confirmEmail ? null : session }, error: state.signUpError }; },
    signInWithPassword: async (body) => { state.calls.push({ type: 'login', body }); return { data: { user: { id: 'auth-ana' }, session: state.signInError ? null : session }, error: state.signInError }; },
    resetPasswordForEmail: async (email, options) => { state.calls.push({ type: 'recoveryRequest', email, options }); return { data: {}, error: state.recoveryError }; },
    verifyOtp: async (body) => { state.calls.push({ type: 'verifyOtp', body }); return { data: { user: { id: 'auth-ana' }, session }, error: state.verifyError }; },
    setSession: async (tokens) => { state.calls.push({ type: 'setSession', tokens }); return { data: { user: { id: 'auth-ana' }, session }, error: null }; },
    updateUser: async (body) => { state.calls.push({ type: 'updateUser', body }); return { data: { user: { id: 'auth-ana' } }, error: state.updatePasswordError }; },
    getUser: async (token) => ({ data: { user: token === 'valid-access' ? { id: 'auth-ana' } : null }, error: token === 'valid-access' ? null : { status: 401 } }),
    refreshSession: async ({ refresh_token }) => { refreshes++; return { data: { user: { id: 'auth-ana' }, session: refresh_token === 'valid-refresh' ? session : null }, error: refresh_token === 'valid-refresh' ? null : { status: 401 } }; },
  } });
  return { database, clientFactory, tables, state, refreshes: () => refreshes };
}

async function setup(t) {
  const data = fixture();
  const auth = createAuthService(data.database, data.clientFactory);
  const app = express(); app.use(express.json());
  app.use('/auth', createAuthRouter(data.database, auth, { frontendUrl: 'http://localhost:5173', recoveryCallbackUrl: 'http://localhost:3002/auth/recovery/callback' }));
  app.use('/pets', createPetRouter(data.database, auth.requireAccount));
  app.use('/caregivers', createCaregiverRouter(data.database, auth.requireAccount));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return { ...data, request: (path, { method = 'GET', body, cookie } = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }) };
}
const register = { first_name: 'Ana', last_name: 'Pérez', email: 'ana@example.com', password: 'mascotas123', confirm_password: 'mascotas123', role: 'owner' };
const cookie = 'pawhub_access=valid-access; pawhub_refresh=valid-refresh';

test('registra datos válidos y entrega sesión en cookies HttpOnly, sin exponer tokens en JSON', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/register', { method: 'POST', body: register });
  assert.equal(response.status, 201);
  assert.ok(response.headers.getSetCookie().every((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)));
  const body = await response.json();
  assert.equal(body.account.id, 101);
  assert.equal(body.account.profile.id, 7);
  assert.equal(body.confirmation_required, false);
  assert.equal(JSON.stringify(body).includes('valid-access'), false);
  assert.equal(api.state.calls[0].body.options.data.role, 'owner');
});
test('confirma registro pendiente de correo sin crear una sesión prematura', async (t) => {
  const api = await setup(t); api.state.confirmEmail = true;
  const response = await api.request('/auth/register', { method: 'POST', body: register });
  assert.equal(response.status, 201);
  const body = await response.json(); assert.equal(body.confirmation_required, true); assert.equal(body.account, null);
  assert.equal(response.headers.getSetCookie().length, 0);
});
test('rechaza obligatorios incompletos y correos ya registrados', async (t) => {
  const api = await setup(t);
  const invalid = await api.request('/auth/register', { method: 'POST', body: {} });
  assert.equal(invalid.status, 400); assert.ok((await invalid.json()).errors.email); assert.equal(api.state.calls.length, 0);
  api.state.duplicate = true;
  assert.equal((await api.request('/auth/register', { method: 'POST', body: register })).status, 409);
});
test('inicia sesión y comunica credenciales incorrectas o correo sin confirmar', async (t) => {
  const api = await setup(t);
  const success = await api.request('/auth/login', { method: 'POST', body: register });
  assert.equal(success.status, 200); assert.equal((await success.json()).account.email, register.email);
  api.state.signInError = { code: 'invalid_credentials', status: 400 };
  const invalid = await api.request('/auth/login', { method: 'POST', body: register });
  assert.equal(invalid.status, 401); assert.match((await invalid.json()).error, /correo o la contraseña/);
  api.state.signInError = { code: 'email_not_confirmed', status: 400 };
  assert.match((await (await api.request('/auth/login', { method: 'POST', body: register })).json()).error, /Confirma tu correo/);
});
test('restaura sesión y coordina renovaciones simultáneas del token expirado', async (t) => {
  const api = await setup(t);
  assert.equal((await (await api.request('/auth/session')).json()).account, null);
  assert.equal((await (await api.request('/auth/session', { cookie })).json()).account.profile.first_name, 'Ana');
  const responses = await Promise.all(Array.from({ length: 3 }, () => api.request('/auth/session', { cookie: 'pawhub_access=expired; pawhub_refresh=valid-refresh' })));
  for (const response of responses) { assert.equal((await response.json()).account.id, 101); assert.ok(response.headers.getSetCookie().length); }
  assert.equal(api.refreshes(), 1);
});
test('el perfil se actualiza únicamente para la cuenta autenticada', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/auth/profile', { method: 'PUT', body: register })).status, 401);
  const response = await api.request('/auth/profile', { method: 'PUT', cookie, body: { ...register, first_name: 'Ana María', id: 999, id_user: 202, role: 'admin', email: 'other@example.com' } });
  assert.equal(response.status, 200);
  assert.equal(api.tables.profiles[0].first_name, 'Ana María'); assert.equal(api.tables.profiles[0].id_user, 101);
  assert.equal((await response.json()).account.email, 'ana@example.com');
});
test('una sesión solo consulta y administra sus propias mascotas usando users.id', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/pets')).status, 401);
  const rows = await (await api.request('/pets', { cookie })).json(); assert.equal(rows.length, 1); assert.equal(rows[0].name, 'Coco');
  const created = await (await api.request('/pets', { method: 'POST', cookie, body: { name: 'Luna', size: 'pequeno', id_owner: 202 } })).json();
  assert.equal(created.id_owner, 101);
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await api.request('/pets/2', { method, cookie, ...(method === 'PUT' ? { body: { name: 'Robado' } } : {}) })).status, 404);
  assert.equal(api.tables.pets.find((pet) => pet.id === 2).name, 'Milo');
});
test('protege borradores y edición de cuidadores contra otras cuentas y roles', async (t) => {
  const api = await setup(t);
  assert.equal((await api.request('/caregivers/profile/7')).status, 401);
  assert.equal((await api.request('/caregivers/profile/8', { cookie })).status, 403);
  assert.equal((await api.request('/caregivers/profile/7', { cookie })).status, 403);
});
test('cierra sesión, revoca la sesión de Supabase y borra ambas cookies', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/logout', { method: 'POST', cookie });
  assert.equal(response.status, 204); assert.equal(api.state.revoked, true);
  assert.equal(response.headers.getSetCookie().length, 3);
  assert.ok(response.headers.getSetCookie().every((value) => /Expires=Thu, 01 Jan 1970/i.test(value)));
});

test('borra cookies inválidas sin devolver una cuenta y limita intentos repetidos', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/session', { cookie: 'pawhub_access=invalid; pawhub_refresh=invalid' });
  assert.equal((await response.json()).account, null);
  assert.equal(response.headers.getSetCookie().length, 3);
  for (let i = 0; i < 25; i++) assert.equal((await api.request('/auth/login', { method: 'POST', body: {} })).status, 400);
  assert.equal((await api.request('/auth/login', { method: 'POST', body: {} })).status, 429);
});

test('el cierre de sesión renueva un acceso expirado antes de revocar la sesión', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/logout', { method: 'POST', cookie: 'pawhub_access=expired; pawhub_refresh=valid-refresh' });
  assert.equal(response.status, 204);
  assert.equal(api.refreshes(), 1);
  assert.equal(api.state.calls.find((call) => call.type === 'signOut').token, 'valid-access');
});

test('solicita recuperación con un mensaje uniforme y callback fijado al backend', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/recovery/request', { method: 'POST', body: { email: ' ANA@example.com ' } });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /Si el correo está registrado/);
  assert.deepEqual(api.state.calls[0], {
    type: 'recoveryRequest', email: 'ana@example.com',
    options: { redirectTo: 'http://localhost:3002/auth/recovery/callback' },
  });
});

test('verifica token_hash recovery en el backend, establece HttpOnly cookies y redirige al frontend', async (t) => {
  const api = await setup(t);
  const response = await api.request('/auth/recovery/callback?token_hash=one-time-hash&type=recovery');
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://localhost:5173/?auth=recovery');
  assert.ok(response.headers.getSetCookie().every((value) => /HttpOnly/i.test(value)));
  assert.equal(api.state.calls[0].type, 'verifyOtp');
  assert.deepEqual(api.state.calls[0].body, { token_hash: 'one-time-hash', type: 'recovery' });
});

test('rechaza callbacks con tipo incorrecto o token vencido', async (t) => {
  const api = await setup(t);
  const wrongType = await api.request('/auth/recovery/callback?token_hash=one-time-hash&type=email');
  assert.equal(wrongType.headers.get('location'), 'http://localhost:5173/?auth=recovery-error');
  assert.equal(api.state.calls.length, 0);
  api.state.verifyError = { code: 'otp_expired', status: 403 };
  const expired = await api.request('/auth/recovery/callback?token_hash=expired-hash&type=recovery');
  assert.equal(expired.headers.get('location'), 'http://localhost:5173/?auth=recovery-error');
});

test('actualiza contraseña solo con cookie de recuperación y elimina el permiso efímero', async (t) => {
  const api = await setup(t);
  const body = { password: 'Mascotas123!', confirm_password: 'Mascotas123!' };
  const denied = await api.request('/auth/recovery/password', { method: 'POST', cookie, body });
  assert.equal(denied.status, 401);
  const response = await api.request('/auth/recovery/password', { method: 'POST', cookie: `${cookie}; pawhub_recovery=1`, body });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /actualizó correctamente/);
  assert.deepEqual(api.state.calls.find((call) => call.type === 'updateUser').body, { password: body.password });
  assert.ok(response.headers.getSetCookie().some((value) => /pawhub_recovery=;/i.test(value)));
});
