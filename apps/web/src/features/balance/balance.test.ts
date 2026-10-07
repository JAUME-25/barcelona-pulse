import { describe, expect, it } from 'vitest';
import { stationFixture, stationsResponse } from '../../test/fixtures';
import {
  clocksAfter,
  clocksBefore,
  computeBalance,
  defaultFrom,
  fromClock,
  signed,
  signedDecimal,
  storyDistricts,
} from './balance';

const before = stationsResponse([
  stationFixture({ id: 1, name: 'A', district: 'Eixample', state: { bikesAvailable: 2 } }),
  stationFixture({ id: 2, name: 'B', district: 'Eixample', state: { bikesAvailable: 20 } }),
  stationFixture({ id: 3, name: 'C', district: 'Gràcia', state: { bikesAvailable: 5 } }),
  // Sin dato al principio: no tiene balance aunque luego informe.
  stationFixture({
    id: 4,
    name: 'D',
    district: 'Gràcia',
    state: { freshness: 'stale', bikesAvailable: null },
  }),
  // Cerrada al principio: cerrada no es vacía, tampoco tiene balance.
  stationFixture({ id: 5, name: 'E', state: { status: 'closed', bikesAvailable: 0 } }),
  stationFixture({ id: 6, name: 'F', state: { bikesAvailable: 7 } }),
]);

const after = stationsResponse([
  stationFixture({ id: 1, name: 'A', district: 'Eixample', state: { bikesAvailable: 12 } }),
  stationFixture({ id: 2, name: 'B', district: 'Eixample', state: { bikesAvailable: 1 } }),
  stationFixture({ id: 3, name: 'C', district: 'Gràcia', state: { bikesAvailable: 5 } }),
  stationFixture({ id: 4, name: 'D', district: 'Gràcia', state: { bikesAvailable: 9 } }),
  stationFixture({ id: 5, name: 'E', state: { bikesAvailable: 3 } }),
  stationFixture({ id: 6, name: 'F', state: { bikesAvailable: 4 } }),
  // Nueva en el segundo momento: sin el primero, sin balance.
  stationFixture({ id: 7, name: 'G', state: { bikesAvailable: 4 } }),
]);

describe('computeBalance', () => {
  const balance = computeBalance(before, after);

  it('clasifica cada estación y nunca convierte la falta de dato en cero', () => {
    const kinds = Object.fromEntries(balance.rows.map((r) => [r.station.name, r.kind]));
    expect(kinds).toEqual({
      A: 'gain',
      B: 'loss',
      C: 'same',
      D: 'nodata',
      E: 'nodata',
      F: 'loss',
      G: 'nodata',
    });
    expect(balance.counts).toEqual({ gain: 1, loss: 2, same: 1, nodata: 3 });
    expect(balance.deltaById.get(1)).toBe(10);
    expect(balance.deltaById.get(4)).toBeNull();
    expect(balance.deltaById.get(7)).toBeNull();
  });

  it('suma lo ganado y lo perdido solo con las que tienen dato en los dos momentos', () => {
    expect(balance.gained).toBe(10);
    expect(balance.lost).toBe(-22);
    expect(balance.known).toBe(4);
    expect(balance.bikesBefore).toBe(34);
    expect(balance.bikesAfter).toBe(22);
    expect(balance.bikesAfter - balance.bikesBefore).toBe(balance.gained + balance.lost);
  });

  it('ordena las que más se llenan y las que más se vacían', () => {
    expect(balance.topGain.map((r) => [r.station.name, r.delta])).toEqual([['A', 10]]);
    expect(balance.topLoss.map((r) => [r.station.name, r.delta])).toEqual([
      ['B', -19],
      ['F', -3],
    ]);
  });

  it('resume por distrito, por estación, y deja fuera las que no tienen distrito', () => {
    expect(balance.districts.map((d) => [d.name, d.stations, d.net, d.perStation])).toEqual([
      ['Gràcia', 1, 0, 0],
      ['Eixample', 2, -9, -4.5],
    ]);
    expect(storyDistricts(balance.districts)).toEqual({ gainers: [], losers: ['Eixample'] });
  });

  it('agrupa por altitud en tres tercios, solo con bastantes estaciones que la publiquen', () => {
    const at = (id: number, altitude: number | null, bikes: number) =>
      stationFixture({ id, name: `S${String(id)}`, altitude, state: { bikesAvailable: bikes } });
    const start = stationsResponse([1, 2, 3, 4, 5, 6, 7].map((id) => at(id, null, 10)));
    // Seis con altitud (la 7 no): las bajas ganan, las altas pierden.
    const end = stationsResponse([
      at(1, 5, 16),
      at(2, 8, 14),
      at(3, 20, 11),
      at(4, 22, 9),
      at(5, 60, 4),
      at(6, 75, 2),
      at(7, null, 30),
    ]);
    const bands = computeBalance(start, end).altitudeBands;
    expect(bands.map((b) => [b.key, b.min, b.max, b.stations, b.net, b.perStation])).toEqual([
      ['low', null, 8, 2, 10, 5],
      ['mid', 8, 22, 2, 0, 0],
      ['high', 22, null, 2, -14, -7],
    ]);

    // Con cinco o menos, nada que comparar.
    const few = stationsResponse([1, 2, 3, 4, 5].map((id) => at(id, id * 10, 12)));
    expect(computeBalance(start, few).altitudeBands).toEqual([]);
  });

  it('sin distritos en la fuente no hay filas', () => {
    const plain = computeBalance(
      stationsResponse([stationFixture({ id: 1, state: { bikesAvailable: 1 } })]),
      stationsResponse([stationFixture({ id: 1, state: { bikesAvailable: 3 } })]),
    );
    expect(plain.districts).toEqual([]);
    expect(plain.counts.gain).toBe(1);
  });
});

describe('las dos horas', () => {
  it('la partida por defecto va tres horas antes, a la media hora, nunca antes de las 00:00', () => {
    expect(defaultFrom('10:00')).toBe('07:00');
    expect(defaultFrom('08:35')).toBe('05:30');
    expect(defaultFrom('01:15')).toBe('00:00');
  });

  it('la partida pedida vale si es una hora anterior a la llegada', () => {
    expect(fromClock('06:00', '10:00')).toBe('06:00');
    expect(fromClock('10:00', '10:00')).toBe('07:00');
    expect(fromClock('11:00', '10:00')).toBe('07:00');
    expect(fromClock('ayer', '10:00')).toBe('07:00');
    expect(fromClock(null, '09:30')).toBe('06:30');
  });

  it('cada selector ofrece solo las horas que dejan la partida antes de la llegada', () => {
    expect(clocksBefore('01:00')).toEqual(['00:00', '00:30']);
    expect(clocksAfter('23:00')).toEqual(['23:30']);
    expect(clocksAfter('23:30')).toEqual([]);
  });
});

describe('cifras con signo', () => {
  it('usa el signo menos tipográfico', () => {
    expect(signed(39)).toBe('+39');
    expect(signed(-23)).toBe('−23');
    expect(signed(0)).toBe('0');
    expect(signedDecimal(6.52)).toBe('+6,5');
    expect(signedDecimal(-0.44)).toBe('−0,4');
    expect(signedDecimal(0)).toBe('0,0');
  });
});
