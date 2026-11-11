const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCaregiver } = require('./validation');

const valid = () => ({
  status: 'published', bio: ' Cuido con cariño. ', experience: 'He cuidado perros y gatos.',
  years_experience: 2, zone: 'Bogotá, Chapinero', species: ['Perros'], specialties: ['Cachorros'],
  services: [{ name: 'Paseos', rate: 15000, unit: 'paseo' }],
  availability: [{ day: 1, start: '08:00', end: '12:00' }], photos: ['https://example.com/photo.jpg'],
});

test('publica un perfil completo, normaliza texto y descarta campos externos', () => {
  const { data, errors } = validateCaregiver({ ...valid(), id: 'injected', profile_id: 'someone-else' });
  assert.deepEqual(errors, {});
  assert.equal(data.bio, 'Cuido con cariño.');
  assert.equal(data.id, undefined);
  assert.equal(data.profile_id, undefined);
});

test('permite borradores incompletos pero no publicarlos', () => {
  assert.deepEqual(validateCaregiver({}).errors, {});
  const { errors } = validateCaregiver({ status: 'published', bio: '   ', experience: '', zone: '' });
  for (const field of ['bio', 'experience', 'zone', 'species', 'services', 'availability']) assert.ok(errors[field], field);
});

test('rechaza cuerpos y estados inválidos', () => {
  for (const value of [null, [], 'texto']) assert.ok(validateCaregiver(value).errors.form);
  assert.ok(validateCaregiver({ status: 'hidden' }).errors.status);
});

test('rechaza experiencia, especies y especialidades inválidas incluso en borradores', () => {
  for (const years_experience of [-1, 1.5, 101, '2', null]) assert.ok(validateCaregiver({ years_experience }).errors.years_experience);
  assert.ok(validateCaregiver({ species: ['Dragones'] }).errors.species);
  assert.ok(validateCaregiver({ specialties: 'Cachorros' }).errors.specialties);
  assert.ok(validateCaregiver({ zone: 'x'.repeat(201) }).errors.zone);
});

test('rechaza tarifas negativas, vacías, no finitas o menores a un centavo', () => {
  for (const rate of [-1, 0, 0.001, '', null, NaN, Infinity, 100000001]) {
    assert.ok(validateCaregiver({ services: [{ name: 'Paseos', rate, unit: 'hora' }] }).errors.services, String(rate));
  }
  assert.ok(validateCaregiver({ services: [{ name: 'Paseos', rate: 100, unit: 'mes' }] }).errors.services);
  assert.ok(validateCaregiver({ ...valid(), services: [valid().services[0], valid().services[0]] }).errors.services);
});

test('valida día, formato y orden de los horarios', () => {
  for (const slot of [
    { day: 7, start: '08:00', end: '10:00' },
    { day: 1.5, start: '08:00', end: '10:00' },
    { day: 1, start: '8:00', end: '10:00' },
    { day: 1, start: '08:60', end: '10:00' },
    { day: 1, start: '08:00', end: '24:00' },
    { day: 1, start: '10:00', end: '10:00' },
    { day: 1, start: '22:00', end: '08:00' },
  ]) assert.ok(validateCaregiver({ availability: [slot] }).errors.availability);
});

test('rechaza horarios superpuestos pero admite franjas consecutivas o en días distintos', () => {
  const slot = { day: 1, start: '08:00', end: '12:00' };
  assert.ok(validateCaregiver({ availability: [slot, { day: 1, start: '11:00', end: '13:00' }] }).errors.availability);
  assert.deepEqual(validateCaregiver({ availability: [slot, { day: 1, start: '12:00', end: '13:00' }, { ...slot, day: 2 }] }).errors, {});
});

test('valida fotografías y límites de colecciones', () => {
  for (const photo of ['javascript:alert(1)', 'data:image/png;base64,abc', 'no-url', 'https://user:secret@example.com/a']) {
    assert.ok(validateCaregiver({ photos: [photo] }).errors.photos);
  }
  assert.ok(validateCaregiver({ photos: Array(7).fill('https://example.com/a') }).errors.photos);
  assert.ok(validateCaregiver({ availability: Array(51).fill({ day: 1, start: '08:00', end: '12:00' }) }).errors.availability);
});

test('valida las coordenadas por pares y acepta un punto en el ecuador', () => {
  for (const coordinates of [{ latitude: 4 }, { longitude: -74 }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: -181 }, { latitude: '4', longitude: '-74' }, { latitude: NaN, longitude: 0 }]) {
    assert.ok(validateCaregiver(coordinates).errors.location);
  }
  assert.deepEqual(validateCaregiver({ latitude: 0, longitude: 0 }).errors, {});
  assert.deepEqual(validateCaregiver({ latitude: null, longitude: null }).errors, {});
});
