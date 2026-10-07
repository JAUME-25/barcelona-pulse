import type { NumberMode } from './AvailabilityFilter';
import { AVAILABILITY_ORDER, type Availability, type ListOrder } from './availability';

// La vista de Explorar en la URL, para que un enlace lleve lo que se ve y sobreviva al cambio de
// idioma: qué categorías se ocultan, el distrito, la búsqueda, el orden de la lista y qué número
// llevan marcadores y lista. Sin parámetro, lo de siempre: todo visible, por nombre, bicis.

export const SEARCH_PARAM = 'buscar';
export const HIDE_PARAM = 'ocultar';
export const DISTRICT_PARAM = 'distrito';
export const ORDER_PARAM = 'orden';
export const NUMBER_PARAM = 'numero';

const CATEGORY_SLUG: Record<Availability, string> = {
  available: 'con-bicis',
  few: 'pocas',
  empty: 'sin-bicis',
  full: 'llenas',
  outOfService: 'fuera-de-servicio',
  unknown: 'sin-dato',
};

/** Las categorías visibles a partir de las ocultas en la URL («sin-dato,fuera-de-servicio»). */
export function visibleFromParam(value: string | null): ReadonlySet<Availability> {
  const hidden = new Set((value ?? '').split(',').filter((s) => s !== ''));
  return new Set(AVAILABILITY_ORDER.filter((c) => !hidden.has(CATEGORY_SLUG[c])));
}

/** Las ocultas, en el orden de la leyenda; null si se ve todo. */
export function hiddenParam(visible: ReadonlySet<Availability>): string | null {
  const hidden = AVAILABILITY_ORDER.filter((c) => !visible.has(c)).map((c) => CATEGORY_SLUG[c]);
  return hidden.length === 0 ? null : hidden.join(',');
}

const ORDER_SLUG: Record<ListOrder, string> = {
  name: 'nombre',
  bikes: 'bicis',
  docks: 'libres',
  ebikes: 'electricas',
};

export function orderFromParam(value: string | null): ListOrder {
  return (Object.keys(ORDER_SLUG) as ListOrder[]).find((o) => ORDER_SLUG[o] === value) ?? 'name';
}

export function orderParam(order: ListOrder): string | null {
  return order === 'name' ? null : ORDER_SLUG[order];
}

export function numberModeFromParam(value: string | null): NumberMode {
  return value === 'electricas' ? 'ebikes' : 'bikes';
}

export function numberModeParam(mode: NumberMode): string | null {
  return mode === 'ebikes' ? 'electricas' : null;
}

/** La búsqueda: null en la URL si está vacía. */
export function searchParam(query: string): string | null {
  return query === '' ? null : query;
}

/** La lista sigue al mapa: solo las estaciones de la parte que se ve (`lista=mapa`). */
export const LIST_PARAM = 'lista';

export function listFollowsMapFromParam(value: string | null): boolean {
  return value === 'mapa';
}

export function listFollowsMapParam(on: boolean): string | null {
  return on ? 'mapa' : null;
}
