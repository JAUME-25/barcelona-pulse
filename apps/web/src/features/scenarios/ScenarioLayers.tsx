import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLat,
  MapLayerMouseEvent,
  MapLayerTouchEvent,
  Map as MapLibreMap,
  MapMouseEvent,
  MapTouchEvent,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { CoverageResponse, StationItem } from '../../api/client';
import { THEME } from '../../app/theme';
import { BUILDINGS_LAYER, HALO_LAYER, MARKERS_LAYER, NETWORK_IMAGE } from '../stations/mapLayers';
import { PIXEL_RATIO } from '../stations/markerImages';
import type { Scenario } from './scenario';
import { createGhostImage, createHatchImage, createHypotheticalImage } from './scenarioImages';
import { asFeature, EMPTY_GEOJSON as EMPTY, reachData, type Tool } from './scenarioView';

export interface ScenarioActions {
  add: (longitude: number, latitude: number) => void;
  moveHypothetical: (id: string, longitude: number, latitude: number) => void;
  removeHypothetical: (id: string) => void;
  moveStation: (station: number, longitude: number, latitude: number) => void;
}

interface ScenarioLayersProps {
  map: MapLibreMap | null;
  /** Último cálculo (puede ser el anterior mientras llega el nuevo). */
  result: CoverageResponse | undefined;
  scenario: Scenario;
  /** Red base en su sitio real: para dibujar el hueco de las quitadas y movidas. */
  stations: readonly StationItem[];
  tool: Tool;
  actions: ScenarioActions;
}

const S = {
  area: 'bp-scn-area',
  base: 'bp-scn-base',
  gained: 'bp-scn-gained',
  lost: 'bp-scn-lost',
  scenario: 'bp-scn-scenario',
  reach: 'bp-scn-reach',
  links: 'bp-scn-links',
  ghosts: 'bp-scn-ghosts',
  added: 'bp-scn-added',
  drag: 'bp-scn-drag',
} as const;

const L = {
  baseFill: 'bp-scn-base-fill',
  gainedFill: 'bp-scn-gained-fill',
  lostFill: 'bp-scn-lost-fill',
  scenarioLine: 'bp-scn-scenario-line',
  areaLine: 'bp-scn-area-line',
  reachCasing: 'bp-scn-reach-casing',
  reach: 'bp-scn-reach',
  links: 'bp-scn-links',
  ghosts: 'bp-scn-ghosts',
  added: 'bp-scn-added',
  drag: 'bp-scn-drag',
} as const;

const IMAGES = {
  hypothetical: 'bp-scn-hypothetical',
  removed: 'bp-scn-removed',
  movedFrom: 'bp-scn-moved-from',
  hatch: 'bp-scn-hatch',
} as const;

// Igual que los marcadores de estación, para que una hipotética y una real se lean a la par.
const ICON_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  11,
  0.42,
  12.5,
  0.55,
  14,
  0.85,
  16,
  1.12,
  17.5,
  1.25,
];

function point(longitude: number, latitude: number, properties: GeoJSON.GeoJsonProperties) {
  return {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [longitude, latitude] },
    properties,
  };
}

function addedData(scenario: Scenario): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: scenario.added.map((h) =>
      point(h.longitude, h.latitude, { id: h.id, label: h.id.replace(/^h/, '') }),
    ),
  };
}

function ghostData(scenario: Scenario, stations: readonly StationItem[]) {
  const byId = new Map(stations.map((s) => [s.id, s]));
  const ghosts: GeoJSON.Feature[] = [];
  const links: GeoJSON.Feature[] = [];
  for (const id of scenario.removed) {
    const s = byId.get(id);
    if (s !== undefined) ghosts.push(point(s.longitude, s.latitude, { kind: 'removed' }));
  }
  for (const m of scenario.moved) {
    const s = byId.get(m.station);
    if (s === undefined) continue;
    ghosts.push(point(s.longitude, s.latitude, { kind: 'moved' }));
    links.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [s.longitude, s.latitude],
          [m.longitude, m.latitude],
        ],
      },
      properties: {},
    });
  }
  return {
    ghosts: { type: 'FeatureCollection', features: ghosts } as GeoJSON.FeatureCollection,
    links: { type: 'FeatureCollection', features: links } as GeoJSON.FeatureCollection,
  };
}

/** Debajo de los edificios en 3D y de los rótulos: la cobertura se pinta sobre el suelo. */
function groundLayer(map: MapLibreMap): string | undefined {
  if (map.getLayer(BUILDINGS_LAYER) !== undefined) return BUILDINGS_LAYER;
  return map.getStyle().layers.find((l) => l.type === 'symbol')?.id ?? HALO_LAYER;
}

function install(map: MapLibreMap) {
  map.addImage(IMAGES.hypothetical, createHypotheticalImage(), { pixelRatio: PIXEL_RATIO });
  map.addImage(IMAGES.removed, createGhostImage(true), { pixelRatio: PIXEL_RATIO });
  map.addImage(IMAGES.movedFrom, createGhostImage(false), { pixelRatio: PIXEL_RATIO });
  map.addImage(IMAGES.hatch, createHatchImage(), { pixelRatio: PIXEL_RATIO });
  for (const id of Object.values(S)) map.addSource(id, { type: 'geojson', data: EMPTY });

  const ground = groundLayer(map);
  // La cobertura es la luz de cada estación: un charco cian sobre el suelo.
  const [, , lit, bright] = THEME.coverage;
  map.addLayer(
    {
      id: L.baseFill,
      type: 'fill',
      source: S.base,
      paint: { 'fill-color': lit, 'fill-opacity': 0.3 },
    },
    ground,
  );
  map.addLayer(
    {
      id: L.gainedFill,
      type: 'fill',
      source: S.gained,
      paint: { 'fill-color': bright, 'fill-opacity': 0.75 },
    },
    ground,
  );
  map.addLayer(
    {
      id: L.lostFill,
      type: 'fill',
      source: S.lost,
      paint: { 'fill-pattern': IMAGES.hatch, 'fill-opacity': 0.95 },
    },
    ground,
  );
  map.addLayer(
    {
      id: L.scenarioLine,
      type: 'line',
      source: S.scenario,
      paint: { 'line-color': lit, 'line-width': 1.2, 'line-opacity': 0.9 },
    },
    ground,
  );
  map.addLayer(
    {
      id: L.areaLine,
      type: 'line',
      source: S.area,
      paint: {
        'line-color': THEME.tokens['--ink-2'],
        'line-width': 1.6,
        'line-dasharray': [3, 2],
        'line-opacity': 0.85,
      },
    },
    ground,
  );
  // Alcance de cada nueva o movida: entero y por encima de los edificios, aunque no gane nada.
  // Con un contorno oscuro debajo para que se lea también sobre la zona ya cubierta.
  map.addLayer(
    {
      id: L.reachCasing,
      type: 'line',
      source: S.reach,
      paint: { 'line-color': THEME.night, 'line-width': 5, 'line-opacity': 0.55 },
    },
    HALO_LAYER,
  );
  map.addLayer(
    {
      id: L.reach,
      type: 'line',
      source: S.reach,
      paint: {
        'line-color': bright,
        'line-width': 2.4,
        'line-dasharray': [2, 1.5],
      },
    },
    HALO_LAYER,
  );
  map.addLayer(
    {
      id: L.links,
      type: 'line',
      source: S.links,
      paint: { 'line-color': bright, 'line-width': 2, 'line-dasharray': [1.5, 1.5] },
    },
    HALO_LAYER,
  );
  map.addLayer({
    id: L.ghosts,
    type: 'symbol',
    source: S.ghosts,
    layout: {
      'icon-image': ['match', ['get', 'kind'], 'removed', IMAGES.removed, IMAGES.movedFrom],
      'icon-size': ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  map.addLayer({
    id: L.added,
    type: 'symbol',
    source: S.added,
    layout: {
      'icon-image': IMAGES.hypothetical,
      'icon-size': ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-field': ['step', ['zoom'], '', 12.5, ['get', 'label']],
      'text-font': [...THEME.textFont],
      'text-size': 12,
      'text-offset': [1.3, -0.9],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': bright, 'text-halo-color': THEME.night, 'text-halo-width': 1.4 },
  });
  map.addLayer({
    id: L.drag,
    type: 'symbol',
    source: S.drag,
    layout: {
      'icon-image': ['match', ['get', 'kind'], 'station', NETWORK_IMAGE, IMAGES.hypothetical],
      'icon-size': ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

function uninstall(map: MapLibreMap) {
  try {
    for (const id of Object.values(L)) if (map.getLayer(id) !== undefined) map.removeLayer(id);
    for (const id of Object.values(S)) if (map.getSource(id) !== undefined) map.removeSource(id);
    for (const id of Object.values(IMAGES)) if (map.hasImage(id)) map.removeImage(id);
  } catch {
    // El mapa ya se ha destruido (se desmonta todo a la vez): no queda nada que quitar.
  }
}

function setData(map: MapLibreMap, source: string, data: GeoJSON.GeoJSON) {
  void map.getSource<GeoJSONSource>(source)?.setData(data);
}

type Dragged = { kind: 'added'; id: string } | { kind: 'station'; id: number };

/**
 * Capas del escenario sobre el mapa de estaciones: área de estudio, cobertura de la red real,
 * lo que se gana y lo que se pierde, y las estaciones hipotéticas. También las acciones con el
 * ratón o el dedo: añadir con un toque, arrastrar para mover y tocar para quitar.
 */
export function ScenarioLayers({
  map,
  result,
  scenario,
  stations,
  tool,
  actions,
}: ScenarioLayersProps) {
  const toolRef = useRef(tool);
  const actionsRef = useRef(actions);
  const scenarioRef = useRef(scenario);
  const reachRef = useRef<ReturnType<typeof reachData>>({
    type: 'FeatureCollection',
    features: [],
  });
  useEffect(() => {
    toolRef.current = tool;
    actionsRef.current = actions;
    scenarioRef.current = scenario;
  });

  // Capas y gestos: se instalan con el mapa y se quitan al salir del modo.
  useEffect(() => {
    if (map === null) return;
    install(map);
    let dragged: Dragged | null = null;

    const lngLatOf = (e: MapMouseEvent | MapTouchEvent): LngLat => e.lngLat;

    const showDrag = (at: LngLat) => {
      if (dragged === null) return;
      setData(map, S.drag, {
        type: 'FeatureCollection',
        features: [point(at.lng, at.lat, { kind: dragged.kind })],
      });
    };

    const onMove = (e: MapMouseEvent | MapTouchEvent) => {
      if (dragged === null) return;
      showDrag(lngLatOf(e));
    };

    // Fin del arrastre, se suelte donde se suelte: sin oyentes, y lo de antes otra vez a la vista.
    // Si el sitio no vale (fuera de la zona) o se ha cancelado, todo vuelve a como estaba; si
    // vale, el escenario nuevo lo redibuja enseguida.
    const stopDragging = () => {
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', onEnd);
      map.off('touchend', onEnd);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchcancel', cancel);
      window.removeEventListener('keydown', onKey);
      map.getCanvas().style.cursor = '';
      dragged = null;
      setData(map, S.drag, EMPTY);
      setData(map, S.added, addedData(scenarioRef.current));
      setData(map, S.reach, reachRef.current);
    };

    function onEnd(e: MapMouseEvent | MapTouchEvent) {
      if (dragged !== null) {
        const at = lngLatOf(e);
        if (dragged.kind === 'added') {
          actionsRef.current.moveHypothetical(dragged.id, at.lng, at.lat);
        } else {
          actionsRef.current.moveStation(dragged.id, at.lng, at.lat);
        }
      }
      stopDragging();
    }

    // Soltar fuera del mapa (sobre el mando, la leyenda o el panel), un toque cancelado o Escape:
    // la estación vuelve a su sitio en vez de quedarse pegada al cursor.
    function cancel() {
      if (dragged !== null) stopDragging();
    }
    // MapLibre avisa antes de un «mouseup» sobre el mapa: si llega aquí arrastrando, fue fuera.
    function onWindowUp() {
      cancel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') cancel();
    }

    const startDrag = (e: MapLayerMouseEvent | MapLayerTouchEvent, what: Dragged) => {
      if ('points' in e && e.points.length !== 1) return;
      e.preventDefault();
      dragged = what;
      map.getCanvas().style.cursor = 'grabbing';
      if (what.kind === 'added') {
        // La hipotética deja su sitio mientras se arrastra.
        setData(map, S.added, {
          type: 'FeatureCollection',
          features: addedData(scenarioRef.current).features.filter(
            (f) => f.properties?.id !== what.id,
          ),
        });
      }
      // Su círculo también: el de antes ya no dice nada.
      const key = what.kind === 'added' ? `a-${what.id}` : `m-${String(what.id)}`;
      setData(map, S.reach, {
        type: 'FeatureCollection',
        features: reachRef.current.features.filter((f) => f.properties.key !== key),
      });
      showDrag(lngLatOf(e));
      if (e.type === 'touchstart') {
        map.on('touchmove', onMove);
        map.once('touchend', onEnd);
        window.addEventListener('touchcancel', cancel);
      } else {
        map.on('mousemove', onMove);
        map.once('mouseup', onEnd);
        window.addEventListener('mouseup', onWindowUp);
      }
      window.addEventListener('keydown', onKey);
    };

    const onAddedDown = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const id: unknown = e.features?.[0]?.properties.id;
      if (typeof id !== 'string' || toolRef.current === 'remove') return;
      startDrag(e, { kind: 'added', id });
    };

    const onStationDown = (e: MapLayerMouseEvent | MapLayerTouchEvent) => {
      const id: unknown = e.features?.[0]?.properties.id;
      if (typeof id !== 'number' || toolRef.current !== 'move') return;
      startDrag(e, { kind: 'station', id });
    };

    // Añadir vale también encima de una estación real (en el Eixample casi siempre hay una);
    // sobre una nueva no, para poder arrastrarla.
    const onClick = (e: MapMouseEvent) => {
      const addedId: unknown = map.queryRenderedFeatures(e.point, { layers: [L.added] })[0]
        ?.properties.id;
      if (toolRef.current === 'remove' && typeof addedId === 'string') {
        actionsRef.current.removeHypothetical(addedId);
        return;
      }
      if (toolRef.current === 'add' && addedId === undefined) {
        actionsRef.current.add(e.lngLat.lng, e.lngLat.lat);
      }
    };

    const grab = () => {
      if (toolRef.current !== 'remove') map.getCanvas().style.cursor = 'grab';
    };
    const release = () => {
      if (dragged === null) map.getCanvas().style.cursor = '';
    };

    map.on('mousedown', L.added, onAddedDown);
    map.on('touchstart', L.added, onAddedDown);
    map.on('mousedown', MARKERS_LAYER, onStationDown);
    map.on('touchstart', MARKERS_LAYER, onStationDown);
    map.on('mouseenter', L.added, grab);
    map.on('mouseleave', L.added, release);
    map.on('click', onClick);

    return () => {
      map.off('mousedown', L.added, onAddedDown);
      map.off('touchstart', L.added, onAddedDown);
      map.off('mousedown', MARKERS_LAYER, onStationDown);
      map.off('touchstart', MARKERS_LAYER, onStationDown);
      map.off('mouseenter', L.added, grab);
      map.off('mouseleave', L.added, release);
      map.off('click', onClick);
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', onEnd);
      map.off('touchend', onEnd);
      window.removeEventListener('mouseup', onWindowUp);
      window.removeEventListener('touchcancel', cancel);
      window.removeEventListener('keydown', onKey);
      uninstall(map);
    };
  }, [map]);

  // Geometrías del cálculo.
  useEffect(() => {
    if (map === null) return;
    const g = result?.geometries;
    setData(map, S.area, asFeature(g?.studyArea));
    setData(map, S.base, asFeature(g?.base));
    setData(map, S.scenario, asFeature(g?.scenario));
    setData(map, S.gained, asFeature(g?.gained));
    setData(map, S.lost, asFeature(g?.lost));
  }, [map, result]);

  // Alcance de las nuevas y movidas: solo el que sigue valiendo para el escenario a la vista.
  useEffect(() => {
    if (map === null) return;
    const reach = reachData(result, scenario);
    reachRef.current = reach;
    setData(map, S.reach, reach);
  }, [map, result, scenario]);

  // Cambios del escenario: se ven al momento, sin esperar al cálculo.
  useEffect(() => {
    if (map === null) return;
    setData(map, S.added, addedData(scenario));
    const { ghosts, links } = ghostData(scenario, stations);
    setData(map, S.ghosts, ghosts);
    setData(map, S.links, links);
  }, [map, scenario, stations]);

  return null;
}
