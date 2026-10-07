import { describe, expect, it } from 'vitest';
import raw from '../../../api/openapi/barcelona-pulse-api.json?raw';
import { readContract, referencedSchemas, typeText, type OpenApiDocument } from './openapi';

// El documento que la API genera al compilar y que la CI comprueba que está al día.
const document = JSON.parse(raw) as OpenApiDocument;

describe('el contrato leído del OpenAPI', () => {
  const contract = readContract(document);

  it('agrupa las rutas por etiqueta, en el orden de uso, y las ordena por ruta', () => {
    expect(contract.groups.map((g) => g.tag)).toEqual([
      'Sources',
      'Stations',
      'History',
      'Scenarios',
    ]);
    expect(contract.groups[1]?.endpoints.map((e) => `${e.method} ${e.path}`)).toEqual([
      'GET /api/stations',
      'GET /api/stations/{id}',
      'GET /api/stations/{id}/pattern',
    ]);
    expect(contract.title).toBe('Barcelona Pulse API');
    expect(contract.openapi).toMatch(/^3\.1/);
  });

  it('lee los parámetros con dónde van, si son obligatorios y su tipo', () => {
    const stations = contract.groups[1]?.endpoints[0];
    // La API valida `source` a mano (el 400 lo explica): el contrato no lo marca obligatorio.
    expect(stations?.parameters.map((p) => [p.name, p.in, p.required, p.type.text])).toEqual([
      ['source', 'query', false, 'string'],
      ['bbox', 'query', false, 'string'],
      ['at', 'query', false, 'string'],
    ]);
    expect(stations?.parameters[2]?.description).toMatch(/zona explícita/);
    expect(stations?.responses.map((r) => r.status)).toEqual(['200', '304', '400', '404']);
    expect(stations?.responses[0]?.type).toEqual({
      text: 'StationsResponse',
      ref: 'StationsResponse',
    });
    expect(stations?.id).toBe('get-api-stations');
  });

  it('la cobertura lleva cuerpo y cada esquema sus propiedades con tipo y descripción', () => {
    const coverage = contract.groups[3]?.endpoints.find((e) => e.method === 'POST');
    expect(coverage?.requestBody).toEqual({ text: 'CoverageRequest', ref: 'CoverageRequest' });

    const station = contract.schemas.find((s) => s.name === 'StationItem');
    const altitude = station?.properties.find((p) => p.name === 'altitude');
    expect(altitude?.type.text).toBe('number (double) | null');
    expect(altitude?.required).toBe(true);
    expect(altitude?.description).toMatch(/metros/);
    const state = station?.properties.find((p) => p.name === 'state');
    expect(state?.type).toEqual({ text: 'StationState', ref: 'StationState' });

    const freshness = contract.schemas.find((s) => s.name === 'Freshness');
    expect(freshness?.values).toEqual(['current', 'stale', 'none']);
  });

  it('solo se enseñan los esquemas que alguna ruta nombra, directa o indirectamente', () => {
    const used = referencedSchemas(contract);
    expect(used.has('StationsResponse')).toBe(true);
    expect(used.has('StationState')).toBe(true);
    expect(used.has('ProblemDetails')).toBe(true);
    // Lo que ningún contrato nombra no sale.
    expect(used.has('Nada')).toBe(false);
  });
});

describe('el texto de un tipo', () => {
  it('cubre básicos, formatos, nulos, listas, enumeraciones y referencias', () => {
    expect(typeText({ type: 'string' })).toEqual({ text: 'string', ref: null });
    expect(typeText({ type: 'integer', format: 'int64' })).toEqual({
      text: 'integer (int64)',
      ref: null,
    });
    expect(typeText({ type: ['null', 'string'] })).toEqual({ text: 'string | null', ref: null });
    expect(typeText({ type: 'array', items: { $ref: '#/components/schemas/Frame' } })).toEqual({
      text: 'Frame[]',
      ref: 'Frame',
    });
    expect(typeText({ enum: ['a', 'b'] })).toEqual({ text: 'a | b', ref: null });
    expect(typeText(undefined)).toEqual({ text: '?', ref: null });
  });
});
