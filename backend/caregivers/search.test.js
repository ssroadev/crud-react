const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseSearch, validCoordinates, distanceKm, matchingServices, availableDuring, ratingFromBookings, filterCaregivers } = require('./search');

const monday = { date: '2026-11-16', day: 1, start_time: '09:00', end_time: '12:00' };
const caregiver = (overrides = {}) => ({
  id: 'one', status: 'published', active: true, latitude: 4.65, longitude: -74.06,
  species: ['Perros'], specialties: ['Cachorros'], rating: null, review_count: 0,
  services: [{ name: 'Paseos', rate: 20000, unit: 'paseo' }],
  availability: [{ day: 1, start: '08:00', end: '13:00' }], ...overrides,
});

test('calcula distancia esférica, incluidos el ecuador y el meridiano 180', () => {
  assert.equal(distanceKm(0, 0, 0, 0), 0);
  assert.ok(Math.abs(distanceKm(0, 0, 0, 1) - 111.195) < 0.01);
  assert.ok(distanceKm(0, 179.9, 0, -179.9) < 23);
  assert.equal(validCoordinates(0, 0), true);
  assert.equal(validCoordinates(null, null), false);
  assert.equal(validCoordinates(Infinity, 0), false);
});

test('valida números, listas inesperadas, rangos de precio y fechas inexistentes', () => {
  for (const query of [
    { latitude: 'NaN', longitude: '0' }, { latitude: ' ', longitude: '0' },
    { longitude: '-181', latitude: '0' }, { latitude: ['4', '5'], longitude: '0' },
    { radius_km: '0' }, { min_price: 'Infinity' }, { min_price: '10', max_price: '9' },
    { species: 'Dragones' }, { sort: 'unknown' },
    { date: '2026-02-29', start_time: '09:00', end_time: '10:00' },
    { date: '2026-11-16', start_time: '22:00', end_time: '08:00' },
  ]) assert.ok(Object.keys(parseSearch(query).errors).length, JSON.stringify(query));
  assert.equal(parseSearch({ latitude: '0', longitude: '0' }).filters.radius_km, 10);
  assert.deepEqual(parseSearch({ date: '2028-02-29', start_time: '09:00', end_time: '10:00' }).errors, {});
});

test('el servicio, precio y unidad deben coincidir en una misma oferta', () => {
  const services = [{ name: 'Paseos', rate: 50000, unit: 'paseo' }, { name: 'Guardería', rate: 10000, unit: 'hora' }];
  assert.deepEqual(matchingServices(services, { service: 'Paseos', max_price: 20000 }), []);
  assert.deepEqual(matchingServices(services, { service: 'Paseos', rate_unit: 'hora' }), []);
  assert.equal(matchingServices(services, { service: 'Paseos', min_price: 50000, max_price: 50000 }).length, 1);
});

test('la disponibilidad cubre toda la franja y permite horarios consecutivos', () => {
  assert.equal(availableDuring([{ day: 1, start: '09:00', end: '10:30' }, { day: 1, start: '10:30', end: '12:00' }], [], monday), true);
  assert.equal(availableDuring([{ day: 1, start: '09:00', end: '10:00' }, { day: 1, start: '11:00', end: '12:00' }], [], monday), false);
  assert.equal(availableDuring([{ day: 2, start: '09:00', end: '12:00' }], [], monday), false);
});

test('descarta reservas solicitadas y confirmadas en conflicto, con límites exclusivos', () => {
  const schedule = caregiver().availability;
  for (const status of ['requested', 'confirmed']) {
    assert.equal(availableDuring(schedule, [{ status, start_at: '2026-11-16T10:00:00', end_at: '2026-11-16T11:00:00' }], monday), false);
  }
  for (const status of ['cancelled', 'completed']) {
    assert.equal(availableDuring(schedule, [{ status, start_at: '2026-11-16T10:00:00', end_at: '2026-11-16T11:00:00' }], monday), true);
  }
  assert.equal(availableDuring(schedule, [{ status: 'confirmed', start_at: '2026-11-16T08:00:00', end_at: '2026-11-16T09:00:00' }], monday), true);
  assert.equal(availableDuring(schedule, [{ status: 'confirmed', start_at: '2026-11-16T15:00:00Z', end_at: '2026-11-16T16:00:00Z' }], monday), false);
});

test('promedia reseñas reales de reservas completadas y distingue ausencia de calificación', () => {
  assert.deepEqual(ratingFromBookings(), { rating: null, review_count: 0 });
  assert.deepEqual(ratingFromBookings([
    { status: 'completed', reviews: [{ rating: 5 }] }, { status: 'completed', reviews: { rating: 4 } },
    { status: 'cancelled', reviews: [{ rating: 1 }] },
  ]), { rating: 4.5, review_count: 2 });
});

test('filtra distancia antes de redondear, excluye borradores y puntos desconocidos', () => {
  const rows = [caregiver(), caregiver({ id: 'no-location', latitude: null, longitude: null }), caregiver({ id: 'inactive', active: false }), caregiver({ id: 'draft', status: 'draft' })];
  assert.equal(filterCaregivers(rows, { sort: 'distance' }).length, 2);
  assert.deepEqual(filterCaregivers(rows, { latitude: 4.65, longitude: -74.06, radius_km: 1, sort: 'distance' }).map((item) => item.id), ['one']);
  assert.deepEqual(filterCaregivers(rows, { species: 'Gatos' }), []);
  assert.deepEqual(filterCaregivers(rows, { specialty: 'Mascotas mayores' }), []);
  assert.deepEqual(filterCaregivers([caregiver({ latitude: 0, longitude: 0.0091 })], { latitude: 0, longitude: 0, radius_km: 1 }), []);
});

test('ordena por precio o reseñas sin inventar calificaciones', () => {
  const rows = [caregiver({ id: 'expensive', rating: 4.8 }), caregiver({ id: 'cheap', services: [{ name: 'Paseos', rate: 9000, unit: 'paseo' }] })];
  assert.equal(filterCaregivers(rows, { sort: 'price' })[0].id, 'cheap');
  assert.equal(filterCaregivers(rows, { sort: 'rating' })[0].id, 'expensive');
});

test('filtra calificación y opiniones mínimas sin confundir ausencia de reseñas con cinco estrellas', () => {
  const profiles = [caregiver(), caregiver({ id: 'match', rating: 4.5, review_count: 5 }),
    caregiver({ id: 'few', rating: 5, review_count: 1 }), caregiver({ id: 'low', rating: 3, review_count: 10 })];
  assert.deepEqual(filterCaregivers(profiles, { min_rating: 4.5, min_reviews: 5 }).map((row) => row.id), ['match']);
  assert.equal(filterCaregivers(profiles, { min_rating: 0, min_reviews: 0 }).length, 4);
});
