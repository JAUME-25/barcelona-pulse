import { describe, expect, it } from 'vitest';
import type { StationState } from '../../api/client';
import { stationFixture } from '../../test/fixtures';
import {
  availabilityOf,
  countByAvailability,
  filterStations,
  sortStations,
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

  it('con los nombres de Bicing, encuentra igual el nombre que llega y el que se ve', () => {
    const real = [
      stationFixture({ id: 10, name: 'AV. PARAL.LEL, 132', sourceStationId: '133' }),
      stationFixture({ id: 11, name: "C/ DEL COMTE D'URGELL 75 B", sourceStationId: '134' }),
      stationFixture({
        id: 12,
        name: 'JARDINS DE CAN FERRERO/PG.DE LA ZONA FR',
        address: 'JARDINS DE CAN FERRERO/PG.DE LA ZONA FRANCA',
        sourceStationId: '135',
      }),
    ];
    const ids = (q: string) => filterStations(real, q, all).map((s) => s.id);
    expect(ids('paral·lel')).toEqual([10]);
    expect(ids('parallel')).toEqual([10]);
    expect(ids('PARAL.LEL')).toEqual([10]);
    expect(ids('comte d’urgell')).toEqual([11]);
    expect(ids("comte d'urgell")).toEqual([11]);
    expect(ids('zona franca')).toEqual([12]); // la fuente lo corta: «ZONA FR»
    // Ordenadas por el nombre que se ve: «Av. Paral·lel», «C/ del Comte…», «Jardins…».
    expect(ids('')).toEqual([10, 11, 12]);
  });

  it('oculta las categorías desactivadas', () => {
    const withoutUnknown = new Set(AVAILABILITY_ORDER.filter((c) => c !== 'unknown'));
    expect(filterStations(stations, '', withoutUnknown).map((s) => s.id)).not.toContain(3);
    expect(countByAvailability(stations).unknown).toBe(1);
  });

  it('busca también por barrio y por distrito, que no suelen ir en el nombre', () => {
    const real = [
      stationFixture({
        id: 20,
        name: 'C/ GRAN DE GRÀCIA, 141',
        district: 'Gràcia',
        neighbourhood: 'la Vila de Gràcia',
      }),
      stationFixture({
        id: 21,
        name: 'C/ PUJADES, 174',
        district: 'Sant Martí',
        neighbourhood: 'el Poblenou',
      }),
      stationFixture({ id: 22, name: 'C/ ARAGÓ, 288', district: 'Eixample', neighbourhood: null }),
    ];
    const ids = (q: string) => filterStations(real, q, all).map((s) => s.id);
    expect(ids('poblenou')).toEqual([21]);
    expect(ids('gracia')).toEqual([20]);
    expect(ids('sant marti')).toEqual([21]);
    expect(ids('eixample')).toEqual([22]);
  });
});

describe('sortStations', () => {
  const byName = [
    stationFixture({
      id: 1,
      name: 'A',
      state: { bikesAvailable: 3, docksAvailable: 20, ebikesAvailable: 0 },
    }),
    stationFixture({
      id: 2,
      name: 'B',
      state: { bikesAvailable: 12, docksAvailable: 5, ebikesAvailable: 7 },
    }),
    stationFixture({
      id: 3,
      name: 'C',
      state: { freshness: 'none', status: 'unknown', bikesAvailable: null, docksAvailable: null },
    }),
    stationFixture({
      id: 4,
      name: 'D',
      state: { bikesAvailable: 12, docksAvailable: 9, ebikesAvailable: 2 },
    }),
    stationFixture({
      id: 5,
      name: 'E',
      state: { status: 'closed', bikesAvailable: 0, docksAvailable: 0 },
    }),
  ];
  const ids = (list: readonly { id: number }[]) => list.map((s) => s.id);

  it('por nombre deja la lista como viene', () => {
    expect(ids(sortStations(byName, 'name'))).toEqual([1, 2, 3, 4, 5]);
  });

  it('por cifras va de más a menos, a igual cifra por nombre, y sin cifra al final', () => {
    // Sin dato y cerrada no enseñan cifras: no pueden ir entre las que sí.
    expect(ids(sortStations(byName, 'bikes'))).toEqual([2, 4, 1, 3, 5]);
    expect(ids(sortStations(byName, 'docks'))).toEqual([1, 4, 2, 3, 5]);
    expect(ids(sortStations(byName, 'ebikes'))).toEqual([2, 4, 1, 3, 5]);
  });

  it('una fuente que no publica la cifra la manda al final', () => {
    const noTypes = [
      stationFixture({ id: 6, name: 'F', state: { ebikesAvailable: null } }),
      stationFixture({ id: 7, name: 'G', state: { ebikesAvailable: 1 } }),
    ];
    expect(ids(sortStations(noTypes, 'ebikes'))).toEqual([7, 6]);
  });
});
