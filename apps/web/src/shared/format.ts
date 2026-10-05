// Los instantes llegan en UTC y se muestran siempre en hora de Barcelona,
// con independencia de la zona horaria del navegador.
export const DISPLAY_TIME_ZONE = 'Europe/Madrid';

const dateTimeFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const timeFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «10 de marzo de 2026, 10:00» */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** «10 de marzo de 2026» */
export function formatDay(iso: string): string {
  return dayFormat.format(new Date(iso));
}

/** «10:00» */
export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** «10:00» si es el mismo día de referencia; si no, fecha y hora completas. */
export function formatTimeRelativeToDay(iso: string, referenceIso: string): string {
  const sameDay = dayFormat.format(new Date(iso)) === dayFormat.format(new Date(referenceIso));
  return sameDay ? formatTime(iso) : formatDateTime(iso);
}

/** «2 h 15 min», «40 min», «menos de 1 min» */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
  if (minutes < 1) return 'menos de 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (hours >= 48) return `${Math.floor(hours / 24)} días`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
