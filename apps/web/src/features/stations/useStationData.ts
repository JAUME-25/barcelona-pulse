import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  toApiError,
  type SourceSummary,
  type StationsResponse,
} from '../../api/client';

export type Remote<T> =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready'; data: T };

interface Keyed<T> {
  key: string;
  value: Remote<T>;
}

function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(
    'No se ha podido contactar con la API. Comprueba la conexión y vuelve a intentarlo.',
  );
}

/**
 * Pide `load` cada vez que cambia `key` y cancela la petición anterior: su respuesta
 * ya no vale. Mientras el resultado guardado sea de otra clave, el estado es «cargando».
 */
function useRemote<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): { state: Remote<T>; retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Keyed<T> | null>(null);
  const requestKey = key === null ? null : `${key}#${String(attempt)}`;

  useEffect(() => {
    if (requestKey === null) return;
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        setResult({ key: requestKey, value: { status: 'ready', data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, value: { status: 'error', error: asApiError(error) } });
      });
    return () => {
      controller.abort();
    };
    // `load` se recrea en cada render; la petición depende solo de la clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  const state: Remote<T> =
    result !== null && result.key === requestKey ? result.value : { status: 'loading' };
  return { state, retry };
}

/**
 * Fuente por defecto: una observada con datos; si no hay, la que tenga datos (la demo).
 * Nunca se mezclan: la vista muestra una sola fuente cada vez.
 */
export function pickDefaultSource(sources: readonly SourceSummary[]): SourceSummary | undefined {
  const withData = sources.filter((s) => s.period !== null);
  return withData.find((s) => s.kind === 'observed') ?? withData[0] ?? sources[0];
}

export function useSources() {
  return useRemote<SourceSummary[]>('sources', async (signal) => {
    const { data, error, response } = await api.GET('/api/sources', { signal });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });
}

export function useStations(sourceId: string | null) {
  return useRemote<StationsResponse>(sourceId, async (signal) => {
    const { data, error, response } = await api.GET('/api/stations', {
      params: { query: { source: sourceId ?? '' } },
      signal,
    });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });
}
