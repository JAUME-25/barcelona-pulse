import type { StationItem, StationState } from '../../api/client';

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

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: 'Con bicis',
  few: 'Pocas bicis',
  empty: 'Sin bicis',
  full: 'Llena',
  outOfService: 'Fuera de servicio',
  unknown: 'Sin dato reciente',
};

export const AVAILABILITY_HINT: Record<Availability, string> = {
  available: `${FEW_BIKES_MAX + 1} o más`,
  few: `de 1 a ${FEW_BIKES_MAX}`,
  empty: 'ninguna libre',
  full: 'sin anclajes libres',
  outOfService: 'no opera',
  unknown: 'no es cero',
};

/**
 * Precedencia: sin dato fiable → desconocido; estación no operativa → fuera de servicio
 * (aunque sus recuentos sean cero, cerrada no es vacía); después, bicis y anclajes.
 */
export function availabilityOf(state: StationState): Availability {
  if (state.freshness !== 'current' || state.status === 'unknown') return 'unknown';
  if (state.status !== 'in_service') return 'outOfService';
  if (state.bikesAvailable === null) return 'unknown';
  if (state.bikesAvailable === 0) return 'empty';
  if (state.docksAvailable === 0) return 'full';
  if (state.bikesAvailable <= FEW_BIKES_MAX) return 'few';
  return 'available';
}

export const STATUS_LABEL: Record<StationState['status'], string> = {
  in_service: 'En servicio',
  maintenance: 'En mantenimiento',
  closed: 'Cerrada',
  planned: 'Prevista',
  unknown: 'Desconocido',
};

export const QUALITY_FLAG_LABEL: Record<string, string> = {
  counts_exceed_capacity: 'Bicis y anclajes suman más que la capacidad publicada.',
  bike_types_mismatch: 'Mecánicas y eléctricas no suman el total publicado.',
};

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

export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterStations(
  stations: readonly StationItem[],
  query: string,
  visible: ReadonlySet<Availability>,
): StationItem[] {
  const q = normalizeForSearch(query.trim());
  return stations
    .filter((s) => visible.has(availabilityOf(s.state)))
    .filter(
      (s) =>
        q === '' ||
        normalizeForSearch(s.name).includes(q) ||
        normalizeForSearch(s.sourceStationId).includes(q),
    )
    .sort((a, b) => collator.compare(a.name, b.name));
}
