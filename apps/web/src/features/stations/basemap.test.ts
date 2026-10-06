import type { StyleSpecification } from 'maplibre-gl';
import { describe, expect, it } from 'vitest';
import { nightStyle } from './basemap';
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
      id: 'place_suburb',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      layout: { 'text-field': ['get', 'name_en'], 'text-size': 10 },
      paint: { 'text-color': 'rgb(101,101,101)' },
    },
    {
      id: 'place_other',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
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
  };
}

describe('nightStyle', () => {
  const night = nightStyle(original);

  it('aclara calles y nombres de barrio sin perder el fondo oscuro', () => {
    expect(layer(night, 'background').paint?.['background-color']).toBe('#0b1422');
    expect(layer(night, 'highway_minor').paint?.['line-color']).toBe('#2b3b55');
    expect(layer(night, 'highway_minor').paint?.['line-width']).toBe(2);
    expect(layer(night, 'place_suburb').paint?.['text-color']).toBe('#e2e8f0');
  });

  it('usa los nombres locales en vez de la traducción inglesa', () => {
    expect(layer(night, 'place_suburb').layout?.['text-field']).toEqual([
      'coalesce',
      ['get', 'name'],
      ['get', 'name_en'],
    ]);
  });

  it('muestra también los barrios de clase quarter', () => {
    expect(JSON.stringify(layer(night, 'place_other').filter)).toContain('quarter');
  });

  it('no toca las capas que no conoce ni modifica el estilo original', () => {
    expect(layer(night, 'capa_que_no_conocemos').paint?.['line-color']).toBe('#123456');
    expect(layer(original, 'highway_minor').paint?.['line-color']).toBe('#181818');
  });

  it('deja las etiquetas después del suelo, donde van los edificios en 3D', () => {
    // Lo que va encima de una capa 3D se pinta sin profundidad: calles y plantas, debajo.
    expect(night.layers.map((l) => l.id)).toEqual([
      'background',
      'highway_minor',
      'capa_que_no_conocemos',
      'landcover_wood',
      'place_suburb',
      'place_other',
    ]);
  });

  it('pinta los bosques sin el patrón que no está en el sprite', () => {
    expect(layer(night, 'landcover_wood').paint?.['fill-pattern']).toBeUndefined();
    expect(layer(night, 'landcover_wood').paint?.['fill-color']).toBe('#0f2219');
    expect(layer(original, 'landcover_wood').paint?.['fill-pattern']).toBe('wood-pattern');
  });
});

describe('octagonLowerPoints', () => {
  it('solo admite niveles que cortan los lados rectos', () => {
    expect(octagonLowerPoints(0, 0, 100, 0.4)).toHaveLength(6);
    expect(() => octagonLowerPoints(0, 0, 100, 0.5)).toThrow(RangeError);
  });
});
