import type { CoverageRequest } from '../../api/client';
import { t } from '../../i18n';

/** Estación inventada para el escenario: no existe y nunca se guarda (ADR 0013). */
export interface Hypothetical {
  id: string;
  longitude: number;
  latitude: number;
}

/** Estación real que en el escenario está en otro sitio. */
export interface Moved {
  station: number;
  longitude: number;
  latitude: number;
}

export interface Scenario {
  area: string;
  radius: number;
  added: Hypothetical[];
  moved: Moved[];
  removed: number[];
}

export const RADIUS_MIN = 50;
export const RADIUS_MAX = 1000;
export const RADIUS_STEP = 50;
/** Los topes de la API (`CoverageQuery.MaxAdded`, `MaxMoved`, `MaxRemoved`). */
export const MAX_ADDED = 50;
export const MAX_MOVED = 100;
export const MAX_REMOVED = 100;

/** El rectángulo donde la API acepta estaciones (`IngestionRules.ServiceArea`). */
export const SERVICE_AREA = { west: 2.0, south: 41.28, east: 2.3, north: 41.5 };

export function insideServiceArea(longitude: number, latitude: number): boolean {
  return (
    longitude >= SERVICE_AREA.west &&
    longitude <= SERVICE_AREA.east &&
    latitude >= SERVICE_AREA.south &&
    latitude <= SERVICE_AREA.north
  );
}

export const DEFAULT_SCENARIO: Scenario = {
  area: 'barcelona',
  radius: 300,
  added: [],
  moved: [],
  removed: [],
};

// El escenario va en la URL para poder compartirlo:
//   ?area=barcelona&radio=300&nuevas=2.11500,41.41800;2.17000,41.40000&trasladadas=572:2.18,41.39&retiradas=12,45
// Las estaciones reales van con el identificador de la fuente (el que se ve en el detalle), no
// con el interno de la base: así el enlace vale en cualquier copia, como ?estacion=. Hasta el
// 7-10-2026 iban con el interno en «movidas» y «quitadas»: esos enlaces se siguen leyendo.
const PARAMS = {
  area: 'area',
  radius: 'radio',
  added: 'nuevas',
  moved: 'trasladadas',
  removed: 'retiradas',
  legacyMoved: 'movidas',
  legacyRemoved: 'quitadas',
};

/** Estaciones reales de un enlace, por su identificador en la fuente: aún sin el interno. */
export interface ScenarioLinks {
  moved: { station: string; longitude: number; latitude: number }[];
  removed: string[];
}

/** Lo justo de cada estación para pasar de un identificador a otro. */
export interface StationIds {
  id: number;
  sourceStationId: string;
}

const coordinate = (n: number) => n.toFixed(5);

function parsePoint(text: string): [number, number] | null {
  const [lon, lat] = text.split(',').map(Number);
  return lon !== undefined && lat !== undefined && Number.isFinite(lon) && Number.isFinite(lat)
    ? [lon, lat]
    : null;
}

function parseMoves<T>(text: string | null, id: (raw: string) => T | null) {
  return (text ?? '').split(';').flatMap((part) => {
    const [raw, point] = part.split(':');
    const station = raw === undefined ? null : id(raw);
    const position = point === undefined ? null : parsePoint(point);
    return station !== null && position !== null
      ? [{ station, longitude: position[0], latitude: position[1] }]
      : [];
  });
}

const internalId = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const sourceId = (raw: string) => (raw === '' ? null : decodeURIComponent(raw));

/**
 * El escenario de la URL. Las estaciones reales de «trasladadas» y «retiradas» llegan aparte
 * (`links`): hasta tener la red no se sabe su identificador interno (`resolveLinks`).
 */
export function scenarioFromParams(params: URLSearchParams): {
  scenario: Scenario;
  links: ScenarioLinks;
} {
  const radius = Number(params.get(PARAMS.radius));
  const added = (params.get(PARAMS.added) ?? '')
    .split(';')
    .map(parsePoint)
    .filter((p): p is [number, number] => p !== null)
    .slice(0, MAX_ADDED)
    .map(([longitude, latitude], i) => ({ id: `h${String(i + 1)}`, longitude, latitude }));
  const removed = (params.get(PARAMS.legacyRemoved) ?? '')
    .split(',')
    .map(internalId)
    .filter((id): id is number => id !== null);
  return {
    scenario: {
      area: params.get(PARAMS.area) ?? DEFAULT_SCENARIO.area,
      radius:
        Number.isInteger(radius) && radius >= RADIUS_MIN && radius <= RADIUS_MAX
          ? radius
          : DEFAULT_SCENARIO.radius,
      added,
      moved: parseMoves(params.get(PARAMS.legacyMoved), internalId),
      removed: [...new Set(removed)],
    },
    links: {
      moved: parseMoves(params.get(PARAMS.moved), sourceId),
      removed: (params.get(PARAMS.removed) ?? '')
        .split(',')
        .map(sourceId)
        .filter((id): id is string => id !== null),
    },
  };
}

/**
 * Con la red a la vista: las estaciones del enlace pasan a su identificador interno y las que no
 * están en esta red (otra copia, otro momento) se quedan fuera, también las de enlaces antiguos.
 */
export function resolveLinks(
  s: Scenario,
  links: ScenarioLinks,
  stations: readonly StationIds[],
): Scenario {
  const known = new Set(stations.map((st) => st.id));
  const idOf = new Map(stations.map((st) => [st.sourceStationId, st.id]));
  const moved = s.moved.filter((m) => known.has(m.station));
  for (const m of links.moved) {
    const station = idOf.get(m.station);
    if (station !== undefined && !moved.some((x) => x.station === station)) {
      moved.push({ station, longitude: m.longitude, latitude: m.latitude });
    }
  }
  const removed = new Set(s.removed.filter((id) => known.has(id)));
  for (const raw of links.removed) {
    const station = idOf.get(raw);
    if (station !== undefined) removed.add(station);
  }
  return {
    ...s,
    moved: moved.slice(0, MAX_MOVED),
    removed: [...removed]
      .filter((id) => !moved.some((m) => m.station === id))
      .slice(0, MAX_REMOVED),
  };
}

/**
 * Escribe el escenario en los parámetros; lo que coincide con el escenario por defecto se quita.
 * Las estaciones reales, con su identificador en la fuente (`sourceIdOf`).
 */
export function scenarioToParams(
  s: Scenario,
  params: URLSearchParams,
  sourceIdOf: (id: number) => string | undefined,
): void {
  const set = (name: string, value: string) => {
    if (value === '') params.delete(name);
    else params.set(name, value);
  };
  const station = (id: number) => {
    const raw = sourceIdOf(id);
    return raw === undefined ? [] : [encodeURIComponent(raw)];
  };
  set(PARAMS.area, s.area === DEFAULT_SCENARIO.area ? '' : s.area);
  set(PARAMS.radius, s.radius === DEFAULT_SCENARIO.radius ? '' : String(s.radius));
  set(
    PARAMS.added,
    s.added.map((h) => `${coordinate(h.longitude)},${coordinate(h.latitude)}`).join(';'),
  );
  set(
    PARAMS.moved,
    s.moved
      .flatMap((m) =>
        station(m.station).map(
          (raw) => `${raw}:${coordinate(m.longitude)},${coordinate(m.latitude)}`,
        ),
      )
      .join(';'),
  );
  set(PARAMS.removed, s.removed.flatMap(station).join(','));
  params.delete(PARAMS.legacyMoved);
  params.delete(PARAMS.legacyRemoved);
}

export function coverageRequest(
  s: Scenario,
  source: string,
  at: string | undefined,
): CoverageRequest {
  return {
    source,
    studyArea: s.area,
    radiusMeters: s.radius,
    at: at ?? null,
    added: s.added,
    moved: s.moved,
    removed: s.removed,
  };
}

/** «Nueva 3» para la etiqueta «h3». */
export function hypotheticalName(id: string): string {
  return t().scenario.newStation(id.replace(/^h/, ''));
}

/** Siguiente etiqueta libre: h1, h2… */
export function nextHypotheticalId(added: readonly Hypothetical[]): string {
  const used = new Set(added.map((h) => h.id));
  let n = 1;
  while (used.has(`h${String(n)}`)) n++;
  return `h${String(n)}`;
}

export function hasChanges(s: Scenario): boolean {
  return s.added.length > 0 || s.moved.length > 0 || s.removed.length > 0;
}
