import type { TimelinePoint } from '../../api/client';
import { localParts } from './time';

/** Cobertura de un paso: todas (o casi) las estaciones con dato, solo parte o ninguna. */
export type Coverage = 'complete' | 'partial' | 'none';

/** Por debajo de esta proporción de estaciones con dato, el paso se marca como incompleto. */
export const COMPLETE_SHARE = 0.95;

export function coverageOf(p: TimelinePoint): Coverage {
  if (p.stationsWithData === 0 || p.stationsKnown === 0) return 'none';
  return p.stationsWithData >= COMPLETE_SHARE * p.stationsKnown ? 'complete' : 'partial';
}

export interface CoverageRun {
  coverage: Coverage;
  from: number;
  to: number;
}

/** Tramos seguidos con la misma cobertura, en índices de paso (ambos incluidos). */
export function coverageRuns(points: readonly TimelinePoint[]): CoverageRun[] {
  const runs: CoverageRun[] = [];
  points.forEach((p, i) => {
    const coverage = coverageOf(p);
    const last = runs.at(-1);
    if (last?.coverage === coverage) last.to = i;
    else runs.push({ coverage, from: i, to: i });
  });
  return runs;
}

/** Tramos con dato: las áreas se cortan en los huecos en vez de caer a cero. */
export function dataSegments(points: readonly TimelinePoint[]): [number, number][] {
  return coverageRuns(points)
    .filter((r) => r.coverage !== 'none')
    .reduce<[number, number][]>((segments, r) => {
      const last = segments.at(-1);
      if (last !== undefined && last[1] === r.from - 1) last[1] = r.to;
      else segments.push([r.from, r.to]);
      return segments;
    }, []);
}

/** Un número redondo igual o mayor que `max` (y al menos 5): la escala de una serie. */
export function niceCeil(max: number): number {
  for (const nice of [5, 10, 20, 25, 40, 50, 80, 100, 150, 200, 250, 400, 500, 1000]) {
    if (max <= nice) return nice;
  }
  return Math.ceil(max / 1000) * 1000;
}

/** Escala común para vacías y llenas: un número redondo igual o mayor que el máximo. */
export function niceMax(points: readonly TimelinePoint[]): number {
  let max = 1;
  for (const p of points) {
    if (p.stationsWithData > 0) max = Math.max(max, p.stationsEmpty, p.stationsFull);
  }
  return niceCeil(max);
}

/** Escala de una serie con huecos (valores nulos), que no cuentan. */
export function niceMaxOf(
  points: readonly TimelinePoint[],
  value: (p: TimelinePoint) => number | null,
): number {
  let max = 1;
  for (const p of points) {
    const v = value(p);
    if (v !== null) max = Math.max(max, v);
  }
  return niceCeil(max);
}

export interface HourMark {
  index: number;
  hour: number;
}

/** Pasos que caen en una hora en punto (hora de Barcelona), cada `every` horas. */
export function hourMarks(points: readonly TimelinePoint[], every = 1): HourMark[] {
  return points.flatMap((p, index) => {
    const { hour, minute } = localParts(Date.parse(p.at));
    return minute === 0 && hour % every === 0 ? [{ index, hour }] : [];
  });
}

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Área de una serie, cortada en los huecos. `project` lleva (paso, valor) a coordenadas del
 * SVG; el valor 0 es la base.
 */
export function areaPath(
  points: readonly TimelinePoint[],
  value: (p: TimelinePoint) => number,
  project: (index: number, value: number) => [number, number],
): string {
  let d = '';
  for (const [from, to] of dataSegments(points)) {
    const [bx, by] = project(from, 0);
    d += `M${f(bx)} ${f(by)}`;
    for (let i = from; i <= to; i++) {
      const point = points[i];
      if (point === undefined) continue;
      const [x, y] = project(i, value(point));
      d += `L${f(x)} ${f(y)}`;
    }
    const [ex, ey] = project(to, 0);
    d += `L${f(ex)} ${f(ey)}Z`;
  }
  return d;
}

/**
 * Línea de una serie con huecos: donde el valor es nulo no se dibuja nada (sin dato no es cero).
 * Un paso suelto entre huecos queda como un punto.
 */
export function linePath(
  points: readonly TimelinePoint[],
  value: (p: TimelinePoint) => number | null,
  project: (index: number, value: number) => [number, number],
): string {
  let d = '';
  // Pasos seguidos con valor en el tramo abierto: 0 si no hay tramo, 1 si es un punto suelto.
  let run = 0;
  for (const [i, p] of points.entries()) {
    const v = value(p);
    if (v === null) {
      if (run === 1) d += 'h0';
      run = 0;
      continue;
    }
    const [x, y] = project(i, v);
    d += `${run === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`;
    run += 1;
  }
  if (run === 1) d += 'h0';
  return d;
}

/** Agrupa los puntos por día de Barcelona. */
export function byLocalDay(points: readonly TimelinePoint[]): Map<string, TimelinePoint[]> {
  const days = new Map<string, TimelinePoint[]>();
  for (const p of points) {
    const { date } = localParts(Date.parse(p.at));
    const list = days.get(date);
    if (list === undefined) days.set(date, [p]);
    else list.push(p);
  }
  return days;
}
