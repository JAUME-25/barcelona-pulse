import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO,
  MAX_MOVED,
  MAX_REMOVED,
  resolveLinks,
  scenarioFromParams,
  scenarioToParams,
} from './scenario';

const network = Array.from({ length: 300 }, (_, i) => ({
  id: i + 1,
  sourceStationId: `b${String(i + 1)}`,
}));

describe('escenario en la URL', () => {
  it('un enlace con más cambios de los que calcula la API se queda en los topes', () => {
    const links = {
      moved: network
        .slice(0, 150)
        .map((s) => ({ station: s.sourceStationId, longitude: 2.17, latitude: 41.39 })),
      removed: network.slice(150).map((s) => s.sourceStationId),
    };
    const scenario = resolveLinks(DEFAULT_SCENARIO, links, network);
    expect(scenario.moved).toHaveLength(MAX_MOVED);
    expect(scenario.removed).toHaveLength(MAX_REMOVED);
  });

  it('ida y vuelta: las estaciones reales van con su identificador de la fuente', () => {
    const scenario = {
      ...DEFAULT_SCENARIO,
      radius: 400,
      added: [{ id: 'h1', longitude: 2.16612, latitude: 41.38345 }],
      moved: [{ station: 3, longitude: 2.17, latitude: 41.4 }],
      removed: [7],
    };
    const params = new URLSearchParams();
    scenarioToParams(scenario, params, (id) => network.find((s) => s.id === id)?.sourceStationId);
    expect(params.get('retiradas')).toBe('b7');

    const back = scenarioFromParams(params);
    expect(back.scenario.radius).toBe(400);
    expect(back.scenario.added).toEqual(scenario.added);
    expect(resolveLinks(back.scenario, back.links, network)).toMatchObject({
      moved: [{ station: 3, longitude: 2.17, latitude: 41.4 }],
      removed: [7],
    });
  });
});
