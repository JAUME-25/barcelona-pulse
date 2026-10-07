import { describe, expect, it } from 'vitest';
import type { PatternHour, StationPatternResponse } from '../../api/client';
import { stationsResponse } from '../../test/fixtures';
import { hoursOf, partsPresent, peakHour, shareOf, totalShare, withBikesShare } from './pattern';

const hour = (h: number, counts: Partial<PatternHour> = {}): PatternHour => ({
  dayType: 'weekday',
  hour: h,
  steps: 4,
  unknown: 0,
  outOfService: 0,
  empty: 0,
  few: 0,
  available: 4,
  full: 0,
  medianBikes: 8,
  ...counts,
});

const pattern = (hours: PatternHour[]): StationPatternResponse => ({
  source: stationsResponse([]).source,
  stationId: 1,
  sourceStationId: 'demo-001',
  stepMinutes: 15,
  toleranceMinutes: 30,
  fewBikesMax: 3,
  weekdays: ['2026-03-10'],
  weekendDays: [],
  hours,
});

describe('patrón de la estación', () => {
  it('cada hora lleva su mediana y la parte de pasos con alguna bici', () => {
    const rows = hoursOf(
      pattern([
        hour(8, { empty: 3, few: 1, available: 0, medianBikes: 2 }),
        hour(9, { unknown: 4, available: 0, medianBikes: null }),
        hour(10, { available: 2, full: 2 }),
      ]),
      'weekday',
    );
    const row = (h: number) => {
      const found = rows[h];
      if (found === undefined) throw new Error(`Falta la hora ${String(h)}.`);
      return found;
    };
    expect(row(8).medianBikes).toBe(2);
    expect(withBikesShare(row(8))).toBe(0.25);
    expect(row(9).medianBikes).toBeNull();
    expect(withBikesShare(row(9))).toBe(0);
    expect(withBikesShare(row(10))).toBe(1);
    // Una hora sin pasos: ni mediana ni parte.
    expect(row(3).medianBikes).toBeNull();
    expect(withBikesShare(row(3))).toBe(0);
  });

  it('siempre 24 horas; la que no tiene pasos no se cuenta como vacía', () => {
    // El día que se adelanta la hora no hay 2:00.
    const rows = hoursOf(
      pattern(Array.from({ length: 24 }, (_, h) => hour(h)).filter((h) => h.hour !== 2)),
      'weekday',
    );
    expect(rows).toHaveLength(24);
    const two = rows[2];
    expect(two).toMatchObject({ hour: 2, steps: 0 });
    if (two !== undefined) expect(shareOf(two, 'empty')).toBe(0);
    expect(partsPresent(rows)).toEqual(['available', 'unknown']);
  });

  it('la hora en que más veces se quedó vacía, solo si llega al 10 %', () => {
    const rows = hoursOf(
      pattern([
        hour(8, { empty: 2, available: 2 }),
        hour(9, { empty: 3, available: 1 }),
        hour(19, { empty: 3, available: 1 }),
      ]),
      'weekday',
    );
    // Con empate, la primera del día.
    expect(peakHour(rows, 'empty')).toEqual({ hour: 9, share: 0.75 });
    expect(peakHour(rows, 'full')).toBeNull();
    const rare = hoursOf(pattern([hour(8, { steps: 40, empty: 3, available: 37 })]), 'weekday');
    expect(peakHour(rare, 'empty')).toBeNull();
  });

  it('cuánto falta de dato en todo el día', () => {
    const rows = hoursOf(
      pattern([hour(0, { unknown: 4, available: 0 }), hour(1), hour(2), hour(3)]),
      'weekday',
    );
    expect(totalShare(rows, 'unknown')).toBe(0.25);
  });
});
