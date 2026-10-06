import type { FramesResponse, StationItem, StationsResponse } from '../../api/client';

export const HOUR_MS = 3_600_000;

/** Inicio (ms, UTC) de la hora que contiene el instante: las ventanas de fotogramas son horas. */
export function hourOf(at: string): number {
  return Math.floor(Date.parse(at) / HOUR_MS) * HOUR_MS;
}

/**
 * Lo que daría GET /api/stations?at=… en un paso, montado a partir de los fotogramas: las
 * estaciones con versión vigente en ese instante y su estado. Sin el paso, `undefined`.
 */
export function stationsAt(frames: FramesResponse, at: string): StationsResponse | undefined {
  const t = Date.parse(at);
  const frame = frames.frames.find((f) => Date.parse(f.at) === t);
  if (frame === undefined) return undefined;
  const stations = frame.states.flatMap(({ station, state }): StationItem[] => {
    const s = frames.stations[station];
    if (s === undefined) return [];
    return [
      {
        id: s.id,
        sourceStationId: s.sourceStationId,
        name: s.name,
        address: s.address,
        district: s.district,
        neighbourhood: s.neighbourhood,
        longitude: s.longitude,
        latitude: s.latitude,
        capacity: s.capacity,
        // Igual que metadataAssumed en la API: atributos publicados después del instante.
        metadataAssumed: s.assumedUntil !== null && t < Date.parse(s.assumedUntil),
        state,
      },
    ];
  });
  return {
    source: frames.source,
    at: frame.at,
    atBasis: 'requested',
    toleranceMinutes: frames.toleranceMinutes,
    count: stations.length,
    truncated: frames.truncated,
    stations,
  };
}

/**
 * El último paso anterior o igual a `at` entre las ventanas ya cargadas, mientras llega el de
 * `at`. Solo si está dentro de la tolerancia de la fuente: uno más viejo sería el estado de otro
 * momento con la hora de este.
 */
export function latestFrameBefore(
  windows: Iterable<FramesResponse>,
  at: string,
): StationsResponse | undefined {
  const t = Date.parse(at);
  let best: { frames: FramesResponse; at: string; time: number } | undefined;
  for (const frames of windows) {
    for (const frame of frames.frames) {
      const time = Date.parse(frame.at);
      if (time <= t && (best === undefined || time > best.time))
        best = { frames, at: frame.at, time };
    }
  }
  if (best === undefined || t - best.time > best.frames.toleranceMinutes * 60_000) return undefined;
  return stationsAt(best.frames, best.at);
}
