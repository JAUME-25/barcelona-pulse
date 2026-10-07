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
import { t } from '../../i18n';
import { AVAILABILITY_ORDER, availabilityOf, type Availability } from './availability';
import { loadNightStyle } from './basemap';
import {
  BIKE_LANES_LAYER,
  BUILDINGS_LAYER,
  HALO_LAYER,
  MARKERS_LAYER,
  NETWORK_IMAGE,
  STATIONS_SOURCE,
  TRANSIT_IMAGE,
} from './mapLayers';
import {
  createHaloImage,
  createMarkerImage,
  createTransitImage,
  PIXEL_RATIO,
} from './markerImages';
import './StationMap.css';

setWorkerUrl(workerUrl);

export type MapStatus =
  | { kind: 'loading' }
  | { kind: 'ready' }
  /** Parte del mapa base no carga, pero el mapa funciona. */
  | { kind: 'degraded' }
  /** El navegador ha retirado el contexto gráfico (p. ej., al volver de otra app): vuelve solo. */
  | { kind: 'lost' }
  /** El estilo no ha cargado o el mapa no se ha podido crear: no hay mapa. */
  | { kind: 'failed' }
  /** El navegador no puede crear un contexto WebGL2. */
  | { kind: 'unsupported' };

interface StationMapProps {
  stations: readonly StationItem[];
  /** Todas las estaciones de la fuente: el encuadre inicial las abarca. */
  frame: readonly StationItem[];
  /** Al cambiar (otra fuente), se vuelve a encuadrar. */
  frameKey: string;
  /**
   * Al cambiar (otro modo, con otros controles encima), se vuelve a encuadrar solo si la persona
   * no ha movido el mapa: si se ha acercado a su barrio, ahí se queda.
   */
  frameMode?: string;
  /** Margen extra que tapan otros controles sobre el mapa (solo escritorio). */
  framePadding?: { top?: number; right: number; bottom: number; left?: number } | undefined;
  selectedId: number | null;
  /**
   * «availability»: color y número según el estado. «network»: todas iguales y sin número,
   * para cuando lo que importa es dónde están (escenarios de cobertura).
   */
  variant?: MarkerVariant;
  /** Edificios en 3D y carriles bici. Al experimentar no: taparían la cobertura o se confundirían con ella. */
  buildings?: boolean;
  onSelect: (id: number) => void;
  onStatusChange: (status: MapStatus) => void;
  /** El mapa ya cargado, para quien dibuje sus propias capas encima; null al desmontarse. */
  onMapReady?: ((map: MapLibreMap | null) => void) | undefined;
}

export type MarkerVariant = 'availability' | 'network';

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

// En un escenario la estación es solo un punto: más pequeña, para que se vea la cobertura.
const NETWORK_ICON_SIZE: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  11,
  0.24,
  12.5,
  0.32,
  14,
  0.55,
  16,
  0.85,
  17.5,
  1,
];

const MAX_FIT_ZOOM = 14;

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Encuadra las estaciones en la parte del mapa que no tapan los paneles. fitBounds calcula sin
 * la inclinación de la cámara y dejaba mucho margen (municipios vecinos y mar): después se
 * ajusta con dónde caen de verdad las estaciones en pantalla. Dos pasadas bastan.
 */
function frameStations(map: MapLibreMap, stations: readonly StationItem[], padding: Padding) {
  const bounds = new LngLatBounds();
  for (const s of stations) bounds.extend([s.longitude, s.latitude]);
  map.fitBounds(bounds, { padding, animate: false, maxZoom: MAX_FIT_ZOOM });

  const { clientWidth, clientHeight } = map.getContainer();
  const areaWidth = clientWidth - padding.left - padding.right;
  const areaHeight = clientHeight - padding.top - padding.bottom;
  if (areaWidth <= 0 || areaHeight <= 0) return;
  const target: [number, number] = [padding.left + areaWidth / 2, padding.top + areaHeight / 2];

  for (let pass = 0; pass < 2; pass++) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of stations) {
      const p = map.project([s.longitude, s.latitude]);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    if (!(width > 0 && height > 0)) return;
    map.panBy([(minX + maxX) / 2 - target[0], (minY + maxY) / 2 - target[1]], {
      animate: false,
    });
    const zoom = map.getZoom() + Math.log2(Math.min(areaWidth / width, areaHeight / height));
    map.zoomTo(Math.min(zoom, MAX_FIT_ZOOM), { animate: false, around: map.unproject(target) });
  }
}

function hasCameraInUrl(): boolean {
  return new URLSearchParams(window.location.hash.slice(1)).has(CAMERA_HASH);
}

/**
 * MapLibre quita «#mapa» de la URL al quitar el mapa. Se deja para el siguiente: al cambiar de
 * idioma (la aplicación se vuelve a montar) o al recuperar el contexto gráfico, la cámara sigue
 * donde estaba.
 */
function removeKeepingCamera(map: MapLibreMap): void {
  const hash = window.location.hash;
  map.remove();
  if (window.location.hash === hash) return;
  const url = new URL(window.location.href);
  url.hash = hash;
  try {
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // Safari limita los cambios de URL seguidos (ver writeParam): se pierde la cámara, nada más.
  }
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

const MARKER_IMAGE: Record<MarkerVariant, ExpressionSpecification | string> = {
  availability: ['concat', 'bp-', ['get', 'cat']],
  network: NETWORK_IMAGE,
};

const MARKER_TEXT: Record<MarkerVariant, ExpressionSpecification | string> = {
  availability: ['step', ['zoom'], '', 13, ['get', 'label']],
  network: '',
};

const MARKER_SIZE: Record<MarkerVariant, ExpressionSpecification> = {
  availability: ICON_SIZE,
  network: NETWORK_ICON_SIZE,
};

function addLayers(
  map: MapLibreMap,
  stations: readonly StationItem[],
  selectedId: number | null,
  variant: MarkerVariant,
  buildings: boolean,
) {
  for (const category of AVAILABILITY_ORDER) {
    map.addImage(`bp-${category}`, createMarkerImage(THEME.markers[category]), {
      pixelRatio: PIXEL_RATIO,
    });
  }
  map.addImage(NETWORK_IMAGE, createMarkerImage(THEME.networkMarker), { pixelRatio: PIXEL_RATIO });
  map.addImage('bp-halo', createHaloImage(), { pixelRatio: PIXEL_RATIO });

  // Edificios en 3D desde z14, opacos y más claros cuanto más altos para que se lean de noche.
  // Justo antes de la primera etiqueta, que nightStyle deja detrás de calles y plantas: lo que va
  // encima de una capa 3D se pinta sin profundidad y se vería a través de los volúmenes.
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
        layout: { visibility: buildings ? 'visible' : 'none' },
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

  map.addSource(STATIONS_SOURCE, { type: 'geojson', data: toFeatureCollection(stations) });
  map.addLayer({
    id: HALO_LAYER,
    type: 'symbol',
    source: STATIONS_SOURCE,
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
    source: STATIONS_SOURCE,
    layout: {
      'icon-image': MARKER_IMAGE[variant],
      'icon-size': MARKER_SIZE[variant],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sort'],
      'text-field': MARKER_TEXT[variant],
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
  frameMode = '',
  framePadding,
  selectedId,
  variant = 'availability',
  buildings = true,
  onSelect,
  onStatusChange,
  onMapReady,
}: StationMapProps) {
  const padTop = framePadding?.top ?? 48;
  const padRight = framePadding?.right ?? 48;
  const padBottom = framePadding?.bottom ?? 48;
  const padLeft = framePadding?.left ?? FLOATING_PANEL_PX;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const stationsRef = useRef(stations);
  const selectedRef = useRef(selectedId);
  const variantRef = useRef(variant);
  const buildingsRef = useRef(buildings);
  const onSelectRef = useRef(onSelect);
  const onStatusRef = useRef(onStatusChange);
  const onMapReadyRef = useRef(onMapReady);
  const fittedKeyRef = useRef<string | null>(null);
  const fittedModeRef = useRef<string | null>(null);
  // La persona ha movido la cámara (o ha elegido una estación) desde el último encuadre. Una
  // cámara que llega en el enlace cuenta igual: es la vista que alguien quería enseñar.
  const movedByUserRef = useRef(hasCameraInUrl());
  // Se mira al montar: en cuanto la cámara se mueve, MapLibre reescribe el hash.
  const cameraFromUrlRef = useRef(hasCameraInUrl());
  const [mapReady, setMapReady] = useState(false);
  // Se crea otro mapa cuando el navegador devuelve el contexto gráfico.
  const [generation, setGeneration] = useState(0);
  // La cámara de Fanals empieza inclinada (THEME.camera.pitch).
  const [oblique, setOblique] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onStatusRef.current = onStatusChange;
    onMapReadyRef.current = onMapReady;
  });

  // Creación y limpieza del mapa. El estilo se descarga y se adapta antes de crearlo.
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const controller = new AbortController();
    let map: MapLibreMap | null = null;
    onStatusRef.current({ kind: 'loading' });

    const create = (loaded: StyleSpecification) => {
      // Los carriles bici nacen ya ocultos al experimentar: sin parpadeo hasta el primer efecto.
      const style: StyleSpecification = {
        ...loaded,
        layers: loaded.layers.map((l) =>
          l.id === BIKE_LANES_LAYER
            ? {
                ...l,
                layout: { ...l.layout, visibility: buildingsRef.current ? 'visible' : 'none' },
              }
            : l,
        ),
      };
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
            'NavigationControl.ZoomIn': t().map.zoomIn,
            'NavigationControl.ZoomOut': t().map.zoomOut,
            'NavigationControl.ResetBearing': t().map.resetBearing,
            'AttributionControl.ToggleAttribution': t().map.attribution,
            'Map.Title': t().map.title,
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
      // El pictograma del metro lo pide el mapa base (basemap.ts) al leer las teselas: se dibuja
      // cuando hace falta. En MapLibre 6 un oyente de «styleimagemissing» ya llega tarde.
      instance.setMissingStyleImageResolver((id) => {
        if (id === TRANSIT_IMAGE && !instance.hasImage(id)) {
          instance.addImage(id, createTransitImage(), { pixelRatio: PIXEL_RATIO });
        }
      });
      // Un fallo suelto (una tesela) deja el aviso hasta que la vista vuelve a cargar sin fallos.
      let degraded = false;
      let errorSinceMove = false;
      // La cámara del enlace (#mapa=…) se aplica al crearlo, sin «pitchend»: el botón la refleja.
      setOblique(instance.getPitch() > 5);
      instance.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');

      instance.on('load', () => {
        loadedRef.current = true;
        addLayers(
          instance,
          stationsRef.current,
          selectedRef.current,
          variantRef.current,
          buildingsRef.current,
        );
        setMapReady(true);
        onStatusRef.current({ kind: degraded ? 'degraded' : 'ready' });
        onMapReadyRef.current?.(instance);
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
      instance.on('movestart', (e) => {
        errorSinceMove = false;
        if (e.originalEvent !== undefined) movedByUserRef.current = true;
      });
      instance.on('error', (e) => {
        errorSinceMove = true;
        // Una tesela que no llega antes de cargar no impide el mapa: antes se daba por perdido
        // («No se ha podido cargar el mapa base») hasta el «load».
        const partial = loadedRef.current || 'tile' in e || 'sourceId' in e;
        degraded = partial;
        onStatusRef.current({ kind: partial ? 'degraded' : 'failed' });
      });
      instance.on('idle', () => {
        if (!degraded || errorSinceMove || !loadedRef.current) return;
        degraded = false;
        onStatusRef.current({ kind: 'ready' });
      });
      // MapLibre destruye el estilo al perder el contexto: hasta que vuelva, nadie toca el mapa.
      instance.on('webglcontextlost', () => {
        if (loadedRef.current) onMapReadyRef.current?.(null);
        loadedRef.current = false;
        mapRef.current = null;
        setMapReady(false);
        onStatusRef.current({ kind: 'lost' });
      });
      // Al volver, otro mapa con lo de ahora (estaciones, selección, modo) y la cámara de la URL.
      instance.on('webglcontextrestored', () => {
        setGeneration((g) => g + 1);
      });
    };

    loadNightStyle(controller.signal)
      .then(create)
      .catch(() => {
        if (!controller.signal.aborted) onStatusRef.current({ kind: 'failed' });
      });

    return () => {
      controller.abort();
      if (loadedRef.current) onMapReadyRef.current?.(null);
      mapRef.current = null;
      loadedRef.current = false;
      setMapReady(false);
      if (map !== null) removeKeepingCamera(map);
    };
  }, [generation]);

  // Datos: se sustituyen en la fuente existente.
  useEffect(() => {
    stationsRef.current = stations;
    const source = loadedRef.current
      ? mapRef.current?.getSource<GeoJSONSource>(STATIONS_SOURCE)
      : undefined;
    if (source !== undefined) void source.setData(toFeatureCollection(stations));
  }, [stations]);

  // Variante de los marcadores: solo cambia el dibujo de la capa.
  useEffect(() => {
    variantRef.current = variant;
    const map = mapRef.current;
    if (!mapReady || map === null) return;
    map.setLayoutProperty(MARKERS_LAYER, 'icon-image', MARKER_IMAGE[variant]);
    map.setLayoutProperty(MARKERS_LAYER, 'icon-size', MARKER_SIZE[variant]);
    map.setLayoutProperty(MARKERS_LAYER, 'text-field', MARKER_TEXT[variant]);
  }, [variant, mapReady]);

  // Edificios en 3D y carriles bici: se ocultan sin quitar la capa (la cobertura se dibuja debajo
  // de los edificios).
  useEffect(() => {
    buildingsRef.current = buildings;
    const map = mapRef.current;
    if (!mapReady || map === null) return;
    for (const id of [BUILDINGS_LAYER, BIKE_LANES_LAYER]) {
      if (map.getLayer(id) !== undefined)
        map.setLayoutProperty(id, 'visibility', buildings ? 'visible' : 'none');
    }
  }, [buildings, mapReady]);

  // Encuadre: abarcando todas las estaciones al abrir y con cada fuente; al cambiar de modo, solo
  // si la persona no ha movido el mapa.
  useEffect(() => {
    const map = mapRef.current;
    const sameFrame = fittedKeyRef.current === frameKey && fittedModeRef.current === frameMode;
    if (!mapReady || map === null || frame.length === 0 || sameFrame) return;
    const onlyMode = fittedKeyRef.current === frameKey;
    const firstTime = fittedKeyRef.current === null;
    fittedKeyRef.current = frameKey;
    fittedModeRef.current = frameMode;
    // Si la URL ya trae una cámara, se respeta en vez de encuadrar.
    if (firstTime && cameraFromUrlRef.current) return;
    if (onlyMode && movedByUserRef.current) return;
    const floatingPanel = window.innerWidth >= 768;
    const padding = floatingPanel
      ? { top: padTop, right: padRight, bottom: padBottom, left: padLeft }
      : { top: 24, right: 24, bottom: 24, left: 24 };
    frameStations(map, frame, padding);
    movedByUserRef.current = false;
  }, [frame, frameKey, frameMode, mapReady, padTop, padRight, padBottom, padLeft]);

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
      // Como si la hubiera movido a mano: al cambiar de modo, el mapa se queda en la estación.
      movedByUserRef.current = true;
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
        aria-label={t().map.region}
      />
      <button
        type="button"
        className="station-map__pitch"
        aria-pressed={oblique}
        onClick={togglePitch}
      >
        {t().map.pitch}
      </button>
    </div>
  );
}
