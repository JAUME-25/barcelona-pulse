import { intlLocale } from './state';

// Fechas y cifras con Intl en el idioma de la interfaz. Sin palabras propias: las frases que
// las rodean («desde las…», «del 4 al 31 de…») son de cada idioma (es.tsx, ca.tsx, en.tsx).
// Los instantes llegan en UTC y se muestran siempre en hora de Barcelona, sea cual sea la zona
// del navegador.

export const DISPLAY_TIME_ZONE = 'Europe/Madrid';

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${intlLocale()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (format === undefined) {
    format = new Intl.DateTimeFormat(intlLocale(), options);
    dateFormats.set(key, format);
  }
  return format;
}

export function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${intlLocale()}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (format === undefined) {
    format = new Intl.NumberFormat(intlLocale(), options);
    numberFormats.set(key, format);
  }
  return format;
}

const BARCELONA = { timeZone: DISPLAY_TIME_ZONE } as const;

/** «10 de marzo de 2026, 10:00» */
export function formatDateTime(iso: string): string {
  return dateFormat({
    ...BARCELONA,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** «10 de marzo de 2026» */
export function formatDay(iso: string): string {
  return dateFormat({ ...BARCELONA, day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  );
}

/** «10 de marzo» */
export function formatDayMonth(iso: string): string {
  return dateFormat({ ...BARCELONA, day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** «10:00» */
export function formatTime(iso: string): string {
  return dateFormat({ ...BARCELONA, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// No depende del idioma: un solo formateador (crearlo en cada llamada costaba en cada paso).
const DAY_KEY = new Intl.DateTimeFormat('en-CA', { ...BARCELONA, dateStyle: 'short' });
const dayKey = (iso: string) => DAY_KEY.format(new Date(iso));

/** El mismo día de Barcelona. */
export function sameLocalDay(a: string, b: string): boolean {
  return dayKey(a) === dayKey(b);
}

/** El mismo año de Barcelona. */
export function sameLocalYear(a: string, b: string): boolean {
  return dayKey(a).slice(0, 4) === dayKey(b).slice(0, 4);
}

/** Nombre del mes («mayo», «maig», «May») de un año y un mes (1-12). */
export function monthName(year: number, month: number): string {
  return dateFormat({ month: 'long', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, 15));
}

function noon(date: string): Date {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** Un día de Barcelona («2026-08-20») con el día de la semana y el año: «jueves, 20 de agosto de 2026». */
export function formatLocalDay(date: string): string {
  return dateFormat({
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(noon(date));
}

/** «jue», «dj.», «Thu» */
export function formatShortWeekday(date: string): string {
  return dateFormat({ timeZone: 'UTC', weekday: 'short' }).format(noon(date));
}

/** Minutos entre dos instantes, en horas y minutos o en días (desde 48 h). */
export function durationParts(
  fromIso: string,
  toIso: string,
): {
  minutes: number;
  hours: number;
  rest: number;
  days: number;
} {
  const minutes = Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
  const hours = Math.floor(minutes / 60);
  return { minutes, hours, rest: minutes % 60, days: Math.floor(hours / 24) };
}

/** Partes de un día local: el día del mes, el mes en letras y el año. */
export function dayParts(date: string): { d: number; m: string; y: string } {
  const [y = '', m = '1', d = '1'] = date.split('-');
  return { d: Number(d), m: monthName(Number(y), Number(m)), y };
}

function nextDay(date: string): string {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Tramos de días seguidos de una lista ordenada: [primero, último]. */
export function dayRuns(days: readonly string[]): [string, string][] {
  const runs: [string, string][] = [];
  for (const day of days) {
    const run = runs.at(-1);
    if (run !== undefined && nextDay(run[1]) === day) run[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

/** Los años de una lista de días locales, sin repetir. */
export function yearsOf(days: readonly string[]): string[] {
  return [...new Set(days.map((d) => d.slice(0, 4)))];
}

/** Meses de unos días locales, agrupados por año: [["2026", ["mayo", "agosto"]]]. */
export function monthsByYear(days: readonly string[]): [string, string[]][] {
  const months = [...new Set(days.map((d) => d.slice(0, 7)))].sort();
  const byYear = new Map<string, string[]>();
  for (const ym of months) {
    const [year = '', month = '1'] = ym.split('-');
    byYear.set(year, [...(byYear.get(year) ?? []), monthName(Number(year), Number(month))]);
  }
  return [...byYear];
}

/** Días de unos días locales, agrupados por mes: [["mayo", [6, 13, 20]]]. */
export function daysByMonth(days: readonly string[]): [string, number[]][] {
  const byMonth = new Map<string, number[]>();
  for (const day of days) {
    const { d, m } = dayParts(day);
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  return [...byMonth];
}

/** «a, b y c», con la conjunción de cada idioma. */
export function joinList(items: readonly string[], and: string): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1) ?? ''}`;
}
