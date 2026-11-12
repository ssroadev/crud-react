const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseRecommendations, recommendCaregivers, ageNeeds } = require('./recommendations');

const schedule = { date: '2026-11-16', day: 1, start_time: '09:00', end_time: '11:00' };
const caregiver = (extra = {}) => ({ id: 'ana', status: 'published', active: true, latitude: 4.65, longitude: -74.06,
  species: ['Perros'], specialties: ['Cachorros'], services: [{ name: 'Paseos', rate: 18000, unit: 'paseo' }],
  availability: [{ day: 1, start: '08:00', end: '18:00' }], busy_bookings: [], rating: null, review_count: 0, ...extra });

test('recomendaciones: combina especie, servicio, necesidades, distancia, disponibilidad y tarifa', () => {
  const result = recommendCaregivers([caregiver()], { ...schedule, species: 'Perros', service: 'Paseos', needs: ['Cachorros'],
    latitude: 4.65, longitude: -74.06, radius_km: 10, max_price: 20000, rate_unit: 'paseo' });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].recommendation.reasons.length, 6);
  assert.equal(result.recommendations[0].distance_km, 0);
  assert.equal(result.context.availability_checked, true);
  assert.equal(result.insufficient_matches, true);
  assert.equal('busy_bookings' in result.recommendations[0], false);
});

test('recomendaciones: las reseñas no convierten una incompatibilidad en una recomendación', () => {
  const result = recommendCaregivers([caregiver(), caregiver({ id: 'rated', rating: 5, review_count: 25, specialties: [] })], { needs: ['Cachorros'] });
  assert.deepEqual(result.recommendations.map((item) => item.id), ['ana']);
  assert.equal(result.alternatives[0].id, 'rated');
  assert.ok(result.alternatives[0].recommendation.warnings.some((warning) => warning.includes('especialidad')));
});

test('recomendaciones: la cercanía pesa más que las calificaciones y estas desempatan opciones equivalentes', () => {
  const result = recommendCaregivers([caregiver({ id: 'far', latitude: 4.71, rating: 5, review_count: 10 }), caregiver()],
    { latitude: 4.65, longitude: -74.06, radius_km: 10 });
  assert.equal(result.recommendations[0].id, 'ana');
  assert.equal(recommendCaregivers([caregiver(), caregiver({ id: 'rated', rating: 4.8, review_count: 1 })], {}).recommendations[0].id, 'rated');
  assert.equal(result.recommendations[0].rating, null);
});

test('recomendaciones: excluye especie y servicio incompatibles, borradores e inactivos', () => {
  const result = recommendCaregivers([caregiver(), caregiver({ id: 'cat', species: ['Gatos'] }),
    caregiver({ id: 'daycare', services: [{ name: 'Guardería', rate: 30000, unit: 'día' }] }),
    caregiver({ id: 'draft', status: 'draft' }), caregiver({ id: 'inactive', active: false })], { species: 'Perros', service: 'Paseos' });
  assert.deepEqual(result.recommendations.map((item) => item.id), ['ana']);
  assert.deepEqual(result.alternatives, []);
});

test('recomendaciones: las reservas pendientes y confirmadas van a alternativas, las franjas contiguas se permiten', () => {
  for (const status of ['requested', 'confirmed']) {
    const result = recommendCaregivers([caregiver({ busy_bookings: [{ status, start_at: '2026-11-16T10:00:00', end_at: '2026-11-16T12:00:00' }] })], schedule);
    assert.equal(result.recommendations.length, 0);
    assert.ok(result.alternatives[0].recommendation.warnings.includes('Sin disponibilidad en ese horario'));
    assert.ok(!result.alternatives[0].recommendation.reasons.includes('Disponible en el horario solicitado'));
  }
  assert.equal(recommendCaregivers([caregiver({ busy_bookings: [{ status: 'confirmed', start_at: '2026-11-16T07:00:00', end_at: '2026-11-16T09:00:00' }] })], schedule).recommendations.length, 1);
});

test('recomendaciones: no supone disponibilidad sin fecha ni cercanía sin coordenadas', () => {
  const result = recommendCaregivers([caregiver({ latitude: null, longitude: null })], {});
  assert.equal(result.context.personalized, false);
  assert.equal(result.context.availability_checked, false);
  assert.deepEqual(result.recommendations[0].recommendation.reasons, []);
  assert.equal(result.recommendations[0].distance_km, null);
  assert.equal(result.insufficient_matches, false);
});

test('recomendaciones: permite ampliar la distancia sin alterar especie, servicio o necesidades', () => {
  const filters = { species: 'Perros', service: 'Paseos', needs: ['Cachorros'], latitude: 4.65, longitude: -74.06, radius_km: 1 };
  const profiles = [caregiver({ latitude: 4.67 }), caregiver({ id: 'missing-location', latitude: null, longitude: null })];
  assert.equal(recommendCaregivers(profiles, filters).recommendations.length, 0);
  const expanded = recommendCaregivers(profiles, { ...filters, radius_km: 5 });
  assert.equal(expanded.recommendations.length, 1);
  assert.equal(expanded.alternatives.length, 1);
  assert.deepEqual(filters.needs, ['Cachorros']);
});

test('recomendaciones: el presupuesto se comprueba en el mismo servicio y unidad', () => {
  const result = recommendCaregivers([caregiver({ services: [{ name: 'Paseos', rate: 30000, unit: 'paseo' }, { name: 'Guardería', rate: 10000, unit: 'hora' }] })],
    { service: 'Paseos', max_price: 15000, rate_unit: 'paseo' });
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.alternatives[0].matching_services[0].name, 'Paseos');
});

test('recomendaciones: usa edad registrada sin deducir enfermedades de las notas ni la especie de la raza', () => {
  const now = new Date('2026-11-12T12:00:00-05:00').getTime();
  assert.deepEqual(ageNeeds({ birth_date: '2026-08-01' }, 'Perros', now), ['Cachorros']);
  assert.deepEqual(ageNeeds({ birth_date: '2015-01-01' }, 'Gatos', now), ['Mascotas mayores']);
  assert.deepEqual(ageNeeds({ birth_date: '2018-01-01' }, 'Gatos', now), []);
  for (const birth_date of [null, 'invalid', '2029-01-01']) assert.deepEqual(ageNeeds({ birth_date }, 'Perros', now), []);
  const pet = { id: '5', name: 'Luna', birth_date: '2026-08-01', notes: 'ansiedad', breed: 'Labrador', size: 'pequeno' };
  assert.deepEqual(ageNeeds(pet, '', now), []);
  const result = recommendCaregivers([caregiver()], { species: 'Perros', needs: ['Cachorros'] }, pet, now);
  assert.deepEqual(result.context.needs, ['Cachorros']);
  assert.equal('notes' in result.context.pet, false);
});

test('recomendaciones: valida necesidades múltiples, IDs bigint y filtros de búsqueda', () => {
  assert.deepEqual(parseRecommendations({ needs: 'Cachorros,Cachorros,Primeros auxilios', pet_id: '9223372036854775807' }).errors, {});
  assert.deepEqual(parseRecommendations({ needs: 'Cachorros,Cachorros' }).filters.needs, ['Cachorros']);
  for (const query of [{ needs: ['Cachorros'] }, { needs: 'Inexistente' }, { pet_id: '1 OR 1=1' }, { pet_id: '9223372036854775808' },
    { pet_id: ['1', '2'] }, { latitude: '4' }, { date: '2026-11-16' }, { min_price: '25', max_price: '20' }]) {
    assert.ok(Object.keys(parseRecommendations(query).errors).length, JSON.stringify(query));
  }
});

test('recomendaciones: la prioridad del dueño cambia el orden entre cercanía y valoraciones', () => {
  const profiles = [caregiver({ id: 'near', rating: 3, review_count: 2 }),
    caregiver({ id: 'reviewed', latitude: 4.70, rating: 4.8, review_count: 40 })];
  const filters = { latitude: 4.65, longitude: -74.06, radius_km: 10 };
  assert.equal(recommendCaregivers(profiles, { ...filters, priority: 'distance' }).recommendations[0].id, 'near');
  const result = recommendCaregivers(profiles, { ...filters, priority: 'rating' });
  assert.equal(result.recommendations[0].id, 'reviewed');
  assert.equal(result.context.priority, 'rating');
  assert.equal(result.recommendations[0].rating, 4.8);
});

test('recomendaciones: considera la cantidad de experiencias sin inventar promedios públicos', () => {
  const result = recommendCaregivers([caregiver({ id: 'one-review', rating: 5, review_count: 1 }),
    caregiver({ id: 'many-reviews', rating: 4.8, review_count: 40 }), caregiver()], { priority: 'rating' });
  assert.deepEqual(result.recommendations.map((row) => row.id), ['many-reviews', 'one-review', 'ana']);
  assert.deepEqual(result.recommendations.map((row) => row.rating), [4.8, 5, null]);
  assert.ok(result.recommendations.every((row) => row.recommendation.availability === 'not_checked'));
});

test('recomendaciones: los mínimos de opiniones y calificación separan alternativas con motivos', () => {
  const result = recommendCaregivers([caregiver({ id: 'match', rating: 4.5, review_count: 5 }),
    caregiver({ id: 'low', rating: 4, review_count: 10 }), caregiver({ id: 'few', rating: 5, review_count: 1 }), caregiver()],
  { min_rating: 4.5, min_reviews: 5 });
  assert.deepEqual(result.recommendations.map((row) => row.id), ['match']);
  assert.equal(result.alternatives.length, 3);
  assert.ok(result.alternatives.find((row) => row.id === 'low').recommendation.warnings.some((warning) => warning.includes('calificación mínima')));
  assert.ok(result.alternatives.find((row) => row.id === 'few').recommendation.warnings.some((warning) => warning.includes('opiniones')));
  assert.equal(result.context.min_rating, 4.5);
  assert.equal(result.context.min_reviews, 5);
  assert.equal(result.context.personalized, true);
  assert.equal(recommendCaregivers([caregiver()], { min_rating: 0, min_reviews: 0 }).recommendations.length, 1);
});

test('recomendaciones: solo disponibles excluye horarios y reservas en conflicto incluso de alternativas', () => {
  const profiles = [caregiver(), caregiver({ id: 'no-hours', availability: [] }),
    ...['requested', 'confirmed'].map((status) => caregiver({ id: status, rating: 5, review_count: 50,
      busy_bookings: [{ status, start_at: '2026-11-16T15:00:00Z', end_at: '2026-11-16T16:00:00Z' }] }))];
  const result = recommendCaregivers(profiles, { ...schedule, only_available: true, priority: 'rating' });
  assert.deepEqual(result.recommendations.map((row) => row.id), ['ana']);
  assert.deepEqual(result.alternatives, []);
  assert.equal(result.recommendations[0].recommendation.availability, 'available');
  assert.equal(result.context.only_available, true);
  const expanded = recommendCaregivers(profiles, { ...schedule, only_available: false });
  assert.equal(expanded.alternatives.length, 3);
  assert.ok(expanded.alternatives.every((row) => row.recommendation.availability === 'unavailable'));
});

test('recomendaciones: precio prioriza la misma unidad sin aprovechar tarifas de otros servicios', () => {
  const profiles = [caregiver({ id: 'expensive', latitude: 4.65, services: [{ name: 'Paseos', rate: 30000, unit: 'paseo' }, { name: 'Guardería', rate: 1000, unit: 'hora' }] }),
    caregiver({ id: 'cheap', latitude: 4.70, services: [{ name: 'Paseos', rate: 12000, unit: 'paseo' }] }),
    caregiver({ id: 'other-unit', services: [{ name: 'Paseos', rate: 1000, unit: 'hora' }] })];
  const filters = { service: 'Paseos', rate_unit: 'paseo', latitude: 4.65, longitude: -74.06, radius_km: 10 };
  assert.equal(recommendCaregivers(profiles, { ...filters, priority: 'distance' }).recommendations[0].id, 'expensive');
  const result = recommendCaregivers(profiles, { ...filters, priority: 'price' });
  assert.equal(result.recommendations[0].id, 'cheap');
  assert.equal(result.recommendations[0].matching_services[0].rate, 12000);
  assert.equal(result.alternatives[0].id, 'other-unit');
  assert.equal(result.context.price_comparable, true);
  assert.ok(result.recommendations.every((row) => Number.isFinite(row.recommendation.score)));
  const equalPrices = recommendCaregivers([caregiver(), caregiver({ id: 'other' })], { priority: 'price', rate_unit: 'paseo' });
  assert.ok(equalPrices.recommendations.every((row) => Number.isFinite(row.recommendation.score)));
});

test('recomendaciones: una prioridad nunca compensa una incompatibilidad ni una ubicación desconocida', () => {
  for (const priority of ['balanced', 'distance', 'rating', 'price']) {
    const result = recommendCaregivers([caregiver(), caregiver({ id: 'incompatible', latitude: null, specialties: [], rating: 5, review_count: 100 })],
      { priority, rate_unit: 'paseo', needs: ['Cachorros'], latitude: 4.65, longitude: -74.06, radius_km: 10 });
    assert.deepEqual(result.recommendations.map((row) => row.id), ['ana']);
    assert.equal(result.alternatives[0].id, 'incompatible');
    assert.equal(result.alternatives[0].distance_km, null);
  }
});

test('recomendaciones: valida prioridades, mínimos y los requisitos de ubicación, tarifa y horario', () => {
  const valid = parseRecommendations({ priority: 'price', rate_unit: 'paseo', only_available: 'true',
    min_rating: '4.5', min_reviews: '5', date: schedule.date, start_time: schedule.start_time, end_time: schedule.end_time });
  assert.deepEqual(valid.errors, {});
  assert.equal(valid.filters.only_available, true);
  assert.equal(valid.filters.min_rating, 4.5);
  assert.equal(valid.filters.min_reviews, 5);
  assert.equal(parseRecommendations({ only_available: 'false' }).filters.only_available, false);
  assert.deepEqual(parseRecommendations({ priority: 'distance', latitude: '0', longitude: '0' }).errors, {});
  for (const query of [{ priority: 'unknown' }, { priority: ['rating'] }, { priority: 'distance' }, { priority: 'price' },
    { min_rating: '5.1' }, { min_rating: '-1' }, { min_rating: ['4', '5'] }, { min_rating: 'NaN' },
    { min_reviews: '1.5' }, { min_reviews: '-1' }, { min_reviews: '10001' }, { min_reviews: 'Infinity' },
    { only_available: 'yes' }, { only_available: true }, { only_available: ['true'] }, { only_available: 'true' },
    { only_available: 'true', date: schedule.date, start_time: '11:00', end_time: '09:00' }]) {
    assert.ok(Object.keys(parseRecommendations(query).errors).length, JSON.stringify(query));
  }
});
