import { describe, expect, it } from 'vitest';
import type { FramesResponse, StationState } from '../../api/client';
import { frameStation, stationFixture, stationsResponse } from '../../test/fixtures';
import { hourOf, latestFrameBefore, stationsAt } from './frames';

const state = (bikes: number): StationState => ({
  ...stationFixture().state,
  bikesAvailable: bikes,
});
const attrs = (id: number, name: string, capacity: number, assumedUntil: string | null = null) =>
  frameStation(stationFixture({ id, name, capacity }), assumedUntil);

// Dos pasos; la estación 1 cambia de capacidad entre ellos (dos versiones, mismo id).
const frames: FramesResponse = {
  source: stationsResponse([]).source,
  from: '2026-03-10T06:00:00+00:00',
  stepMinutes: 5,
  toleranceMinutes: 30,
  truncated: false,
  stations: [
    attrs(1, 'Pl. de Catalunya', 20, '2026-03-10T06:05:00+00:00'),
    attrs(1, 'Pl. de Catalunya', 30),
    attrs(2, 'Liceu', 25),
  ],
  frames: [
    {
      at: '2026-03-10T06:00:00+00:00',
      states: [
        { station: 0, state: state(5) },
        { station: 2, state: state(7) },
      ],
    },
    {
      at: '2026-03-10T06:05:00+00:00',
      states: [
        { station: 1, state: state(6) },
        { station: 2, state: state(8) },
      ],
    },
  ],
};

describe('fotogramas', () => {
  it('cada paso da las estaciones con la versión vigente y su estado', () => {
    const first = stationsAt(frames, '2026-03-10T06:00:00Z');
    expect(first?.at).toBe('2026-03-10T06:00:00+00:00');
    expect(first?.atBasis).toBe('requested');
    expect(first?.stations.map((s) => [s.id, s.capacity, s.state.bikesAvailable])).toEqual([
      [1, 20, 5],
      [2, 25, 7],
    ]);
    // Antes de publicarse, los atributos de la primera versión se asumen.
    expect(first?.stations[0]?.metadataAssumed).toBe(true);

    const second = stationsAt(frames, '2026-03-10T07:05:00+01:00');
    expect(second?.stations.map((s) => [s.id, s.capacity, s.state.bikesAvailable])).toEqual([
      [1, 30, 6],
      [2, 25, 8],
    ]);
    expect(second?.count).toBe(2);
  });

  it('un instante que no es un paso no se inventa', () => {
    expect(stationsAt(frames, '2026-03-10T06:02:00Z')).toBeUndefined();
  });

  it('mientras llega una hora, el último paso anterior ya cargado, dentro de la tolerancia', () => {
    expect(latestFrameBefore([frames], '2026-03-10T06:30:00Z')?.at).toBe(
      '2026-03-10T06:05:00+00:00',
    );
    expect(latestFrameBefore([frames], '2026-03-10T05:55:00Z')).toBeUndefined();
    // 35 minutos después del último paso cargado (tolerancia de 30): sería otro momento.
    expect(latestFrameBefore([frames], '2026-03-10T06:40:00Z')).toBeUndefined();
  });

  it('las ventanas son horas UTC, que coinciden con las de Barcelona', () => {
    expect(new Date(hourOf('2026-08-20T08:35:00+02:00')).toISOString()).toBe(
      '2026-08-20T06:00:00.000Z',
    );
  });
});
