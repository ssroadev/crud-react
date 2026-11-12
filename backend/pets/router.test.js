const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createPetRouter } = require('./router');

async function setup(t) {
  const tables = {
    pets: [{ id: 1, id_owner: 10, name: 'Luna', size: 'mediano', breed: 'Raza antigua' }, { id: 2, id_owner: 20, name: 'Milo' }],
    pet_breeds: [{ id: 'dog-beagle', species: 'Perros', name: 'Beagle', active: true },
      { id: 'cat-siamese', species: 'Gatos', name: 'Siamés', active: true }, { id: 'dog-old', species: 'Perros', name: 'Inactiva', active: false }],
  };
  const state = { catalogUnavailable: false };
  const db = { from(table) {
    const filters = []; let one = false; let payload; let inserting = false;
    const q = { select: () => q, order: () => q,
      eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return q; },
      single() { one = true; return q; }, maybeSingle() { one = true; return q; },
      insert(value) { payload = value; inserting = true; return q; }, update(value) { payload = value; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (table === 'pet_breeds' && state.catalogUnavailable) return { data: null, error: { message: 'missing table' } };
        const inserted = inserting ? payload.map((row) => ({ ...row, id: tables[table].length + 1 })) : [];
        if (inserting) tables[table].push(...inserted);
        const rows = inserting ? inserted : tables[table].filter((row) => filters.every((f) => f(row)));
        if (payload && !inserting) rows.forEach((row) => Object.assign(row, payload));
        return { data: one ? rows[0] || null : rows, error: null };
      }).then(resolve, reject); },
    }; return q;
  } };
  const app = express(); app.use(express.json());
  app.use('/pets', createPetRouter(db, (req, res, next) => {
    if (req.get('Authorization') !== 'Test owner') return res.status(401).json({ error: 'Inicia sesión.' });
    req.account = { id: 10 }; next();
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const request = (path, body, method = 'GET', authenticated = true) => fetch(`http://127.0.0.1:${server.address().port}/pets${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Test owner' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { request, tables, state };
}

test('razas HTTP: catálogo público, solo opciones activas y sin mascotas privadas', async (t) => {
  const { request } = await setup(t);
  const response = await request('/breeds', null, 'GET', false);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).map((row) => row.id), ['dog-beagle', 'cat-siamese']);
  assert.equal((await request('', null, 'GET', false)).status, 401);
});

test('razas HTTP: resuelve el nombre en la base y no acepta dueño ni nombre de raza manipulados', async (t) => {
  const { request } = await setup(t);
  const response = await request('', { name: 'Coco', size: 'pequeno', breed_id: 'dog-beagle', breed: 'Falso', id_owner: 99 }, 'POST');
  assert.equal(response.status, 201);
  const pet = await response.json();
  assert.equal(pet.breed, 'Beagle'); assert.equal(pet.id_owner, 10);
  assert.equal('breed_id' in pet, false);
  for (const breed_id of ['dog-old', 'dog-missing']) assert.equal((await request('', { name: 'Coco', size: 'mediano', breed_id }, 'POST')).status, 400);
});

test('razas HTTP: guarda Otra, conserva raza al editar otros campos y protege mascotas ajenas', async (t) => {
  const { request } = await setup(t);
  let response = await request('/1', { notes: 'Nueva nota' }, 'PUT');
  assert.equal((await response.json()).breed, 'Raza antigua');
  response = await request('/1', { breed_id: null, breed_other: ' Raza personalizada ' }, 'PUT');
  assert.equal((await response.json()).breed, 'Raza personalizada');
  assert.equal((await request('/2', { breed_id: 'dog-beagle' }, 'PUT')).status, 404);
  assert.equal((await request('/1', { breed_other: '' }, 'PUT')).status, 400);
});

test('razas HTTP: sin catálogo informa el error y aún permite Otra', async (t) => {
  const { request, state } = await setup(t); state.catalogUnavailable = true;
  assert.equal((await request('/breeds')).status, 503);
  assert.equal((await request('', { name: 'Luna', size: 'mediano', breed_id: 'dog-beagle' }, 'POST')).status, 503);
  const response = await request('', { name: 'Luna', size: 'mediano', breed_other: 'Otra raza' }, 'POST');
  assert.equal(response.status, 201);
  assert.equal((await response.json()).breed, 'Otra raza');
});
