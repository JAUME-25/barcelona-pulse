import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatLocalDay,
  lastLocalDays,
  localClock,
  localMidnight,
  localParts,
  weekDates,
  weekStart,
} from './time';

const hoursIn = (day: string) => (localMidnight(addDays(day, 1)) - localMidnight(day)) / 3_600_000;

describe('días de Barcelona', () => {
  it('la medianoche cambia con el horario de verano', () => {
    expect(new Date(localMidnight('2026-08-20')).toISOString()).toBe('2026-08-19T22:00:00.000Z');
    expect(new Date(localMidnight('2026-03-10')).toISOString()).toBe('2026-03-09T23:00:00.000Z');
  });

  it('los días de cambio de hora duran 23 y 25 horas', () => {
    expect(hoursIn('2026-03-29')).toBe(23);
    expect(hoursIn('2026-10-25')).toBe(25);
    expect(hoursIn('2026-08-20')).toBe(24);
  });

  it('se reproducen los últimos siete días del periodo', () => {
    // Una estación que no informa desde 2025 estira el periodo: cuentan los últimos días.
    expect(lastLocalDays('2025-06-12T08:54:16+00:00', '2026-08-23T21:55:00+00:00', 7)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ]);
    expect(lastLocalDays('2026-03-10T06:00:00+00:00', '2026-03-10T09:00:00+00:00', 7)).toEqual([
      '2026-03-10',
    ]);
  });

  it('las semanas van de lunes a domingo', () => {
    expect(weekStart('2026-08-20')).toBe('2026-08-17'); // jueves
    expect(weekStart('2026-08-17')).toBe('2026-08-17'); // lunes
    expect(weekStart('2026-08-23')).toBe('2026-08-17'); // domingo
    expect(weekStart('2026-03-01')).toBe('2026-02-23'); // cruza de mes
    expect(weekDates('2026-08-17')).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ]);
  });

  it('la fecha lleva el año y la hora es la de Barcelona', () => {
    expect(formatLocalDay('2026-08-23')).toBe('domingo, 23 de agosto de 2026');
    expect(localClock('2026-08-20T06:30:00+00:00')).toBe('08:30');
    expect(localParts(Date.parse('2026-08-19T22:00:00Z')).date).toBe('2026-08-20');
  });
});
