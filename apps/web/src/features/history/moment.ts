import type { SourceSummary } from '../../api/client';
import { lastLocalDays, localMidnight, localParts } from './time';

// El momento que se enseña de un histórico. Antes, Explorar abría en el último dato (un domingo a
// las 23:55, el rato más tranquilo de la semana) y Reproducir en el último día a las 00:00. Si
// nadie pide otro, se enseña el último laborable importado a primera hora de la mañana.

/** Hora de reloj del momento representativo, en Barcelona. */
export const DEFAULT_CLOCK = '08:30';

/** Día («2026-05-29») y hora de reloj («08:30») de Barcelona pedidos; null, lo que no se pidió. */
export interface Moment {
  day: string | null;
  time: string | null;
}

export const NO_MOMENT: Moment = { day: null, time: null };

const MAX_DAYS = 7;

/**
 * Días que se pueden reproducir: los que cubren las ingestas de la fuente. Una base anterior a
 * ese dato no los tiene: entonces, los últimos días de su periodo.
 */
export function availableDays(source: SourceSummary | undefined): string[] {
  if (source === undefined) return [];
  if (source.days.length > 0) return source.days;
  const period = source.period;
  return period === null ? [] : lastLocalDays(period.from, period.to, MAX_DAYS);
}

/** Día de la semana de una fecha de Barcelona (0 = domingo). */
function weekdayOf(date: string): number {
  const [y = Number.NaN, m = Number.NaN, d = Number.NaN] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** De lunes a viernes. Los festivos cuentan como laborables: no hay calendario. */
export function isWeekday(date: string): boolean {
  const weekday = weekdayOf(date);
  return weekday >= 1 && weekday <= 5;
}

/** El último laborable de los días importados; si no hay ninguno, el último día. */
export function defaultDay(days: readonly string[]): string | null {
  return days.findLast(isWeekday) ?? days.at(-1) ?? null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * El momento importado que más se parece a ahora («A esta hora»): el último día con el mismo día
 * de la semana que hoy (si no lo hay, el último del mismo tipo, laborable o fin de semana; si no,
 * el último), a la hora de reloj de ahora en Barcelona, en pasos de 5 minutos. Null sin días.
 */
export function momentLikeNow(days: readonly string[], now: number): Moment | null {
  const today = localParts(now);
  const weekday = weekdayOf(today.date);
  const day =
    days.findLast((d) => weekdayOf(d) === weekday) ??
    days.findLast((d) => isWeekday(d) === isWeekday(today.date)) ??
    days.at(-1) ??
    null;
  if (day === null) return null;
  return { day, time: `${pad(today.hour)}:${pad(Math.floor(today.minute / 5) * 5)}` };
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isClock(value: string | null): value is string {
  return value !== null && CLOCK.test(value);
}

/**
 * Instante (ISO, UTC) de una hora de reloj de un día de Barcelona. En el día de 25 h, la hora
 * repetida es la primera vez que pasa; una hora que no existe (la que se salta en marzo) da el
 * primer instante después.
 */
export function instantOf(day: string, clock: string): string {
  const [h = 0, m = 0] = clock.split(':').map(Number);
  const target = h * 60 + m;
  const naive = localMidnight(day) + target * 60_000;
  // En los días de cambio de hora, contar desde la medianoche se desvía una hora.
  for (const candidate of [naive, naive + 3_600_000, naive - 3_600_000]) {
    const p = localParts(candidate);
    if (p.date === day && p.hour * 60 + p.minute === target) {
      return new Date(candidate).toISOString();
    }
  }
  return new Date(naive).toISOString();
}

/**
 * Instante que enseñan Explorar y Experimentar de un histórico: el día y la hora pedidos (en el
 * enlace o al salir de Reproducir) si el día está importado; si no, el laborable representativo a
 * las 08:30. Nunca después del último dato.
 */
export function historicalInstant(source: SourceSummary, moment: Moment): string | undefined {
  const period = source.period;
  if (period === null) return undefined;
  const days = availableDays(source);
  const day = moment.day !== null && days.includes(moment.day) ? moment.day : defaultDay(days);
  if (day === null) return period.to;
  const at = instantOf(day, isClock(moment.time) ? moment.time : DEFAULT_CLOCK);
  return Date.parse(at) > Date.parse(period.to) ? period.to : at;
}
