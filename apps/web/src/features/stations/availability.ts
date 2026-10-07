import type { StationItem, StationState } from '../../api/client';
import { t } from '../../i18n';
import { stationName } from './names';

/**
 * Categoría que se dibuja en el mapa y en la lista. Es presentación: la decide el
 * cliente a partir del estado que da la API, que ya trae «unknown» si el dato no vale.
 */
export type Availability = 'available' | 'few' | 'empty' | 'full' | 'outOfService' | 'unknown';

export const FEW_BIKES_MAX = 3;

/** Orden de la leyenda y de los filtros. */
export const AVAILABILITY_ORDER: readonly Availability[] = [
  'available',
  'few',
  'empty',
  'full',
  'outOfService',
  'unknown',
];

/** «Con bicis», «Sin dato reciente»… en el idioma de la interfaz. */
export function availabilityLabel(category: Availability): string {
  return t().availability.label[category];
}

/** «4 o más», «no es cero»… */
export function availabilityHint(category: Availability): string {
  return t().availability.hint(category, FEW_BIKES_MAX);
}

/**
 * Precedencia: sin dato fiable → desconocido; estación no operativa → fuera de servicio
 * (aunque sus recuentos sean cero, cerrada no es vacía); después, bicis y anclajes.
 * La línea temporal de la API cuenta vacías y llenas con la misma regla
 * (apps/api/Features/History/TimelineQuery.cs): si cambia aquí, cambia allí.
 */
export function availabilityOf(state: StationState): Availability {
  if (state.freshness !== 'current' || state.status === 'unknown') return 'unknown';
  if (state.status !== 'in_service') return 'outOfService';
  // En servicio pero sin prestar ni admitir devoluciones: en la práctica no opera.
  if (state.isRenting === false && state.isReturning === false) return 'outOfService';
  if (state.bikesAvailable === null) return 'unknown';
  if (state.bikesAvailable === 0) return 'empty';
  if (state.docksAvailable === 0) return 'full';
  if (state.bikesAvailable <= FEW_BIKES_MAX) return 'few';
  return 'available';
}

export function statusLabel(status: StationState['status']): string {
  return t().availability.status[status];
}

/** Explicación de una marca de calidad; si no se conoce, la marca tal cual. */
export function qualityFlagLabel(flag: string): string {
  return t().availability.quality[flag] ?? flag;
}

export function countByAvailability(
  stations: readonly StationItem[],
): Record<Availability, number> {
  const counts: Record<Availability, number> = {
    available: 0,
    few: 0,
    empty: 0,
    full: 0,
    outOfService: 0,
    unknown: 0,
  };
  for (const s of stations) counts[availabilityOf(s.state)]++;
  return counts;
}

/** Comparación de nombres en español: «Pl. d'Espanya» junto a «Pl. de…», acentos sin peso. */
const collator = new Intl.Collator('es', { sensitivity: 'base', ignorePunctuation: true });

/** Sin acentos ni mayúsculas, y sin los signos que se escriben de varias formas: «paral·lel»,
 *  «paral.lel» y «parallel» son lo mismo, y «d’Urgell» y «d'Urgell» también. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[·.'’`´]/g, '')
    .toLowerCase();
}

/**
 * Las estaciones que se ven en la lista y en el mapa: las de las categorías activas, las que
 * casan con la búsqueda y, si se ha elegido uno, las del distrito (`''` son las que no tienen).
 * Por nombre.
 */
export function filterStations(
  stations: readonly StationItem[],
  query: string,
  visible: ReadonlySet<Availability>,
  district: string | null = null,
): StationItem[] {
  const q = normalizeForSearch(query.trim());
  return (
    stations
      .filter((s) => visible.has(availabilityOf(s.state)))
      .filter((s) => district === null || (s.district ?? '') === district)
      .map((s) => ({ s, name: stationName(s) }))
      // Por el nombre que se ve y por el que publica la fuente, que puede traer palabras
      // cortadas; y por el barrio y el distrito: «Gràcia» o «Poblenou» no suelen ir en el nombre.
      .filter(
        ({ s, name }) =>
          q === '' ||
          normalizeForSearch(name).includes(q) ||
          normalizeForSearch(s.name).includes(q) ||
          normalizeForSearch(s.sourceStationId).includes(q) ||
          normalizeForSearch(s.neighbourhood ?? '').includes(q) ||
          normalizeForSearch(s.district ?? '').includes(q),
      )
      .sort((a, b) => collator.compare(a.name, b.name))
      .map(({ s }) => s)
  );
}

/**
 * Operativa, con dato y sin ninguna eléctrica publicada: la que se atenúa en el mapa cuando el
 * número es el de eléctricas. Sin desglose (null) no se sabe, y no se atenúa.
 */
export function lacksEbikes(station: StationItem): boolean {
  const category = availabilityOf(station.state);
  if (category === 'unknown' || category === 'outOfService') return false;
  return station.state.ebikesAvailable === 0;
}

/** Orden de la lista: por nombre o, de más a menos, por bicis, anclajes libres o eléctricas. */
export type ListOrder = 'name' | 'bikes' | 'docks' | 'ebikes';
export const LIST_ORDERS: readonly ListOrder[] = ['name', 'bikes', 'docks', 'ebikes'];

/** La cifra por la que se ordena; null si no se enseña (sin dato o fuera de servicio). */
function orderValue(station: StationItem, order: ListOrder): number | null {
  const category = availabilityOf(station.state);
  if (category === 'unknown' || category === 'outOfService') return null;
  switch (order) {
    case 'bikes':
      return station.state.bikesAvailable;
    case 'docks':
      return station.state.docksAvailable;
    case 'ebikes':
      return station.state.ebikesAvailable;
    case 'name':
      return null;
  }
}

/**
 * Ordena una lista que ya viene por nombre. Por cifras va de más a menos; las estaciones sin la
 * cifra (sin dato, fuera de servicio o una fuente que no la publica) quedan al final, y a igual
 * cifra se conserva el orden por nombre.
 */
export function sortStations(stations: readonly StationItem[], order: ListOrder): StationItem[] {
  if (order === 'name') return [...stations];
  return stations
    .map((s) => ({ s, value: orderValue(s, order) }))
    .sort((a, b) => {
      if (a.value === null) return b.value === null ? 0 : 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    })
    .map(({ s }) => s);
}
