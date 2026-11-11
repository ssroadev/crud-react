const options = require('../../shared/caregiver-options.json');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateCaregiver(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: { form: 'Envía un perfil válido.' } };
  }
  const data = { status: input.status ?? 'draft' };
  if (!['draft', 'published'].includes(data.status)) errors.status = 'Estado inválido.';
  const publishing = data.status === 'published';

  for (const [key, limit, label] of [
    ['bio', 3000, 'descripción personal'],
    ['experience', 3000, 'experiencia previa'],
    ['zone', 200, 'zona de cobertura'],
  ]) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) {
      errors[key] = `La ${label} debe ser texto de hasta ${limit} caracteres.`;
    }
    data[key] = typeof value === 'string' ? value.trim() : '';
    if (publishing && !data[key]) errors[key] = `Completa la ${label}.`;
  }

  data.years_experience = input.years_experience === undefined ? 0 : input.years_experience;
  if (!Number.isInteger(data.years_experience) || data.years_experience < 0 || data.years_experience > 100) {
    errors.years_experience = 'Indica entre 0 y 100 años completos de experiencia.';
  }

  const hasLatitude = input.latitude !== undefined && input.latitude !== null;
  const hasLongitude = input.longitude !== undefined && input.longitude !== null;
  data.latitude = input.latitude ?? null;
  data.longitude = input.longitude ?? null;
  data.location_name = typeof input.location_name === 'string' ? input.location_name.trim() : '';
  if (hasLatitude !== hasLongitude || (hasLatitude && (
    typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || data.latitude < -90 || data.latitude > 90 ||
    typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || data.longitude < -180 || data.longitude > 180
  ))) errors.location = 'Indica latitud y longitud válidas para tu ubicación.';
  if (data.location_name.length > 300 || (input.location_name !== undefined && typeof input.location_name !== 'string')) {
    errors.location = 'El nombre de la ubicación debe tener hasta 300 caracteres.';
  }

  for (const key of ['species', 'specialties']) {
    const values = input[key] ?? [];
    if (!Array.isArray(values) || values.some((value) => !options[key].includes(value))) {
      errors[key] = 'Selecciona opciones válidas.';
      data[key] = [];
    } else data[key] = [...new Set(values)];
  }
  if (publishing && !data.species.length) errors.species = 'Selecciona al menos una especie.';

  data.services = [];
  if (!Array.isArray(input.services ?? []) || (input.services?.length ?? 0) > options.services.length) {
    errors.services = 'Selecciona servicios válidos.';
  } else {
    const names = new Set();
    for (const item of input.services ?? []) {
      if (!item || !options.services.includes(item.name) || names.has(item.name) ||
          typeof item.rate !== 'number' || !Number.isFinite(item.rate) || item.rate < 0.01 || item.rate > 100000000 ||
          !options.rateUnits.includes(item.unit)) {
        errors.services = 'Cada servicio debe ser único y tener una tarifa mayor que cero y una unidad válida.';
        continue;
      }
      names.add(item.name);
      data.services.push({ name: item.name, rate: Math.round(item.rate * 100) / 100, unit: item.unit });
    }
  }
  if (publishing && !data.services.length && !errors.services) errors.services = 'Agrega al menos un servicio con su tarifa.';

  data.availability = [];
  if (!Array.isArray(input.availability ?? []) || (input.availability?.length ?? 0) > 50) {
    errors.availability = 'Puedes registrar hasta 50 franjas horarias.';
  } else {
    for (const slot of input.availability ?? []) {
      if (!slot || !Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6 ||
          typeof slot.start !== 'string' || typeof slot.end !== 'string' ||
          !TIME.test(slot.start) || !TIME.test(slot.end) || slot.start >= slot.end) {
        errors.availability = 'Cada horario necesita un día válido y una hora final posterior a la inicial.';
        continue;
      }
      if (data.availability.some((other) => other.day === slot.day && slot.start < other.end && other.start < slot.end)) {
        errors.availability = 'Los horarios de un mismo día no pueden superponerse.';
      }
      data.availability.push({ day: slot.day, start: slot.start, end: slot.end });
    }
    data.availability.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  }
  if (publishing && !data.availability.length && !errors.availability) errors.availability = 'Agrega al menos un horario disponible.';

  data.photos = [];
  if (!Array.isArray(input.photos ?? []) || (input.photos?.length ?? 0) > 6) {
    errors.photos = 'Puedes agregar hasta 6 fotografías.';
  } else {
    for (const photo of input.photos ?? []) {
      try {
        if (typeof photo !== 'string' || photo.length > 2048) throw new Error();
        const url = new URL(photo);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error();
        data.photos.push(url.href);
      } catch {
        errors.photos = 'Las fotografías deben tener una URL HTTP o HTTPS válida.';
      }
    }
    data.photos = [...new Set(data.photos)];
  }
  return { data, errors };
}

module.exports = { validateCaregiver };
