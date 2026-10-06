import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  toApiError,
  type ApiError,
  type FramesResponse,
  type StationsResponse,
} from '../../api/client';
import { asApiError, type Remote } from '../stations/useStationData';
import { HOUR_MS, hourOf, latestFrameBefore, stationsAt } from './frames';

type Entry = { status: 'ready'; data: FramesResponse } | { status: 'error'; error: ApiError };

/** Horas que se guardan en memoria: la actual, la siguiente y algunas ya vistas. */
const MAX_HOURS = 8;
/** Mientras se arrastra por la pista no se pide nada: solo la hora en la que se para. */
const SETTLE_MS = 150;

const keyOf = (sourceId: string, hour: number) => `${sourceId}|${String(hour)}`;
const hourOfKey = (key: string) => Number(key.slice(key.lastIndexOf('|') + 1));

async function loadFrames(
  sourceId: string,
  hour: number,
  signal: AbortSignal,
): Promise<FramesResponse> {
  const { data, error, response } = await api.GET('/api/sources/{id}/frames', {
    params: { path: { id: sourceId }, query: { from: new Date(hour).toISOString(), step: 5 } },
    signal,
  });
  if (data === undefined) throw toApiError(error, response);
  return data;
}

/**
 * Estado de las estaciones al reproducir, a partir de fotogramas: una petición por hora del
 * día (12 pasos de 5 min) en vez de una por paso, y la hora siguiente pedida por adelantado.
 * Mientras llega una hora se ofrece en `previous` el último paso anterior ya cargado, si está
 * dentro de la tolerancia de la fuente; si la hora ha fallado, nada.
 */
export function useFrames(sourceId: string | null, at: string | undefined) {
  const [entries, setEntries] = useState<ReadonlyMap<string, Entry>>(() => new Map());
  const [attempt, setAttempt] = useState(0);
  const entriesRef = useRef(entries);
  const inFlight = useRef(new Set<string>());
  const hour = at === undefined ? null : hourOf(at);

  useEffect(() => {
    entriesRef.current = entries;
  });

  // Al desmontar se cancelan las peticiones pendientes: sus respuestas ya no sirven.
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (sourceId === null || hour === null) return;
    const missing = [hour, hour + HOUR_MS]
      .map((h) => keyOf(sourceId, h))
      .filter((k) => !entriesRef.current.has(k) && !inFlight.current.has(k));
    if (missing.length === 0) return;

    const store = (key: string, entry: Entry) => {
      setEntries((previous) => {
        const next = new Map(previous);
        next.set(key, entry);
        // Se olvidan primero las horas más lejanas a la que acaba de llegar.
        const around = hourOfKey(key);
        const byDistance = [...next.keys()].sort(
          (a, b) => Math.abs(hourOfKey(b) - around) - Math.abs(hourOfKey(a) - around),
        );
        for (const old of byDistance.slice(0, Math.max(0, next.size - MAX_HOURS))) {
          next.delete(old);
        }
        return next;
      });
    };

    const timer = window.setTimeout(() => {
      const signal = controllerRef.current?.signal ?? new AbortController().signal;
      for (const key of missing) {
        if (inFlight.current.has(key)) continue;
        inFlight.current.add(key);
        loadFrames(sourceId, hourOfKey(key), signal)
          .then((data) => {
            store(key, { status: 'ready', data });
          })
          .catch((error: unknown) => {
            if (!signal.aborted) store(key, { status: 'error', error: asApiError(error) });
          })
          .finally(() => {
            inFlight.current.delete(key);
          });
      }
    }, SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [sourceId, hour, attempt]);

  const current =
    sourceId === null || hour === null ? undefined : entries.get(keyOf(sourceId, hour));
  const response = useMemo(
    () =>
      current?.status === 'ready' && at !== undefined ? stationsAt(current.data, at) : undefined,
    [current, at],
  );
  const state: Remote<StationsResponse> =
    current?.status === 'error'
      ? { status: 'error', error: current.error }
      : response !== undefined
        ? { status: 'ready', data: response }
        : { status: 'loading' };

  const failed = current?.status === 'error';
  const previous = useMemo(() => {
    if (response !== undefined || failed || sourceId === null || at === undefined) return undefined;
    const loaded: FramesResponse[] = [];
    for (const [key, entry] of entries) {
      if (key.startsWith(`${sourceId}|`) && entry.status === 'ready') loaded.push(entry.data);
    }
    return latestFrameBefore(loaded, at);
  }, [response, failed, entries, sourceId, at]);

  const retry = useCallback(() => {
    if (sourceId === null || hour === null) return;
    const key = keyOf(sourceId, hour);
    setEntries((previousEntries) => {
      const next = new Map(previousEntries);
      next.delete(key);
      return next;
    });
    setAttempt((n) => n + 1);
  }, [sourceId, hour]);

  return { state, previous, retry };
}
