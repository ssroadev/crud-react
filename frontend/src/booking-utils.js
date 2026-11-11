export const bookingMoney = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

export function todayInBogota() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function formatBookingTime(value) {
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value.replace(' ', 'T')}-05:00`;
  return new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(normalized));
}

export function durationLabel(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'Por definir';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return [hours && `${hours} h`, rest && `${rest} min`].filter(Boolean).join(' ');
}
