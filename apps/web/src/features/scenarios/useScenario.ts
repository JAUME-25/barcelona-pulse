import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, toApiError, type CoverageResponse, type StudyAreaItem } from '../../api/client';
import { replaceUrl } from '../../shared/url';
import { useRemote } from '../stations/useStationData';
import {
  coverageRequest,
  DEFAULT_SCENARIO,
  insideServiceArea,
  MAX_ADDED,
  nextHypotheticalId,
  resolveLinks,
  scenarioFromParams,
  scenarioToParams,
  type Scenario,
  type ScenarioLinks,
  type StationIds,
} from './scenario';

/** Espera tras el último cambio antes de calcular: arrastrar no lanza un cálculo por píxel. */
const SETTLE_MS = 300;
/** Cambios que se pueden deshacer. */
const MAX_UNDO = 50;

export function useStudyAreas(enabled: boolean) {
  return useRemote<StudyAreaItem[]>(enabled ? 'study-areas' : null, async (signal) => {
    const { data, error, response } = await api.GET('/api/study-areas', { signal });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });
}

interface History {
  present: Scenario;
  past: Scenario[];
  /** Último tipo de cambio: mover el radio varias veces seguidas se deshace de una vez. */
  last: string | null;
}

/**
 * Escenario de cobertura: los cambios sobre la red real (añadidas, movidas, quitadas), el radio y
 * el área de estudio. Va en la URL y se calcula en la API un momento después del último cambio.
 * Sin fuente no pide nada. Las estaciones reales del enlace esperan a la red (`stations`) para
 * saber su identificador interno: hasta entonces ni se calcula ni se reescribe la URL.
 */
export function useScenario(
  sourceId: string | null,
  at: string | undefined,
  stations: readonly StationIds[],
) {
  const [initial] = useState(() => scenarioFromParams(new URLSearchParams(window.location.search)));
  const [history, setHistory] = useState<History>(() => ({
    present: initial.scenario,
    past: [],
    last: null,
  }));
  const scenario = history.present;
  const [links, setLinks] = useState<ScenarioLinks | null>(() =>
    initial.links.moved.length > 0 ||
    initial.links.removed.length > 0 ||
    initial.scenario.moved.length > 0 ||
    initial.scenario.removed.length > 0
      ? initial.links
      : null,
  );

  // En cuanto llega la red, se ajusta al pintar (no hace falta otro efecto).
  if (links !== null && stations.length > 0) {
    setHistory((h) => ({ ...h, present: resolveLinks(h.present, links, stations) }));
    setLinks(null);
  }

  const sourceIds = useMemo(
    () => new Map(stations.map((s) => [s.id, s.sourceStationId])),
    [stations],
  );
  useEffect(() => {
    // Solo al experimentar: al reproducir, la red cambia en cada paso y cada cambio de URL cuenta
    // para el límite de Safari (y la hora final dejaba de guardarse).
    if (sourceId === null) return;
    // Sin la red (mientras llega otra vez) se perderían de la URL las estaciones reales.
    const changesStations = scenario.moved.length > 0 || scenario.removed.length > 0;
    if (links !== null || (changesStations && sourceIds.size === 0)) return;
    const url = new URL(window.location.href);
    scenarioToParams(scenario, url.searchParams, (id) => sourceIds.get(id));
    if (url.href !== window.location.href) replaceUrl(url);
  }, [sourceId, scenario, links, sourceIds]);

  const requestKey =
    sourceId === null || links !== null
      ? null
      : JSON.stringify(coverageRequest(scenario, sourceId, at));
  const [settledKey, setSettledKey] = useState(requestKey);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettledKey(requestKey);
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [requestKey]);

  const {
    state: result,
    previous,
    retry,
  } = useRemote<CoverageResponse>(settledKey, async (signal) => {
    if (settledKey === null) throw new Error('Sin escenario');
    const { data, error, response } = await api.POST('/api/scenarios/coverage', {
      body: JSON.parse(settledKey) as ReturnType<typeof coverageRequest>,
      signal,
    });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });

  const update = useCallback((kind: string, change: (s: Scenario) => Scenario) => {
    setHistory((h) => {
      const next = change(h.present);
      if (next === h.present) return h;
      const merge = kind === 'radius' && h.last === 'radius';
      return {
        present: next,
        past: merge ? h.past : [...h.past.slice(1 - MAX_UNDO), h.present],
        last: kind,
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      const previousScenario = h.past.at(-1);
      return previousScenario === undefined
        ? h
        : { present: previousScenario, past: h.past.slice(0, -1), last: null };
    });
  }, []);

  /** Añade una estación hipotética; fuera del área de servicio o con el máximo, no hace nada. */
  const add = useCallback(
    (longitude: number, latitude: number) => {
      if (!insideServiceArea(longitude, latitude)) return;
      update('add', (s) =>
        s.added.length >= MAX_ADDED
          ? s
          : { ...s, added: [...s.added, { id: nextHypotheticalId(s.added), longitude, latitude }] },
      );
    },
    [update],
  );

  const moveHypothetical = useCallback(
    (id: string, longitude: number, latitude: number) => {
      if (!insideServiceArea(longitude, latitude)) return;
      update('move', (s) => ({
        ...s,
        added: s.added.map((h) => (h.id === id ? { ...h, longitude, latitude } : h)),
      }));
    },
    [update],
  );

  const removeHypothetical = useCallback(
    (id: string) => {
      update('remove', (s) => ({ ...s, added: s.added.filter((h) => h.id !== id) }));
    },
    [update],
  );

  const moveStation = useCallback(
    (station: number, longitude: number, latitude: number) => {
      if (!insideServiceArea(longitude, latitude)) return;
      update('move', (s) => ({
        ...s,
        moved: [...s.moved.filter((m) => m.station !== station), { station, longitude, latitude }],
        removed: s.removed.filter((id) => id !== station),
      }));
    },
    [update],
  );

  const removeStation = useCallback(
    (station: number) => {
      update('remove', (s) =>
        s.removed.includes(station)
          ? s
          : {
              ...s,
              moved: s.moved.filter((m) => m.station !== station),
              removed: [...s.removed, station],
            },
      );
    },
    [update],
  );

  const restoreStation = useCallback(
    (station: number) => {
      update('restore', (s) => ({
        ...s,
        moved: s.moved.filter((m) => m.station !== station),
        removed: s.removed.filter((id) => id !== station),
      }));
    },
    [update],
  );

  const setRadius = useCallback(
    (radius: number) => {
      update('radius', (s) => (s.radius === radius ? s : { ...s, radius }));
    },
    [update],
  );

  const setArea = useCallback(
    (area: string) => {
      update('area', (s) => (s.area === area ? s : { ...s, area }));
    },
    [update],
  );

  /** Vuelve a la red real; el radio y el área se quedan. */
  const reset = useCallback(() => {
    update('reset', (s) => ({ ...DEFAULT_SCENARIO, area: s.area, radius: s.radius }));
  }, [update]);

  // Mientras llega el cálculo nuevo, el anterior de la misma fuente sigue en pantalla.
  const shown =
    result.status === 'ready'
      ? result.data
      : previous?.reference.source.id === sourceId
        ? previous
        : undefined;
  const pending = settledKey !== requestKey || result.status === 'loading';

  return {
    scenario,
    result,
    shown,
    pending,
    retry,
    canUndo: history.past.length > 0,
    undo,
    add,
    moveHypothetical,
    removeHypothetical,
    moveStation,
    removeStation,
    restoreStation,
    setRadius,
    setArea,
    reset,
  };
}

export type ScenarioState = ReturnType<typeof useScenario>;
