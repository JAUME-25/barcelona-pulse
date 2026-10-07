import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { nightStyle, STREET_NAME } from './basemap';
import { octagonLowerPoints } from './octagon';

const original: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': 'rgb(12,12,12)' } },
    {
      id: 'highway_minor',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#181818', 'line-width': 2 },
    },
    {
      id: 'highway_path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      paint: { 'line-color': 'rgb(27 ,27 ,29)', 'line-dasharray': [1.5, 1.5] },
    },
    {
      id: 'highway_name_other',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      layout: { 'text-field': ['get', 'name_en'], 'text-transform': 'uppercase', 'text-size': 10 },
    },
    {
      id: 'place_suburb',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      maxzoom: 15,
      layout: { 'text-field': ['get', 'name_en'], 'text-size': 10 },
      paint: { 'text-color': 'rgb(101,101,101)' },
    },
    {
      id: 'place_other',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      maxzoom: 14,
      filter: ['==', ['get', 'class'], 'neighbourhood'],
      layout: { 'text-field': ['get', 'name_en'] },
    },
    {
      id: 'capa_que_no_conocemos',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      paint: { 'line-color': '#123456' },
    },
    {
      id: 'landcover_wood',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      paint: { 'fill-color': 'rgb(32,32,32)', 'fill-pattern': 'wood-pattern' },
    },
  ],
};

function layer(style: StyleSpecification, id: string) {
  const found = style.layers.find((l) => l.id === id);
  if (found === undefined) throw new Error(`Falta ${id}`);
  return found as unknown as {
    paint?: Record<string, unknown>;
    layout?: Record<string, unknown>;
    filter?: unknown;
    minzoom?: number;
    maxzoom?: number;
  };
}

/** Evalúa una expresión de MapLibre como lo hace el mapa, con las propiedades de una tesela. */
function evaluate(expression: unknown, properties: Record<string, unknown>, zoom = 16): unknown {
  const parsed = createExpression(expression, 'layers[highway_name_other].layout.text-field');
  if (parsed.result !== 'success') throw new Error(JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom }, { type: 'Feature', properties } as never);
}

describe('nightStyle', () => {
  const night = nightStyle(original);

  it('aclara calles y nombres de barrio sin perder el fondo oscuro', () => {
    expect(layer(night, 'background').paint?.['background-color']).toBe('#0b1422');
    expect(layer(night, 'highway_minor').paint?.['line-color']).toBe('#3b5072');
    expect(layer(night, 'highway_minor').paint?.['line-width']).toBe(2);
    expect(layer(night, 'place_suburb').paint?.['text-color']).toBe('#e2e8f0');
  });

  it('las calles peatonales, continuas: en Ciutat Vella no son caminos', () => {
    expect(layer(night, 'highway_path').paint?.['line-dasharray']).toBeUndefined();
    expect(layer(original, 'highway_path').paint?.['line-dasharray']).toEqual([1.5, 1.5]);
  });

  it('usa los nombres locales en vez de la traducción inglesa', () => {
    expect(layer(night, 'place_suburb').layout?.['text-field']).toEqual([
      'coalesce',
      ['get', 'name'],
      ['get', 'name_en'],
    ]);
  });

  it('muestra los barrios de clase quarter, también al acercarse (la tesela los trae desde z14)', () => {
    expect(JSON.stringify(layer(night, 'place_other').filter)).toContain('quarter');
    expect(layer(night, 'place_other').maxzoom).toBe(16);
    expect(layer(night, 'place_suburb').maxzoom).toBe(14);
  });

  it('calles: las principales antes y en negrita; el resto desde z14, sin pasillos del metro', () => {
    const other = layer(night, 'highway_name_other');
    expect(other.minzoom).toBe(14);
    expect(other.layout?.['text-field']).toEqual(STREET_NAME);
    expect(other.layout?.['text-transform']).toBe('none');
    expect(JSON.stringify(other.filter)).toContain('corridor');
    expect(layer(night, 'bp-street-major').layout?.['text-font']).toEqual(['Noto Sans Bold']);
  });

  it('no toca las capas que no conoce ni modifica el estilo original', () => {
    expect(layer(night, 'capa_que_no_conocemos').paint?.['line-color']).toBe('#123456');
    expect(layer(original, 'highway_minor').paint?.['line-color']).toBe('#181818');
    expect(original.layers).toHaveLength(8);
  });

  it('deja las etiquetas después del suelo, y cada referencia nueva en su sitio', () => {
    // Lo que va encima de una capa 3D se pinta sin profundidad: calles y plantas, debajo. Los
    // carriles bici, encima del suelo y antes de la primera etiqueta (allí van los edificios en
    // 3D). Lo de más arriba se coloca antes: barrios > metro > parques > calles > portales.
    expect(night.layers.map((l) => l.id)).toEqual([
      'background',
      'highway_minor',
      'highway_path',
      'capa_que_no_conocemos',
      'landcover_wood',
      'bp-bike-lanes',
      'bp-housenumber',
      'highway_name_other',
      'bp-street-major',
      'place_suburb',
      'bp-parks',
      'bp-transit',
      'place_other',
    ]);
  });

  it('pinta los bosques sin el patrón que no está en el sprite', () => {
    expect(layer(night, 'landcover_wood').paint?.['fill-pattern']).toBeUndefined();
    expect(layer(night, 'landcover_wood').paint?.['fill-color']).toBe('#112a1c');
    expect(layer(original, 'landcover_wood').paint?.['fill-pattern']).toBe('wood-pattern');
  });
});

describe('nombres de calle', () => {
  it.each([
    ['Carrer de Mallorca', 'Mallorca'],
    ["Carrer d'Aragó", 'Aragó'],
    ['Carrer d’Aragó', 'Aragó'],
    ['Carrer de la Diputació', 'Diputació'],
    ['Carrer de les Carolines', 'Carolines'],
    ["Carrer de l'Or", 'Or'],
    ['Carrer del Bisbe', 'Bisbe'],
    ['Carrer dels Almogàvers', 'Almogàvers'],
    ['Carrer Gran de Gràcia', 'Gran de Gràcia'],
    ['Avinguda Diagonal', 'Av. Diagonal'],
    ['Passeig de Gràcia', 'Pg. de Gràcia'],
    ['Plaça de Catalunya', 'Pl. de Catalunya'],
    ['Passatge de Méndez Vigo', 'Ptge. de Méndez Vigo'],
    ['Travessera de Gràcia', 'Trav. de Gràcia'],
    ['Gran Via de les Corts Catalanes', 'Gran Via de les Corts Catalanes'],
    ['Rambla de Catalunya', 'Rambla de Catalunya'],
    ['Via Laietana', 'Via Laietana'],
  ])('«%s» se escribe «%s»', (name, expected) => {
    expect(evaluate(STREET_NAME, { name })).toBe(expected);
  });

  it('sin nombre local usa el inglés; sin ninguno, nada', () => {
    expect(evaluate(STREET_NAME, { name_en: 'Carrer de Pau Claris' })).toBe('Pau Claris');
    expect(evaluate(STREET_NAME, {})).toBe('');
  });
});

describe('octagonLowerPoints', () => {
  it('solo admite niveles que cortan los lados rectos', () => {
    expect(octagonLowerPoints(0, 0, 100, 0.4)).toHaveLength(6);
    expect(() => octagonLowerPoints(0, 0, 100, 0.5)).toThrow(RangeError);
  });
});
