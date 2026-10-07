import { useEffect, useRef } from 'react';
import type { StationItem, StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { formatDateTime, formatDay, formatDuration, formatTime } from '../../shared/format';
import { availabilityLabel, availabilityOf, qualityFlagLabel, statusLabel } from './availability';
import { distanceLabel, distanceMeters } from './distance';
import { districtName, stationName } from './names';
import { OctagonGlyph } from './OctagonGlyph';
import { sourceName } from './sources';
import { StationList, type ListFigures } from './StationList';
import { useStationDetail } from './stationDetails';
import { StationPatternSection } from './StationPattern';
import { sortVersions, versionSteps, type VersionChange } from './versions';

/** Cuántas cercanas se enseñan: las justas para tener alternativa sin alargar la ficha. */
const NEARBY_COUNT = 5;

interface StationDetailProps {
  station: StationItem;
  response: StationsResponse;
  onBack: () => void;
  /** Mover el foco al nombre: sí si la persona acaba de elegirla, no al abrir un enlace. */
  focusOnOpen: boolean;
  /** Ya tiene el foco: al volver a montarse (p. ej., al reproducir otro día) no lo pide otra vez. */
  onFocused: () => void;
  /** Todas las estaciones del momento, para las cercanas; y cómo abrir una de ellas. */
  all?: readonly StationItem[];
  onSelect?: ((id: number) => void) | undefined;
  /** La cifra que enseñan las cercanas: la misma que la lista (bicis o eléctricas). */
  figures?: ListFigures;
}

/**
 * Las estaciones más próximas, con su estado: si esta no sirve (vacía, llena, sin dato), la
 * alternativa está a un toque. En línea recta (EPSG:25831), no a pie.
 */
function NearbyStations({
  station,
  all,
  at,
  onSelect,
  figures,
}: {
  station: StationItem;
  all: readonly StationItem[];
  at: string;
  onSelect: (id: number) => void;
  figures: ListFigures;
}) {
  const m = t().detail;
  const nearby = all
    .filter((s) => s.id !== station.id)
    .map((s) => ({ s, d: distanceMeters(station, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, NEARBY_COUNT)
    .map(({ s }) => s);
  if (nearby.length === 0) return null;
  return (
    <section className="station-detail__nearby" aria-labelledby="station-nearby">
      <h3 id="station-nearby">{m.nearby}</h3>
      <p className="station-detail__note">{m.nearbyNote}</p>
      <StationList
        stations={nearby}
        at={at}
        selectedId={null}
        onSelect={onSelect}
        figures={figures}
        distanceFrom={station}
      />
    </section>
  );
}

function changeText(change: VersionChange): string {
  const m = t().detail;
  switch (change.kind) {
    case 'capacity':
      return m.changeCapacity(change.from, change.to);
    case 'name':
      return m.changeName(
        stationName({ name: change.from, address: null }),
        stationName({ name: change.to, address: null }),
      );
    case 'address':
      return m.changeAddress(change.from, change.to);
    case 'moved':
      return m.changeMoved(distanceLabel(change.meters));
  }
}

/**
 * Los cambios de atributos de la estación en los días importados (nombre, dirección, sitio,
 * capacidad), con su fecha: la API los guarda por versiones y la ficha los enseña plegados.
 */
function StationChanges({ station, at }: { station: StationItem; at: string }) {
  const m = t().detail;
  const state = useStationDetail(station.id, at);
  if (state.status === 'loading') {
    return <p className="station-detail__note">{m.changesLoading}</p>;
  }
  if (state.status === 'error') {
    return <p className="station-detail__note">{m.changesFailed}</p>;
  }
  const versions = sortVersions(state.data.versions);
  const first = versions[0];
  if (first === undefined) return null;
  const since = formatDay(first.firstSeenAt);
  const steps = versionSteps(versions);
  if (steps.length === 0) return <p className="station-detail__note">{m.noChanges(since)}</p>;
  return (
    <details className="station-detail__changes">
      <summary>{m.changes(steps.length)}</summary>
      <p className="station-detail__note">{m.knownSince(since)}</p>
      <ol className="station-detail__change-list">
        {steps.map((step) => (
          <li key={step.at}>
            <time dateTime={step.at}>{formatDateTime(step.at)}</time>:{' '}
            {step.changes.map(changeText).join(' · ')}
          </li>
        ))}
      </ol>
    </details>
  );
}

function UnknownExplanation({
  station,
  response,
}: {
  station: StationItem;
  response: StationsResponse;
}) {
  const m = t().detail;
  const last = station.state.lastObservedAt;
  if (last === null) {
    return <p className="station-detail__explain">{m.neverReported}</p>;
  }
  // «de las 07:45» el mismo día; si no, con la fecha: «del 12 de junio de 2025, 10:54».
  const sameDay = formatDay(last) === formatDay(response.at);
  return (
    <p className="station-detail__explain">
      {m.lastObservation({
        sameDay,
        when: <time dateTime={last}>{sameDay ? formatTime(last) : formatDateTime(last)}</time>,
        clock: formatTime(last),
        duration: formatDuration(last, response.at),
        tolerance: response.toleranceMinutes,
      })}
    </p>
  );
}

export function StationDetail({
  station,
  response,
  onBack,
  focusOnOpen,
  onFocused,
  all = [],
  onSelect,
  figures = 'bikes',
}: StationDetailProps) {
  const m = t().detail;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { state } = station;
  const category = availabilityOf(state);
  const current = state.freshness === 'current';

  // Al abrir el detalle, el foco va al nombre para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (!focusOnOpen) return;
    headingRef.current?.focus();
    onFocused();
  }, [station.id, focusOnOpen, onFocused]);

  const unavailable = [
    state.docksDisabled ? m.docks(state.docksDisabled) : null,
    state.bikesDisabled ? m.bikes(state.bikesDisabled) : null,
  ].filter((x): x is string => x !== null);

  const bikeSplit =
    state.mechanicalBikesAvailable !== null && state.ebikesAvailable !== null
      ? m.bikeSplit(state.mechanicalBikesAvailable, state.ebikesAvailable)
      : m.noSplit;

  return (
    <article className="station-detail" aria-labelledby="station-detail-name">
      <button type="button" className="station-detail__back" onClick={onBack}>
        {m.back}
      </button>

      <h2 id="station-detail-name" className="station-detail__name" tabIndex={-1} ref={headingRef}>
        {stationName(station)}
      </h2>
      {station.neighbourhood !== null && (
        <p className="station-detail__area">
          {station.neighbourhood}
          {station.district !== null && `, ${districtName(station.district)}`}
        </p>
      )}
      <p className="station-detail__status">
        <OctagonGlyph category={category} size={26} />
        <span>
          {availabilityLabel(category)}
          {category === 'outOfService' && <> ({statusLabel(state.status).toLowerCase()})</>}
        </span>
      </p>

      {current && state.lastObservedAt !== null && (
        <p className="station-detail__observed">
          <time dateTime={state.lastObservedAt}>
            {m.observedAt({
              time: <strong>{formatTime(state.lastObservedAt)}</strong>,
              day: formatDay(state.lastObservedAt),
              clock: formatTime(state.lastObservedAt),
            })}
          </time>
        </p>
      )}

      {current && state.bikesAvailable !== null ? (
        <dl className="station-detail__figures">
          <div>
            <dt>{m.bikesAvailable}</dt>
            <dd className="station-detail__figure">{state.bikesAvailable}</dd>
            <dd className="station-detail__sub">{bikeSplit}</dd>
          </div>
          <div>
            <dt>{m.docksFree}</dt>
            <dd className="station-detail__figure">{state.docksAvailable ?? '–'}</dd>
            {station.capacity !== null && (
              <dd className="station-detail__sub">{m.capacityOf(station.capacity)}</dd>
            )}
          </div>
        </dl>
      ) : (
        <UnknownExplanation station={station} response={response} />
      )}

      {category === 'outOfService' && <p className="station-detail__explain">{m.outOfService}</p>}

      {current && category !== 'outOfService' && state.isRenting === false && (
        <p className="station-detail__explain">{m.notRenting}</p>
      )}
      {current && category !== 'outOfService' && state.isReturning === false && (
        <p className="station-detail__explain">{m.notReturning}</p>
      )}

      <dl className="station-detail__facts">
        {current && unavailable.length > 0 && (
          <>
            <dt>{m.unavailable}</dt>
            <dd>{unavailable.join(` ${m.and} `)}</dd>
          </>
        )}
        {!current && (
          <>
            <dt>{m.capacity}</dt>
            <dd>{station.capacity === null ? m.notPublished : m.docks(station.capacity)}</dd>
            <dt>{m.last}</dt>
            <dd>
              {state.lastObservedAt === null ? (
                m.none
              ) : (
                <time dateTime={state.lastObservedAt}>{formatDateTime(state.lastObservedAt)}</time>
              )}
            </dd>
          </>
        )}
        <dt>{m.source}</dt>
        <dd>
          {response.source.kind === 'synthetic' ? m.demoSource : sourceName(response.source)}
          <span className="station-detail__id">{m.id(station.sourceStationId)}</span>
        </dd>
      </dl>

      {(state.qualityFlags.length > 0 || station.metadataAssumed) && (
        <ul className="station-detail__notes">
          {state.qualityFlags.map((flag) => (
            <li key={flag}>{qualityFlagLabel(flag)}</li>
          ))}
          {station.metadataAssumed && <li>{m.metadataAssumed}</li>}
        </ul>
      )}

      <StationChanges station={station} at={response.at} />

      {/* Después de los datos de esta estación y antes del patrón: la alternativa, a un toque. */}
      {onSelect !== undefined && (
        <NearbyStations
          station={station}
          all={all}
          at={response.at}
          onSelect={onSelect}
          figures={figures}
        />
      )}

      <StationPatternSection stationId={station.id} at={response.at} />
    </article>
  );
}
