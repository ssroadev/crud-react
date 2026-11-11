const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterRequests(bookings, { status = 'all', from = '', to = '', query = '', mode = 'requests', sort = 'newest', prioritizeUpdates = false } = {}) {
  const term = normalize(query.trim());
  return bookings.filter((booking) => {
    if (mode === 'agenda' && booking.status !== 'confirmed') return false;
    if (status !== 'all' && booking.status !== status) return false;
    const day = booking.start_at.slice(0, 10);
    if (from && day < from || to && day > to) return false;
    const owner = Array.isArray(booking.owner?.profile) ? booking.owner.profile[0] : booking.owner?.profile;
    return !term || normalize([booking.id, booking.service_name, booking.pet?.name, owner?.first_name, owner?.last_name, booking.caregiver_profile?.profile?.first_name, booking.caregiver_profile?.profile?.last_name, booking.location].join(' ')).includes(term);
  }).sort((a, b) => {
    if (sort === 'soonest') return a.start_at.localeCompare(b.start_at);
    if (sort === 'latest') return b.start_at.localeCompare(a.start_at);
    if (prioritizeUpdates) {
      const unread = Number(Boolean(b.owner_unread)) - Number(Boolean(a.owner_unread));
      if (unread) return unread;
      const activity = (booking) => Math.max(...[booking.completed_at, booking.reviewed_at, booking.created_at, booking.start_at].filter(Boolean).map((value) => new Date(value).getTime()));
      return activity(b) - activity(a);
    }
    return (b.created_at || b.start_at).localeCompare(a.created_at || a.start_at) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
  });
}

export function requestCounts(bookings) {
  return bookings.reduce((counts, booking) => ({ ...counts, [booking.status]: (counts[booking.status] || 0) + 1 }), { requested: 0, confirmed: 0, rejected: 0, completed: 0, cancelled: 0 });
}
