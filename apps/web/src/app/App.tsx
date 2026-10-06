import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { StationItem } from '../api/client';
import { ReplayDeck } from '../features/history/ReplayDeck';
import { ModeSwitch, type Mode } from '../features/history/ReplayParts';
import { useFrames } from '../features/history/useFrames';
import { useReplay } from '../features/history/useReplay';
import {
  ScenarioDeck,
  ScenarioPanel,
  type ScenarioViewProps,
} from '../features/scenarios/ScenarioDeck';
import { ScenarioLayers } from '../features/scenarios/ScenarioLayers';
import { CoverageLegend } from '../features/scenarios/ScenarioParts';
import type { Tool } from '../features/scenarios/scenarioView';
import { useScenario, useStudyAreas } from '../features/scenarios/useScenario';
import { AvailabilityFilter } from '../features/stations/AvailabilityFilter';
import {
  AVAILABILITY_ORDER,
  countByAvailability,
  filterStations,
  type Availability,
} from '../features/stations/availability';
import { BrandMark } from '../features/stations/OctagonGlyph';
import { SourceNotice } from '../features/stations/SourceNotice';
import { StationDetail } from '../features/stations/StationDetail';
import { StationList } from '../features/stations/StationList';
import type { MapStatus } from '../features/stations/StationMap';
import {
  instantFor,
  pickDefaultSource,
  useSources,
  useStations,
} from '../features/stations/useStationData';
import { plural } from '../shared/format';
import { readParam, writeParam } from '../shared/url';
import './App.css';

// MapLibre es casi todo el JavaScript: el mapa llega en su propio fragmento y el panel y la lista
// no lo esperan (en un móvil medio, más de un segundo).
const StationMap = lazy(() =>
  import('../features/stations/StationMap').then((m) => ({ default: m.StationMap })),
);

const STATION_PARAM = 'estacion';
const SOURCE_PARAM = 'fuente';
const MODE_PARAM = 'modo';
const MODE_IN_URL: Record<Mode, string | null> = {
  explore: null,
  replay: 'reproducir',
  experiment: 'experimentar',
};
const NO_STATIONS: readonly StationItem[] = [];

function modeFromUrl(): Mode {
  const value = readParam(MODE_PARAM);
  if (value === MODE_IN_URL.replay) return 'replay';
  if (value === MODE_IN_URL.experiment) return 'experiment';
  return 'explore';
}

/**
 * Lo que tapan los controles sobre el mapa en escritorio, para que el encuadre inicial use solo
 * la parte que se ve: la leyenda a la derecha y, al reproducir o experimentar, el mando abajo.
 */
const EXPLORE_FRAME = { right: 312, bottom: 48 };
const REPLAY_FRAME = { right: 312, bottom: 330 };
const EXPERIMENT_FRAME = { right: 312, bottom: 300 };

const readStationParam = () => readParam(STATION_PARAM);
const writeStationParam = (value: string | null) => {
  writeParam(STATION_PARAM, value);
};

function MapStatusMessage({ status }: { status: MapStatus }) {
  switch (status.kind) {
    case 'failed':
      return (
        <p className="map-message" role="status">
          No se ha podido cargar el mapa base. La lista de estaciones sigue disponible.
        </p>
      );
    case 'unsupported':
      return (
        <p className="map-message" role="status">
          Este navegador no puede dibujar el mapa porque no tiene WebGL2. La lista de estaciones
          sigue disponible.
        </p>
      );
    case 'degraded':
      return (
        <p className="map-message map-message--soft" role="status">
          Parte del mapa base no ha cargado.
        </p>
      );
    default:
      return null;
  }
}

export function App() {
  const { state: sourcesState, retry: retrySources } = useSources();
  // La fuente también va en la URL (?fuente=demo): enlaces compartibles y pruebas deterministas.
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(() =>
    readParam(SOURCE_PARAM),
  );
  const [now] = useState(() => Date.now());
  const sources = sourcesState.status === 'ready' ? sourcesState.data : [];
  const source =
    sources.find((s) => s.id === chosenSourceId) ?? pickDefaultSource(sources) ?? undefined;
  const sourceId = source?.id ?? null;

  const [mode, setMode] = useState<Mode>(modeFromUrl);
  const [initialMoment] = useState(() => ({ day: readParam('dia'), time: readParam('hora') }));
  // Solo se reproduce una fuente con datos; sin ellos, la vista es la de explorar.
  const replaying = mode === 'replay' && (source?.period ?? null) !== null;
  const experimenting = mode === 'experiment' && sourceId !== null;
  const shownMode: Mode = replaying ? 'replay' : experimenting ? 'experiment' : 'explore';
  // Si no llega el estado de las estaciones, la reproducción se para.
  const stationsFailedRef = useRef(false);
  const replay = useReplay(
    replaying ? source : undefined,
    initialMoment.day,
    initialMoment.time,
    stationsFailedRef,
  );

  // Al explorar, un instante con /api/stations; al reproducir, fotogramas de una hora.
  const explored = useStations(replaying ? null : sourceId, instantFor(source, now));
  const framed = useFrames(replaying ? sourceId : null, replay.point?.at);
  const {
    state: stationsState,
    previous: previousStations,
    retry: retryStations,
  } = replaying ? framed : explored;
  useEffect(() => {
    stationsFailedRef.current = stationsState.status === 'error';
  });

  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<ReadonlySet<Availability>>(
    () => new Set(AVAILABILITY_ORDER),
  );
  // La selección se guarda por identificador de origen: es lo que va en la URL
  // (?estacion=demo-008) y no depende de los ids internos de cada base de datos.
  const [selectedKey, setSelectedKey] = useState<string | null>(readStationParam);
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: 'loading' });
  const lastSelectedRef = useRef<number | null>(null);
  const restoreFocusRef = useRef(false);
  // Al abrir un enlace directo no se mueve el foco: la página quedaría desplazada fuera del mapa.
  const [selectedByUser, setSelectedByUser] = useState(false);
  const bodyRef = useRef<HTMLElement>(null);

  // Al reproducir, mientras llega el momento siguiente se sigue viendo el anterior de la misma
  // fuente: el mapa no parpadea en cada paso.
  const response =
    stationsState.status === 'ready'
      ? stationsState.data
      : replaying && previousStations?.source.id === sourceId
        ? previousStations
        : null;
  const all = response?.stations ?? NO_STATIONS;
  const counts = useMemo(() => countByAvailability(all), [all]);
  const filtered = useMemo(() => filterStations(all, query, visible), [all, query, visible]);
  const selected =
    selectedKey === null ? undefined : all.find((s) => s.sourceStationId === selectedKey);
  const selectedId = selected?.id ?? null;

  // Experimentar: la red real del instante y los cambios del escenario sobre ella.
  const scenario = useScenario(experimenting ? sourceId : null, instantFor(source, now));
  const { state: areasState } = useStudyAreas(experimenting);
  const areas = areasState.status === 'ready' ? areasState.data : [];
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [tool, setTool] = useState<Tool>(null);
  const { removed, moved } = scenario.scenario;
  const scenarioStations = useMemo(() => {
    if (removed.length === 0 && moved.length === 0) return all;
    const gone = new Set(removed);
    const movedTo = new Map(moved.map((m) => [m.station, m]));
    return all
      .filter((s) => !gone.has(s.id))
      .map((s) => {
        const m = movedTo.get(s.id);
        return m === undefined ? s : { ...s, longitude: m.longitude, latitude: m.latitude };
      });
  }, [all, removed, moved]);
  const { removeStation } = scenario;
  const tapStation = useCallback(
    (id: number) => {
      if (tool === 'remove') removeStation(id);
    },
    [tool, removeStation],
  );
  const scenarioView: ScenarioViewProps = {
    state: scenario,
    areas,
    stations: all,
    tool,
    onTool: setTool,
  };

  const select = useCallback(
    (id: number) => {
      const station = all.find((s) => s.id === id);
      if (station === undefined) return;
      lastSelectedRef.current = id;
      setSelectedByUser(true);
      setSelectedKey(station.sourceStationId);
      writeStationParam(station.sourceStationId);
    },
    [all],
  );

  const closeDetail = useCallback(() => {
    setSelectedKey(null);
    writeStationParam(null);
  }, []);

  const backToList = useCallback(() => {
    restoreFocusRef.current = true;
    closeDetail();
  }, [closeDetail]);

  // Al volver con el botón, el foco regresa a la estación que se estaba viendo.
  useEffect(() => {
    if (selectedId !== null || !restoreFocusRef.current || lastSelectedRef.current === null) {
      return;
    }
    restoreFocusRef.current = false;
    bodyRef.current
      ?.querySelector<HTMLButtonElement>(`[data-station-id="${String(lastSelectedRef.current)}"]`)
      ?.focus();
  }, [selectedId]);

  const toggleCategory = useCallback((category: Availability) => {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const resetFilters = () => {
    setQuery('');
    setVisible(new Set(AVAILABILITY_ORDER));
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setTool(null);
    writeParam(MODE_PARAM, MODE_IN_URL[next]);
  };

  const mapUnavailable = mapStatus.kind === 'failed' || mapStatus.kind === 'unsupported';

  let body: ReactNode;
  if (sourcesState.status === 'error') {
    body = (
      <div className="panel-status" role="alert">
        <p>No se han podido cargar las fuentes de datos. {sourcesState.error.message}</p>
        <button type="button" className="button" onClick={retrySources}>
          Reintentar
        </button>
      </div>
    );
  } else if (sourcesState.status === 'ready' && sourceId === null) {
    body = (
      <div className="panel-status">
        <p>Todavía no hay datos cargados.</p>
        <p className="panel-status__hint">
          En local, importa la demo con <code>docker compose run --rm api ingest demo</code>.
        </p>
      </div>
    );
  } else if (stationsState.status === 'error') {
    body = (
      <div className="panel-status" role="alert">
        <p>No se han podido cargar las estaciones. {stationsState.error.message}</p>
        <button type="button" className="button" onClick={retryStations}>
          Reintentar
        </button>
      </div>
    );
  } else if (response === null) {
    body = (
      <p className="panel-status" role="status">
        Cargando estaciones…
      </p>
    );
  } else if (experimenting) {
    body = <ScenarioPanel {...scenarioView} />;
  } else {
    body = (
      <>
        {/* Búsqueda siempre a mano, también con el detalle abierto. */}
        <div className="panel-tools">
          <div className="search">
            <label htmlFor="station-search" className="search__label">
              Buscar estación
            </label>
            <input
              id="station-search"
              className="search__input"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selectedKey !== null) closeDetail();
              }}
            />
          </div>
          <p className="panel-tools__count" aria-live="polite">
            {filtered.length === all.length
              ? plural(all.length, 'estación', 'estaciones')
              : `${filtered.length} de ${all.length} estaciones`}
          </p>
        </div>
        {selected !== undefined ? (
          <StationDetail
            station={selected}
            response={response}
            onBack={backToList}
            focusOnOpen={selectedByUser}
          />
        ) : filtered.length === 0 ? (
          <div className="panel-status">
            <p>Ninguna estación coincide con la búsqueda y los filtros.</p>
            <button type="button" className="button" onClick={resetFilters}>
              Mostrar todas
            </button>
          </div>
        ) : (
          <>
            <h2 className="list-title">Estaciones</h2>
            <StationList stations={filtered} selectedId={selectedId} onSelect={select} />
          </>
        )}
      </>
    );
  }

  return (
    <div
      className="app"
      data-map={mapUnavailable ? 'unavailable' : 'available'}
      data-map-status={mapStatus.kind}
      data-mode={shownMode}
      data-tool={experimenting ? (tool ?? undefined) : undefined}
    >
      <header className="panel-head">
        <div className="brand">
          <BrandMark />
          <div>
            <h1 className="brand__name">Barcelona Pulse</h1>
            <p className="brand__tagline">Estaciones de Bicing en el mapa</p>
          </div>
        </div>
        <ModeSwitch mode={shownMode} onChange={changeMode} />
        {sources.length > 1 && (
          <label className="source-picker">
            Fuente
            <select
              value={sourceId ?? ''}
              onChange={(e) => {
                setChosenSourceId(e.target.value);
                writeParam(SOURCE_PARAM, e.target.value);
                closeDetail();
              }}
            >
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.kind === 'synthetic' ? `${s.name} (demo)` : s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {response !== null && (
          <SourceNotice response={response} compact={replaying || experimenting} />
        )}
      </header>

      <div className="map-area">
        <Suspense fallback={<div className="station-map" aria-hidden="true" />}>
          <StationMap
            stations={experimenting ? scenarioStations : filtered}
            frame={all}
            frameKey={`${sourceId ?? ''}:${shownMode}`}
            framePadding={
              replaying ? REPLAY_FRAME : experimenting ? EXPERIMENT_FRAME : EXPLORE_FRAME
            }
            selectedId={experimenting ? null : selectedId}
            variant={experimenting ? 'network' : 'availability'}
            onSelect={experimenting ? tapStation : select}
            onStatusChange={setMapStatus}
            onMapReady={setMap}
          />
        </Suspense>
        <MapStatusMessage status={mapStatus} />
        {replaying && <ReplayDeck replay={replay} />}
        {experimenting && (
          <ScenarioLayers
            map={map}
            result={scenario.shown}
            scenario={scenario.scenario}
            stations={all}
            tool={tool}
            actions={scenario}
          />
        )}
        {experimenting && response !== null && <ScenarioDeck {...scenarioView} />}
        {response !== null && (
          <div className="map-legend">
            {experimenting ? (
              <CoverageLegend />
            ) : (
              <AvailabilityFilter counts={counts} visible={visible} onToggle={toggleCategory} />
            )}
          </div>
        )}
      </div>

      <main className="panel-body" ref={bodyRef}>
        {body}
      </main>
    </div>
  );
}
