import { describe, expect, it } from 'vitest';
import { stationFixture } from '../../test/fixtures';
import { AVAILABILITY_ORDER, filterStations } from './availability';
import { summarizeByDistrict, totalRow } from './districts';

const unknown = {
  freshness: 'stale',
  status: 'unknown',
  bikesAvailable: null,
  docksAvailable: null,
} as const;

const stations = [
  stationFixture({ id: 1, district: 'Eixample', state: { bikesAvailable: 0 } }),
  stationFixture({ id: 2, district: 'Eixample', state: { bikesAvailable: 12, docksAvailable: 0 } }),
  stationFixture({ id: 3, district: 'Eixample', state: unknown }),
  stationFixture({ id: 4, district: 'SantMartí', state: { bikesAvailable: 8 } }),
  // Cerrada con los recuentos a cero: ni vacía ni sin dato; cuenta entre las que informaron.
  stationFixture({
    id: 5,
    district: 'SantMartí',
    state: { status: 'closed', bikesAvailable: 0, docksAvailable: 0 },
  }),
  stationFixture({ id: 6, district: null, state: unknown }),
];

describe('resumen por distrito', () => {
  it('cuenta estaciones, sin bicis, llenas y sin dato aparte, y escribe el distrito para leerse', () => {
    expect(summarizeByDistrict(stations)).toEqual([
      { key: 'Eixample', name: 'Eixample', stations: 3, known: 2, empty: 1, full: 1, unknown: 1 },
      {
        key: 'SantMartí',
        name: 'Sant Martí',
        stations: 2,
        known: 2,
        empty: 0,
        full: 0,
        unknown: 0,
      },
      { key: '', name: 'Sin distrito', stations: 1, known: 0, empty: 0, full: 0, unknown: 1 },
    ]);
  });

  it('sin dato nunca suma a vacías: un distrito donde nadie informó no tiene ninguna vacía', () => {
    const silent = [
      stationFixture({ id: 1, district: 'Gràcia', state: unknown }),
      stationFixture({ id: 2, district: 'Gràcia', state: unknown }),
    ];
    const [row] = summarizeByDistrict(silent);
    expect(row).toMatchObject({ stations: 2, known: 0, empty: 0, unknown: 2 });
  });

  it('la suma de las filas es la ciudad', () => {
    expect(totalRow(summarizeByDistrict(stations))).toEqual({
      key: '*',
      name: 'Todos los distritos',
      stations: 6,
      known: 4,
      empty: 1,
      full: 1,
      unknown: 2,
    });
  });

  it('si la fuente no publica distritos (la demo), no hay filas', () => {
    expect(summarizeByDistrict([stationFixture({ id: 1, district: null })])).toEqual([]);
  });

  it('el filtro por distrito se suma a la búsqueda y a las categorías', () => {
    const all = new Set(AVAILABILITY_ORDER);
    const ids = (district: string | null) =>
      filterStations(stations, '', all, district).map((s) => s.id);
    expect(ids('Eixample')).toEqual([1, 2, 3]);
    expect(ids('')).toEqual([6]);
    expect(ids(null)).toHaveLength(6);
    const withoutUnknown = new Set(AVAILABILITY_ORDER.filter((c) => c !== 'unknown'));
    expect(filterStations(stations, '', withoutUnknown, 'Eixample').map((s) => s.id)).toEqual([
      1, 2,
    ]);
  });
});
