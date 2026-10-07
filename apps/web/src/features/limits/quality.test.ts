import { describe, expect, it } from 'vitest';
import type { TimelinePoint } from '../../api/client';
import { hourGrid, qualitySummary, weeksOf } from './quality';

/** Pasos de 15 minutos desde las 00:00 de Barcelona del 20 de mayo (22:00 UTC del 19). */
function steps(count: number, withData: (i: number) => number, start = '2026-05-19T22:00:00Z') {
  const from = Date.parse(start);
  return Array.from({ length: count }, (_, i): TimelinePoint => ({
    at: new Date(from + i * 900_000).toISOString(),
    stationsKnown: 100,
    stationsWithData: withData(i),
    stationsCounted: 0,
    stationsEmpty: 0,
    stationsFull: 0,
    bikesAvailable: null,
    docksAvailable: null,
    stationsCountedEbikes: 0,
    ebikesAvailable: null,
  }));
}

describe('rejilla de huecos', () => {
  // Las 03:15 con el 80 % y las 05:00 sin datos; el resto, completo.
  const day = steps(96, (i) => (i === 13 ? 80 : i === 20 ? 0 : 99));

  it('cada hora lleva el peor paso de esa hora, y cada día el peor de todos', () => {
    const [row] = hourGrid(day, ['2026-05-20']);
    expect(row?.hours[2]).toBe('complete');
    expect(row?.hours[3]).toBe('partial');
    expect(row?.hours[5]).toBe('none');
    expect(row?.worst).toBe('none');
  });

  it('solo los días importados, en su orden', () => {
    const twoDays = [...day, ...steps(96, () => 99, '2026-05-20T22:00:00Z')];
    expect(hourGrid(twoDays, ['2026-05-21']).map((r) => r.day)).toEqual(['2026-05-21']);
    expect(hourGrid(twoDays, ['2026-05-21'])[0]?.worst).toBe('complete');
  });

  it('resume los pasos por debajo del 95 % y los días que los tienen', () => {
    const summary = qualitySummary(day, ['2026-05-20']);
    expect(summary.steps).toBe(96);
    expect(summary.incomplete).toBe(1);
    expect(summary.empty).toBe(1);
    expect(summary.daysWithGaps).toEqual(['2026-05-20']);
    expect(summary.average).toBeCloseTo((94 * 0.99 + 0.8) / 96, 6);
  });

  it('una petición por semana de lunes a domingo', () => {
    expect(weeksOf(['2026-05-04', '2026-05-10', '2026-05-11', '2026-08-20'])).toEqual([
      '2026-05-04',
      '2026-05-11',
      '2026-08-17',
    ]);
  });
});
