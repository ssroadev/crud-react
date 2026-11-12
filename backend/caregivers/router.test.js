const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCaregiverRouter } = require('./router');

// Simula las operaciones de Supabase; las peticiones sí recorren Express por HTTP.
function database() {
  const tables = {
    profiles: [{ id: 1, id_user: 101, first_name: 'Ana', last_name: 'Pérez' }],
    caregiver_profiles: [],
    caregivers: [], bookings: [], reviews: [], pets: [],
  };
  return {
    tables,
    from(table) {
      const filters = [];
      let payload;
      let one = false;
      let range;
      const query = {
        select() { return query; },
        eq(key, value) { filters.push((row) => String(row[key]) === String(value)); return query; },
        in(key, values) { filters.push((row) => values.some((value) => String(row[key]) === String(value))); return query; },
        lt(key, value) { filters.push((row) => row[key] < value); return query; },
        gt(key, value) { filters.push((row) => row[key] > value); return query; },
        range(start, end) { range = [start, end]; return query; },
        order() { return query; },
        maybeSingle() { one = true; return query; },
        single() { one = true; return query; },
        upsert(value) { payload = value; return query; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (payload) {
              const previous = tables[table].find((row) => String(row.profile_id) === String(payload.profile_id));
              const row = { id: previous?.id || 'test-caregiver-id', ...previous, ...payload };
              tables[table] = [...tables[table].filter((item) => item.id !== row.id), row];
            }
            let rows = tables[table].filter((row) => filters.every((filter) => filter(row)))
              .map((row) => {
                if (table === 'caregiver_profiles') return { ...row, profile: tables.profiles.find((item) => item.id === row.profile_id) };
                if (table === 'caregivers') return { ...row, bookings: tables.bookings.filter((booking) => booking.id_caregiver === row.id).map((booking) => ({ ...booking, reviews: tables.reviews.filter((review) => review.id_booking === booking.id) })) };
                return row;
              });
            if (range) rows = rows.slice(range[0], range[1] + 1);
            return { data: one ? rows[0] ?? null : rows, error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

async function setup(t, db = database()) {
  const app = express();
  app.use(express.json());
  app.use('/caregivers', createCaregiverRouter(db, (req, _res, next) => {
    req.account = { id: 101, profile: { id: 1 }, roles: ['caregiver'] }; next();
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/caregivers`;
  return {
    db,
    get: (path = '') => fetch(`${url}${path}`),
    put: (body, id = 1) => fetch(`${url}/profile/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  };
}

const complete = {
  status: 'published', bio: 'Cuido con cariño', experience: 'Cuido perros desde hace 3 años',
  years_experience: 3, zone: 'Chapinero', species: ['Perros'],
  services: [{ name: 'Paseos', rate: 18000, unit: 'paseo' }],
  availability: [{ day: 1, start: '09:00', end: '12:00' }],
};

test('crea y recupera borradores sin exponerlos en las rutas públicas', async (t) => {
  const api = await setup(t);
  assert.equal(await (await api.get('/profile/1')).json(), null);
  const response = await api.put({ bio: 'En preparación' });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.status, 'draft');
  assert.equal((await (await api.get('/profile/1')).json()).bio, 'En preparación');
  assert.deepEqual(await (await api.get()).json(), []);
  assert.equal((await api.get(`/${saved.id}`)).status, 404);
});

test('recomendaciones HTTP: consulta pública, validación, mascota propia y privacidad de mascotas ajenas', async (t) => {
  const api = await setup(t);
  api.db.tables.profiles.push({ id: 2, id_user: 202, first_name: 'Laura', last_name: 'Gómez' });
  api.db.tables.caregiver_profiles.push({ ...complete, id: 'recommended', profile_id: 2, specialties: ['Cachorros'] });
  api.db.tables.pets.push({ id: 10, id_owner: 101, name: 'Luna', size: 'pequeno', birth_date: null },
    { id: 11, id_owner: 999, name: 'Mascota ajena', notes: 'Privadas' });
  let response = await api.get('/recommendations?species=Perros&needs=Cachorros');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  let result = await response.json();
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.context.pet, null);
  api.db.tables.caregiver_profiles.push({ ...complete, id: 'own-profile', profile_id: 1 });
  response = await api.get('/recommendations?pet_id=10&species=Perros');
  assert.equal(response.status, 200);
  result = await response.json();
  assert.equal(result.context.pet.name, 'Luna');
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].id, 'recommended');
  assert.equal((await api.get('/recommendations?pet_id=11')).status, 404);
  assert.equal((await api.get('/recommendations?pet_id=12')).status, 404);
  assert.equal((await api.get('/recommendations?needs=Inexistente')).status, 400);
  assert.equal((await api.get('/recommendations?latitude=4')).status, 400);
});

test('recomendaciones HTTP: requiere sesión para consultar una mascota guardada', async (t) => {
  const app = express();
  app.use('/caregivers', createCaregiverRouter(database()));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const url = `http://127.0.0.1:${server.address().port}/caregivers/recommendations`;
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(`${url}?pet_id=10`)).status, 401);
});

test('recomendaciones HTTP: consulta reservas reales y reseñas antes de decidir compatibilidad', async (t) => {
  const api = await setup(t);
  api.db.tables.profiles.push({ id: 2, id_user: 202, first_name: 'Laura', last_name: 'Gómez' });
  api.db.tables.caregiver_profiles.push({ ...complete, id: 'busy', profile_id: 2, specialties: [] });
  api.db.tables.caregivers.push({ id: 77, id_user: 202, active: true });
  api.db.tables.bookings.push({ id: 8, id_caregiver: 77, start_at: '2026-11-16T10:00:00', end_at: '2026-11-16T11:00:00', status: 'confirmed' },
    { id: 9, id_caregiver: 77, status: 'completed' });
  api.db.tables.reviews.push({ id_booking: 9, rating: 5 });
  const response = await api.get('/recommendations?species=Perros&date=2026-11-16&start_time=09:00&end_time=11:00');
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.alternatives.length, 1);
  assert.equal(result.alternatives[0].rating, 5);
  assert.equal(result.alternatives[0].review_count, 1);
  assert.ok(result.alternatives[0].recommendation.warnings.includes('Sin disponibilidad en ese horario'));
  assert.equal('busy_bookings' in result.alternatives[0], false);
});

test('publica, actualiza sin duplicar y retira un perfil al guardarlo como borrador', async (t) => {
  const api = await setup(t);
  const response = await api.put(complete);
  assert.equal(response.status, 200);
  const first = await response.json();
  assert.equal((await (await api.get()).json()).length, 1);
  assert.equal((await api.get(`/${first.id}`)).status, 200);
  const edited = await (await api.put({ ...complete, zone: 'Teusaquillo', services: [{ name: 'Paseos', rate: 20000, unit: 'paseo' }] })).json();
  assert.equal(edited.id, first.id);
  assert.equal(edited.zone, 'Teusaquillo');
  assert.equal(edited.services[0].rate, 20000);
  assert.equal(api.db.tables.caregiver_profiles.length, 1);
  await api.put({ ...edited, status: 'draft' });
  assert.deepEqual(await (await api.get()).json(), []);
  assert.equal((await api.get(`/${first.id}`)).status, 404);
});

test('rechaza publicaciones incompletas sin alterar los datos ya guardados', async (t) => {
  const api = await setup(t);
  await api.put(complete);
  const response = await api.put({ ...complete, bio: '', availability: [] });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.ok(body.errors.bio);
  assert.ok(body.errors.availability);
  assert.equal((await (await api.get()).json())[0].bio, complete.bio);
});

test('rechaza cuentas inexistentes y descarta la identidad enviada en el cuerpo', async (t) => {
  const api = await setup(t);
  assert.equal((await api.put(complete, 99)).status, 403);
  const saved = await (await api.put({ ...complete, profile_id: 99 })).json();
  assert.equal(saved.profile_id, 1);
});

test('devuelve un error JSON si falla la base de datos', async (t) => {
  const db = database();
  db.from = () => {
    const query = {
      select: () => query, eq: () => query, order: () => query, range: () => query,
      then: (resolve) => Promise.resolve({ data: null, error: { message: 'database unavailable' } }).then(resolve),
    };
    return query;
  };
  const api = await setup(t, db);
  const response = await api.get();
  assert.equal(response.status, 500);
  assert.ok((await response.json()).error);
});

test('busca por distancia y combina filtros sobre el mismo servicio', async (t) => {
  const api = await setup(t);
  await api.put({ ...complete, latitude: 4.65, longitude: -74.06, specialties: ['Cachorros'] });
  const query = new URLSearchParams({ latitude: '4.65', longitude: '-74.06', radius_km: '3', service: 'Paseos', species: 'Perros', specialty: 'Cachorros', max_price: '20000', rate_unit: 'paseo' });
  const response = await api.get(`?${query}`);
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].distance_km, 0);
  assert.equal(rows[0].rating, null);
  assert.equal(rows[0].profile.id_user, undefined);
  query.set('latitude', '5.65');
  assert.deepEqual(await (await api.get(`?${query}`)).json(), []);
  query.set('latitude', '4.65'); query.set('max_price', '1000');
  assert.deepEqual(await (await api.get(`?${query}`)).json(), []);
});

test('usa profiles.id_user para ubicación heredada, reseñas y conflictos de reservas', async (t) => {
  const api = await setup(t);
  await api.put(complete);
  api.db.tables.caregivers.push({ id: 77, id_user: 101, latitude: 4.65, longitude: -74.06, active: true });
  api.db.tables.bookings.push(
    { id: 40, id_caregiver: 77, status: 'completed', start_at: '2026-01-05T09:00:00', end_at: '2026-01-05T10:00:00' },
    { id: 41, id_caregiver: 77, status: 'confirmed', start_at: '2026-11-16T10:00:00', end_at: '2026-11-16T11:00:00' },
  );
  api.db.tables.reviews.push({ id: 5, id_booking: 40, rating: 4 });
  const rows = await (await api.get('?latitude=4.65&longitude=-74.06&radius_km=1')).json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rating, 4);
  assert.equal(rows[0].review_count, 1);
  const detail = await (await api.get(`/${rows[0].id}`)).json();
  assert.equal(detail.rating, 4);
  assert.equal(detail.busy_bookings, undefined);
  assert.deepEqual(await (await api.get('?date=2026-11-16&start_time=09:00&end_time=12:00')).json(), []);
  assert.equal((await (await api.get('?date=2026-11-16&start_time=09:00&end_time=10:00')).json()).length, 1);
  assert.deepEqual(await (await api.get('?date=2026-11-17&start_time=09:00&end_time=10:00')).json(), []);
  api.db.tables.caregivers[0].active = false;
  assert.deepEqual(await (await api.get()).json(), []);
  assert.equal((await api.get(`/${rows[0].id}`)).status, 404);
});

test('rechaza filtros inválidos y devuelve errores por campo', async (t) => {
  const api = await setup(t);
  for (const query of ['latitude=91&longitude=0', 'radius_km=5', 'latitude=0', 'min_price=200&max_price=100', 'date=2026-02-30&start_time=09:00&end_time=10:00', 'date=2026-11-16', 'service=unknown']) {
    const response = await api.get(`?${query}`);
    assert.equal(response.status, 400, query);
    assert.ok(Object.keys((await response.json()).errors).length);
  }
});
