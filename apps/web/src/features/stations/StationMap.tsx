import {
  GPUInitializationError,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import type { StationItem } from '../../api/client';
import { THEME } from '../../app/theme';
import { AVAILABILITY_ORDER, availabilityOf, type Availability } from './availability';
import { loadNightStyle } from './basemap';
import { createHaloImage, createMarkerImage, PIXEL_RATIO } from './markerImages';
import './StationMap.css';

setWorkerUrl(workerUrl);

export type MapStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  /** Parte del mapa base no carga, pero el mapa funciona. */
  | { kind: 'degraded' }
  /** El estilo o el contexto gráfico han fallado: no hay mapa. */
  | { kind: 'failed' }
  /** El navegador no puede crear un contexto WebGL2. */
  | { kind: 'unsupported' };

interface StationMapProps {
  stations: readonly StationItem[];
  /** Todas las estaciones de la fuente: el encuadre inicial las abarca. */
  frame: readonly StationItem[];
  frameKey: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onStatusChange: (status: MapStatus) => void;
}

const SOURCE_ID = 'bp-stations';
const MARKERS_LAYER = 'bp-stations';
const HALO_LAYER = 'bp-stations-halo';
const BUILDINGS_LAYER = 'bp-buildings-3d';
const CAMERA_HASH = 'mapa';
const BARCELONA: [number, number] = [2.165, 41.395];
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [1.9, 41.22],
  [2.45, 41.58],
];
/** Ancho del panel flotante en escritorio, para que el encuadre no quede debajo. */
const FLOATING_PANEL_PX = 460;

// Pequeños a escala de ciudad (unas 540 estaciones reales se solapan) y grandes a nivel de
// calle, donde llevan el número dentro.
const ICON_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  11,
  0.38,
  12.5,
  0.5,
  14,
  0.82,
  16,
  1.12,
  17.5,
  1.25,
];

function hasCameraInUrl(): boolean {
  return new URLSearchParams(window.location.hash.slice(1)).has(CAMERA_HASH);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Texto dentro del marcador: bicis disponibles, «0» si está vacía y «?» si no hay dato. */
function markerLabel(category: Availability, station: StationItem): string {
  if (category === 'unknown') return '?';
  if (category === 'outOfService' || station.state.bikesAvailable === null) return '';
  return String(station.state.bikesAvailable);
}

function toFeatureCollection(stations: readonly StationItem[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: stations.map((s) => {
      const category = availabilityOf(s.state);
      return {
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: {
          id: s.id,
          cat: category,
          // Las desconocidas debajo: no deben tapar a las que tienen dato.
          sort: category === 'unknown' ? 0 : 1,
          label: markerLabel(category, s),
        },
      };
    }),
  };
}

function byCategory(pick: (c: Availability) => string | number): ExpressionSpecification {
  const pairs = AVAILABILITY_ORDER.flatMap((c) => [c, pick(c)]);
  return ['match', ['get', 'cat'], ...pairs, pick('unknown')] as unknown as ExpressionSpecification;
}

function addLayers(map: MapLibreMap, stations: readonly StationItem[], selectedId: number | null) {
  for (const category of AVAILABILITY_ORDER) {
    map.addImage(`bp-${category}`, createMarkerImage(THEME.markers[category]), {
      pixelRatio: PIXEL_RATIO,
    });
  }
  map.addImage('bp-halo', createHaloImage(), { pixelRatio: PIXEL_RATIO });

  // Edificios en 3D desde z14, más claros cuanto más altos para que se lean de noche.
  if (map.getSource('openmaptiles') !== undefined) {
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer(
      {
        id: BUILDINGS_LAYER,
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        filter: ['!=', ['get', 'hide_3d'], true],
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 0],
            0,
            THEME.buildings.low,
            60,
            THEME.buildings.high,
          ],
          'fill-extrusion-height': ['get', 'render_height'],
          'fill-extrusion-base': ['get', 'render_min_height'],
          'fill-extrusion-opacity': THEME.buildings.opacity,
        },
      },
      firstSymbol,
    );
  }

  map.addSource(SOURCE_ID, { type: 'geojson', data: toFeatureCollection(stations) });
  map.addLayer({
    id: HALO_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['==', ['get', 'id'], selectedId ?? -1],
    layout: {
      'icon-image': 'bp-halo',
      'icon-size': ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  map.addLayer({
    id: MARKERS_LAYER,
    type: 'symbol',
    source: SOURCE_ID,
    layout: {
      'icon-image': ['concat', 'bp-', ['get', 'cat']],
      'icon-size': ICON_SIZE,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sort'],
      'text-field': ['step', ['zoom'], '', 13, ['get', 'label']],
      'text-font': [...THEME.textFont],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 15, 12.5, 17.5, 15],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': byCategory((c) => THEME.markers[c].text),
      'text-halo-color': THEME.night,
      'text-halo-width': byCategory((c) => (THEME.markers[c].textHalo === true ? 1.2 : 0)),
    },
  });
}

/**
 * Mapa MapLibre creado una sola vez por montaje. Los cambios de datos y de selección se
 * aplican con setData/setFilter; React nunca reconstruye el mapa.
 */
export function StationMap({
  stations,
  frame,
  frameKey,
  selectedId,
  onSelect,
  onStatusChange,
}: StationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const stationsRef = useRef(stations);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);
  const onStatusRef = useRef(onStatusChange);
  const fittedKeyRef = useRef<string | null>(null);
  // Se mira al montar: en cuanto la cámara se mueve, MapLibre reescribe el hash.
  const cameraFromUrlRef = useRef(hasCameraInUrl());
  const [mapReady, setMapReady] = useState(false);
  // La cámara de Fanals empieza inclinada (THEME.camera.pitch).
  const [oblique, setOblique] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onStatusRef.current = onStatusChange;
  });

  // Creación y limpieza del mapa. El estilo se descarga y se adapta antes de crearlo.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const controller = new AbortController();
    let map: MapLibreMap | null = null;
    onStatusRef.current({ kind: 'loading' });

    const create = (style: StyleSpecification) => {
      try {
        map = new MapLibreMap({
          container,
          style,
          center: BARCELONA,
          zoom: 12,
          pitch: THEME.camera.pitch,
          bearing: THEME.camera.bearing,
          maxBounds: MAX_BOUNDS,
          minZoom: 10.5,
          maxZoom: 18.5,
          attributionControl: { compact: true },
          // La cámara va en la URL (#mapa=zoom/lat/lon/rumbo/inclinación): se puede compartir una vista.
          hash: CAMERA_HASH,
          canvasContextAttributes: { antialias: true },
          locale: {
            'NavigationControl.ZoomIn': 'Acercar',
            'NavigationControl.ZoomOut': 'Alejar',
            'NavigationControl.ResetBearing': 'Orientar al norte',
            'AttributionControl.ToggleAttribution': 'Mostrar atribuciones',
            'Map.Title': 'Mapa',
          },
        });
      } catch (error) {
        onStatusRef.current({
          kind: error instanceof GPUInitializationError ? 'unsupported' : 'failed',
        });
        return;
      }

      const instance = map;
      mapRef.current = instance;
      instance.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

      instance.on('load', () => {
        loadedRef.current = true;
        addLayers(instance, stationsRef.current, selectedRef.current);
        setMapReady(true);
        onStatusRef.current({ kind: 'ready' });
      });
      instance.on('click', MARKERS_LAYER, (e: MapLayerMouseEvent) => {
        const id: unknown = e.features?.[0]?.properties.id;
        if (typeof id === 'number') onSelectRef.current(id);
      });
      instance.on('mouseenter', MARKERS_LAYER, () => {
        instance.getCanvas().style.cursor = 'pointer';
      });
      instance.on('mouseleave', MARKERS_LAYER, () => {
        instance.getCanvas().style.cursor = '';
      });
      instance.on('pitchend', () => {
        setOblique(instance.getPitch() > 5);
      });
      instance.on('error', () => {
        onStatusRef.current({ kind: loadedRef.current ? 'degraded' : 'failed' });
      });
      instance.on('webglcontextlost', () => {
        onStatusRef.current({ kind: 'failed' });
      });
    };

    loadNightStyle(controller.signal)
      .then(create)
      .catch(() => {
        if (!controller.signal.aborted) onStatusRef.current({ kind: 'failed' });
      });

    return () => {
      controller.abort();
      mapRef.current = null;
      loadedRef.current = false;
      map?.remove();
    };
  }, []);

  // Datos: se sustituyen en la fuente existente.
  useEffect(() => {
    stationsRef.current = stations;
    const source = loadedRef.current
      ? mapRef.current?.getSource<GeoJSONSource>(SOURCE_ID)
      : undefined;
    if (source !== undefined) void source.setData(toFeatureCollection(stations));
  }, [stations]);

  // Encuadre inicial: una vez por fuente, abarcando todas sus estaciones.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || map === null || frame.length === 0 || fittedKeyRef.current === frameKey) {
      return;
    }
    // Si la URL ya trae una cámara, se respeta en vez de encuadrar.
    if (fittedKeyRef.current === null && cameraFromUrlRef.current) {
      fittedKeyRef.current = frameKey;
      return;
    }
    const bounds = new LngLatBounds();
    for (const s of frame) bounds.extend([s.longitude, s.latitude]);
    const floatingPanel = window.innerWidth >= 768;
    const padding = floatingPanel
      ? { top: 48, right: 48, bottom: 48, left: FLOATING_PANEL_PX }
      : 32;
    map.fitBounds(bounds, { padding, animate: false, maxZoom: 14 });
    fittedKeyRef.current = frameKey;
  }, [frame, frameKey, mapReady]);

  // Selección: resalta y, si queda fuera de la vista, centra la estación.
  useEffect(() => {
    selectedRef.current = selectedId;
    const map = mapRef.current;
    if (!mapReady || map === null) return;
    map.setFilter(HALO_LAYER, ['==', ['get', 'id'], selectedId ?? -1]);
    if (selectedId === null) return;

    const station = stationsRef.current.find((s) => s.id === selectedId);
    if (station === undefined) return;
    const point = map.project([station.longitude, station.latitude]);
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const left = window.innerWidth >= 768 ? FLOATING_PANEL_PX : width * 0.1;
    const visible =
      point.x > left && point.x < width * 0.9 && point.y > height * 0.1 && point.y < height * 0.9;
    if (!visible) {
      // En escritorio se centra en la parte del mapa que no tapa el panel.
      map.easeTo({
        center: [station.longitude, station.latitude],
        zoom: Math.max(map.getZoom(), 14),
        offset: window.innerWidth >= 768 ? [FLOATING_PANEL_PX / 2, 0] : [0, 0],
        duration: prefersReducedMotion() ? 0 : 600,
      });
    }
  }, [selectedId, mapReady]);

  const togglePitch = () => {
    const map = mapRef.current;
    if (map === null) return;
    map.easeTo({
      pitch: map.getPitch() > 5 ? 0 : THEME.camera.pitch,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  };

  return (
    <div className="station-map">
      <div
        ref={containerRef}
        className="station-map__canvas"
        role="region"
        aria-label="Mapa de estaciones"
      />
      <button
        type="button"
        className="station-map__pitch"
        aria-pressed={oblique}
        onClick={togglePitch}
      >
        Vista 3D
      </button>
    </div>
  );
}
