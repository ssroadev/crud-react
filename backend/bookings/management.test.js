const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assessAvailability } = require('./management');
const now = Date.parse('2030-01-01T00:00:00Z');
const request = { id: 1, id_caregiver: 77, caregiver_profile_id: 'profile', status: 'requested', service_name: 'Paseos', rate_unit: 'hora', start_at: '2030-01-07T09:00:00', end_at: '2030-01-07T10:30:00', caregiver: { active: true } };
const professional = { status: 'published', services: [{ name: 'Paseos', unit: 'hora' }], availability: [{ day: 1, start: '08:00', end: '10:00' }, { day: 1, start: '10:00', end: '12:00' }] };

test('la comprobación no considera la propia solicitud un conflicto y permite franjas contiguas', () => {
  assert.equal(assessAvailability(request, professional, [request], now).can_accept, true);
  assert.equal(assessAvailability({ ...request, status: 'confirmed' }, professional, [], now), null);
});
test('detecta cambios de horario, perfil, actividad o servicio', () => {
  for (const profile of [null, { ...professional, status: 'draft' }, { ...professional, services: [] }, { ...professional, availability: [{ day: 1, start: '12:00', end: '18:00' }] }]) {
    assert.equal(assessAvailability(request, profile, [], now).can_accept, false);
  }
  assert.equal(assessAvailability({ ...request, caregiver: { active: false } }, professional, [], now).can_accept, false);
});
test('detecta conflictos del mismo cuidador y descarta otros cuidadores o reservas canceladas', () => {
  const conflict = { ...request, id: 2, status: 'confirmed', start_at: '2030-01-07T10:00:00' };
  assert.equal(assessAvailability(request, professional, [request, conflict], now).can_accept, false);
  assert.equal(assessAvailability(request, professional, [{ ...conflict, id_caregiver: 99 }], now).can_accept, true);
  assert.equal(assessAvailability(request, professional, [{ ...conflict, status: 'cancelled' }], now).can_accept, true);
});
test('no permite aceptar una solicitud vencida ni una franja que cruza de fecha', () => {
  assert.equal(assessAvailability(request, professional, [], Date.parse('2030-01-08T00:00:00Z')).can_accept, false);
  assert.equal(assessAvailability({ ...request, end_at: '2030-01-08T10:30:00' }, professional, [], now).can_accept, false);
});

test('los filtros de la interfaz permiten revisar historial, agenda y búsquedas con tildes', async () => {
  const { filterRequests, requestCounts } = await import('../../frontend/src/request-filters.js');
  const rows = [
    { id: 1, status: 'requested', start_at: '2030-01-07T09:00:00', service_name: 'Paseos', pet: { name: 'Cocó' }, owner: { profile: { first_name: 'María' } } },
    { id: 2, status: 'confirmed', start_at: '2030-01-08T12:00:00', service_name: 'Guardería', pet: { name: 'Milo' } },
    { id: 3, status: 'completed', start_at: '2029-12-01T10:00:00', service_name: 'Paseos', pet: { name: 'Cocó' } },
  ];
  assert.deepEqual(filterRequests(rows, { query: 'coco' }).map((row) => row.id), [1, 3]);
  assert.deepEqual(filterRequests(rows, { query: 'maria' }).map((row) => row.id), [1]);
  assert.deepEqual(filterRequests(rows, { mode: 'agenda' }).map((row) => row.id), [2]);
  assert.deepEqual(filterRequests(rows, { mode: 'history', status: 'completed' }).map((row) => row.id), [3]);
  assert.deepEqual(filterRequests(rows, { from: '2030-01-07', to: '2030-01-07' }).map((row) => row.id), [1]);
  assert.equal(requestCounts(rows).confirmed, 1);
  assert.equal(requestCounts(rows).completed, 1);
  const updated = { ...rows[2], owner_unread: true, completed_at: '2030-01-09T12:00:00Z' };
  assert.equal(filterRequests([rows[0], rows[1], updated], { prioritizeUpdates: true })[0].id, 3);
});
