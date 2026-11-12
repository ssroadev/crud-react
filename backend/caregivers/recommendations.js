const options = require('../../shared/caregiver-options.json');
const { parseSearch, validCoordinates, distanceKm, matchingServices, availableDuring } = require('./search');

function parseRecommendations(query) {
  const { filters, errors } = parseSearch({ ...query, sort: 'distance' });
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
  const inferredNeeds = ageNeeds(pet, filters.species, now);
  const needs = [...new Set([...(filters.needs || []), ...inferredNeeds])];
  const personalized = Boolean(filters.species || filters.service || filters.latitude !== undefined || filters.date || needs.length ||
    filters.min_price !== undefined || filters.max_price !== undefined || filters.rate_unit);
  const recommendations = [];
  const alternatives = [];
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
          score += 20 * (1 - distance / filters.radius_km);
          reasons.push('Dentro de tu zona de búsqueda');
        } else warnings.push('Fuera de la distancia seleccionada');
      } else warnings.push('Ubicación sin confirmar');
    }
    if (filters.date) {
      if (availableDuring(profile.availability, profile.busy_bookings, filters)) {
        score += 30; reasons.push('Disponible en el horario solicitado');
      } else warnings.push('Sin disponibilidad en ese horario');
    }
    const matching = matchingServices(offers, filters);
    if (!matching.length) warnings.push('La tarifa no coincide con tu presupuesto o unidad');
    else if (filters.min_price !== undefined || filters.max_price !== undefined) { score += 10; reasons.push('Tarifa dentro de tu presupuesto'); }
    // Las reseñas son complementarias: nunca convierten una incompatibilidad en recomendación.
    if (profile.rating !== null && Number.isFinite(profile.rating) && profile.review_count > 0) {
      score += Math.max(0, Math.min(5, profile.rating));
      if (profile.rating >= 4) reasons.push('Bien valorado por otros dueños');
    }
    const { busy_bookings: _busy, legacy_id: _legacy, ...publicProfile } = profile;
    const result = { ...publicProfile, distance_km: distance === null ? null : Math.round(distance * 10) / 10,
      matching_services: matching.length ? matching : offers,
      recommendation: { score: Math.round(score * 100) / 100, reasons, warnings } };
    (warnings.length ? alternatives : recommendations).push(result);
  }
  const rank = (a, b) => b.recommendation.score - a.recommendation.score ||
    (b.review_count || 0) - (a.review_count || 0) || String(a.id).localeCompare(String(b.id));
  recommendations.sort(rank);
  alternatives.sort((a, b) => a.recommendation.warnings.length - b.recommendation.warnings.length || rank(a, b));
  return { recommendations, alternatives, insufficient_matches: personalized && recommendations.length < 3,
    context: { personalized, needs, inferred_needs: inferredNeeds, location_used: filters.latitude !== undefined,
      availability_checked: Boolean(filters.date), pet: pet ? { id: String(pet.id), name: pet.name, size: pet.size } : null } };
}

module.exports = { parseRecommendations, ageNeeds, recommendCaregivers };
