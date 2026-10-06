import { api, toApiError, type SourceSummary, type TimelinePoint } from '../../api/client';
import { coverageOf, type Coverage } from '../history/series';
import { addDays, localMidnight, localParts, weekStart } from '../history/time';
import { useRemote } from '../stations/useStationData';

/** Paso de la rejilla de huecos: una semana por petición sale en ~1,7 s y se guarda en la API. */
export const QUALITY_STEP_MINUTES = 15;

const RANK: Record<Coverage, number> = { complete: 0, partial: 1, none: 2 };

export interface DayRow {
  day: string;
  /** La peor cobertura de cada hora local (0 a 23); null si la hora no existe ese día. */
  hours: (Coverage | null)[];
  worst: Coverage;
}

/** Por día importado y hora de Barcelona, la peor cobertura de los pasos de esa hora. */
export function hourGrid(points: readonly TimelinePoint[], days: readonly string[]): DayRow[] {
  const wanted = new Set(days);
  const rows = new Map<string, (Coverage | null)[]>();
  for (const p of points) {
    const { date, hour } = localParts(Date.parse(p.at));
    if (!wanted.has(date)) continue;
    const hours = rows.get(date) ?? Array.from<Coverage | null>({ length: 24 }).fill(null);
    const coverage = coverageOf(p);
    const current = hours[hour];
    if (current === null || current === undefined || RANK[coverage] > RANK[current]) {
      hours[hour] = coverage;
    }
    rows.set(date, hours);
  }
  return days.flatMap((day) => {
    const hours = rows.get(day);
    if (hours === undefined) return [];
    const worst = hours.reduce<Coverage>(
      (w, c) => (c !== null && RANK[c] > RANK[w] ? c : w),
      'complete',
    );
    return [{ day, hours, worst }];
  });
}

export interface QualitySummary {
  steps: number;
  /** Media de la proporción de estaciones con dato en cada paso. */
  average: number;
  incomplete: number;
  empty: number;
  /** Días con algún paso incompleto o vacío. */
  daysWithGaps: string[];
}

export function qualitySummary(points: readonly TimelinePoint[], days: readonly string[]) {
  const wanted = new Set(days);
  const inDays = points.filter((p) => wanted.has(localParts(Date.parse(p.at)).date));
  const shares = inDays.map((p) =>
    p.stationsKnown === 0 ? 0 : p.stationsWithData / p.stationsKnown,
  );
  const gaps = new Set<string>();
  let incomplete = 0;
  let empty = 0;
  for (const p of inDays) {
    const coverage = coverageOf(p);
    if (coverage === 'complete') continue;
    if (coverage === 'none') empty++;
    else incomplete++;
    gaps.add(localParts(Date.parse(p.at)).date);
  }
  return {
    steps: inDays.length,
    average: shares.length === 0 ? 0 : shares.reduce((a, b) => a + b, 0) / shares.length,
    incomplete,
    empty,
    daysWithGaps: [...gaps].sort(),
  } satisfies QualitySummary;
}

/** Semanas (de lunes a domingo) que tocan los días importados. */
export function weeksOf(days: readonly string[]): string[] {
  return [...new Set(days.map(weekStart))].sort();
}

/**
 * Línea temporal de todos los días importados, cada 15 minutos: una petición por semana (la API
 * admite 7 días por petición).
 */
async function loadWeeks(sourceId: string, weeks: readonly string[]): Promise<TimelinePoint[]> {
  const parts = await Promise.all(
    weeks.map(async (monday) => {
      const from = new Date(localMidnight(monday)).toISOString();
      const to = new Date(
        localMidnight(addDays(monday, 7)) - QUALITY_STEP_MINUTES * 60_000,
      ).toISOString();
      const { data, error, response } = await api.GET('/api/sources/{id}/timeline', {
        params: { path: { id: sourceId }, query: { from, to, step: QUALITY_STEP_MINUTES } },
      });
      if (data === undefined) throw toApiError(error, response);
      return data.points;
    }),
  );
  return parts.flat();
}

// Una vez por página: abrir y cerrar la ficha no repite las peticiones, que cuentan para el
// límite de 120 por minuto de la API. Si fallan, se olvidan para poder reintentar.
const loaded = new Map<string, Promise<TimelinePoint[]>>();

export function useQuality(source: SourceSummary | undefined) {
  const weeks = source === undefined ? [] : weeksOf(source.days);
  const key = source === undefined || weeks.length === 0 ? null : `${source.id}:${weeks.join(',')}`;
  return useRemote<TimelinePoint[]>(key, () => {
    if (key === null || source === undefined) return Promise.resolve([]);
    let promise = loaded.get(key);
    if (promise === undefined) {
      promise = loadWeeks(source.id, weeks);
      loaded.set(key, promise);
      promise.catch(() => loaded.delete(key));
    }
    return promise;
  });
}
