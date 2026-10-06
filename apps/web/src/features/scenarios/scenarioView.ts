import type { CoverageResponse, StationItem } from '../../api/client';
import { t } from '../../i18n';
import type { ChangeKind } from '../../i18n/types';
import { stationName } from '../stations/names';
import { hypotheticalName, type Scenario } from './scenario';

/** Herramienta activa sobre el mapa. Sin herramienta, el mapa solo se mira. */
export type Tool = 'add' | 'move' | 'remove' | null;

/** Las herramientas, en el orden de los botones. Nombre y ayuda: `t().scenario.tools`. */
export const TOOLS: readonly Exclude<Tool, null>[] = ['add', 'move', 'remove'];

export const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const GEOMETRY_TYPES = new Set(['Polygon', 'MultiPolygon', 'GeometryCollection']);

/** Geometría GeoJSON de la API (llega como `unknown`); vacía o de otro tipo, null. */
function asGeometry(geometry: unknown): GeoJSON.Geometry | null {
  if (typeof geometry !== 'object' || geometry === null) return null;
  const g = geometry as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (typeof g.type !== 'string' || !GEOMETRY_TYPES.has(g.type)) return null;
  const parts = g.type === 'GeometryCollection' ? g.geometries : g.coordinates;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  return geometry as GeoJSON.Geometry;
}

/** Una geometría vacía se dibuja como nada. */
export function asFeature(geometry: unknown): GeoJSON.Feature | GeoJSON.FeatureCollection {
  const g = asGeometry(geometry);
  return g === null ? EMPTY_GEOJSON : { type: 'Feature', geometry: g, properties: {} };
}

const samePlace = (
  a: { longitude: number; latitude: number } | undefined,
  b: { longitude: number; latitude: number } | undefined,
) => a !== undefined && b !== undefined && a.longitude === b.longitude && a.latitude === b.latitude;

/**
 * Círculos de alcance de las estaciones nuevas y movidas. Solo los que siguen valiendo para el
 * escenario a la vista: mientras llega el cálculo nuevo, uno de un sitio o un radio anteriores
 * diría algo falso. Cada uno lleva su clave (a-h1, m-409) para ocultarlo al arrastrar.
 */
export function reachData(
  r: CoverageResponse | undefined,
  s: Scenario,
): GeoJSON.FeatureCollection<GeoJSON.Geometry, { key: string }> {
  const features: GeoJSON.Feature<GeoJSON.Geometry, { key: string }>[] = [];
  if (r === undefined || r.radiusMeters !== s.radius)
    return { type: 'FeatureCollection', features };
  for (const reach of r.geometries.reach) {
    const geometry = asGeometry(reach.circle);
    if (geometry === null) continue;
    let key: string | null = null;
    if (reach.kind === 'added' && reach.added !== null) {
      const label = reach.added;
      const current = s.added.find((h) => h.id === label);
      if (
        samePlace(
          current,
          r.added.find((h) => h.id === label),
        )
      )
        key = `a-${label}`;
    } else if (reach.kind === 'moved' && reach.station !== null) {
      const station = reach.station;
      const current = s.moved.find((m) => m.station === station);
      if (
        samePlace(
          current,
          r.moved.find((m) => m.station === station),
        )
      ) {
        key = `m-${String(station)}`;
      }
    }
    if (key !== null) features.push({ type: 'Feature', geometry, properties: { key } });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * Por qué el escenario no mueve la superficie, si no la mueve. Sin explicación parece que no ha
 * pasado nada: una estación en zona ya cubierta, o fuera del área de estudio, no gana nada.
 * La respuesta tiene que ser la de este escenario (no una anterior).
 */
export function noEffectMessage(s: Scenario, r: CoverageResponse): string | null {
  const added = s.added.length;
  const moved = s.moved.length;
  const removed = s.removed.length;
  const { gainedSquareMeters: gained, lostSquareMeters: lost } = r.difference;
  if (added + moved + removed === 0 || gained !== 0 || lost !== 0) return null;

  const allOutside = (kind: 'added' | 'removed') => {
    const reach = r.geometries.reach.filter((x) => x.kind === kind);
    return reach.length > 0 && reach.every((x) => x.squareMetersInArea === 0);
  };
  return t().scenario.noEffect({
    added,
    moved,
    removed,
    municipality: r.studyArea.kind === 'municipality',
    areaName: r.studyArea.name,
    radius: r.radiusMeters,
    addedOutside: allOutside('added'),
    removedOutside: allOutside('removed'),
  });
}

export interface ChangeItem {
  key: string;
  name: string;
  what: ChangeKind;
  undo: () => void;
}

/** Los cambios del escenario, cada uno con su forma de deshacerlo. */
export function changeItems(
  scenario: Scenario,
  stations: readonly StationItem[],
  actions: { removeHypothetical: (id: string) => void; restoreStation: (id: number) => void },
): ChangeItem[] {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const nameOf = (id: number) => {
    const station = byId.get(id);
    return station === undefined ? t().scenario.stationFallback(id) : stationName(station);
  };
  return [
    ...scenario.added.map((h): ChangeItem => ({
      key: `a-${h.id}`,
      name: hypotheticalName(h.id),
      what: 'added',
      undo: () => {
        actions.removeHypothetical(h.id);
      },
    })),
    ...scenario.moved.map((m): ChangeItem => ({
      key: `m-${String(m.station)}`,
      name: nameOf(m.station),
      what: 'moved',
      undo: () => {
        actions.restoreStation(m.station);
      },
    })),
    ...scenario.removed.map((id): ChangeItem => ({
      key: `r-${String(id)}`,
      name: nameOf(id),
      what: 'removed',
      undo: () => {
        actions.restoreStation(id);
      },
    })),
  ];
}
