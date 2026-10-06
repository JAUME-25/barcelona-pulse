import type { StationItem, TimelinePoint } from '../../api/client';
import { formatDuration, formatSince, plural } from '../../shared/format';
import { COMPLETE_SHARE, coverageOf, coverageRuns } from '../history/series';
import { addDays, localClock } from '../history/time';

// Límites visibles (B5): qué muestra la aplicación y qué no. Textos y cálculos sin React, para
// la ficha «Qué muestra y qué no», las notas junto a los datos y el sello del mapa.

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
  const last = station.state.lastObservedAt;
  if (silence === 'never' || last === null) return 'Ningún dato hasta este momento';
  if (silence === 'days') return `Sin datos desde ${formatSince(last, at)}`;
  return `${formatDuration(last, at)} sin datos`;
}

const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

function dayParts(date: string): { d: number; m: string; y: string } {
  const [y = '', m = '1', d = '1'] = date.split('-');
  return { d: Number(d), m: monthName.format(Date.UTC(Number(y), Number(m) - 1, 15)), y };
}

/** Tramos de días seguidos: [primero, último]. */
function runsOf(days: readonly string[]): [string, string][] {
  const runs: [string, string][] = [];
  for (const day of days) {
    const run = runs.at(-1);
    if (run !== undefined && addDays(run[1], 1) === day) run[1] = day;
    else runs.push([day, day]);
  }
  return runs;
}

/** «del 4 al 31 de mayo», con el año si se pide. */
function runText([first, last]: [string, string], withYear: boolean): string {
  const a = dayParts(first);
  const b = dayParts(last);
  const year = (y: string) => (withYear ? ` de ${y}` : '');
  if (first === last) return `el ${String(a.d)} de ${a.m}${year(a.y)}`;
  if (a.y === b.y && a.m === b.m) {
    return `del ${String(a.d)} al ${String(b.d)} de ${b.m}${year(b.y)}`;
  }
  if (a.y === b.y) return `del ${String(a.d)} de ${a.m} al ${String(b.d)} de ${b.m}${year(b.y)}`;
  return `del ${String(a.d)} de ${a.m} de ${a.y} al ${String(b.d)} de ${b.m} de ${b.y}`;
}

function joinWithY(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} y ${items.at(-1) ?? ''}`;
}

/**
 * Periodo de unos días locales ordenados: «del 4 al 31 de mayo de 2026» o, con huecos, «del 4
 * al 31 de mayo y del 17 al 30 de agosto de 2026». Sin días, null.
 */
export function periodText(days: readonly string[]): string | null {
  const runs = runsOf(days);
  if (runs.length === 0) return null;
  const years = [...new Set(days.map((d) => d.slice(0, 4)))];
  const oneYear = years.length === 1;
  const joined = joinWithY(runs.map((r) => runText(r, !oneYear)));
  return oneYear ? `${joined} de ${years[0] ?? ''}` : joined;
}

/** «6, 13, 20 y 27 de mayo» */
export function listDays(days: readonly string[]): string {
  const byMonth = new Map<string, number[]>();
  for (const day of days) {
    const { d, m } = dayParts(day);
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  return joinWithY([...byMonth].map(([m, ds]) => `${joinWithY(ds.map(String))} de ${m}`));
}

const SHARE = new Intl.NumberFormat('es-ES', { style: 'percent' }).format(COMPLETE_SHARE);

/**
 * Bajo la pista de «Reproducir»: a qué horas del día informó menos del 95 % de las estaciones
 * (la misma regla que la franja rayada). Sin puntos, null.
 */
export function gapText(points: readonly TimelinePoint[]): string | null {
  if (points.length === 0) return null;
  if (points.every((p) => coverageOf(p) === 'none')) return 'Sin datos en todo el día.';
  const ranges = coverageRuns(points)
    .filter((r) => r.coverage !== 'complete')
    .flatMap((r) => {
      const from = points[r.from]?.at;
      const to = points[r.to]?.at;
      if (from === undefined || to === undefined) return [];
      return [
        r.from === r.to
          ? `a las ${localClock(from)}`
          : `de ${localClock(from)} a ${localClock(to)}`,
      ];
    });
  if (ranges.length === 0) return `Todo el día con dato del ${SHARE} de las estaciones o más.`;
  const shown = ranges.slice(0, 3);
  const rest = ranges.length - shown.length;
  const list =
    rest > 0 ? `${shown.join(', ')} y ${plural(rest, 'tramo', 'tramos')} más` : joinWithY(shown);
  return `Menos del ${SHARE} de las estaciones con dato ${list}.`;
}

/** Lo que la aplicación no dice, en el orden en que alguien suele suponerlo. */
export function notSaid(toleranceMinutes: number): string[] {
  return [
    'No es tiempo real: es un archivo del pasado.',
    `Sin dato no es cero: una estación que lleva más de ${String(toleranceMinutes)} minutos sin informar sale como desconocida, no como vacía.`,
    'Un cambio en el número de bicis no es un viaje: no se sabe de dónde vienen ni adónde van.',
    'La cobertura es geometría en línea recta. No es a pie, ni población, ni demanda.',
    'No predice ni recomienda nada.',
  ];
}

export interface Origin {
  what: string;
  who: string;
  terms: string;
}

/** De dónde sale cada cosa que se ve. */
export function origins(months: string | null): Origin[] {
  const when = months === null ? '' : `, ${months}`;
  return [
    {
      what: 'Estado de las estaciones',
      who: `Ajuntament de Barcelona, Open Data BCN${when}`,
      terms: 'CC BY 4.0, datos transformados',
    },
    {
      what: 'Nombre, ubicación y capacidad',
      who: `Ajuntament de Barcelona, Open Data BCN${when}`,
      terms: 'CC BY 4.0',
    },
    {
      what: 'Distritos para la cobertura',
      who: 'Ajuntament de Barcelona, Open Data BCN (2017)',
      terms: 'CC BY 4.0',
    },
    {
      what: 'Mapa base y edificios',
      who: 'OpenFreeMap, OpenMapTiles y OpenStreetMap',
      terms: 'ODbL',
    },
    { what: 'Estaciones hipotéticas', who: 'Las pones tú', terms: 'No se guardan' },
  ];
}
