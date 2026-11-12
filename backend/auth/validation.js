const rules = require('../../shared/account-validation.json');

function validateAccount(input, mode = 'register') {
  const errors = {};
  const data = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { data, errors: { form: 'Completa los datos del formulario.' } };
  if (mode !== 'profile') {
    data.email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!data.email || data.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Ingresa un correo electrónico válido.';
    data.password = typeof input.password === 'string' ? input.password : '';
    const minimum = mode === 'login' ? 1 : rules.passwordMinLength;
    if (data.password.length < minimum || data.password.length > rules.passwordMaxLength) {
      errors.password = mode === 'login' ? 'Ingresa tu contraseña.' : `Usa entre ${rules.passwordMinLength} y ${rules.passwordMaxLength} caracteres.`;
    }
    if (mode === 'register' && data.password !== input.confirm_password) errors.confirm_password = 'Las contraseñas no coinciden.';
  }
  if (mode !== 'login') {
    for (const [key, label] of [['first_name', 'nombre'], ['last_name', 'apellido']]) {
      data[key] = typeof input[key] === 'string' ? input[key].trim().replace(/\s+/g, ' ') : '';
      if (!data[key] || data[key].length > rules.nameMaxLength || /[\u0000-\u001f<>]/.test(data[key])) errors[key] = `Ingresa tu ${label}, de hasta ${rules.nameMaxLength} caracteres.`;
    }
    data.phone = typeof input.phone === 'string' ? input.phone.trim() : '';
    if (data.phone && (!/^[+\d\s().-]{7,25}$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 7)) errors.phone = 'Ingresa un teléfono válido de al menos 7 dígitos.';
    if (input.phone !== undefined && typeof input.phone !== 'string') errors.phone = 'Ingresa un teléfono válido.';
    if (mode === 'profile') {
      data.bio = typeof input.bio === 'string' ? input.bio.trim() : '';
      if (data.bio.length > 1000 || (input.bio !== undefined && typeof input.bio !== 'string')) errors.bio = 'Tu presentación debe ser texto de hasta 1000 caracteres.';
    } else {
      data.role = input.role ?? 'owner';
      if (!rules.roles.includes(data.role)) errors.role = 'Selecciona dueño o cuidador.';
    }
  }
  return { data, errors };
}

function validateRecoveryEmail(input) {
  const value = input && typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const errors = !value || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? { email: 'Ingresa un correo electrónico válido.' }
    : {};
  return { email: value, errors };
}

function validateRecoveryPassword(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { password: '', errors: { form: 'Completa los campos de contraseña.' } };
  }
  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < rules.passwordMinLength || password.length > rules.passwordMaxLength
    || !/\p{Ll}/u.test(password) || !/\p{Lu}/u.test(password) || !/\p{N}/u.test(password) || !/[^\p{L}\p{N}]/u.test(password)) {
    errors.password = 'La contraseña debe tener entre 8 y 128 caracteres e incluir minúscula, mayúscula, número y carácter especial.';
  }
  if (password !== input.confirm_password) errors.confirm_password = 'Las contraseñas no coinciden.';
  return { password, errors };
}

module.exports = { validateAccount, validateRecoveryEmail, validateRecoveryPassword };
