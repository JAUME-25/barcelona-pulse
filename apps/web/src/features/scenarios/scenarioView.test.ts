import { describe, expect, it } from 'vitest';
import type { CoverageResponse } from '../../api/client';
import { figuresOf, formatArea } from './figures';
import { DEFAULT_SCENARIO, type Scenario } from './scenario';
import { noEffectMessage, reachData } from './scenarioView';

type Reach = CoverageResponse['geometries']['reach'][number];

const CIRCLE = {
  type: 'Polygon',
  coordinates: [
    [
      [2.18, 41.41],
      [2.19, 41.41],
      [2.19, 41.42],
      [2.18, 41.41],
    ],
  ],
};

function reach(partial: Partial<Reach> & Pick<Reach, 'kind'>): Reach {
  return { added: null, station: null, squareMetersInArea: 501_848, circle: CIRCLE, ...partial };
}

function response(
  s: Scenario,
  over: {
    gained?: number;
    lost?: number;
    reach?: Reach[];
    kind?: 'municipality' | 'district';
    name?: string;
  } = {},
): CoverageResponse {
  const area = 101_702_265;
  const base = 61_838_000;
  const gained = over.gained ?? 0;
  const lost = over.lost ?? 0;
  return {
    model: { name: 'cobertura-geometrica', version: 1, assumptions: [] },
    reference: {
      source: {
        id: 'bicing-bcn',
        name: 'Bicing',
        kind: 'observed',
        attribution: 'prueba',
        license: null,
        url: null,
      },
      at: '2026-08-30T21:55:00Z',
      atBasis: 'requested',
      stations: 544,
    },
    studyArea: {
      id: 'barcelona',
      name: over.name ?? 'Barcelona',
      kind: over.kind ?? 'municipality',
      areaSquareMeters: area,
      source: 'prueba',
      attribution: 'prueba',
      license: null,
      note: null,
    },
    radiusMeters: s.radius,
    added: s.added,
    moved: s.moved,
    removed: s.removed,
    base: { stations: 544, coveredSquareMeters: base, coveredShare: base / area },
    scenario: {
      stations: 544 + s.added.length - s.removed.length,
      coveredSquareMeters: base + gained - lost,
      coveredShare: (base + gained - lost) / area,
    },
    difference: { gainedSquareMeters: gained, lostSquareMeters: lost },
    geometries: {
      studyArea: null,
      base: null,
      scenario: null,
      gained: null,
      lost: null,
      reach: over.reach ?? [],
    },
  };
}

const oneAdded: Scenario = {
  ...DEFAULT_SCENARIO,
  radius: 400,
  added: [{ id: 'h1', longitude: 2.1835, latitude: 41.4165 }],
};

describe('noEffectMessage', () => {
  it('explica que una estación nueva en zona cubierta no añade superficie', () => {
    const r = response(oneAdded, { reach: [reach({ kind: 'added', added: 'h1' })] });
    expect(noEffectMessage(oneAdded, r)).toBe(
      'Esta estación no añade superficie: en Barcelona, todo lo que está a menos de 400 m de ella ya lo cubre la red real.',
    );
  });

  it('no dice nada si el escenario gana o pierde algo, o si no hay cambios', () => {
    const reachH1 = [reach({ kind: 'added' as const, added: 'h1' })];
    expect(noEffectMessage(oneAdded, response(oneAdded, { gained: 1, reach: reachH1 }))).toBeNull();
    expect(noEffectMessage(oneAdded, response(oneAdded, { lost: 3, reach: reachH1 }))).toBeNull();
    expect(noEffectMessage(DEFAULT_SCENARIO, response(DEFAULT_SCENARIO))).toBeNull();
  });

  it('distingue una estación fuera del área de estudio de una en zona cubierta', () => {
    const r = response(oneAdded, {
      kind: 'district',
      name: 'Eixample',
      reach: [reach({ kind: 'added', added: 'h1', squareMetersInArea: 0 })],
    });
    expect(noEffectMessage(oneAdded, r)).toBe(
      'Esta estación queda fuera del distrito: no cuenta para el porcentaje.',
    );
  });

  it('tiene su texto para quitar, para mover y para varios cambios a la vez', () => {
    const removed: Scenario = { ...DEFAULT_SCENARIO, removed: [12, 13] };
    expect(
      noEffectMessage(
        removed,
        response(removed, {
          reach: [reach({ kind: 'removed', station: 12 }), reach({ kind: 'removed', station: 13 })],
        }),
      ),
    ).toBe(
      'Quitarlas no resta superficie: en Barcelona, lo que cubrían lo cubren también otras estaciones.',
    );

    const moved: Scenario = {
      ...DEFAULT_SCENARIO,
      moved: [{ station: 7, longitude: 2.17, latitude: 41.39 }],
    };
    expect(noEffectMessage(moved, response(moved))).toMatch(/^Moverla no cambia la superficie:/);

    const mixed: Scenario = { ...oneAdded, removed: [12] };
    expect(noEffectMessage(mixed, response(mixed))).toBe(
      'Estos cambios no mueven la superficie cubierta en Barcelona.',
    );
  });
});

describe('reachData', () => {
  it('dibuja el alcance de las nuevas y movidas, no el de las quitadas', () => {
    const s: Scenario = {
      ...oneAdded,
      moved: [{ station: 7, longitude: 2.17, latitude: 41.39 }],
      removed: [12],
    };
    const r = response(s, {
      reach: [
        reach({ kind: 'added', added: 'h1' }),
        reach({ kind: 'moved', station: 7 }),
        reach({ kind: 'removed', station: 12 }),
      ],
    });
    expect(reachData(r, s).features.map((f) => f.properties.key)).toEqual(['a-h1', 'm-7']);
  });

  it('no dibuja un círculo de un cálculo anterior: otro sitio u otro radio', () => {
    const r = response(oneAdded, { reach: [reach({ kind: 'added', added: 'h1' })] });
    const elsewhere: Scenario = {
      ...oneAdded,
      added: [{ id: 'h1', longitude: 2.19, latitude: 41.42 }],
    };
    expect(reachData(r, elsewhere).features).toHaveLength(0);
    expect(reachData(r, { ...oneAdded, radius: 300 }).features).toHaveLength(0);
    expect(reachData(r, { ...oneAdded, added: [] }).features).toHaveLength(0);
    expect(reachData(undefined, oneAdded).features).toHaveLength(0);
  });
});

describe('figuras', () => {
  it('pone las superficies pequeñas en m² para que no salgan como 0,00 km²', () => {
    expect(formatArea(0)).toBe('0 m²');
    expect(formatArea(42)).toBe('menos de 100 m²');
    expect(formatArea(13_597)).toBe('13.600 m²');
    expect(formatArea(4_620)).toBe('4600 m²');
    expect(formatArea(282_289)).toBe('0,28 km²');
  });

  it('solo dice «sin cambio» si no gana ni pierde nada', () => {
    expect(figuresOf(response(oneAdded)).delta).toBe('sin cambio');
    const small = figuresOf(response(oneAdded, { gained: 3_000 }));
    expect([small.direction, small.delta]).toEqual(['up', 'menos de 0,01 puntos']);
    const big = figuresOf(response(oneAdded, { gained: 355_000 }));
    expect([big.direction, big.delta]).toEqual(['up', '+0,35 puntos']);
    const loss = figuresOf(response(oneAdded, { lost: 204_000 }));
    expect([loss.direction, loss.delta]).toEqual(['down', '-0,20 puntos']);
    // Gana lo mismo que pierde: el porcentaje no cambia, pero la cobertura sí.
    const moved = figuresOf(response(oneAdded, { gained: 282_000, lost: 282_000 }));
    expect([moved.direction, moved.delta]).toEqual(['same', '0,00 puntos']);
  });
});
