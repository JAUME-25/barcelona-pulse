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

const dayMonthFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: DISPLAY_TIME_ZONE,
  day: 'numeric',
  month: 'long',
});
const yearFormat = new Intl.DateTimeFormat('es-ES', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
});

/**
 * Desde cuándo, respecto a un momento de referencia: «las 23:39» si es del mismo día, «el 28 de
 * mayo» si es del mismo año y, si no, «el 12 de junio de 2025».
 */
export function formatSince(iso: string, referenceIso: string): string {
  const date = new Date(iso);
  const reference = new Date(referenceIso);
  if (dayFormat.format(date) === dayFormat.format(reference)) return `las ${formatTime(iso)}`;
  if (yearFormat.format(date) === yearFormat.format(reference)) {
    return `el ${dayMonthFormat.format(date)}`;
  }
  return `el ${dayFormat.format(date)}`;
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

const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

function joinWithY(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;
}

/**
 * Meses que cubren unos días locales («2026-05-04»…): «mayo de 2026», «mayo y agosto de 2026» o
 * «diciembre de 2025 y enero de 2026». Sin días, null.
 */
export function formatMonths(days: readonly string[]): string | null {
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].sort();
  if (months.length === 0) return null;
  const byYear = new Map<string, string[]>();
  for (const ym of months) {
    const [year = '', month = '1'] = ym.split('-');
    const name = monthName.format(Date.UTC(Number(year), Number(month) - 1, 15));
    byYear.set(year, [...(byYear.get(year) ?? []), name]);
  }
  return joinWithY([...byYear].map(([year, names]) => `${joinWithY(names)} de ${year}`));
}
