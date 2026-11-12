const { validId } = require('../bookings/validation');
const validProfileId = (value) => typeof value === 'string' && /^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(value);

function validateReview(input) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: { form: 'Completa tu valoración.' } };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) errors.rating = 'Elige una puntuación de 1 a 5 estrellas.';
  if (input.comment !== undefined && input.comment !== null && (typeof input.comment !== 'string' || input.comment.length > 2000)) errors.comment = 'Escribe un comentario de hasta 2000 caracteres.';
  return { errors, data: { rating: input.rating, comment: typeof input.comment === 'string' ? input.comment.trim() || null : null } };
}

function parseReviewPage(query) {
  const errors = {};
  if (query.before_id !== undefined && !validId(query.before_id)) errors.before_id = 'La página de opiniones no es válida.';
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^\d{1,2}$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 50)) errors.limit = 'Consulta entre 1 y 50 opiniones por página.';
  return { errors, data: { p_before_id: query.before_id || null, p_limit: query.limit === undefined ? 5 : Number(query.limit) } };
}

function reviewError(res, error) {
  const statuses = { '22023': 400, '42501': 403, P0002: 404, P0001: 409, '23505': 409 };
  const status = statuses[error.code];
  if (!status) console.error('Error de opiniones:', error.code || 'connection_error');
  return res.status(status || 503).json({ error: status ? error.message : 'No se pudieron cargar o guardar las opiniones. Reintenta en un momento.' });
}

module.exports = { validateReview, parseReviewPage, validProfileId, reviewError };
