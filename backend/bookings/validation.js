const { parseSearch } = require('../caregivers/search');
const options = require('../../shared/caregiver-options.json');
const validId = (id) => (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
  (typeof id === 'string' && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= 9223372036854775807n);

function validateBooking(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { form: 'Completa los datos de la solicitud.' } };
  const errors = {};
  if (typeof input.caregiver_profile_id !== 'string' || !/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(input.caregiver_profile_id)) errors.caregiver = 'Selecciona un cuidador válido.';
  if (!validId(input.pet_id)) errors.pet_id = 'Selecciona una mascota registrada en tu cuenta.';
  if (!options.services.includes(input.service)) errors.service = 'Selecciona el tipo de servicio.';
  const { filters, errors: scheduleErrors } = parseSearch({ date: input.date || '', start_time: input.start_time || '', end_time: input.end_time || '' });
  if (!filters.date || scheduleErrors.availability || Number(filters.date?.slice(0, 4)) < 1) errors.availability = scheduleErrors.availability || 'Completa la fecha y las horas de inicio y fin.';
  else if (new Date(`${filters.date}T${filters.start_time}:00-05:00`).getTime() <= now) errors.availability = 'Selecciona una fecha y hora futuras.';
  const location = typeof input.location === 'string' ? input.location.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (!location || location.length > 250) errors.location = 'Indica dónde se prestará el servicio, en hasta 250 caracteres.';
  if ((input.notes !== undefined && typeof input.notes !== 'string') || notes.length > 2000) errors.notes = 'Las observaciones deben tener hasta 2000 caracteres.';
  return { errors, data: {
    p_caregiver_profile_id: input.caregiver_profile_id, p_pet_id: String(input.pet_id), p_service: input.service,
    p_date: filters.date, p_start: filters.start_time, p_end: filters.end_time, p_location: location, p_notes: notes,
  } };
}

module.exports = { validateBooking, validId };
