import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  toApiError,
  type SourceSummary,
  type StationsResponse,
  type TimelineResponse,
} from '../../api/client';
import { t } from '../../i18n';

export type Remote<T> =
  { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready'; data: T };

interface Keyed<T> {
  key: string;
  value: Remote<T>;
}

export function asApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(t().api.unreachable);
}

/**
 * Pide `load` cada vez que cambia `key` y cancela la petición anterior: su respuesta
 * ya no vale. Mientras el resultado guardado sea de otra clave, el estado es «cargando».
 * `previous` es el último resultado bueno, sea de la clave que sea: quien lo use comprueba
 * que sigue valiendo (por ejemplo, que es de la misma fuente).
 */
export function useRemote<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
): { state: Remote<T>; previous: T | undefined; retry: () => void } {
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
  const previous = result?.value.status === 'ready' ? result.value.data : undefined;
  return { state, previous, retry };
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

/**
 * Instante que se pide para una fuente. Una observada cuyo último dato es más viejo que su
 * tolerancia es un histórico: se muestra su último momento disponible (avisando de que no es
 * el estado actual) en vez de «ahora», donde todo saldría desconocido.
 */
export function instantFor(source: SourceSummary | undefined, now: number): string | undefined {
  if (source?.kind !== 'observed' || source.period === null) return undefined;
  const age = now - Date.parse(source.period.to);
  return age > source.toleranceMinutes * 60_000 ? source.period.to : undefined;
}

export interface TimelineRange {
  from: string;
  to: string;
  stepMinutes: number;
}

export function useTimeline(sourceId: string | null, range: TimelineRange | null) {
  const key =
    sourceId === null || range === null
      ? null
      : `${sourceId}:${range.from}:${range.to}:${String(range.stepMinutes)}`;
  return useRemote<TimelineResponse>(key, async (signal) => {
    const { data, error, response } = await api.GET('/api/sources/{id}/timeline', {
      params: {
        path: { id: sourceId ?? '' },
        query: { from: range?.from, to: range?.to, step: range?.stepMinutes },
      },
      signal,
    });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });
}

export function useStations(sourceId: string | null, at?: string) {
  const key = sourceId === null ? null : `${sourceId}@${at ?? 'por-defecto'}`;
  return useRemote<StationsResponse>(key, async (signal) => {
    const { data, error, response } = await api.GET('/api/stations', {
      params: { query: { source: sourceId ?? '', ...(at === undefined ? {} : { at }) } },
      signal,
    });
    if (data === undefined) throw toApiError(error, response);
    return data;
  });
}
