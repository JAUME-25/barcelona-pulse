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
import { availableDays, momentLikeNow, type Moment } from '../features/history/moment';
import { ReplayDeck } from '../features/history/ReplayDeck';
import { ModeSwitch, type Mode } from '../features/history/ReplayParts';
import { formatLocalDay, localClock } from '../features/history/time';
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
import { AvailabilityFilter, type NumberMode } from '../features/stations/AvailabilityFilter';
import {
  activePreset,
  AVAILABILITY_ORDER,
  countByAvailability,
  filterStations,
  LIST_ORDERS,
  normalizeForSearch,
  PRESET_VIEW,
  sortStations,
  type Availability,
  type ListOrder,
  type Preset,
} from '../features/stations/availability';
import { districtKey, summarizeByDistrict } from '../features/stations/districts';
import { DistrictSummary } from '../features/stations/DistrictSummary';
import { BrandMark } from '../features/stations/OctagonGlyph';
import { SourceNotice } from '../features/stations/SourceNotice';
import { StationDetail } from '../features/stations/StationDetail';
import { StationList } from '../features/stations/StationList';
import { distanceLabel } from '../features/stations/distance';
import { inBounds, type MapBounds } from '../features/stations/mapBounds';
import { ROUGH_ACCURACY_M, useNearMe, type LocationNotice } from '../features/stations/useNearMe';
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
import { historyPushed, pushParams, readParam, syncParam, writeParam } from '../shared/url';
import { MOBILE_QUERY, useMediaQuery } from '../shared/useMediaQuery';
import { stationName } from '../features/stations/names';
import {
  DISTRICT_PARAM,
  HIDE_PARAM,
  hiddenParam,
  LIST_PARAM,
  listFollowsMapFromParam,
  listFollowsMapParam,
  NUMBER_PARAM,
  numberModeFromParam,
  numberModeParam,
  ORDER_PARAM,
  orderFromParam,
  orderParam,
  SEARCH_PARAM,
  searchParam,
  visibleFromParam,
} from '../features/stations/viewParams';
import { LanguageSwitch } from './LanguageSwitch';
import { MapBoundary } from './MapBoundary';
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
/** Qué pasó al pulsar «Cerca de mí», con su motivo: cada fallo se arregla de una manera. */
function locationNoticeText(notice: LocationNotice): string {
  const m = t().app;
  switch (notice.kind) {
    case 'located':
      return notice.accuracy !== null && notice.accuracy > ROUGH_ACCURACY_M
        ? m.locatedRough(distanceLabel(notice.accuracy))
        : m.located;
    case 'outside':
      return m.locationOutside;
    case 'denied':
      return m.locationDenied;
    case 'unavailable':
      return m.locationUnavailable;
    case 'timeout':
      return m.locationTimeout;
    case 'unsupported':
      return m.locationUnsupported;
  }
}

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
  // En móvil, el aviso de procedencia va plegado a una línea: el mapa empieza antes.
  const mobile = useMediaQuery(MOBILE_QUERY);
  // El momento pedido (?dia=…&hora=…): lo que enseñan Explorar y Experimentar de un histórico y
  // donde empieza Reproducir. Al salir de Reproducir se queda el momento que se estaba viendo.
  const [moment, setMoment] = useState<Moment>(() => ({
    day: readParam('dia'),
    time: readParam('hora'),
  }));
  // «Qué muestra y qué no»: ocupa el panel y va en la URL (?vista=limites). Al llegar con el
  // enlace no se mueve el foco, como con una estación.
  const [sheet, setSheet] = useState(() =>
    readParam(VIEW_PARAM) === VIEW_LIMITS ? { byUser: false } : null,
  );
  const restoreLimitsFocusRef = useRef(false);
  const sheetFocused = useCallback(() => {
    setSheet((s) => (s?.byUser === true ? { byUser: false } : s));
  }, []);
  // Al elegir un día en la ficha, el foco va a la pista del reproductor.
  const focusReplayRef = useRef(false);
  // Solo se reproduce una fuente con datos; sin ellos, la vista es la de explorar.
  const replaying = mode === 'replay' && (source?.period ?? null) !== null;
  const experimenting = mode === 'experiment' && sourceId !== null;
  const shownMode: Mode = replaying ? 'replay' : experimenting ? 'experiment' : 'explore';
  // Mientras llega el estado de las estaciones, la reproducción espera; si no llega, se para.
  const stationsProgressRef = useRef<StationsProgress>('loading');
  const replay = useReplay(
    replaying ? source : undefined,
    moment.day,
    moment.time,
    stationsProgressRef,
  );

  // Al explorar, un instante con /api/stations; al reproducir, fotogramas de una hora.
  const exploreAt = instantFor(source, now, moment);
  const explored = useStations(replaying ? null : sourceId, exploreAt);
  const framed = useFrames(replaying ? sourceId : null, replay.point?.at);
  const {
    state: stationsState,
    previous: previousStations,
    retry: retryStations,
  } = replaying ? framed : explored;
  useEffect(() => {
    stationsProgressRef.current = stationsState.status;
  });

  // La vista de Explorar (búsqueda, categorías ocultas, distrito, orden y número) empieza por la
  // URL y vuelve a ella: así un enlace la lleva entera y el cambio de idioma no la pierde.
  const [query, setQuery] = useState(() => readParam(SEARCH_PARAM) ?? '');
  const [visible, setVisible] = useState<ReadonlySet<Availability>>(() =>
    visibleFromParam(readParam(HIDE_PARAM)),
  );
  // Distrito elegido (clave de la fuente) para la lista y el mapa; null, todos.
  const [district, setDistrict] = useState<string | null>(() => readParam(DISTRICT_PARAM));
  // La selección se guarda por identificador de origen: es lo que va en la URL
  // (?estacion=demo-008) y no depende de los ids internos de cada base de datos.
  const [selectedKey, setSelectedKey] = useState<string | null>(readStationParam);
  const [mapStatus, setMapStatus] = useState<MapStatus>({ kind: 'loading' });
  const mapCrashed = useCallback(() => {
    setMapStatus({ kind: 'failed' });
  }, []);
  const lastSelectedRef = useRef<number | null>(null);
  const restoreFocusRef = useRef(false);
  // Al abrir un enlace directo no se mueve el foco: la página quedaría desplazada fuera del mapa.
  // Una vez tomado, no se vuelve a pedir: al reproducir, el detalle se vuelve a montar al llegar
  // otro día y se llevaba el foco de la pista (y, en móvil, la página).
  const [selectedByUser, setSelectedByUser] = useState(false);
  const detailFocused = useCallback(() => {
    setSelectedByUser(false);
  }, []);
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
  // Sin distritos en la fuente (la demo) no hay resumen ni filtro.
  const districtRows = useMemo(() => summarizeByDistrict(all), [all]);
  const activeDistrict = districtRows.length === 0 ? null : district;
  // Con un distrito elegido, el recuento, la leyenda y el encuadre del mapa son los de ese distrito.
  const inDistrict = useMemo(
    () => (activeDistrict === null ? all : all.filter((s) => districtKey(s) === activeDistrict)),
    [all, activeDistrict],
  );
  const counts = useMemo(() => countByAvailability(inDistrict), [inDistrict]);
  // Qué número llevan marcadores y lista: todas las bicis o las eléctricas, que mucha gente
  // prefiere. Las categorías no cambian.
  const [numberMode, setNumberMode] = useState<NumberMode>(() =>
    numberModeFromParam(readParam(NUMBER_PARAM)),
  );
  const filtered = useMemo(
    () => filterStations(all, query, visible, activeDistrict),
    [all, query, visible, activeDistrict],
  );
  // Orden de la lista (el mapa no lo necesita): por nombre o por cifras, de más a menos.
  const [order, setOrder] = useState<ListOrder>(() => orderFromParam(readParam(ORDER_PARAM)));
  // «Solo las del mapa»: la lista sigue a la parte del mapa que se ve (al cargar y tras cada
  // movimiento). El mapa no cambia: es él quien acota.
  const [listFollowsMap, setListFollowsMap] = useState(() =>
    listFollowsMapFromParam(readParam(LIST_PARAM)),
  );
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  // «Cerca de mí»: dónde está la persona, solo en memoria (nunca en la URL ni guardado). Al
  // llegar, la lista se ordena por distancia y el punto se marca en el mapa.
  const nearMe = useNearMe(() => {
    setOrder('distance');
  });
  const { me } = nearMe;
  const onMap = useMemo(
    () =>
      listFollowsMap && bounds !== null ? filtered.filter((s) => inBounds(s, bounds)) : filtered,
    [filtered, listFollowsMap, bounds],
  );
  const listed = useMemo(() => sortStations(onMap, order, me), [onMap, order, me]);
  // Mientras se busca, el mapa encuadra los resultados, aunque se haya movido antes.
  const searching = normalizeForSearch(query.trim());
  const selected =
    selectedKey === null ? undefined : all.find((s) => s.sourceStationId === selectedKey);
  const selectedId = selected?.id ?? null;
  // Lo que el enlace pedía y no se puede enseñar, y lo que la API recortó: se dice, no se calla.
  // Los avisos desaparecen cuando cambia lo que los provocó (otra estación, otro momento).
  const linkStationMissing =
    !replaying && stationsState.status === 'ready' && selectedKey !== null && selected === undefined
      ? selectedKey
      : null;
  const linkDayMissing =
    source !== undefined && moment.day !== null && !availableDays(source).includes(moment.day)
      ? moment.day
      : null;
  const truncated = response?.truncated === true;

  // Experimentar: la red real del instante y los cambios del escenario sobre ella.
  const scenario = useScenario(experimenting ? sourceId : null, exploreAt, all);
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
      // Abrir el detalle añade una entrada al historial, para que Atrás lo cierre; pasar a otra
      // estación con el detalle abierto, no.
      if (selectedKey === null) pushParams({ [STATION_PARAM]: station.sourceStationId }, 'detail');
      else writeStationParam(station.sourceStationId);
    },
    [all, selectedKey],
  );

  // Si el detalle añadió su entrada, cerrarlo es volver atrás (lo cierra el historial, como
  // Atrás); si se llegó con un enlace, se quita de la URL sin tocar el historial.
  const closeDetail = useCallback(() => {
    if (historyPushed('detail')) {
      window.history.back();
      return;
    }
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

  // La vista, a la URL: cambia la entrada actual, sin apilar (son ajustes, no lugares). La
  // búsqueda, al dejar de escribir; si la aplicación se vuelve a montar antes, no se pierde.
  useEffect(() => {
    syncParam(HIDE_PARAM, hiddenParam(visible));
  }, [visible]);
  useEffect(() => {
    syncParam(DISTRICT_PARAM, district);
  }, [district]);
  useEffect(() => {
    syncParam(ORDER_PARAM, orderParam(order));
  }, [order]);
  useEffect(() => {
    syncParam(NUMBER_PARAM, numberModeParam(numberMode));
  }, [numberMode]);
  useEffect(() => {
    syncParam(LIST_PARAM, listFollowsMapParam(listFollowsMap));
  }, [listFollowsMap]);
  const pendingQueryRef = useRef<string | null>(null);
  useEffect(() => {
    pendingQueryRef.current = query;
    const timer = window.setTimeout(() => {
      syncParam(SEARCH_PARAM, searchParam(query));
      pendingQueryRef.current = null;
    }, 400);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);
  useEffect(
    () => () => {
      if (pendingQueryRef.current !== null) {
        syncParam(SEARCH_PARAM, searchParam(pendingQueryRef.current));
      }
    },
    [],
  );

  const resetFilters = () => {
    setQuery('');
    setVisible(new Set(AVAILABILITY_ORDER));
    setDistrict(null);
  };

  // Elegir un distrito cierra el detalle, como escribir en la búsqueda: se va a ver la lista.
  // El ya elegido, pulsado otra vez, deja de filtrar.
  const pickDistrict = (key: string | null) => {
    setDistrict((current) => (current === key ? null : key));
    if (selectedKey !== null) closeDetail();
  };

  const changeMode = (next: Mode) => {
    // Al dejar de reproducir, el momento que se veía sigue en Explorar y Experimentar (y en la
    // URL, aunque se saliera con la reproducción en marcha).
    if (replaying && next !== 'replay' && replay.day !== null && replay.point !== undefined) {
      const time = localClock(replay.point.at);
      setMoment({ day: replay.day, time });
      writeParam('dia', replay.day);
      writeParam('hora', time);
    }
    setMode(next);
    setTool(null);
    // Cambiar de modo añade una entrada: Atrás vuelve al modo anterior tal como estaba.
    pushParams({ [MODE_PARAM]: MODE_IN_URL[next] }, 'mode');
  };

  // Atrás y Adelante: el estado vuelve a ser el de la URL de esa entrada (modo, estación, ficha y
  // momento). Lo que cambia a cada paso (la hora al reproducir, el escenario) no añade entradas.
  const replaySelectRef = useRef(replay.selectMoment);
  useEffect(() => {
    replaySelectRef.current = replay.selectMoment;
  });
  useEffect(() => {
    const onPopState = () => {
      setMode(modeFromUrl());
      setTool(null);
      setSelectedByUser(false);
      setSelectedKey(readStationParam());
      setSheet(readParam(VIEW_PARAM) === VIEW_LIMITS ? { byUser: false } : null);
      const day = readParam('dia');
      const time = readParam('hora');
      setMoment({ day, time });
      if (day !== null) replaySelectRef.current(day, time);
      setQuery(readParam(SEARCH_PARAM) ?? '');
      setVisible(visibleFromParam(readParam(HIDE_PARAM)));
      setDistrict(readParam(DISTRICT_PARAM));
      // La distancia nunca va en la URL: mientras se sepa dónde está la persona, Atrás no la quita.
      setOrder((current) =>
        current === 'distance' ? current : orderFromParam(readParam(ORDER_PARAM)),
      );
      setNumberMode(numberModeFromParam(readParam(NUMBER_PARAM)));
      setListFollowsMap(listFollowsMapFromParam(readParam(LIST_PARAM)));
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // «Cambiar momento»: a Reproducir, parado en el momento mostrado, con el foco en la pista.
  const changeMoment = () => {
    changeMode('replay');
    focusReplayRef.current = true;
  };

  // «A esta hora»: el día importado que más se parece a hoy, a la hora de reloj de ahora. Cambia
  // el momento sin apilar historial, como al salir de Reproducir.
  const showThisHour = () => {
    const like = momentLikeNow(availableDays(source), Date.now());
    if (like === null) return;
    setMoment(like);
    writeParam('dia', like.day);
    writeParam('hora', like.time);
  };

  // Atajos de la leyenda: lo visible y el número a la vez. El que ya está puesto, pulsado otra
  // vez, vuelve a enseñarlo todo con las bicis.
  const applyPreset = (preset: Preset) => {
    if (activePreset(visible, numberMode) === preset) {
      setVisible(new Set(AVAILABILITY_ORDER));
      setNumberMode('bikes');
      return;
    }
    const view = PRESET_VIEW[preset];
    setVisible(new Set(view.visible));
    setNumberMode(view.numberMode);
  };

  const openSheet = () => {
    setSheet({ byUser: true });
    pushParams({ [VIEW_PARAM]: VIEW_LIMITS }, 'sheet');
  };
  /**
   * Cerrar la ficha: con su botón, volviendo atrás si ella añadió la entrada; al elegir un día o
   * una estación desde ella, en la misma entrada (`inPlace`), porque lo que sigue añade la suya.
   */
  const closeSheet = (restoreFocus: boolean, inPlace = false) => {
    restoreLimitsFocusRef.current = restoreFocus;
    if (!inPlace && historyPushed('sheet')) {
      window.history.back();
      return;
    }
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
    closeSheet(false, true);
    replay.selectDay(day);
    changeMode('replay');
    focusReplayRef.current = true;
  };
  // La ficha desaparece al elegir el día: sin esto, el foco se quedaba en la página.
  useEffect(() => {
    if (!replaying || !focusReplayRef.current) return;
    focusReplayRef.current = false;
    document.querySelector<HTMLElement>('.replay-deck__track')?.focus();
  });
  const selectFromSheet = (id: number) => {
    closeSheet(false, true);
    select(id);
  };

  // Título de la pestaña: la estación, la ficha o el modo, y el nombre de la aplicación.
  useEffect(() => {
    const what =
      selected !== undefined
        ? stationName(selected)
        : sheet !== null
          ? t().source.limits
          : shownMode === 'explore'
            ? null
            : t().modes[shownMode];
    document.title = what === null ? 'Barcelona Pulse' : `${what} · Barcelona Pulse`;
  }, [selected, sheet, shownMode]);

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
        onFocused={sheetFocused}
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
        {(linkStationMissing !== null || linkDayMissing !== null || truncated) && (
          <div className="link-notice" role="status">
            {linkStationMissing !== null && <p>{m.linkStationMissing(linkStationMissing)}</p>}
            {linkDayMissing !== null && <p>{m.linkDayMissing(formatLocalDay(linkDayMissing))}</p>}
            {truncated && <p>{m.truncated}</p>}
          </div>
        )}
        {/* Búsqueda siempre a mano, también con el detalle abierto. */}
        <div className="panel-tools">
          <div className="search">
            <label htmlFor="station-search" className="search__label">
              {m.search}
            </label>
            <div className="search__row">
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
                // Intro abre la primera estación de la lista.
                onKeyDown={(e) => {
                  const first = listed[0];
                  if (e.key === 'Enter' && searching !== '' && first !== undefined) {
                    e.preventDefault();
                    select(first.id);
                  }
                }}
              />
              <button
                type="button"
                className="button search__near"
                onClick={nearMe.locate}
                disabled={nearMe.locating}
              >
                {nearMe.locating ? m.locating : m.nearMe}
              </button>
            </div>
            {nearMe.notice !== null && (
              <p className="search__notice" role="status">
                {locationNoticeText(nearMe.notice)}
              </p>
            )}
          </div>
          <div className="panel-tools__row">
            {/* Al reproducir cambia en cada paso: anunciarlo no dejaría oír nada más. */}
            <p className="panel-tools__count" aria-live={replaying ? 'off' : 'polite'}>
              {m.count(listed.length, inDistrict.length)}
            </p>
            {selected === undefined && (
              <label className="list-order">
                <span>{m.order}</span>
                <select
                  value={order}
                  onChange={(e) => {
                    setOrder(e.target.value as ListOrder);
                    // Elegir otro orden a mano retira el aviso de «Cerca de mí».
                    nearMe.dismiss();
                  }}
                >
                  {LIST_ORDERS.map((value) => (
                    <option key={value} value={value}>
                      {m.orders[value]}
                    </option>
                  ))}
                  {me !== null && <option value="distance">{m.orders.distance}</option>}
                </select>
              </label>
            )}
          </div>
        </div>
        {selected !== undefined ? (
          <StationDetail
            station={selected}
            response={response}
            onBack={backToList}
            focusOnOpen={selectedByUser}
            onFocused={detailFocused}
            all={all}
            onSelect={select}
            figures={numberMode}
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
            {districtRows.length > 0 && (
              <DistrictSummary rows={districtRows} active={activeDistrict} onPick={pickDistrict} />
            )}
            <div className="list-head">
              <h2 className="list-title">{m.listTitle}</h2>
              {!mapUnavailable && (
                <label className="list-scope">
                  <input
                    type="checkbox"
                    checked={listFollowsMap}
                    onChange={(e) => {
                      setListFollowsMap(e.target.checked);
                    }}
                  />
                  {m.onlyOnMap}
                </label>
              )}
            </div>
            {listed.length === 0 ? (
              <div className="panel-status">
                <p>{m.noneOnMap}</p>
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    setListFollowsMap(false);
                  }}
                >
                  {m.wholeList}
                </button>
              </div>
            ) : (
              <StationList
                stations={listed}
                at={response.at}
                figures={numberMode}
                selectedId={selectedId}
                onSelect={select}
                distanceFrom={me}
              />
            )}
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
                setDistrict(null);
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
            onChangeMoment={source?.period == null ? undefined : changeMoment}
            onThisHour={source?.period == null ? undefined : showThisHour}
            shareWithoutCamera={me !== null}
            fold={mobile}
          />
        )}
      </header>

      <div className="map-area">
        <MapBoundary onError={mapCrashed}>
          <Suspense fallback={<div className="station-map" aria-hidden="true" />}>
            <StationMap
              stations={experimenting ? scenarioStations : filtered}
              frame={experimenting ? all : searching === '' ? inDistrict : filtered}
              frameKey={sourceId ?? ''}
              // Con otro distrito se encuadra el distrito, solo si no se ha movido el mapa antes;
              // con una búsqueda, sus resultados, siempre.
              frameMode={
                experimenting
                  ? shownMode
                  : `${shownMode}${activeDistrict === null ? '' : `:${activeDistrict}`}${searching === '' ? '' : `?${searching}`}`
              }
              frameFollows={!experimenting && searching !== ''}
              framePadding={
                replaying ? REPLAY_FRAME : experimenting ? EXPERIMENT_FRAME : EXPLORE_FRAME
              }
              selectedId={experimenting ? null : selectedId}
              zoomOnSelect={selectedByUser}
              variant={experimenting ? 'network' : 'availability'}
              label={numberMode}
              buildings={!experimenting}
              onSelect={experimenting ? tapStation : select}
              onStatusChange={setMapStatus}
              onMapReady={setMap}
              onBoundsChange={setBounds}
              me={experimenting ? null : me}
            />
          </Suspense>
        </MapBoundary>
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
              <AvailabilityFilter
                counts={counts}
                visible={visible}
                onToggle={toggleCategory}
                numberMode={numberMode}
                onNumberMode={setNumberMode}
                onPreset={applyPreset}
                showMe={me !== null}
              />
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
