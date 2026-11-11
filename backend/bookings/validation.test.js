const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateBooking, validId } = require('./validation');
const now = Date.parse('2030-01-01T00:00:00Z');
const valid = { caregiver_profile_id: '11111111-1111-4111-8111-111111111111', pet_id: '7', service: 'Paseos', date: '2030-01-07', start_time: '09:00', end_time: '10:30', location: ' Chapinero, Bogotá ', notes: ' Dar agua después del paseo. ' };

test('valida una solicitud y descarta identidad, estado y precio enviados por el cliente', () => {
  const { data, errors } = validateBooking({ ...valid, owner_id: 999, status: 'confirmed', total_amount: 1 }, now);
  assert.deepEqual(errors, {});
  assert.equal(data.p_location, 'Chapinero, Bogotá');
  assert.equal(data.p_notes, 'Dar agua después del paseo.');
  for (const key of ['p_owner_id', 'status', 'total_amount']) assert.equal(data[key], undefined);
});
test('exige cuidador, mascota, servicio, fecha, horario y ubicación', () => {
  const { errors } = validateBooking({}, now);
  for (const key of ['caregiver', 'pet_id', 'service', 'availability', 'location']) assert.ok(errors[key]);
  for (const body of [null, [], 'invalid']) assert.ok(validateBooking(body, now).errors.form);
});
test('rechaza fechas pasadas o inexistentes y franjas vacías o invertidas', () => {
  for (const changes of [{ date: '2029-01-01' }, { date: '2030-02-30' }, { date: '0000-01-01' }, { start_time: '10:30' }, { start_time: '23:00', end_time: '02:00' }, { end_time: '' }]) {
    assert.ok(validateBooking({ ...valid, ...changes }, now).errors.availability);
  }
});
test('valida IDs bigint sin perder precisión, longitudes y tipos', () => {
  assert.equal(validId('9223372036854775807'), true);
  for (const value of ['9223372036854775808', 0, -1, '1 or 1=1', 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(validId(value), false);
  assert.ok(validateBooking({ ...valid, location: 'x'.repeat(251) }, now).errors.location);
  assert.ok(validateBooking({ ...valid, notes: 'x'.repeat(2001) }, now).errors.notes);
  assert.ok(validateBooking({ ...valid, notes: {} }, now).errors.notes);
});
