import type { StationItem, TimelinePoint } from '../../api/client';
import { t } from '../../i18n';
import { numberFormat } from '../../i18n/intl';
import { COMPLETE_SHARE, coverageOf, coverageRuns } from '../history/series';
import { localClock } from '../history/time';

// Límites visibles (B5): qué muestra la aplicación y qué no. Cálculos sin React para la ficha
// «Qué muestra y qué no», las notas junto a los datos y el sello del mapa. Las frases son de cada
// idioma (i18n): aquí se decide qué decir y allí cómo.

export type { Origin } from '../../i18n/types';

export const CODE_URL = 'https://github.com/JAUME-25/barcelona-pulse';

/** Por qué una estación no tiene dato en un instante: ninguno hasta entonces, o cuánto lleva callada. */
export type Silence = 'never' | 'days' | 'hours' | 'minutes';

export interface SilentStation {
  station: StationItem;
  silence: Silence;
}

const HOUR = 3_600_000;
const SEVERITY: Record<Silence, number> = { never: 0, days: 1, hours: 2, minutes: 3 };

export function silenceOf(station: StationItem, at: string): Silence | null {
  if (station.state.freshness === 'current') return null;
  const last = station.state.lastObservedAt;
  if (last === null) return 'never';
  const age = Date.parse(at) - Date.parse(last);
  if (age >= 24 * HOUR) return 'days';
  if (age >= HOUR) return 'hours';
  return 'minutes';
}

/** Las estaciones sin dato en el instante, de la que más tiempo lleva callada a la que menos. */
export function silentStations(stations: readonly StationItem[], at: string): SilentStation[] {
  return stations
    .flatMap((station) => {
      const silence = silenceOf(station, at);
      return silence === null ? [] : [{ station, silence }];
    })
    .sort(
      (a, b) =>
        SEVERITY[a.silence] - SEVERITY[b.silence] ||
        (a.station.state.lastObservedAt ?? '').localeCompare(b.station.state.lastObservedAt ?? ''),
    );
}

/**
 * «Ningún dato hasta este momento» (en lo importado: puede que aún no hubiera empezado a
 * informar), «Sin datos desde el 28 de mayo» o «16 min sin datos».
 */
export function silenceLabel({ station, silence }: SilentStation, at: string): string {
  const m = t().limits;
  const last = station.state.lastObservedAt;
  if (silence === 'never' || last === null) return m.silentNever;
  if (silence === 'days') return m.silentSince(last, at);
  return m.silentFor(last, at);
}

/**
 * Periodo de unos días locales ordenados: «del 4 al 31 de mayo de 2026» o, con huecos, «del 4
 * al 31 de mayo y del 17 al 30 de agosto de 2026». Sin días, null.
 */
export function periodText(days: readonly string[]): string | null {
  return t().limits.periodOf(days);
}

/** «6, 13, 20 y 27 de mayo» */
export function listDays(days: readonly string[]): string {
  return t().limits.listDays(days);
}

/**
 * Bajo la pista de «Reproducir»: a qué horas del día informó menos del 95 % de las estaciones
 * (la misma regla que la franja rayada). Sin puntos, null.
 */
export function gapText(points: readonly TimelinePoint[]): string | null {
  if (points.length === 0) return null;
  const share = numberFormat({ style: 'percent' }).format(COMPLETE_SHARE);
  const allNone = points.every((p) => coverageOf(p) === 'none');
  const ranges = allNone
    ? []
    : coverageRuns(points)
        .filter((r) => r.coverage !== 'complete')
        .flatMap((r) => {
          const from = points[r.from]?.at;
          const to = points[r.to]?.at;
          if (from === undefined || to === undefined) return [];
          return [{ from: localClock(from), to: r.from === r.to ? null : localClock(to) }];
        });
  return t().limits.gap({ allNone, share, ranges });
}

/** Lo que la aplicación no dice, en el orden en que alguien suele suponerlo. */
export function notSaid(toleranceMinutes: number): string[] {
  return t().limits.notSaid(toleranceMinutes);
}

/** De dónde sale cada cosa que se ve. */
export function origins(months: string | null) {
  return t().limits.origins(months);
}
