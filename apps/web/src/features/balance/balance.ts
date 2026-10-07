import type { StationItem, StationsResponse } from '../../api/client';
import { numberFormat } from '../../i18n/intl';
import { availabilityOf } from '../stations/availability';
import { districtKey, NO_DISTRICT } from '../stations/districts';
import { isClock } from '../history/moment';
import { districtName } from '../stations/names';

// Balance entre dos horas del mismo día: las bicis ancladas en cada estación en el segundo
// momento menos las del primero. Son dos estados, no viajes: lo que entra y sale entre medias no
// se ve. Una estación sin dato fiable o fuera de servicio en cualquiera de los dos momentos no
// tiene balance («sin dato»), nunca cero.

export type BalanceKind = 'gain' | 'loss' | 'same' | 'nodata';

export const BALANCE_KINDS: readonly BalanceKind[] = ['gain', 'loss', 'same', 'nodata'];

export interface BalanceRow {
  /** La estación en el segundo momento: sus atributos y su estado de entonces. */
  station: StationItem;
  before: number | null;
  after: number | null;
  /** `after - before` cuando los dos se conocen. */
  delta: number | null;
  kind: BalanceKind;
}

export interface BalanceDistrict {
  key: string;
  name: string;
  /** Estaciones con balance (con dato en los dos momentos). */
  stations: number;
  net: number;
  perStation: number;
}

export interface Balance {
  rows: readonly BalanceRow[];
  /** El balance de cada estación por su id, para el mapa; null, sin dato. */
  deltaById: ReadonlyMap<number, number | null>;
  counts: Record<BalanceKind, number>;
  /** Suma de lo que ganan las que ganan y (negativa) de lo que pierden las que pierden. */
  gained: number;
  lost: number;
  /** Estaciones con dato en los dos momentos y sus bicis ancladas en cada uno. */
  known: number;
  bikesBefore: number;
  bikesAfter: number;
  topGain: readonly BalanceRow[];
  topLoss: readonly BalanceRow[];
  /** De más a menos balance por estación. Vacío si la fuente no publica distritos. */
  districts: readonly BalanceDistrict[];
}

/** Cuántas estaciones salen en «las que más se llenan» y «las que más se vacían». */
export const TOP_ROWS = 6;

/** Bicis ancladas si el estado es fiable: con dato reciente y en servicio. Si no, null. */
function bikesOf(station: StationItem): number | null {
  const category = availabilityOf(station.state);
  if (category === 'unknown' || category === 'outOfService') return null;
  return station.state.bikesAvailable;
}

function kindOf(delta: number | null): BalanceKind {
  if (delta === null) return 'nodata';
  return delta > 0 ? 'gain' : delta < 0 ? 'loss' : 'same';
}

export function computeBalance(before: StationsResponse, after: StationsResponse): Balance {
  const earlier = new Map(before.stations.map((s) => [s.id, s]));
  const rows: BalanceRow[] = after.stations.map((station) => {
    const first = earlier.get(station.id);
    const bikesBefore = first === undefined ? null : bikesOf(first);
    const bikesAfter = bikesOf(station);
    const delta = bikesBefore === null || bikesAfter === null ? null : bikesAfter - bikesBefore;
    return { station, before: bikesBefore, after: bikesAfter, delta, kind: kindOf(delta) };
  });

  const counts: Record<BalanceKind, number> = { gain: 0, loss: 0, same: 0, nodata: 0 };
  let gained = 0;
  let lost = 0;
  let bikesBefore = 0;
  let bikesAfter = 0;
  const districts = new Map<string, BalanceDistrict>();
  for (const row of rows) {
    counts[row.kind] += 1;
    if (row.delta === null || row.before === null || row.after === null) continue;
    if (row.delta > 0) gained += row.delta;
    else lost += row.delta;
    bikesBefore += row.before;
    bikesAfter += row.after;
    const key = districtKey(row.station);
    if (key === NO_DISTRICT) continue;
    let district = districts.get(key);
    if (district === undefined) {
      district = { key, name: districtName(key), stations: 0, net: 0, perStation: 0 };
      districts.set(key, district);
    }
    district.stations += 1;
    district.net += row.delta;
  }
  for (const d of districts.values()) d.perStation = d.net / d.stations;

  const known = rows.filter((r) => r.delta !== null);
  const byDelta = (sign: 1 | -1) =>
    known
      .filter((r) => (r.delta ?? 0) * sign > 0)
      .sort((a, b) => ((b.delta ?? 0) - (a.delta ?? 0)) * sign)
      .slice(0, TOP_ROWS);

  return {
    rows,
    deltaById: new Map(rows.map((r) => [r.station.id, r.delta])),
    counts,
    gained,
    lost,
    known: known.length,
    bikesBefore,
    bikesAfter,
    topGain: byDelta(1),
    topLoss: byDelta(-1),
    districts: [...districts.values()].sort(
      (a, b) => b.perStation - a.perStation || a.name.localeCompare(b.name, 'es'),
    ),
  };
}

/** Los distritos que más ganan y los que más pierden por estación, hasta tres de cada. */
export function storyDistricts(districts: readonly BalanceDistrict[]): {
  gainers: string[];
  losers: string[];
} {
  return {
    gainers: districts
      .filter((d) => d.net > 0)
      .slice(0, 3)
      .map((d) => d.name),
    losers: [...districts]
      .filter((d) => d.net < 0)
      .sort((a, b) => a.perStation - b.perStation)
      .slice(0, 3)
      .map((d) => d.name),
  };
}

const MINUS = '−';

/** «+39», «−23», «0»: con el signo menos tipográfico, no el guion. */
export function signed(n: number): string {
  if (n > 0) return `+${String(n)}`;
  if (n < 0) return `${MINUS}${String(-n)}`;
  return '0';
}

/** «+6,5» (o «+6.5» en inglés): el balance por estación de un distrito. */
export function signedDecimal(n: number): string {
  const text = numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Math.abs(n),
  );
  if (n > 0) return `+${text}`;
  if (n < 0) return `${MINUS}${text}`;
  return text;
}

// Las dos horas, en pasos de media hora: 48 opciones caben en un selector.
const pad = (n: number) => String(n).padStart(2, '0');

export const HALF_HOURS: readonly string[] = Array.from(
  { length: 48 },
  (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 === 0 ? '00' : '30'}`,
);

/** Hora de llegada si nadie pide otra: el final de la punta de la mañana. */
export const DEFAULT_TO = '10:00';

/** Parámetro de la URL con la hora de partida (`desde=07:00`). La de llegada es `hora`. */
export const FROM_PARAM = 'desde';

function minutesOf(clock: string): number {
  const [h = 0, m = 0] = clock.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Hora de partida si nadie la pide: tres horas antes de la de llegada, a la media hora anterior
 * y nunca antes de las 00:00. De las 10:00, las 07:00; de las 01:15, las 00:00.
 */
export function defaultFrom(to: string): string {
  const minutes = Math.max(0, Math.floor((minutesOf(to) - 180) / 30) * 30);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** La hora de partida pedida, si es una hora y va antes de la de llegada; si no, la de siempre. */
export function fromClock(requested: string | null, to: string): string {
  return isClock(requested) && minutesOf(requested) < minutesOf(to) ? requested : defaultFrom(to);
}

/** Horas que valen como partida (antes de la llegada) o como llegada (después de la partida). */
export function clocksBefore(to: string): string[] {
  return HALF_HOURS.filter((c) => minutesOf(c) < minutesOf(to));
}

export function clocksAfter(from: string): string[] {
  return HALF_HOURS.filter((c) => minutesOf(c) > minutesOf(from));
}
