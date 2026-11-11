const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createLocationRouter } = require('./router');

async function setup(t, options) {
  const app = express();
  app.use('/locations', createLocationRouter(options));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return (q) => fetch(`http://127.0.0.1:${server.address().port}/locations?q=${encodeURIComponent(q)}`);
}

test('localiza texto manual y reutiliza la caché sin nuevas peticiones al proveedor', async (t) => {
  let calls = 0;
  const get = await setup(t, { fetchImpl: async (url) => {
    calls++;
    assert.equal(url.searchParams.get('q'), 'Chapinero, Bogotá');
    assert.equal(url.searchParams.get('limit'), '5');
    return { ok: true, json: async () => ({ features: [
      { properties: { name: 'Chapinero', city: 'Bogotá', country: 'Colombia' }, geometry: { coordinates: [-74.06, 4.65] } },
      { properties: { name: 'Invalid' }, geometry: { coordinates: [null, null] } },
    ] }) };
  } });
  const result = await (await get('Chapinero, Bogotá')).json();
  assert.deepEqual(result, [{ latitude: 4.65, longitude: -74.06, label: 'Chapinero, Bogotá, Colombia' }]);
  assert.deepEqual(await (await get('CHAPINERO, BOGOTÁ')).json(), result);
  assert.equal(calls, 1);
});

test('informa si no hay coincidencias y limita peticiones distintas demasiado rápidas', async (t) => {
  const get = await setup(t, { now: () => 1000, fetchImpl: async () => ({ ok: true, json: async () => ({ features: [] }) }) });
  assert.deepEqual(await (await get('No existe')).json(), []);
  assert.equal((await get('Otra ciudad')).status, 429);
});

test('rechaza búsquedas vacías y comunica fallos del proveedor sin datos internos', async (t) => {
  const get = await setup(t, { fetchImpl: async () => { throw new Error('private provider details'); } });
  assert.equal((await get('ab')).status, 400);
  const response = await get('Bogotá');
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /coordenadas manualmente/);
  assert.equal(body.error.includes('private'), false);
});

test('permite volver a consultar después de que venza la caché', async (t) => {
  let time = 1000;
  let calls = 0;
  const get = await setup(t, { now: () => time, fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ features: [] }) };
  } });
  await get('Bogotá');
  time += 3600001;
  await get('Bogotá');
  assert.equal(calls, 2);
});
