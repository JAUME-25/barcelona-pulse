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
import type { SourceSummary, StationItem, StationsResponse } from '../api/client';
import { ReplayDeck } from '../features/history/ReplayDeck';
import { ModeSwitch, type Mode } from '../features/history/ReplayParts';
import { useFrames } from '../features/history/useFrames';
import { useReplay, type StationsProgress } from '../features/history/useReplay';
import { LimitsSheet } from '../features/limits/LimitsSheet';
import { MapStamp } from '../features/limits/MapStamp';
import { hasChanges } from '../features/scenarios/scenario';
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
import { sourceName } from '../features/stations/sources';
import { t } from '../i18n';
import { formatMonths } from '../shared/format';
import { readParam, writeParam } from '../shared/url';
import { LanguageSwitch } from './LanguageSwitch';
import './App.css';

// MapLibre es casi todo el JavaScript: el mapa llega en su propio fragmento y el panel y la lista
// no lo esperan (en un móvil medio, más de un segundo).
const StationMap = lazy(() =>
  import('../features/stations/StationMap').then((m) => ({ default: m.StationMap })),
);

const STATION_PARAM = 'estacion';
const SOURCE_PARAM = 'fuente';
const MODE_PARAM = 'modo';
const VIEW_PARAM = 'vista';
const VIEW_LIMITS = 'limites';
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
  const m = t().map;
  switch (status.kind) {
    case 'failed':
      return (
        <p className="map-message" role="status">
          {m.failed}
        </p>
      );
    case 'unsupported':
      return (
        <p className="map-message" role="status">
          {m.unsupported}
        </p>
      );
    case 'degraded':
      return (
        <p className="map-message map-message--soft" role="status">
          {m.degraded}
        </p>
      );
    case 'lost':
      return (
        <p className="map-message" role="status">
          {m.lost}
        </p>
      );
    default:
      return null;
  }
}

/**
 * Al reproducir, sin el estado de las estaciones del paso (llega o ha fallado): el mapa queda
 * vacío en vez de enseñar otro momento, y lo dice donde se mira.
 */
function ReplayStationsMessage({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const m = t().replay;
  return failed ? (
    <div className="map-message map-message--replay" role="alert">
      <p>{m.stationsFailed}</p>
      <button type="button" className="button" onClick={onRetry}>
        {t().app.retry}
      </button>
    </div>
  ) : (
    <p className="map-message map-message--replay" role="status">
      {m.stationsLoading}
    </p>
  );
}

/**
 * Al reproducir, el aviso de procedencia no enseña el instante (lo hace el reproductor): basta
 * la fuente. Así sigue a la vista mientras llega un paso y la cabecera no salta.
 */
function replayNotice(source: SourceSummary): StationsResponse {
  const { id, kind, name, attribution, license, url } = source;
  return {
    source: { id, kind, name, attribution, license, url },
    at: source.period?.to ?? '',
    atBasis: 'requested',
    toleranceMinutes: source.toleranceMinutes,
    count: 0,
    truncated: false,
    stations: [],
  };
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
  // «Qué muestra y qué no»: ocupa el panel y va en la URL (?vista=limites). Al llegar con el
  // enlace no se mueve el foco, como con una estación.
  const [sheet, setSheet] = useState(() =>
    readParam(VIEW_PARAM) === VIEW_LIMITS ? { byUser: false } : null,
  );
  const restoreLimitsFocusRef = useRef(false);
  // Solo se reproduce una fuente con datos; sin ellos, la vista es la de explorar.
  const replaying = mode === 'replay' && (source?.period ?? null) !== null;
  const experimenting = mode === 'experiment' && sourceId !== null;
  const shownMode: Mode = replaying ? 'replay' : experimenting ? 'experiment' : 'explore';
  // Mientras llega el estado de las estaciones, la reproducción espera; si no llega, se para.
  const stationsProgressRef = useRef<StationsProgress>('loading');
  const replay = useReplay(
    replaying ? source : undefined,
    initialMoment.day,
    initialMoment.time,
    stationsProgressRef,
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
    stationsProgressRef.current = stationsState.status;
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
  // fuente si está dentro de su tolerancia (useFrames): el mapa no parpadea en cada paso.
  const response =
    stationsState.status === 'ready'
      ? stationsState.data
      : replaying && previousStations?.source.id === sourceId
        ? previousStations
        : null;
  const notice = replaying && source !== undefined ? replayNotice(source) : response;
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

  const openSheet = () => {
    setSheet({ byUser: true });
    writeParam(VIEW_PARAM, VIEW_LIMITS);
  };
  const closeSheet = (restoreFocus: boolean) => {
    restoreLimitsFocusRef.current = restoreFocus;
    setSheet(null);
    writeParam(VIEW_PARAM, null);
  };

  // Al volver de la ficha con su botón, el foco regresa al enlace que la abrió.
  useEffect(() => {
    if (sheet !== null || !restoreLimitsFocusRef.current) return;
    restoreLimitsFocusRef.current = false;
    document.querySelector<HTMLButtonElement>('.source-notice__limits button')?.focus();
  }, [sheet]);

  // Desde la ficha: reproducir un día o abrir una estación sin dato (se marca en el mapa).
  const pickDay = (day: string) => {
    closeSheet(false);
    replay.selectDay(day);
    changeMode('replay');
  };
  const selectFromSheet = (id: number) => {
    closeSheet(false);
    select(id);
  };

  const mapUnavailable = mapStatus.kind === 'failed' || mapStatus.kind === 'unsupported';
  const m = t().app;

  let body: ReactNode;
  if (sourcesState.status === 'error') {
    body = (
      <div className="panel-status" role="alert">
        <p>
          {m.sourcesError} {sourcesState.error.message}
        </p>
        <button type="button" className="button" onClick={retrySources}>
          {m.retry}
        </button>
      </div>
    );
  } else if (sourcesState.status === 'ready' && sourceId === null) {
    body = (
      <div className="panel-status">
        <p>{m.noData}</p>
        <p className="panel-status__hint">
          {m.noDataHint(<code>docker compose run --rm api ingest demo</code>)}
        </p>
      </div>
    );
  } else if (stationsState.status === 'error') {
    body = (
      <div className="panel-status" role="alert">
        <p>
          {m.stationsError} {stationsState.error.message}
        </p>
        <button type="button" className="button" onClick={retryStations}>
          {m.retry}
        </button>
      </div>
    );
  } else if (response === null) {
    body = (
      <p className="panel-status" role="status">
        {m.loading}
      </p>
    );
  } else if (sheet !== null && source?.kind === 'observed') {
    // Al experimentar no se abre una estación: allí tocarla es quitarla del escenario.
    body = (
      <LimitsSheet
        source={source}
        response={response}
        focusOnOpen={sheet.byUser}
        onClose={() => {
          closeSheet(true);
        }}
        onPickDay={pickDay}
        onSelectStation={experimenting ? undefined : selectFromSheet}
      />
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
              {m.search}
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
            {m.count(filtered.length, all.length)}
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
            <p>{m.noMatch}</p>
            <button type="button" className="button" onClick={resetFilters}>
              {m.showAll}
            </button>
          </div>
        ) : (
          <>
            <h2 className="list-title">{m.listTitle}</h2>
            <StationList
              stations={filtered}
              at={response.at}
              selectedId={selectedId}
              onSelect={select}
            />
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
            <p className="brand__tagline">{t().brand.tagline}</p>
          </div>
          <LanguageSwitch />
        </div>
        <ModeSwitch mode={shownMode} onChange={changeMode} />
        {sources.length > 1 && (
          <label className="source-picker">
            {m.source}
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
                  {s.kind === 'synthetic' ? `${sourceName(s)} ${m.demoSuffix}` : sourceName(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        {notice !== null && (
          <SourceNotice
            response={notice}
            compact={replaying || experimenting}
            months={source === undefined ? null : formatMonths(source.days)}
            onLimits={notice.source.kind === 'observed' ? openSheet : undefined}
          />
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
            buildings={!experimenting}
            onSelect={experimenting ? tapStation : select}
            onStatusChange={setMapStatus}
            onMapReady={setMap}
          />
        </Suspense>
        <MapStatusMessage status={mapStatus} />
        {replaying && response === null && replay.point !== undefined && !mapUnavailable && (
          <ReplayStationsMessage
            failed={stationsState.status === 'error'}
            onRetry={retryStations}
          />
        )}
        {/* Sello de qué es y de cuándo: solo en móvil (CSS), donde el aviso queda arriba. */}
        {notice !== null && !mapUnavailable && (
          <MapStamp
            kind={notice.source.kind}
            at={replaying ? replay.point?.at : notice.at}
            experiment={experimenting}
            hypothetical={hasChanges(scenario.scenario)}
          />
        )}
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
