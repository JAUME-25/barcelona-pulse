import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { THEME } from '../../app/theme';
import { BIKE_LANES_LAYER, TRANSIT_IMAGE } from './mapLayers';

/**
 * Convierte el estilo «dark» de OpenFreeMap en la noche de Fanals: fondo azul noche en vez
 * de negro, calles visibles, nombres de calle y de barrio legibles, parques y agua
 * distinguibles. Cambia colores, tamaños y nombres y añade referencias (portales, metro, parques,
 * carriles bici) que el estilo no dibuja; si una capa desaparece del estilo original, se ignora.
 */

type Props = Record<string, unknown>;

const NIGHT = THEME.night;
const LABEL_HALO = 'rgba(11, 20, 34, 0.92)';
const STRONG_HALO = 'rgba(11, 20, 34, 0.95)';

/** Nombres locales (los de las placas de la calle), no la traducción inglesa. */
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name_en']];
/** El mismo nombre, siempre texto (las expresiones de texto no admiten nulos). */
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name_en'], ''];

/** Quita el prefijo si el nombre empieza por él (MapLibre no tiene «replace»). */
function withoutPrefixes(
  pairs: readonly (readonly [string, string])[],
  input: ExpressionSpecification,
): ExpressionSpecification {
  const branches = pairs.flatMap(([prefix, replacement]) => [
    ['==', ['index-of', prefix, input], 0],
    ['concat', replacement, ['slice', input, prefix.length]],
  ]);
  return ['case', ...branches, input] as unknown as ExpressionSpecification;
}

/**
 * Nombres de calle como en los planos de Barcelona: «Mallorca», «Av. Diagonal», «Pg. de
 * Gràcia». Con «Carrer de» delante no cabían en las calles cortas: en el Gòtic, a z16,6, se veían
 * 3 nombres y así se ven 40. Las abreviaturas son las de las estaciones (`names.ts`).
 */
export const STREET_NAME = withoutPrefixes(
  [
    ['Carrer de les ', ''],
    ['Carrer de la ', ''],
    ["Carrer de l'", ''],
    ['Carrer de l’', ''],
    ['Carrer dels ', ''],
    ['Carrer del ', ''],
    ['Carrer de ', ''],
    ["Carrer d'", ''],
    ['Carrer d’', ''],
    ['Carrer ', ''],
    ['Avinguda ', 'Av. '],
    ['Passeig ', 'Pg. '],
    ['Plaça ', 'Pl. '],
    ['Passatge ', 'Ptge. '],
    ['Travessera ', 'Trav. '],
    ['Carretera ', 'Ctra. '],
  ],
  NAME,
);

const LINE: ExpressionSpecification = [
  'match',
  ['geometry-type'],
  ['LineString', 'MultiLineString'],
  true,
  false,
];
const MAJOR_ROAD: ExpressionSpecification = [
  'match',
  ['get', 'class'],
  ['trunk', 'primary', 'secondary', 'tertiary'],
  true,
  false,
];

const PAINT: Record<string, Props> = {
  background: { 'background-color': NIGHT },
  water: { 'fill-color': '#0f2234' },
  waterway: { 'line-color': '#0f2234' },
  landuse_residential: { 'fill-color': '#0e1a2b' },
  landcover_wood: { 'fill-color': '#112a1c' },
  landuse_park: { 'fill-color': '#12301f' },
  // Las plantas, antes del 3D (hasta z14), se leían casi como el fondo.
  building: { 'fill-color': '#1a2a43', 'fill-outline-color': '#26395a' },
  road_area_pier: { 'fill-color': '#0e1a2b' },
  road_pier: { 'line-color': '#0e1a2b' },
  highway_path: { 'line-color': '#2e4060' },
  highway_minor: { 'line-color': '#3b5072' },
  highway_major_casing: { 'line-color': 'rgba(185, 202, 228, 0.5)' },
  highway_major_inner: { 'line-color': '#4d6590' },
  highway_major_subtle: { 'line-color': '#4d6590' },
  highway_motorway_casing: { 'line-color': 'rgba(195, 212, 235, 0.55)' },
  highway_motorway_inner: { 'line-color': '#5e78a3' },
  highway_motorway_subtle: { 'line-color': '#31435f' },
  railway: { 'line-color': '#2b3954' },
  railway_transit: { 'line-color': '#2b3954' },
  railway_minor: { 'line-color': '#2b3954' },
  railway_dashline: { 'line-color': NIGHT },
  railway_transit_dashline: { 'line-color': NIGHT },
  railway_minor_dashline: { 'line-color': NIGHT },
  highway_name_other: {
    'text-color': '#c2ccd9',
    'text-halo-color': LABEL_HALO,
    'text-halo-width': 1.7,
  },
  highway_name_motorway: {
    'text-color': '#c8d2de',
    'text-halo-color': LABEL_HALO,
    'text-halo-width': 1.6,
  },
  water_name: { 'text-color': '#86a3c2', 'text-halo-color': LABEL_HALO, 'text-halo-width': 1.2 },
};

const PLACE_LAYERS = [
  'place_other',
  'place_suburb',
  'place_village',
  'place_town',
  'place_city',
  'place_city_large',
  'place_state',
];

const LAYOUT: Record<string, Props> = {
  // Las calles que no son principales, desde z14 (ver STREET_MAJOR) y en minúscula, como en las
  // placas: en mayúsculas ocupaban más y cabían menos.
  highway_name_other: {
    'text-field': STREET_NAME,
    'text-transform': 'none',
    'text-font': ['Noto Sans Regular'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11, 16, 12.5, 18, 15],
    'symbol-spacing': 200,
    'text-max-angle': 40,
    'text-padding': 1,
    'symbol-sort-key': ['match', ['get', 'class'], 'minor', 0, 'path', 1, 'service', 2, 3],
  },
  place_suburb: {
    'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 15, 16],
    'text-letter-spacing': 0.08,
  },
  place_other: {
    'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11.5, 14, 13.5, 16, 15],
    'text-letter-spacing': 0.1,
  },
  place_village: { 'text-size': 12.5 },
  place_town: { 'text-size': 13 },
  place_city: { 'text-size': 15 },
  place_city_large: { 'text-size': 17 },
  // Las flechas de sentido único: ruido a esta escala.
  road_oneway: { visibility: 'none' },
  road_oneway_opposite: { visibility: 'none' },
};

/**
 * Hasta qué zoom se ve cada capa. Los barrios: la tesela los trae desde z14 y el estilo los
 * apagaba en z14, así que no salían nunca; los distritos dejan sitio a los barrios desde z14.
 */
const MAX_ZOOM: Record<string, number> = { place_other: 16, place_suburb: 14 };
const MIN_ZOOM: Record<string, number> = { highway_name_other: 14 };

/** Los barrios de Barcelona en OSM suelen ser `quarter`; el estilo original no los muestra. */
const PLACE_OTHER_FILTER: FilterSpecification = [
  'all',
  ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false],
  [
    'match',
    ['get', 'class'],
    ['neighbourhood', 'quarter', 'hamlet', 'isolated_dwelling'],
    true,
    false,
  ],
];

/** Pasillos y andenes del metro también tienen nombre en OSM: no son calles. */
const STREET_OTHER_FILTER: FilterSpecification = [
  'all',
  LINE,
  ['!=', ['get', 'class'], 'motorway'],
  ['!', MAJOR_ROAD],
  ['match', ['get', 'subclass'], ['corridor', 'platform'], false, true],
] as FilterSpecification;

function withChanges(layer: LayerSpecification): LayerSpecification {
  const paint: Props = {
    ...(('paint' in layer ? layer.paint : undefined) ?? {}),
    ...PAINT[layer.id],
  };
  const layout: Props = {
    ...(('layout' in layer ? layer.layout : undefined) ?? {}),
  };

  if (PLACE_LAYERS.includes(layer.id)) {
    Object.assign(paint, {
      'text-color': layer.id === 'place_other' ? '#cfd8e3' : '#e2e8f0',
      'text-halo-color': LABEL_HALO,
      'text-halo-width': 1.6,
    });
  }
  if (layer.type === 'symbol' && 'text-field' in layout && /place|name/.test(layer.id)) {
    layout['text-field'] = LOCAL_NAME;
  }
  Object.assign(layout, LAYOUT[layer.id]);
  // El sprite de OpenFreeMap no tiene «wood-pattern»: con el patrón, los bosques no se pintaban
  // (Collserola y Montjuïc sin su verde) y la consola lo avisaba.
  if (layer.id === 'landcover_wood') delete paint['fill-pattern'];
  // Las calles peatonales, continuas: en Ciutat Vella son casi todas y el trazo discontinuo las
  // hacía parecer caminos.
  if (layer.id === 'highway_path') delete paint['line-dasharray'];

  const changed = { ...layer, paint, layout } as LayerSpecification & {
    filter?: FilterSpecification;
    minzoom?: number;
    maxzoom?: number;
  };
  if (layer.id === 'place_other') changed.filter = PLACE_OTHER_FILTER;
  if (layer.id === 'highway_name_other') changed.filter = STREET_OTHER_FILTER;
  if (MAX_ZOOM[layer.id] !== undefined) changed.maxzoom = MAX_ZOOM[layer.id];
  if (MIN_ZOOM[layer.id] !== undefined) changed.minzoom = MIN_ZOOM[layer.id];
  return changed;
}

/** Calles principales: antes que las demás, en negrita y desde z12. */
const STREET_MAJOR: LayerSpecification = {
  id: 'bp-street-major',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'transportation_name',
  minzoom: 12,
  filter: ['all', LINE, MAJOR_ROAD] as FilterSpecification,
  layout: {
    'symbol-placement': 'line',
    'symbol-spacing': 260,
    'symbol-sort-key': ['match', ['get', 'class'], 'trunk', 0, 'primary', 1, 'secondary', 2, 3],
    'text-field': STREET_NAME,
    'text-font': ['Noto Sans Bold'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 13.5, 17, 16.5],
    'text-max-angle': 35,
    'text-padding': 1,
    'text-pitch-alignment': 'viewport',
    'text-rotation-alignment': 'map',
  },
  paint: { 'text-color': '#e3e9f1', 'text-halo-color': STRONG_HALO, 'text-halo-width': 1.8 },
};

/** Números de portal desde z17: las estaciones se llaman por su dirección («Rosselló, 453»). */
const HOUSE_NUMBERS: LayerSpecification = {
  id: 'bp-housenumber',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'housenumber',
  minzoom: 17,
  layout: {
    'text-field': ['to-string', ['get', 'housenumber']],
    'text-font': ['Noto Sans Regular'],
    'text-size': 10.5,
    'text-padding': 2,
  },
  paint: { 'text-color': '#8796ab', 'text-halo-color': STRONG_HALO, 'text-halo-width': 1.2 },
};

/**
 * Metro, tren y tranvía desde z14: pictograma redondo (no octógono, que es Bicing) y el nombre en
 * cursiva. Sirven para orientarse; los datos de Bicing siguen encima.
 */
const TRANSIT: LayerSpecification = {
  id: 'bp-transit',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'poi',
  minzoom: 14,
  filter: [
    'all',
    ['==', ['get', 'class'], 'railway'],
    [
      'match',
      ['get', 'subclass'],
      ['subway', 'station', 'halt', 'tram_stop', 'light_rail'],
      true,
      false,
    ],
  ] as FilterSpecification,
  layout: {
    'icon-image': TRANSIT_IMAGE,
    'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 15, 0.9, 17, 1],
    'icon-padding': 1,
    'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
    'text-field': NAME,
    'text-font': ['Noto Sans Italic'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11.5, 17, 14],
    'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
    'text-radial-offset': 0.95,
    'text-justify': 'auto',
    'text-optional': true,
    'text-max-width': 9,
  },
  paint: { 'text-color': '#d7e0ea', 'text-halo-color': STRONG_HALO, 'text-halo-width': 1.6 },
};

const STARTS_WITH_PARC: ExpressionSpecification = ['==', ['index-of', 'Parc ', NAME], 0];

/** Parques desde z14 y jardines (casi todos, interiores de manzana) desde z16. */
const PARKS: LayerSpecification = {
  id: 'bp-parks',
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'poi',
  minzoom: 14,
  filter: [
    'all',
    ['==', ['get', 'class'], 'park'],
    ['any', STARTS_WITH_PARC, ['==', ['index-of', 'Jardins ', NAME], 0]],
  ] as FilterSpecification,
  layout: {
    'text-field': ['step', ['zoom'], ['case', STARTS_WITH_PARC, NAME, ''], 16, NAME],
    'text-font': ['Noto Sans Italic'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 14, 11.5, 17, 13.5],
    'text-max-width': 8,
    'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
  },
  paint: { 'text-color': '#93c4a2', 'text-halo-color': STRONG_HALO, 'text-halo-width': 1.5 },
};

/**
 * Carriles bici que OpenStreetMap dibuja aparte de la calzada (`highway=cycleway`): no están
 * todos, y así se dice en la leyenda y en «Qué muestra y qué no». Verde: el cian es de la
 * cobertura y las escalas cálida y violeta, de los estados.
 */
const BIKE_LANES: LayerSpecification = {
  id: BIKE_LANES_LAYER,
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  minzoom: 12,
  filter: ['all', LINE, ['==', ['get', 'subclass'], 'cycleway']] as FilterSpecification,
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': THEME.bikeLane,
    'line-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.55, 15, 0.85],
    'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 0.8, 15, 1.8, 18, 4],
  },
};

/** Coloca `layer` antes (o después) de la capa `anchor`, si está; si no, no la añade. */
function insert(
  layers: LayerSpecification[],
  anchor: string,
  layer: LayerSpecification,
  where: 'before' | 'after' = 'before',
): void {
  const i = layers.findIndex((l) => l.id === anchor);
  if (i < 0) return;
  layers.splice(where === 'before' ? i : i + 1, 0, layer);
}

/**
 * Las etiquetas, después de todo lo demás. El estilo intercala alguna entre el suelo
 * (`water_name` va antes que los edificios y las calles), y los edificios en 3D van justo antes
 * de la primera: MapLibre pinta sin profundidad lo que queda encima de una capa 3D, así que las
 * calles y las plantas se veían a través de los volúmenes.
 */
function labelsLast(layers: readonly LayerSpecification[]): LayerSpecification[] {
  return [
    ...layers.filter((l) => l.type !== 'symbol'),
    ...layers.filter((l) => l.type === 'symbol'),
  ];
}

export function nightStyle(style: StyleSpecification): StyleSpecification {
  const layers = labelsLast(style.layers.map(withChanges));
  // Las capas nuevas, en el orden de prioridad de MapLibre (lo de más arriba se coloca antes):
  // barrios > metro > parques > calles principales > el resto de calles > portales.
  insert(layers, 'highway_name_other', STREET_MAJOR, 'after');
  insert(layers, 'highway_name_other', HOUSE_NUMBERS);
  insert(layers, 'place_other', PARKS);
  insert(layers, 'place_other', TRANSIT);
  // Encima de calles y plantas y debajo de los edificios en 3D, que van antes de la primera
  // etiqueta (StationMap).
  const firstLabel = layers.find((l) => l.type === 'symbol')?.id;
  if (firstLabel !== undefined && layers.some((l) => l.id === 'highway_minor')) {
    insert(layers, firstLabel, BIKE_LANES);
  }
  return { ...style, layers };
}

export async function loadNightStyle(signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(THEME.styleUrl, { signal });
  if (!response.ok)
    throw new Error(`El estilo del mapa base respondió ${String(response.status)}.`);
  return nightStyle((await response.json()) as StyleSpecification);
}
