import type { CoverageRequest } from '../../api/client';

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
export const MAX_ADDED = 50;

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
//   ?area=barcelona&radio=300&nuevas=2.11500,41.41800;2.17000,41.40000&movidas=7:2.18,41.39&quitadas=12,45
const PARAMS = {
  area: 'area',
  radius: 'radio',
  added: 'nuevas',
  moved: 'movidas',
  removed: 'quitadas',
};

const coordinate = (n: number) => n.toFixed(5);

function parsePoint(text: string): [number, number] | null {
  const [lon, lat] = text.split(',').map(Number);
  return lon !== undefined && lat !== undefined && Number.isFinite(lon) && Number.isFinite(lat)
    ? [lon, lat]
    : null;
}

export function scenarioFromParams(params: URLSearchParams): Scenario {
  const radius = Number(params.get(PARAMS.radius));
  const added = (params.get(PARAMS.added) ?? '')
    .split(';')
    .map(parsePoint)
    .filter((p): p is [number, number] => p !== null)
    .slice(0, MAX_ADDED)
    .map(([longitude, latitude], i) => ({ id: `h${String(i + 1)}`, longitude, latitude }));
  const moved = (params.get(PARAMS.moved) ?? '').split(';').flatMap((part): Moved[] => {
    const [id, point] = part.split(':');
    const station = Number(id);
    const position = point === undefined ? null : parsePoint(point);
    return Number.isInteger(station) && position !== null
      ? [{ station, longitude: position[0], latitude: position[1] }]
      : [];
  });
  const removed = (params.get(PARAMS.removed) ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  return {
    area: params.get(PARAMS.area) ?? DEFAULT_SCENARIO.area,
    radius:
      Number.isInteger(radius) && radius >= RADIUS_MIN && radius <= RADIUS_MAX
        ? radius
        : DEFAULT_SCENARIO.radius,
    added,
    moved,
    removed: [...new Set(removed)],
  };
}

/** Escribe el escenario en los parámetros; lo que coincide con el escenario por defecto se quita. */
export function scenarioToParams(s: Scenario, params: URLSearchParams): void {
  const set = (name: string, value: string) => {
    if (value === '') params.delete(name);
    else params.set(name, value);
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
      .map((m) => `${String(m.station)}:${coordinate(m.longitude)},${coordinate(m.latitude)}`)
      .join(';'),
  );
  set(PARAMS.removed, s.removed.join(','));
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
  return `Nueva ${id.replace(/^h/, '')}`;
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
