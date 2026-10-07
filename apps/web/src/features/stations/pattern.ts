import type { PatternHour, StationPatternResponse } from '../../api/client';

export type DayType = PatternHour['dayType'];
export const DAY_TYPES: readonly DayType[] = ['weekday', 'weekend'];

/** Lo que cuenta cada hora, en el orden de la leyenda; «unknown» es sin dato, nunca cero. */
export const PATTERN_PARTS = [
  'empty',
  'few',
  'available',
  'full',
  'outOfService',
  'unknown',
] as const;
export type PatternPart = (typeof PATTERN_PARTS)[number];

export interface PatternHourRow {
  hour: number;
  steps: number;
  counts: Record<PatternPart, number>;
}

/**
 * Las 24 horas de un tipo de día. Una hora sin pasos (la de las 2:00 el día que se adelanta la
 * hora, si no hay otro día de ese tipo) sale con 0 pasos: no se dibuja como vacía.
 */
export function hoursOf(pattern: StationPatternResponse, dayType: DayType): PatternHourRow[] {
  const byHour = new Map(
    pattern.hours.filter((h) => h.dayType === dayType).map((h) => [h.hour, h] as const),
  );
  return Array.from({ length: 24 }, (_, hour) => {
    const h = byHour.get(hour);
    return {
      hour,
      steps: h?.steps ?? 0,
      counts: {
        empty: h?.empty ?? 0,
        few: h?.few ?? 0,
        available: h?.available ?? 0,
        full: h?.full ?? 0,
        outOfService: h?.outOfService ?? 0,
        unknown: h?.unknown ?? 0,
      },
    };
  });
}

/** Parte de los pasos de la hora en un estado (0 si la hora no tiene pasos). */
export function shareOf(row: PatternHourRow, part: PatternPart): number {
  return row.steps === 0 ? 0 : row.counts[part] / row.steps;
}

/**
 * La hora en que un estado se dio más veces, si llega a `minShare` (por debajo, «casi nunca»).
 * Con empate, la primera del día.
 */
export function peakHour(
  rows: readonly PatternHourRow[],
  part: PatternPart,
  minShare = 0.1,
): { hour: number; share: number } | null {
  let best: { hour: number; share: number } | null = null;
  for (const row of rows) {
    const share = shareOf(row, part);
    if (share >= minShare && (best === null || share > best.share))
      best = { hour: row.hour, share };
  }
  return best;
}

/** Parte de todos los pasos del día en un estado (p. ej., cuánto falta de dato). */
export function totalShare(rows: readonly PatternHourRow[], part: PatternPart): number {
  const steps = rows.reduce((sum, row) => sum + row.steps, 0);
  return steps === 0 ? 0 : rows.reduce((sum, row) => sum + row.counts[part], 0) / steps;
}

/** Los estados que salen alguna vez, en el orden de la leyenda: la clave solo explica esos. */
export function partsPresent(rows: readonly PatternHourRow[]): PatternPart[] {
  return PATTERN_PARTS.filter(
    (part) =>
      rows.some((row) => row.counts[part] > 0) ||
      (part === 'unknown' && rows.some((row) => row.steps === 0)),
  );
}

/** Días de cada tipo: los importados de la fuente, sin festivos aparte. */
export function daysOf(pattern: StationPatternResponse, dayType: DayType): readonly string[] {
  return dayType === 'weekday' ? pattern.weekdays : pattern.weekendDays;
}
