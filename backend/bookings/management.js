const { availableDuring } = require('../caregivers/search');

function bookingTimestamp(value) {
  if (typeof value !== 'string') return NaN;
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}-05:00`).getTime();
}

function assessAvailability(booking, profile, bookings, now = Date.now()) {
  if (booking.status !== 'requested') return null;
  const unavailable = (reason) => ({ can_accept: false, reason });
  if (!profile || !booking.caregiver_profile_id) return unavailable('Esta solicitud no está vinculada a un perfil profesional vigente.');
  if (booking.caregiver?.active === false || profile.status !== 'published') return unavailable('Tu perfil debe estar publicado y activo para aceptar.');
  const starts = bookingTimestamp(booking.start_at), ends = bookingTimestamp(booking.end_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts || booking.start_at.slice(0, 10) !== booking.end_at.slice(0, 10)) return unavailable('Esta solicitud no tiene una franja válida dentro del mismo día.');
  if (starts <= now) return unavailable('El horario de esta solicitud ya pasó. Puedes rechazarla para cerrar la solicitud.');
  if (!profile.services?.some((offer) => offer.name === booking.service_name && offer.unit === booking.rate_unit)) return unavailable('El servicio o su unidad ya no está disponible en tu perfil.');
  const date = booking.start_at.slice(0, 10);
  const filters = { date, start_time: booking.start_at.slice(11, 16), end_time: booking.end_at.slice(11, 16), day: new Date(`${date}T00:00:00Z`).getUTCDay() };
  if (!availableDuring(profile.availability, [], filters)) return unavailable('Este horario no coincide con tu disponibilidad registrada.');
  const otherBookings = bookings.filter((other) => String(other.id) !== String(booking.id) && String(other.id_caregiver) === String(booking.id_caregiver));
  if (!availableDuring(profile.availability, otherBookings, filters)) return unavailable('Otra solicitud o reserva se cruza con este horario.');
  return { can_accept: true, reason: 'El horario coincide con tu disponibilidad actual.' };
}

module.exports = { assessAvailability, bookingTimestamp };
