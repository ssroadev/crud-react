const sizes = ['pequeno', 'mediano', 'grande'];

function validatePet(input, partial = false, now = Date.now()) {
  const errors = {};
  const data = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { data, errors: { form: 'Completa los datos de tu mascota.' } };
  if (!partial || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) errors.name = 'Escribe su nombre, de hasta 100 caracteres.';
    else data.name = input.name.trim();
  }
  if (!partial || input.size !== undefined) {
    if (!sizes.includes(input.size)) errors.size = 'Selecciona un tamaño válido.';
    else data.size = input.size;
  }
  const structuredBreed = input.breed_id !== undefined || input.breed_other !== undefined;
  let breedId = null;
  if (structuredBreed) {
    const id = input.breed_id;
    const other = input.breed_other;
    if (id !== null && id !== undefined && (typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 100)) {
      errors.breed = 'Selecciona una raza del catálogo o elige Otra.';
    } else if (id) breedId = id;
    if (other !== null && other !== undefined && (typeof other !== 'string' || !other.trim() || other.trim().length > 100)) errors.breed = 'Indica cuál es la raza, de hasta 100 caracteres.';
    if (id && other !== null && other !== undefined) errors.breed = 'Selecciona una raza del catálogo o escribe otra, no ambas.';
    data.breed = typeof other === 'string' ? other.trim() : null;
  } else if (input.breed !== undefined) {
    // Compatibilidad con clientes y mascotas anteriores al catálogo.
    if (input.breed !== null && (typeof input.breed !== 'string' || input.breed.trim().length > 100)) errors.breed = 'La raza debe tener hasta 100 caracteres.';
    else data.breed = input.breed?.trim() || null;
  }
  if (input.birth_date !== undefined) {
    const value = input.birth_date;
    if (value === null || value === '') data.birth_date = null;
    else {
      const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : null;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(now));
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value > today || value.slice(0, 4) === '0000') {
        errors.birth_date = 'Elige una fecha de nacimiento válida que no sea futura.';
      } else data.birth_date = value;
    }
  }
  if (input.notes !== undefined) {
    if (input.notes !== null && (typeof input.notes !== 'string' || input.notes.length > 2000)) errors.notes = 'Escribe hasta 2000 caracteres en las notas.';
    else data.notes = input.notes?.trim() || null;
  }
  if (partial && !Object.keys(data).length && !breedId && !Object.keys(errors).length) errors.form = 'Indica los datos que quieres actualizar.';
  return { data, breedId, errors };
}

module.exports = { validatePet };
