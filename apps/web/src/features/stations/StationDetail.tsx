import { useEffect, useRef } from 'react';
import type { StationItem, StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { formatDateTime, formatDay, formatDuration, formatTime } from '../../shared/format';
import { availabilityLabel, availabilityOf, qualityFlagLabel, statusLabel } from './availability';
import { districtName, stationName } from './names';
import { OctagonGlyph } from './OctagonGlyph';
import { sourceName } from './sources';

interface StationDetailProps {
  station: StationItem;
  response: StationsResponse;
  onBack: () => void;
  /** Mover el foco al nombre: sí si la persona acaba de elegirla, no al abrir un enlace. */
  focusOnOpen: boolean;
  /** Ya tiene el foco: al volver a montarse (p. ej., al reproducir otro día) no lo pide otra vez. */
  onFocused: () => void;
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
    </article>
  );
}
