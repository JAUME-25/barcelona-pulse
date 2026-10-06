import { DISPLAY_TIME_ZONE } from '../../shared/format';

// Días y horas de Barcelona, sea cual sea la zona del navegador. Un «día» es una fecha
// AAAA-MM-DD del calendario de Barcelona; los de cambio de hora duran 23 o 25 horas.

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DISPLAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface LocalParts {
  date: string;
  hour: number;
  minute: number;
}

export function localParts(ms: number): LocalParts {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};
  for (const p of partsFormat.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    date: `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function splitDate(date: string): [number, number, number] {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = date.split('-').map(Number);
  return [y, m, d];
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Instante (ms) de las 00:00 del día en Barcelona. */
export function localMidnight(date: string): number {
  const [y, m, d] = splitDate(date);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Barcelona va una o dos horas por delante de UTC; el cambio de hora es de madrugada.
  for (const hours of [1, 2]) {
    const candidate = utcMidnight - hours * 3_600_000;
    const p = localParts(candidate);
    if (p.date === date && p.hour === 0 && p.minute === 0) return candidate;
  }
  throw new RangeError(`No se encuentra la medianoche del ${date} en Barcelona.`);
}

/** Lunes de la semana del día (las semanas van de lunes a domingo). */
export function weekStart(date: string): string {
  const [y, m, d] = splitDate(date);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

/** Los siete días de la semana que empieza en `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Los últimos `count` días de Barcelona hasta el de `toIso`, sin pasar del de `fromIso`. */
export function lastLocalDays(fromIso: string, toIso: string, count: number): string[] {
  const first = localParts(Date.parse(fromIso)).date;
  const days: string[] = [];
  for (
    let day = localParts(Date.parse(toIso)).date;
    days.length < count && day >= first;
    day = addDays(day, -1)
  ) {
    days.unshift(day);
  }
  return days;
}

// Con el año: en una reproducción histórica, «domingo, 23 de agosto» no basta.
const longDay = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortWeekday = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'short' });

function noon(date: string): Date {
  const [y, m, d] = splitDate(date);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** «jueves, 20 de agosto de 2026» */
export function formatLocalDay(date: string): string {
  return longDay.format(noon(date));
}

/** «jue» */
export function formatShortWeekday(date: string): string {
  return shortWeekday.format(noon(date));
}

export function dayOfMonth(date: string): number {
  return splitDate(date)[2];
}

/** «08:35» en hora de Barcelona. */
export function localClock(iso: string): string {
  const { hour, minute } = localParts(Date.parse(iso));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
