import { describe, expect, it } from 'vitest';
import type { StationState } from '../../api/client';
import { stationFixture } from '../../test/fixtures';
import {
  availabilityOf,
  countByAvailability,
  filterStations,
  AVAILABILITY_ORDER,
} from './availability';

function state(partial: Partial<StationState>): StationState {
  return {
    freshness: 'current',
    lastObservedAt: '2026-03-10T09:00:00+00:00',
    status: 'in_service',
    bikesAvailable: 10,
    mechanicalBikesAvailable: 6,
    ebikesAvailable: 4,
    docksAvailable: 10,
    bikesDisabled: 0,
    docksDisabled: 0,
    isRenting: true,
    isReturning: true,
    qualityFlags: [],
    ...partial,
  };
}

describe('availabilityOf', () => {
  it('trata la falta de dato como desconocido, nunca como cero', () => {
    expect(
      availabilityOf(state({ freshness: 'stale', status: 'unknown', bikesAvailable: null })),
    ).toBe('unknown');
    expect(
      availabilityOf(state({ freshness: 'none', status: 'unknown', bikesAvailable: null })),
    ).toBe('unknown');
    expect(availabilityOf(state({ bikesAvailable: null }))).toBe('unknown');
  });

  it('una estación cerrada con recuentos a cero está fuera de servicio, no vacía', () => {
    expect(availabilityOf(state({ status: 'closed', bikesAvailable: 0, docksAvailable: 0 }))).toBe(
      'outOfService',
    );
    expect(availabilityOf(state({ status: 'maintenance' }))).toBe('outOfService');
  });

  it('sin prestar ni admitir devoluciones cuenta como fuera de servicio; con uno de los dos, no', () => {
    expect(availabilityOf(state({ isRenting: false, isReturning: false }))).toBe('outOfService');
    expect(availabilityOf(state({ isRenting: false, isReturning: true }))).toBe('available');
    expect(availabilityOf(state({ isRenting: null, isReturning: null }))).toBe('available');
  });

  it('clasifica por bicis y anclajes', () => {
    expect(availabilityOf(state({ bikesAvailable: 0 }))).toBe('empty');
    expect(availabilityOf(state({ bikesAvailable: 12, docksAvailable: 0 }))).toBe('full');
    expect(availabilityOf(state({ bikesAvailable: 3 }))).toBe('few');
    expect(availabilityOf(state({ bikesAvailable: 1 }))).toBe('few');
    expect(availabilityOf(state({ bikesAvailable: 4 }))).toBe('available');
  });
});

describe('filterStations', () => {
  const stations = [
    stationFixture({ id: 1, name: 'Pl. de Sants', sourceStationId: 'demo-028' }),
    stationFixture({ id: 2, name: 'Estació de Sants', sourceStationId: 'demo-027' }),
    stationFixture({
      id: 3,
      name: 'Fòrum',
      sourceStationId: 'demo-043',
      state: { freshness: 'none', status: 'unknown', bikesAvailable: null, docksAvailable: null },
    }),
  ];
  const all = new Set(AVAILABILITY_ORDER);

  it('busca sin tener en cuenta acentos ni mayúsculas y ordena por nombre', () => {
    expect(filterStations(stations, 'FORUM', all).map((s) => s.id)).toEqual([3]);
    expect(filterStations(stations, 'sants', all).map((s) => s.name)).toEqual([
      'Estació de Sants',
      'Pl. de Sants',
    ]);
  });

  it('busca también por identificador de origen', () => {
    expect(filterStations(stations, 'demo-043', all).map((s) => s.id)).toEqual([3]);
  });

  it('oculta las categorías desactivadas', () => {
    const withoutUnknown = new Set(AVAILABILITY_ORDER.filter((c) => c !== 'unknown'));
    expect(filterStations(stations, '', withoutUnknown).map((s) => s.id)).not.toContain(3);
    expect(countByAvailability(stations).unknown).toBe(1);
  });
});
