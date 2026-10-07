import { describe, expect, it } from 'vitest';
import type { TimelinePoint } from '../../api/client';
import { dialPaths } from './dial';
import {
  areaPath,
  coverageRuns,
  dataSegments,
  hourMarks,
  linePath,
  niceMax,
  niceMaxOf,
} from './series';

function point(at: string, withData: number, empty = 0, full = 0, known = 46): TimelinePoint {
  return {
    at,
    stationsKnown: known,
    stationsWithData: withData,
    stationsCounted: withData,
    stationsEmpty: empty,
    stationsFull: full,
    bikesAvailable: withData === 0 ? null : 100,
    docksAvailable: withData === 0 ? null : 100,
    stationsCountedEbikes: withData,
    ebikesAvailable: withData === 0 ? null : 40,
  };
}

// 05:50 a 06:15 UTC (06:50 a 07:15 en Barcelona) cada 5 minutos.
const points = [
  point('2026-03-10T05:50:00+00:00', 0),
  point('2026-03-10T05:55:00+00:00', 0),
  point('2026-03-10T06:00:00+00:00', 46, 2, 1),
  point('2026-03-10T06:05:00+00:00', 45, 3, 1),
  point('2026-03-10T06:10:00+00:00', 40, 3, 2),
  point('2026-03-10T06:15:00+00:00', 0),
];

describe('series de la línea temporal', () => {
  it('separa los tramos completos, incompletos y sin datos', () => {
    expect(coverageRuns(points)).toEqual([
      { coverage: 'none', from: 0, to: 1 },
      { coverage: 'complete', from: 2, to: 3 },
      { coverage: 'partial', from: 4, to: 4 },
      { coverage: 'none', from: 5, to: 5 },
    ]);
    expect(dataSegments(points)).toEqual([[2, 4]]);
  });

  it('las áreas se cortan en los huecos en vez de caer a cero', () => {
    const project = (i: number, v: number): [number, number] => [i, -v];
    expect(areaPath(points, (p) => p.stationsEmpty, project)).toBe('M2 0L2 -2L3 -3L4 -3L4 0Z');
    const withGap = [...points.slice(2, 4), points[0], points[4]].filter(
      (p): p is TimelinePoint => p !== undefined,
    );
    expect(areaPath(withGap, (p) => p.stationsEmpty, project).match(/M/g)).toHaveLength(2);
  });

  it('la escala es un número redondo, la misma para vacías y llenas', () => {
    expect(niceMax(points)).toBe(5);
    expect(niceMax([point('2026-08-20T07:00:00+00:00', 538, 79, 43, 540)])).toBe(80);
  });

  it('la línea de bicis se corta en los huecos y no baja a cero', () => {
    const project = (i: number, v: number): [number, number] => [i, -v];
    const bikes = [
      { ...point('2026-03-10T06:00:00+00:00', 46), bikesAvailable: 4000 },
      { ...point('2026-03-10T06:05:00+00:00', 46), bikesAvailable: 4200 },
      point('2026-03-10T06:10:00+00:00', 0), // hueco: nulo, no cero
      { ...point('2026-03-10T06:15:00+00:00', 46), bikesAvailable: 3900 },
      point('2026-03-10T06:20:00+00:00', 0),
    ];
    // Dos tramos: el segundo, de un solo paso, queda como un punto («h0»).
    expect(linePath(bikes, (p) => p.bikesAvailable, project)).toBe('M0 -4000L1 -4200M3 -3900h0');
    expect(linePath(bikes, () => null, project)).toBe('');
    expect(niceMaxOf(bikes, (p) => p.bikesAvailable)).toBe(5000);
    expect(niceMaxOf(bikes, () => null)).toBe(5);
  });

  it('marca las horas en punto en hora de Barcelona', () => {
    expect(hourMarks(points)).toEqual([{ index: 2, hour: 7 }]);
  });

  it('en los relojes, sin datos es una línea discontinua y no una barra de cero', () => {
    const shape = { c: 22, emptyR: 6, fullR: 14, band: 7, stepAngle: (2 * Math.PI) / 24 };
    const paths = dialPaths(points, 5, shape);
    expect(paths.gaps).not.toBe('');
    expect(paths.rings).not.toBe('');
    // Tres pasos con dato y vacías: tres sectores en la banda interior.
    expect(paths.empty.match(/M/g)).toHaveLength(3);
  });
});
