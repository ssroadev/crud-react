const { validCoordinates, ratingFromBookings } = require('./search');

// Evita el límite implícito de 1000 filas de PostgREST al filtrar el directorio.
async function readAll(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await buildQuery().range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

async function enrichCaregivers(supabase, profiles, filters = {}) {
  if (!profiles.length) return [];
  const userIds = [...new Set(profiles.map((item) => item.profile?.id_user).filter((id) => id !== undefined))];
  let legacyCaregivers = [];
  // profiles.id y caregivers.id_user pertenecen a entidades distintas.
  for (let index = 0; index < userIds.length; index += 100) {
    const ids = userIds.slice(index, index + 100);
    const rows = await readAll(() => supabase.from('caregivers')
      .select('id,id_user,latitude,longitude,active,bookings(status,reviews(rating))')
      .in('id_user', ids).order('id'));
    legacyCaregivers.push(...rows);
  }
  let busyBookings = [];
  if (filters.date && legacyCaregivers.length) {
    for (let index = 0; index < legacyCaregivers.length; index += 100) {
      const ids = legacyCaregivers.slice(index, index + 100).map((item) => item.id);
      const rows = await readAll(() => supabase.from('bookings')
        .select('id,id_caregiver,start_at,end_at,status').in('id_caregiver', ids)
        .in('status', ['requested', 'confirmed'])
        .lt('start_at', `${filters.date}T${filters.end_time}:00`)
        .gt('end_at', `${filters.date}T${filters.start_time}:00`).order('id'));
      busyBookings.push(...rows);
    }
  }
  const byUser = new Map(legacyCaregivers.map((item) => [String(item.id_user), item]));
  return profiles.map((item) => {
    const legacy = byUser.get(String(item.profile?.id_user));
    const ownLocation = validCoordinates(item.latitude, item.longitude);
    const legacyLocation = legacy && validCoordinates(legacy.latitude, legacy.longitude);
    return {
      ...item,
      profile: { first_name: item.profile?.first_name, last_name: item.profile?.last_name },
      latitude: ownLocation ? Number(item.latitude) : legacyLocation ? Number(legacy.latitude) : null,
      longitude: ownLocation ? Number(item.longitude) : legacyLocation ? Number(legacy.longitude) : null,
      active: legacy?.active ?? true,
      ...ratingFromBookings(legacy?.bookings),
      busy_bookings: legacy ? busyBookings.filter((booking) => String(booking.id_caregiver) === String(legacy.id)) : [],
    };
  });
}

module.exports = { readAll, enrichCaregivers };
