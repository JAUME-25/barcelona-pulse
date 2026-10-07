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
      // Por el nombre que se ve y por el que publica la fuente, que puede traer palabras cortadas.
      .filter(
        ({ s, name }) =>
          q === '' ||
          normalizeForSearch(name).includes(q) ||
          normalizeForSearch(s.name).includes(q) ||
          normalizeForSearch(s.sourceStationId).includes(q),
      )
      .sort((a, b) => collator.compare(a.name, b.name))
      .map(({ s }) => s)
  );
}
