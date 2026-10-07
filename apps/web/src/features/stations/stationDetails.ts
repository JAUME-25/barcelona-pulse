import { api, toApiError, type StationDetailResponse } from '../../api/client';
import { useRemote, type Remote } from './useStationData';

/**
 * Detalles de estación ya pedidos en esta página (`GET /api/stations/{id}`, con sus versiones):
 * al reproducir, el detalle se vuelve a montar a cada paso y no hace falta pedirlo otra vez. Las
 * versiones no cambian hasta la siguiente ingesta; la página las vuelve a pedir al recargar.
 */
const LOADED = new Map<number, StationDetailResponse>();

/** Para las pruebas: cada una empieza sin detalles guardados. */
export function forgetStationDetails(): void {
  LOADED.clear();
}

async function loadDetail(stationId: number, at: string): Promise<StationDetailResponse> {
  const { data, error, response } = await api.GET('/api/stations/{id}', {
    params: { path: { id: stationId }, query: { at } },
  });
  if (data === undefined) throw toApiError(error, response);
  LOADED.set(stationId, data);
  return data;
}

/** El detalle de una estación (sus versiones), de la caché de la página si ya llegó. */
export function useStationDetail(stationId: number, at: string): Remote<StationDetailResponse> {
  const cached = LOADED.get(stationId);
  const remote = useRemote<StationDetailResponse>(
    cached === undefined ? `detail:${String(stationId)}` : null,
    () => loadDetail(stationId, at),
  );
  return cached === undefined ? remote.state : { status: 'ready', data: cached };
}
