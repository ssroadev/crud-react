const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePet } = require('./validation');

const pet = { name: ' Luna ', size: 'mediano' };
test('mascotas: normaliza datos, admite catálogo y conserva razas antiguas', () => {
  let result = validatePet({ ...pet, breed_id: 'dog-beagle', breed: 'Nombre enviado por el cliente', id_owner: 999 });
  assert.deepEqual(result.errors, {});
  assert.equal(result.data.name, 'Luna');
  assert.equal(result.breedId, 'dog-beagle');
  assert.equal('id_owner' in result.data, false);
  result = validatePet({ ...pet, breed: ' Labrador ' });
  assert.equal(result.data.breed, 'Labrador');
  result = validatePet({ ...pet, breed_id: null, breed_other: ' Otra raza ' });
  assert.equal(result.data.breed, 'Otra raza');
  assert.deepEqual(result.errors, {});
});

test('mascotas: Otra requiere texto y no puede combinarse con una raza del catálogo', () => {
  for (const extra of [{ breed_id: 'dog-beagle', breed_other: 'Otra' }, { breed_other: '' }, { breed_other: '   ' },
    { breed_id: '__other__' }, { breed_id: 1 }, { breed_other: {} }, { breed: [] }, { breed: 'x'.repeat(101) }]) {
    assert.ok(validatePet({ ...pet, ...extra }).errors.breed, JSON.stringify(extra));
  }
  assert.equal(validatePet({ ...pet, breed_id: null, breed_other: null }).data.breed, null);
});

test('mascotas: valida obligatorios, fecha real no futura y longitud de notas', () => {
  for (const input of [null, [], {}, { name: ' ', size: 'mediano' }, { ...pet, size: 'enorme' },
    { ...pet, birth_date: '2026-02-30' }, { ...pet, birth_date: '9999-01-01' }, { ...pet, birth_date: 12 },
    { ...pet, notes: 'x'.repeat(2001) }, { ...pet, notes: {} }]) assert.ok(Object.keys(validatePet(input).errors).length);
  assert.deepEqual(validatePet({ ...pet, birth_date: '2020-02-29', notes: ' Hola ' }).errors, {});
  assert.equal(validatePet({ ...pet, notes: ' Hola ' }).data.notes, 'Hola');
});

test('mascotas: actualizaciones parciales conservan campos omitidos y permiten quitar la raza', () => {
  assert.deepEqual(validatePet({ notes: 'Nueva nota' }, true).data, { notes: 'Nueva nota' });
  assert.deepEqual(validatePet({ breed_id: null, breed_other: null }, true).data, { breed: null });
  assert.ok(validatePet({}, true).errors.form);
});
