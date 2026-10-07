import { describe, expect, it } from 'vitest';
import { demoSource, observedSource } from '../../test/fixtures';
import { defaultDay, historicalInstant, instantOf, isClock, isWeekday } from './moment';

/** El histórico de prueba con otro final de periodo. */
const endingAt = (to: string) => ({
  ...observedSource,
  period: { from: '2026-08-19T22:00:00+00:00', to, observationCount: 300 },
});

const may = [
  '2026-05-25',
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-05-30',
  '2026-05-31',
];

describe('el día representativo', () => {
  it('es el último laborable importado, no el domingo con que acaba el mes', () => {
    expect(isWeekday('2026-05-29')).toBe(true);
    expect(isWeekday('2026-05-31')).toBe(false);
    expect(defaultDay(may)).toBe('2026-05-29');
  });

  it('sin laborables, el último día; sin días, ninguno', () => {
    expect(defaultDay(['2026-05-30', '2026-05-31'])).toBe('2026-05-31');
    expect(defaultDay([])).toBeNull();
  });
});

describe('una hora de reloj de un día de Barcelona', () => {
  it('es un instante en UTC, en verano y en invierno', () => {
    expect(instantOf('2026-08-20', '08:30')).toBe('2026-08-20T06:30:00.000Z');
    expect(instantOf('2026-01-15', '08:30')).toBe('2026-01-15T07:30:00.000Z');
    expect(instantOf('2026-08-20', '00:00')).toBe('2026-08-19T22:00:00.000Z');
  });

  it('en los días de cambio de hora sigue siendo esa hora de reloj', () => {
    // El 25-10-2026 (25 h) las 08:30 ya van en hora de invierno.
    expect(instantOf('2026-10-25', '08:30')).toBe('2026-10-25T07:30:00.000Z');
    // La hora repetida (de 02:00 a 03:00) es la primera vez que pasa.
    expect(instantOf('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
    // El 29-3-2026 (23 h) las 08:30 ya van en hora de verano.
    expect(instantOf('2026-03-29', '08:30')).toBe('2026-03-29T06:30:00.000Z');
    // Las 02:30 no existen ese día: el primer instante después (las 03:30).
    expect(instantOf('2026-03-29', '02:30')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('reconoce una hora de reloj válida', () => {
    expect(isClock('08:30')).toBe(true);
    expect(isClock('23:59')).toBe(true);
    expect(isClock('24:00')).toBe(false);
    expect(isClock('8:30')).toBe(false);
    expect(isClock(null)).toBe(false);
  });
});

describe('el instante que se enseña de un histórico', () => {
  it('sin pedir nada, el último laborable importado a las 08:30', () => {
    // El 20-8-2026 es jueves.
    expect(historicalInstant(observedSource, { day: null, time: null })).toBe(
      '2026-08-20T06:30:00.000Z',
    );
    // Acaba en domingo: el viernes, no el último día.
    const weekend = {
      ...endingAt('2026-08-23T21:55:00+00:00'),
      days: ['2026-08-21', '2026-08-22', '2026-08-23'],
    };
    expect(historicalInstant(weekend, { day: null, time: null })).toBe('2026-08-21T06:30:00.000Z');
  });

  it('el día y la hora pedidos, si el día está importado', () => {
    const week = { ...observedSource, days: ['2026-08-17', '2026-08-18', '2026-08-19'] };
    expect(historicalInstant(week, { day: '2026-08-18', time: '17:05' })).toBe(
      '2026-08-18T15:05:00.000Z',
    );
    // Solo el día: a las 08:30. Un día no importado: el representativo.
    expect(historicalInstant(week, { day: '2026-08-18', time: null })).toBe(
      '2026-08-18T06:30:00.000Z',
    );
    expect(historicalInstant(week, { day: '2026-08-25', time: '17:05' })).toBe(
      '2026-08-19T15:05:00.000Z',
    );
  });

  it('nunca después del último dato', () => {
    const morning = endingAt('2026-08-20T05:00:00+00:00');
    expect(historicalInstant(morning, { day: null, time: null })).toBe('2026-08-20T05:00:00+00:00');
  });

  it('sin días conocidos, los últimos del periodo; sin periodo, nada', () => {
    const noDays = { ...observedSource, days: [] };
    expect(historicalInstant(noDays, { day: null, time: null })).toBe('2026-08-20T06:30:00.000Z');
    expect(historicalInstant({ ...demoSource, period: null }, { day: null, time: null })).toBe(
      undefined,
    );
  });
});
