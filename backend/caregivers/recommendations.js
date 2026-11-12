const options = require('../../shared/caregiver-options.json');
const preferences = require('../../shared/recommendation-options.json');
const { parseSearch, validCoordinates, distanceKm, matchingServices, availableDuring } = require('./search');

function parseRecommendations(query) {
  const { filters, errors } = parseSearch({ ...query, sort: 'distance' });
  filters.priority = query.priority === undefined || query.priority === '' ? 'balanced' : query.priority;
  if (!preferences.priorities.some(({ value }) => value === filters.priority)) errors.priority = 'Selecciona una prioridad válida.';
  if (filters.priority === 'distance' && (filters.latitude === undefined || filters.longitude === undefined)) errors.priority = 'Añade tu ubicación para priorizar la cercanía.';
  if (filters.priority === 'price' && !filters.rate_unit) errors.priority = 'Elige una unidad de tarifa para comparar precios.';
  filters.only_available = query.only_available === 'true';
  if (query.only_available !== undefined && !['', 'true', 'false'].includes(query.only_available)) errors.only_available = 'Selecciona una opción de disponibilidad válida.';
  if (filters.only_available && !filters.date) errors.only_available = 'Indica una fecha y un horario completos para mostrar solo disponibles.';
  const needs = query.needs === undefined || query.needs === '' ? [] :
    typeof query.needs === 'string' ? query.needs.split(',') : null;
  if (!needs || needs.some((need) => !options.specialties.includes(need))) errors.needs = 'Selecciona necesidades válidas para tu mascota.';
  filters.needs = [...new Set([...(needs || []), ...(filters.specialty ? [filters.specialty] : [])])];
  if (query.pet_id !== undefined && query.pet_id !== '') {
    if (typeof query.pet_id !== 'string' || !/^[1-9]\d{0,18}$/.test(query.pet_id) || BigInt(query.pet_id) > 9223372036854775807n) {
      errors.pet_id = 'Selecciona una mascota registrada en tu cuenta.';
    } else filters.pet_id = query.pet_id;
  }
  return { filters, errors };
}

// La especie se confirma en la búsqueda: las mascotas existentes no tienen ese campo.
// No se deducen condiciones médicas ni especies a partir de la raza o de notas libres.
function ageNeeds(pet, species, now = Date.now()) {
  if (!pet?.birth_date || !['Perros', 'Gatos'].includes(species)) return [];
  const born = new Date(`${pet.birth_date}T12:00:00-05:00`).getTime();
  const age = (now - born) / (365.25 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(age) || age < 0) return [];
  if (age < 1) return ['Cachorros'];
  if (age >= (species === 'Gatos' ? 10 : 7)) return ['Mascotas mayores'];
  return [];
}

function recommendCaregivers(profiles, filters, pet = null, now = Date.now()) {
  const priority = filters.priority || 'balanced';
  const weights = {
    balanced: { distance: 20, rating: 5, price: 10 },
    distance: { distance: 45, rating: 5, price: 10 },
    rating: { distance: 10, rating: 35, price: 10 },
    price: { distance: 10, rating: 5, price: 35 },
  }[priority];
  const inferredNeeds = ageNeeds(pet, filters.species, now);
  const needs = [...new Set([...(filters.needs || []), ...inferredNeeds])];
  const personalized = Boolean(filters.species || filters.service || filters.latitude !== undefined || filters.date || needs.length ||
    filters.min_price !== undefined || filters.max_price !== undefined || filters.rate_unit || filters.min_rating > 0 || filters.min_reviews > 0 || priority !== 'balanced');
  const recommendations = [];
  const alternatives = [];
  const prices = new Map();
  for (const profile of profiles) {
    if (profile.status !== 'published' || profile.active === false) continue;
    // No se sugieren cuidadores de otra especie o que no ofrecen el servicio solicitado.
    if (filters.species && !profile.species?.includes(filters.species)) continue;
    const offers = matchingServices(profile.services, { service: filters.service });
    if (!offers.length) continue;
    const reasons = [];
    const warnings = [];
    let score = 0;
    if (filters.species) { score += 30; reasons.push(`Atiende ${filters.species.toLowerCase()}`); }
    if (filters.service) { score += 25; reasons.push(`Ofrece ${filters.service.toLowerCase()}`); }
    for (const need of needs) {
      if (profile.specialties?.includes(need)) { score += 25; reasons.push(`Especialidad: ${need.toLowerCase()}`); }
      else warnings.push(`No declara especialidad en ${need.toLowerCase()}`);
    }
    let distance = null;
    if (filters.latitude !== undefined) {
      if (validCoordinates(profile.latitude, profile.longitude)) {
        distance = distanceKm(filters.latitude, filters.longitude, profile.latitude, profile.longitude);
        if (distance <= filters.radius_km) {
          score += weights.distance * (1 - distance / filters.radius_km);
          reasons.push('Dentro de tu zona de búsqueda');
        } else warnings.push('Fuera de la distancia seleccionada');
      } else warnings.push('Ubicación sin confirmar');
    }
    let availability = 'not_checked';
    if (filters.date) {
      if (availableDuring(profile.availability, profile.busy_bookings, filters)) {
        availability = 'available';
        score += 30; reasons.push('Disponible en el horario solicitado');
      } else {
        if (filters.only_available) continue;
        availability = 'unavailable'; warnings.push('Sin disponibilidad en ese horario');
      }
    }
    const matching = matchingServices(offers, filters);
    if (!matching.length) warnings.push('La tarifa no coincide con tu presupuesto o unidad');
    else if (filters.min_price !== undefined || filters.max_price !== undefined) { score += 10; reasons.push('Tarifa dentro de tu presupuesto'); }
    // Las reseñas son complementarias: nunca convierten una incompatibilidad en recomendación.
    const hasReviews = profile.rating !== null && Number.isFinite(profile.rating) && profile.review_count > 0;
    if (filters.min_rating > 0 && (!hasReviews || profile.rating < filters.min_rating)) warnings.push(`No alcanza la calificación mínima de ${filters.min_rating}`);
    if (filters.min_reviews > 0 && (profile.review_count || 0) < filters.min_reviews) warnings.push(`Tiene menos de ${filters.min_reviews} opiniones`);
    if (hasReviews) {
      // Suaviza muestras pequeñas solo para ordenar; nunca altera el promedio publicado.
      const quality = (Math.max(1, Math.min(5, profile.rating)) * profile.review_count + 3.5 * 5) / (profile.review_count + 5);
      score += weights.rating * quality / 5;
      if (profile.rating >= 4) reasons.push('Bien valorado por otros dueños');
    }
    const { busy_bookings: _busy, legacy_id: _legacy, ...publicProfile } = profile;
    const result = { ...publicProfile, distance_km: distance === null ? null : Math.round(distance * 10) / 10,
      matching_services: matching.length ? matching : offers,
      recommendation: { score, reasons, warnings, availability } };
    if (filters.rate_unit && matching.length) prices.set(result, Math.min(...matching.map((service) => Number(service.rate))));
    (warnings.length ? alternatives : recommendations).push(result);
  }
  // Solo compara precios del servicio y la unidad elegidos, sin mezclar horas, días o visitas.
  const comparable = (recommendations.length ? recommendations : alternatives).filter((result) => prices.has(result));
  const lowest = comparable.length ? Math.min(...comparable.map((result) => prices.get(result))) : 0;
  const highest = comparable.length ? Math.max(...comparable.map((result) => prices.get(result))) : 0;
  for (const result of [...recommendations, ...alternatives]) {
    if (prices.has(result)) {
      const affinity = highest === lowest ? 1 : Math.max(0, Math.min(1, (highest - prices.get(result)) / (highest - lowest)));
      result.recommendation.score += weights.price * affinity;
      if (priority === 'price') result.recommendation.reasons.push(`Tarifa comparable por ${filters.rate_unit}`);
    }
    result.recommendation.score = Math.round(result.recommendation.score * 100) / 100;
  }
  const rank = (a, b) => b.recommendation.score - a.recommendation.score ||
    (b.review_count || 0) - (a.review_count || 0) || String(a.id).localeCompare(String(b.id));
  recommendations.sort(rank);
  alternatives.sort((a, b) => a.recommendation.warnings.length - b.recommendation.warnings.length || rank(a, b));
  return { recommendations, alternatives, insufficient_matches: personalized && recommendations.length < 3,
    context: { personalized, needs, inferred_needs: inferredNeeds, location_used: filters.latitude !== undefined,
      availability_checked: Boolean(filters.date), only_available: Boolean(filters.only_available), priority,
      min_rating: filters.min_rating || null, min_reviews: filters.min_reviews || null, price_comparable: Boolean(filters.rate_unit),
      pet: pet ? { id: String(pet.id), name: pet.name, size: pet.size } : null } };
}

module.exports = { parseRecommendations, ageNeeds, recommendCaregivers };
