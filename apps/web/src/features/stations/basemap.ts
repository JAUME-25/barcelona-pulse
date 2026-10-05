import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { THEME } from '../../app/theme';

/**
 * Convierte el estilo «dark» de OpenFreeMap en la noche de Fanals: fondo azul noche en vez
 * de negro, calles visibles, nombres de calle y de barrio legibles, parques y agua
 * distinguibles. Solo cambia colores, tamaños y nombres; si una capa desaparece del estilo
 * original, se ignora.
 */

type Props = Record<string, unknown>;

const NIGHT = THEME.night;
const LABEL_HALO = 'rgba(11, 20, 34, 0.92)';

/** Nombres locales (los de las placas de la calle), no la traducción inglesa. */
const LOCAL_NAME: ExpressionSpecification = ['coalesce', ['get', 'name'], ['get', 'name_en']];

const PAINT: Record<string, Props> = {
  background: { 'background-color': NIGHT },
  water: { 'fill-color': '#0f2234' },
  waterway: { 'line-color': '#0f2234' },
  landuse_residential: { 'fill-color': '#0e1a2b' },
  landcover_wood: { 'fill-color': '#0f2219' },
  landuse_park: { 'fill-color': '#10251b' },
  building: { 'fill-color': '#132036' },
  road_area_pier: { 'fill-color': '#0e1a2b' },
  road_pier: { 'line-color': '#0e1a2b' },
  highway_path: { 'line-color': '#23324a' },
  highway_minor: { 'line-color': '#2b3b55' },
  highway_major_casing: { 'line-color': 'rgba(150, 170, 200, 0.35)' },
  highway_major_inner: { 'line-color': '#31435f' },
  highway_major_subtle: { 'line-color': '#31435f' },
  highway_motorway_casing: { 'line-color': 'rgba(170, 190, 220, 0.42)' },
  highway_motorway_inner: { 'line-color': '#41557a' },
  highway_motorway_subtle: { 'line-color': '#31435f' },
  railway: { 'line-color': '#2b3954' },
  railway_transit: { 'line-color': '#2b3954' },
  railway_minor: { 'line-color': '#2b3954' },
  railway_dashline: { 'line-color': NIGHT },
  railway_transit_dashline: { 'line-color': NIGHT },
  railway_minor_dashline: { 'line-color': NIGHT },
  highway_name_other: {
    'text-color': '#b4c0cf',
    'text-halo-color': LABEL_HALO,
    'text-halo-width': 1.6,
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
  highway_name_other: { 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11.5, 17, 15] },
  place_suburb: {
    'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 15, 16],
    'text-letter-spacing': 0.08,
  },
  place_other: { 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 12, 16, 14.5] },
  place_village: { 'text-size': 12.5 },
  place_town: { 'text-size': 13 },
  place_city: { 'text-size': 15 },
  place_city_large: { 'text-size': 17 },
};

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

function withChanges(layer: LayerSpecification): LayerSpecification {
  const paint: Props = {
    ...(('paint' in layer ? layer.paint : undefined) ?? {}),
    ...PAINT[layer.id],
  };
  const layout: Props = {
    ...(('layout' in layer ? layer.layout : undefined) ?? {}),
    ...LAYOUT[layer.id],
  };

  if (PLACE_LAYERS.includes(layer.id)) {
    Object.assign(paint, {
      'text-color': '#e2e8f0',
      'text-halo-color': LABEL_HALO,
      'text-halo-width': 1.6,
    });
  }
  if (layer.type === 'symbol' && 'text-field' in layout && /place|name/.test(layer.id)) {
    layout['text-field'] = LOCAL_NAME;
  }

  const changed = { ...layer, paint, layout } as LayerSpecification;
  if (layer.id === 'place_other')
    (changed as { filter?: FilterSpecification }).filter = PLACE_OTHER_FILTER;
  return changed;
}

export function nightStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.map(withChanges) };
}

export async function loadNightStyle(signal: AbortSignal): Promise<StyleSpecification> {
  const response = await fetch(THEME.styleUrl, { signal });
  if (!response.ok)
    throw new Error(`El estilo del mapa base respondió ${String(response.status)}.`);
  return nightStyle((await response.json()) as StyleSpecification);
}
