import { describe, expect, it } from 'vitest';
import { demoSource, observedSource } from '../../test/fixtures';
import { instantFor, pickDefaultSource } from './useStationData';

describe('instantFor', () => {
  const lastData = Date.parse('2026-08-20T21:55:02+00:00');

  it('pide un laborable a las 08:30 de un histórico observado, o el momento pedido', () => {
    // El 20-8-2026 es jueves: las 08:30 de Barcelona son las 06:30 UTC.
    expect(instantFor(observedSource, lastData + 60 * 60_000)).toBe('2026-08-20T06:30:00.000Z');
    expect(
      instantFor(observedSource, lastData + 60 * 60_000, { day: '2026-08-20', time: '17:05' }),
    ).toBe('2026-08-20T15:05:00.000Z');
  });

  it('deja que la API use «ahora» si los datos observados están dentro de la tolerancia', () => {
    expect(instantFor(observedSource, lastData + 10 * 60_000)).toBeUndefined();
  });

  it('no fija instante para la demo: la API ya usa el final de sus datos', () => {
    expect(instantFor(demoSource, lastData)).toBeUndefined();
  });
});

describe('pickDefaultSource', () => {
  it('prefiere los datos observados a la demo y nunca las mezcla', () => {
    expect(pickDefaultSource([demoSource, observedSource])?.id).toBe('bicing-bcn');
    expect(pickDefaultSource([demoSource])?.id).toBe('demo');
    expect(pickDefaultSource([{ ...observedSource, period: null }, demoSource])?.id).toBe('demo');
  });
});
