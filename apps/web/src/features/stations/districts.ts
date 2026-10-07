import type { StationItem } from '../../api/client';
import { t } from '../../i18n';
import { availabilityOf } from './availability';
import { districtName } from './names';

/** Clave del filtro para las estaciones cuya fuente no publica distrito. */
export const NO_DISTRICT = '';

/**
 * Resumen de un distrito en el momento mostrado. «Sin dato» va aparte y nunca suma a vacías ni
 * a llenas: una estación que no informó no se sabe cómo estaba. `known` son las que sí informaron
 * (con las fuera de servicio): si es 0, de vacías y llenas no se puede decir ni cero.
 */
export interface DistrictRow {
  key: string;
  name: string;
  stations: number;
  known: number;
  empty: number;
  full: number;
  unknown: number;
}

/** Clave del distrito de una estación, tal como lo publica la fuente. */
export function districtKey(station: Pick<StationItem, 'district'>): string {
  return station.district ?? NO_DISTRICT;
}

/**
 * Las estaciones agrupadas por distrito, de más a menos estaciones, con las que no tienen
 * distrito al final. Si ninguna lo tiene (la demo), no hay filas: no hay nada que resumir.
 */
export function summarizeByDistrict(stations: readonly StationItem[]): DistrictRow[] {
  const rows = new Map<string, DistrictRow>();
  let withDistrict = 0;
  for (const s of stations) {
    const key = districtKey(s);
    if (key !== NO_DISTRICT) withDistrict += 1;
    let row = rows.get(key);
    if (row === undefined) {
      row = {
        key,
        name: key === NO_DISTRICT ? t().districts.none : districtName(key),
        stations: 0,
        known: 0,
        empty: 0,
        full: 0,
        unknown: 0,
      };
      rows.set(key, row);
    }
    row.stations += 1;
    const category = availabilityOf(s.state);
    if (category === 'unknown') row.unknown += 1;
    else row.known += 1;
    if (category === 'empty') row.empty += 1;
    if (category === 'full') row.full += 1;
  }
  if (withDistrict === 0) return [];
  return [...rows.values()].sort((a, b) => {
    if (a.key === NO_DISTRICT) return 1;
    if (b.key === NO_DISTRICT) return -1;
    return b.stations - a.stations || a.name.localeCompare(b.name, 'es');
  });
}

/** La suma de todas las filas: la ciudad entera en ese momento. */
export function totalRow(rows: readonly DistrictRow[]): DistrictRow {
  const total: DistrictRow = {
    key: '*',
    name: t().districts.all,
    stations: 0,
    known: 0,
    empty: 0,
    full: 0,
    unknown: 0,
  };
  for (const r of rows) {
    total.stations += r.stations;
    total.known += r.known;
    total.empty += r.empty;
    total.full += r.full;
    total.unknown += r.unknown;
  }
  return total;
}
