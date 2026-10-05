import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StationItem } from '../api/client';
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
import { StationMap, type MapStatus } from '../features/stations/StationMap';
import { pickDefaultSource, useSources, useStations } from '../features/stations/useStationData';
import { plural } from '../shared/format';
import './App.css';

const STATION_PARAM = 'estacion';
const NO_STATIONS: readonly StationItem[] = [];

function readStationParam(): string | null {
  return new URLSearchParams(window.location.search).get(STATION_PARAM);
}

function writeStationParam(sourceStationId: string | null): void {
  const url = new URL(window.location.href);
  if (sourceStationId === null) url.searchParams.delete(STATION_PARAM);
  else url.searchParams.set(STATION_PARAM, sourceStationId);
  window.history.replaceState(null, '', url);
}

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
  const [chosenSourceId, setChosenSourceId] = useState<string | null>(null);
  const sources = sourcesState.status === 'ready' ? sourcesState.data : [];
  const sourceId = chosenSourceId ?? pickDefaultSource(sources)?.id ?? null;
  const { state: stationsState, retry: retryStations } = useStations(sourceId);

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

  const response = stationsState.status === 'ready' ? stationsState.data : null;
  const all = response?.stations ?? NO_STATIONS;
  const counts = useMemo(() => countByAvailability(all), [all]);
  const filtered = useMemo(() => filterStations(all, query, visible), [all, query, visible]);
  const selected =
    selectedKey === null ? undefined : all.find((s) => s.sourceStationId === selectedKey);
  const selectedId = selected?.id ?? null;

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
    >
      <header className="panel-head">
        <div className="brand">
          <BrandMark />
          <div>
            <h1 className="brand__name">Barcelona Pulse</h1>
            <p className="brand__tagline">Estaciones de Bicing en el mapa</p>
          </div>
        </div>
        {sources.length > 1 && (
          <label className="source-picker">
            Fuente
            <select
              value={sourceId ?? ''}
              onChange={(e) => {
                setChosenSourceId(e.target.value);
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
        {response !== null && <SourceNotice response={response} />}
      </header>

      <div className="map-area">
        <StationMap
          stations={filtered}
          frame={all}
          frameKey={sourceId ?? ''}
          selectedId={selectedId}
          onSelect={select}
          onStatusChange={setMapStatus}
        />
        <MapStatusMessage status={mapStatus} />
        {response !== null && (
          <div className="map-legend">
            <AvailabilityFilter counts={counts} visible={visible} onToggle={toggleCategory} />
          </div>
        )}
      </div>

      <main className="panel-body" ref={bodyRef}>
        {body}
      </main>
    </div>
  );
}
