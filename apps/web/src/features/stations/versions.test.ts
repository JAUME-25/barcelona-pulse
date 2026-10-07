import { describe, expect, it } from 'vitest';
import type { StationVersionItem } from '../../api/client';
import { sortVersions, versionSteps } from './versions';

const version = (extra: Partial<StationVersionItem> = {}): StationVersionItem => ({
  name: 'PL. DE CATALUNYA',
  address: null,
  district: 'Eixample',
  neighbourhood: null,
  longitude: 2.1699,
  latitude: 41.387,
  capacity: 27,
  validFrom: null,
  validTo: null,
  firstSeenAt: '2026-05-04T05:00:00+00:00',
  ...extra,
});

describe('los cambios de una estación', () => {
  it('ordena por vigencia, con la primera conocida (sin validFrom) delante', () => {
    const sorted = sortVersions([
      version({ validFrom: '2026-05-20T08:00:00+00:00', capacity: 30 }),
      version({ validFrom: '2026-05-12T08:00:00+00:00', capacity: 28 }),
      version({ validTo: '2026-05-12T08:00:00+00:00' }),
    ]);
    expect(sorted.map((v) => v.capacity)).toEqual([27, 28, 30]);
  });

  it('dice qué cambió en cada versión nueva: capacidad, nombre, dirección y metros movidos', () => {
    const steps = versionSteps([
      version({ validTo: '2026-05-12T08:00:00+00:00', capacity: 24 }),
      version({
        validFrom: '2026-05-12T08:00:00+00:00',
        validTo: '2026-05-20T08:00:00+00:00',
        capacity: 27,
        longitude: 2.1699 + 0.0004,
      }),
      version({
        validFrom: '2026-05-20T08:00:00+00:00',
        name: 'PL. CATALUNYA',
        address: 'Pl. de Catalunya, 1',
        longitude: 2.1699 + 0.0004,
      }),
    ]);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.at).toBe('2026-05-12T08:00:00+00:00');
    expect(steps[0]?.changes.map((c) => c.kind)).toEqual(['capacity', 'moved']);
    const moved = steps[0]?.changes[1];
    expect(moved?.kind === 'moved' && Math.round(moved.meters)).toBeGreaterThan(30);
    expect(steps[1]?.changes.map((c) => c.kind)).toEqual(['name', 'address']);
  });

  it('un cambio de ubicación por debajo del metro no cuenta como traslado', () => {
    const steps = versionSteps([
      version({ validTo: '2026-05-12T08:00:00+00:00' }),
      version({
        validFrom: '2026-05-12T08:00:00+00:00',
        longitude: 2.1699 + 0.000005,
        capacity: 20,
      }),
    ]);
    expect(steps[0]?.changes.map((c) => c.kind)).toEqual(['capacity']);
  });

  it('con una sola versión no hay cambios', () => {
    expect(versionSteps([version()])).toEqual([]);
    expect(versionSteps([])).toEqual([]);
  });
});
