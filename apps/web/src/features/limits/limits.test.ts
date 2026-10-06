import { describe, expect, it } from 'vitest';
import type { StationState, TimelinePoint } from '../../api/client';
import { stationFixture } from '../../test/fixtures';
import {
  gapText,
  listDays,
  periodText,
  silenceLabel,
  silenceOf,
  silentStations,
  type SilentStation,
} from './limits';

// 31 de mayo de 2026 a las 23:55 en Barcelona.
const AT = '2026-05-31T21:55:00+00:00';

function station(id: number, lastObservedAt: string | null, freshness: StationState['freshness']) {
  return stationFixture({
    id,
    name: `Estación ${String(id)}`,
    state: {
      freshness,
      lastObservedAt,
      status: freshness === 'current' ? 'in_service' : 'unknown',
    },
  });
}

function silent(lastObservedAt: string | null): SilentStation {
  const s = station(1, lastObservedAt, lastObservedAt === null ? 'none' : 'stale');
  return { station: s, silence: silenceOf(s, AT) ?? 'never' };
}

describe('estaciones sin dato', () => {
  it('distingue las que nunca han informado de las que llevan días, horas o minutos calladas', () => {
    expect(silenceOf(station(1, '2026-05-31T21:52:00+00:00', 'current'), AT)).toBeNull();
    expect(silenceOf(station(1, null, 'none'), AT)).toBe('never');
    expect(silenceOf(station(1, '2026-05-28T03:04:45+00:00', 'stale'), AT)).toBe('days');
    expect(silenceOf(station(1, '2026-05-31T19:40:00+00:00', 'stale'), AT)).toBe('hours');
    expect(silenceOf(station(1, '2026-05-31T21:39:38+00:00', 'stale'), AT)).toBe('minutes');
  });

  it('las ordena de la que más tiempo lleva callada a la que menos y deja fuera las que tienen dato', () => {
    const list = silentStations(
      [
        station(1, '2026-05-31T21:39:38+00:00', 'stale'),
        station(2, '2026-05-31T21:52:00+00:00', 'current'),
        station(3, '2025-06-12T08:54:16+00:00', 'stale'),
        station(4, null, 'none'),
        station(5, '2026-05-28T03:04:45+00:00', 'stale'),
      ],
      AT,
    );
    expect(list.map((s) => s.station.id)).toEqual([4, 3, 5, 1]);
  });

  it('dice el motivo con la fecha de Barcelona, y el año solo si no es el del momento', () => {
    expect(silenceLabel(silent(null), AT)).toBe('Ningún dato hasta este momento');
    expect(silenceLabel(silent('2026-05-28T03:04:45+00:00'), AT)).toBe(
      'Sin datos desde el 28 de mayo',
    );
    expect(silenceLabel(silent('2025-06-12T08:54:16+00:00'), AT)).toBe(
      'Sin datos desde el 12 de junio de 2025',
    );
    expect(silenceLabel(silent('2026-05-31T19:55:00+00:00'), AT)).toBe('2 h sin datos');
    expect(silenceLabel(silent('2026-05-31T21:39:00+00:00'), AT)).toBe('16 min sin datos');
  });
});

describe('periodo importado', () => {
  const may = Array.from({ length: 28 }, (_, i) => `2026-05-${String(i + 4).padStart(2, '0')}`);

  it('días seguidos', () => {
    expect(periodText(may)).toBe('del 4 al 31 de mayo de 2026');
    expect(periodText(['2026-08-20'])).toBe('el 20 de agosto de 2026');
    expect(periodText(['2026-04-30', '2026-05-01'])).toBe('del 30 de abril al 1 de mayo de 2026');
    expect(periodText(['2025-12-31', '2026-01-01'])).toBe(
      'del 31 de diciembre de 2025 al 1 de enero de 2026',
    );
  });

  it('con huecos, cada tramo', () => {
    expect(periodText([...may, '2026-08-17', '2026-08-18'])).toBe(
      'del 4 al 31 de mayo y del 17 al 18 de agosto de 2026',
    );
    expect(periodText([])).toBeNull();
  });

  it('lista de días por mes', () => {
    expect(listDays(['2026-05-06', '2026-05-13', '2026-05-20', '2026-05-27'])).toBe(
      '6, 13, 20 y 27 de mayo',
    );
    expect(listDays(['2026-05-06', '2026-08-26', '2026-08-27'])).toBe(
      '6 de mayo y 26 y 27 de agosto',
    );
  });
});

describe('huecos de un día', () => {
  /** Un día de mayo cada 5 minutos desde las 00:00 de Barcelona (22:00 UTC del día anterior). */
  function day(withData: (localMinute: number) => number): TimelinePoint[] {
    const start = Date.parse('2026-05-19T22:00:00Z');
    return Array.from({ length: 288 }, (_, i) => ({
      at: new Date(start + i * 300_000).toISOString(),
      stationsKnown: 100,
      stationsWithData: withData(i * 5),
      stationsCounted: 0,
      stationsEmpty: 0,
      stationsFull: 0,
      bikesAvailable: null,
      docksAvailable: null,
    }));
  }
  const at = (h: number, m: number) => h * 60 + m;

  it('sin huecos lo dice', () => {
    expect(gapText(day(() => 99))).toMatch(
      /^Todo el día con dato del 95\s% de las estaciones o más\.$/,
    );
  });

  it('da las horas de los tramos con menos del 95 % de las estaciones', () => {
    const points = day((m) => (m >= at(3, 10) && m <= at(4, 20) ? 80 : m === at(17, 40) ? 0 : 99));
    expect(gapText(points)).toMatch(
      /^Menos del 95\s% de las estaciones con dato de 03:10 a 04:20 y a las 17:40\.$/,
    );
  });

  it('con muchos tramos, los tres primeros y cuántos más', () => {
    const points = day((m) => ([at(1, 0), at(2, 0), at(3, 0), at(4, 0)].includes(m) ? 50 : 99));
    expect(gapText(points)).toMatch(
      /con dato a las 01:00, a las 02:00, a las 03:00 y 1 tramo más\.$/,
    );
  });

  it('un día sin ningún dato, y sin puntos nada', () => {
    expect(gapText(day(() => 0))).toBe('Sin datos en todo el día.');
    expect(gapText([])).toBeNull();
  });
});
