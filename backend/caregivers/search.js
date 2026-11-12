const options = require('../../shared/caregiver-options.json');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseSearch(query) {
  const filters = {};
  const errors = {};
  const present = (key) => query[key] !== undefined && query[key] !== '';
  const number = (key, min, max) => {
    if (!present(key)) return;
    const raw = query[key];
    if (typeof raw !== 'string' || !raw.trim() || !Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) {
      errors[key] = `Indica un valor entre ${min} y ${max}.`;
    } else filters[key] = Number(raw);
  };
  number('latitude', -90, 90);
  number('longitude', -180, 180);
  number('radius_km', 0.1, 200);
  number('min_price', 0, 100000000);
  number('max_price', 0, 100000000);
  number('min_rating', 0, 5);
  number('min_reviews', 0, 10000);
  if (filters.min_reviews !== undefined && !Number.isInteger(filters.min_reviews)) errors.min_reviews = 'Indica una cantidad entera de opiniones, entre 0 y 10000.';
  if (present('latitude') !== present('longitude') || (present('radius_km') && !present('latitude'))) {
    errors.location = 'Selecciona una ubicación válida para buscar por distancia.';
  }
  if (filters.latitude !== undefined && filters.longitude !== undefined) filters.radius_km ??= 10;
  if (filters.min_price !== undefined && filters.max_price !== undefined && filters.min_price > filters.max_price) {
    errors.max_price = 'El precio máximo debe ser igual o mayor al mínimo.';
  }
  for (const [key, values] of [['service', options.services], ['species', options.species], ['specialty', options.specialties], ['rate_unit', options.rateUnits]]) {
    if (!present(key)) continue;
    if (!values.includes(query[key])) errors[key] = 'Selecciona una opción válida.';
    else filters[key] = query[key];
  }
  const availabilityKeys = ['date', 'start_time', 'end_time'];
  if (availabilityKeys.some(present)) {
    if (!availabilityKeys.every(present)) errors.availability = 'Indica fecha, hora inicial y hora final para filtrar disponibilidad.';
    else {
      const { date, start_time: start, end_time: end } = query;
      const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
      if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        errors.availability = 'Selecciona una fecha válida.';
      } else if (typeof start !== 'string' || typeof end !== 'string' || !TIME.test(start) || !TIME.test(end) || start >= end) {
        errors.availability = 'La hora final debe ser posterior a la inicial, dentro del mismo día.';
      } else Object.assign(filters, { date, start_time: start, end_time: end, day: parsed.getUTCDay() });
    }
  }
  filters.sort = query.sort || 'distance';
  if (!['distance', 'price', 'rating'].includes(filters.sort)) errors.sort = 'Selecciona un orden válido.';
  return { filters, errors };
}

function validCoordinates(latitude, longitude) {
  return latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined &&
    Number.isFinite(Number(latitude)) && Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number.isFinite(Number(longitude)) && Number(longitude) >= -180 && Number(longitude) <= 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (value) => Number(value) * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

function matchingServices(services = [], filters) {
  return services.filter((service) => (!filters.service || service.name === filters.service) &&
    (!filters.rate_unit || service.unit === filters.rate_unit) &&
    (filters.min_price === undefined || Number(service.rate) >= filters.min_price) &&
    (filters.max_price === undefined || Number(service.rate) <= filters.max_price));
}

function inBogota(value) {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}-05:00`).getTime();
}

function availableDuring(availability = [], bookings = [], filters) {
  if (!filters.date) return true;
  const slots = availability.filter((slot) => slot.day === filters.day).sort((a, b) => a.start.localeCompare(b.start));
  let coveredUntil = filters.start_time;
  for (const slot of slots) {
    if (slot.start <= coveredUntil && slot.end > coveredUntil) coveredUntil = slot.end;
  }
  if (coveredUntil < filters.end_time) return false;
  const start = inBogota(`${filters.date}T${filters.start_time}:00`);
  const end = inBogota(`${filters.date}T${filters.end_time}:00`);
  return !bookings.some((booking) => ['requested', 'confirmed'].includes(booking.status) &&
    start < inBogota(booking.end_at) && inBogota(booking.start_at) < end);
}

function ratingFromBookings(bookings = []) {
  const ratings = bookings.filter((booking) => booking.status === 'completed').flatMap((booking) => {
    const reviews = Array.isArray(booking.reviews) ? booking.reviews : booking.reviews ? [booking.reviews] : [];
    return reviews.map((review) => Number(review.rating)).filter((rating) => rating >= 1 && rating <= 5);
  });
  return { rating: ratings.length ? Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length * 10) / 10 : null, review_count: ratings.length };
}

function filterCaregivers(caregivers, filters) {
  const results = [];
  for (const caregiver of caregivers) {
    if (caregiver.status !== 'published' || caregiver.active === false) continue;
    if (filters.species && !caregiver.species?.includes(filters.species)) continue;
    if (filters.specialty && !caregiver.specialties?.includes(filters.specialty)) continue;
    if (filters.min_rating > 0 && (caregiver.rating === null || !Number.isFinite(caregiver.rating) || !caregiver.review_count || caregiver.rating < filters.min_rating)) continue;
    if (filters.min_reviews > 0 && (caregiver.review_count || 0) < filters.min_reviews) continue;
    const services = matchingServices(caregiver.services, filters);
    if (!services.length) continue;
    if (!availableDuring(caregiver.availability, caregiver.busy_bookings, filters)) continue;
    let distance = null;
    if (filters.latitude !== undefined) {
      if (!validCoordinates(caregiver.latitude, caregiver.longitude)) continue;
      distance = distanceKm(filters.latitude, filters.longitude, caregiver.latitude, caregiver.longitude);
      if (distance > filters.radius_km) continue;
    }
    const { busy_bookings: _busy, legacy_id: _legacy, ...publicProfile } = caregiver;
    results.push({ ...publicProfile, distance_km: distance === null ? null : Math.round(distance * 10) / 10, matching_services: services });
  }
  const price = (caregiver) => Math.min(...caregiver.matching_services.map((service) => Number(service.rate)));
  return results.sort((a, b) => {
    if (filters.sort === 'price') return price(a) - price(b);
    if (filters.sort === 'rating') return (b.rating ?? -1) - (a.rating ?? -1);
    return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  });
}

module.exports = { parseSearch, validCoordinates, distanceKm, matchingServices, availableDuring, ratingFromBookings, filterCaregivers };
