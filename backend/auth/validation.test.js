const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAccount } = require('./validation');
const registration = { first_name: ' Ana ', last_name: ' Pérez ', email: ' ANA@EXAMPLE.COM ', phone: '+57 300 123 4567', password: 'mascotas123', confirm_password: 'mascotas123', role: 'owner' };

test('valida y normaliza el registro sin modificar la contraseña', () => {
  const { data, errors } = validateAccount(registration);
  assert.deepEqual(errors, {});
  assert.equal(data.email, 'ana@example.com');
  assert.equal(data.first_name, 'Ana');
  assert.equal(data.password, 'mascotas123');
  assert.equal(data.confirm_password, undefined);
});
test('exige nombre, apellido, correo y contraseña con confirmación', () => {
  const { errors } = validateAccount({ first_name: '  ', last_name: '', email: 'no-email', password: '123', confirm_password: '456' });
  for (const key of ['first_name', 'last_name', 'email', 'password', 'confirm_password']) assert.ok(errors[key]);
});
test('rechaza roles privilegiados, teléfonos inválidos y tipos incorrectos', () => {
  for (const body of [null, [], 'invalid']) assert.ok(validateAccount(body).errors.form);
  assert.ok(validateAccount({ ...registration, role: 'admin' }).errors.role);
  assert.ok(validateAccount({ ...registration, phone: 'abcdefghi' }).errors.phone);
  assert.ok(validateAccount({ ...registration, first_name: '<script>' }).errors.first_name);
  assert.ok(validateAccount({ ...registration, password: 'a'.repeat(129) }).errors.password);
  assert.deepEqual(validateAccount({ ...registration, phone: '' }).errors, {});
});
test('el acceso no exige los datos de registro ni revela si existe el correo', () => {
  assert.deepEqual(validateAccount({ email: 'ana@example.com', password: 'a-password' }, 'login').errors, {});
  assert.ok(validateAccount({ email: '', password: '' }, 'login').errors.email);
});
test('el perfil no permite cambiar correo, rol o identidad mediante asignación masiva', () => {
  const { data, errors } = validateAccount({ ...registration, auth_user_id: 'someone-else', id: 99, bio: 'Mi perro se llama Coco.' }, 'profile');
  assert.deepEqual(errors, {});
  assert.equal(data.email, undefined);
  assert.equal(data.role, undefined);
  assert.equal(data.auth_user_id, undefined);
  assert.equal(data.id, undefined);
  assert.ok(validateAccount({ ...registration, bio: 'a'.repeat(1001) }, 'profile').errors.bio);
});
