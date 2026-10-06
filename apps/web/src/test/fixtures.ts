import type {
  FramesResponse,
  SourceSummary,
  StationItem,
  StationsResponse,
  StationState,
} from '../api/client';

type StationOverrides = Partial<Omit<StationItem, 'state'>> & { state?: Partial<StationState> };

/** Los atributos de una estación tal como llegan en los fotogramas. */
export function frameStation(
  s: StationItem,
  assumedUntil: string | null = null,
): FramesResponse['stations'][number] {
  return {
    id: s.id,
    sourceStationId: s.sourceStationId,
    name: s.name,
    address: s.address,
    district: s.district,
    neighbourhood: s.neighbourhood,
    longitude: s.longitude,
    latitude: s.latitude,
    capacity: s.capacity,
    assumedUntil,
  };
}

export function stationFixture(overrides: StationOverrides = {}): StationItem {
  const { state, ...rest } = overrides;
  return {
    id: 1,
    sourceStationId: 'demo-001',
    name: 'Pl. de Catalunya',
    address: null,
    district: null,
    neighbourhood: null,
    longitude: 2.1699,
    latitude: 41.387,
    capacity: 27,
    metadataAssumed: false,
    ...rest,
    state: {
      freshness: 'current',
      lastObservedAt: '2026-03-10T09:00:00+00:00',
      status: 'in_service',
      bikesAvailable: 10,
      mechanicalBikesAvailable: 6,
      ebikesAvailable: 4,
      docksAvailable: 15,
      bikesDisabled: 0,
      docksDisabled: 1,
      isRenting: true,
      isReturning: true,
      qualityFlags: [],
      ...state,
    },
  };
}

export const demoSource: SourceSummary = {
  id: 'demo',
  kind: 'synthetic',
  name: 'Demo sintética',
  attribution: 'Datos sintéticos de Barcelona Pulse.',
  license: null,
  url: null,
  toleranceMinutes: 30,
  stationCount: 3,
  period: {
    from: '2026-03-10T06:00:00+00:00',
    to: '2026-03-10T09:00:00+00:00',
    observationCount: 30,
  },
  lastIngestion: null,
};

export const observedSource: SourceSummary = {
  id: 'bicing-bcn',
  kind: 'observed',
  name: 'Bicing, histórico del Ajuntament de Barcelona',
  attribution: 'Fuente de los datos: Ayuntamiento de Barcelona.',
  license: 'CC BY 4.0',
  url: 'https://opendata-ajuntament.barcelona.cat/data/es/dataset/estat-estacions-bicing',
  toleranceMinutes: 15,
  stationCount: 3,
  period: {
    from: '2026-08-19T22:00:00+00:00',
    to: '2026-08-20T21:55:02+00:00',
    observationCount: 300,
  },
  lastIngestion: null,
};

export function stationsResponse(
  stations: StationItem[],
  overrides: Partial<StationsResponse> = {},
): StationsResponse {
  return {
    source: {
      id: 'demo',
      kind: 'synthetic',
      name: 'Demo sintética',
      attribution: 'Datos sintéticos de Barcelona Pulse.',
      license: null,
      url: null,
    },
    at: '2026-03-10T09:00:00+00:00',
    atBasis: 'latest_observation',
    toleranceMinutes: 30,
    count: stations.length,
    truncated: false,
    stations,
    ...overrides,
  };
}

/** Respuesta de la fuente real pedida en un momento del histórico. */
export function observedResponse(stations: StationItem[]): StationsResponse {
  return stationsResponse(stations, {
    source: {
      id: observedSource.id,
      kind: 'observed',
      name: observedSource.name,
      attribution: observedSource.attribution,
      license: observedSource.license,
      url: observedSource.url,
    },
    at: '2026-08-20T21:55:02+00:00',
    atBasis: 'requested',
    toleranceMinutes: 15,
  });
}
