import { useEffect, useRef } from 'react';
import type { StationItem, StationsResponse } from '../../api/client';
import { formatDateTime, formatDay, formatDuration, formatTime, plural } from '../../shared/format';
import {
  AVAILABILITY_LABEL,
  availabilityOf,
  QUALITY_FLAG_LABEL,
  STATUS_LABEL,
} from './availability';
import { OctagonGlyph } from './OctagonGlyph';

interface StationDetailProps {
  station: StationItem;
  response: StationsResponse;
  onBack: () => void;
  /** Mover el foco al nombre: sí si la persona acaba de elegirla, no al abrir un enlace. */
  focusOnOpen: boolean;
}

function UnknownExplanation({
  station,
  response,
}: {
  station: StationItem;
  response: StationsResponse;
}) {
  const last = station.state.lastObservedAt;
  if (last === null) {
    return (
      <p className="station-detail__explain">
        Esta estación no ha enviado ninguna observación hasta el momento mostrado.
      </p>
    );
  }
  // «de las 07:45» el mismo día; si no, con la fecha: «del 12 de junio de 2025, 10:54».
  const sameDay = formatDay(last) === formatDay(response.at);
  return (
    <p className="station-detail__explain">
      La última observación es {sameDay ? 'de las' : 'del'}{' '}
      <time dateTime={last}>{sameDay ? formatTime(last) : formatDateTime(last)}</time>,{' '}
      {formatDuration(last, response.at)} antes del momento mostrado. Pasados{' '}
      {response.toleranceMinutes} min sin datos, el estado se da por desconocido: no se supone que
      esté vacía.
    </p>
  );
}

export function StationDetail({ station, response, onBack, focusOnOpen }: StationDetailProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { state } = station;
  const category = availabilityOf(state);
  const current = state.freshness === 'current';

  // Al abrir el detalle, el foco va al nombre para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (focusOnOpen) headingRef.current?.focus();
  }, [station.id, focusOnOpen]);

  const unavailable = [
    state.docksDisabled ? plural(state.docksDisabled, 'anclaje', 'anclajes') : null,
    state.bikesDisabled ? plural(state.bikesDisabled, 'bici', 'bicis') : null,
  ].filter((x): x is string => x !== null);

  const bikeSplit =
    state.mechanicalBikesAvailable !== null && state.ebikesAvailable !== null
      ? `${state.mechanicalBikesAvailable} mecánicas y ${state.ebikesAvailable} eléctricas`
      : 'Sin desglose por tipo';

  return (
    <article className="station-detail" aria-labelledby="station-detail-name">
      <button type="button" className="station-detail__back" onClick={onBack}>
        Volver a la lista
      </button>

      <h2 id="station-detail-name" className="station-detail__name" tabIndex={-1} ref={headingRef}>
        {station.name}
      </h2>
      {station.neighbourhood !== null && (
        <p className="station-detail__area">
          {station.neighbourhood}
          {station.district !== null && `, ${station.district}`}
        </p>
      )}
      <p className="station-detail__status">
        <OctagonGlyph category={category} size={26} />
        <span>
          {AVAILABILITY_LABEL[category]}
          {category === 'outOfService' && <> ({STATUS_LABEL[state.status].toLowerCase()})</>}
        </span>
      </p>

      {current && state.lastObservedAt !== null && (
        <p className="station-detail__observed">
          Dato de las{' '}
          <time dateTime={state.lastObservedAt}>
            <strong>{formatTime(state.lastObservedAt)}</strong> del{' '}
            {formatDay(state.lastObservedAt)}
          </time>
        </p>
      )}

      {current && state.bikesAvailable !== null ? (
        <dl className="station-detail__figures">
          <div>
            <dt>Bicis disponibles</dt>
            <dd className="station-detail__figure">{state.bikesAvailable}</dd>
            <dd className="station-detail__sub">{bikeSplit}</dd>
          </div>
          <div>
            <dt>Anclajes libres</dt>
            <dd className="station-detail__figure">{state.docksAvailable ?? '–'}</dd>
            {station.capacity !== null && (
              <dd className="station-detail__sub">de {station.capacity} de capacidad</dd>
            )}
          </div>
        </dl>
      ) : (
        <UnknownExplanation station={station} response={response} />
      )}

      {category === 'outOfService' && (
        <p className="station-detail__explain">
          La estación no está operativa. Las cifras son las que publica, pero puede que no se puedan
          coger ni devolver bicis.
        </p>
      )}

      {current && category !== 'outOfService' && state.isRenting === false && (
        <p className="station-detail__explain">
          En este momento la estación no permite coger bicis, aunque tenga.
        </p>
      )}
      {current && category !== 'outOfService' && state.isReturning === false && (
        <p className="station-detail__explain">
          En este momento la estación no admite devoluciones, aunque tenga anclajes libres.
        </p>
      )}

      <dl className="station-detail__facts">
        {current && unavailable.length > 0 && (
          <>
            <dt>No disponibles</dt>
            <dd>{unavailable.join(' y ')}</dd>
          </>
        )}
        {!current && (
          <>
            <dt>Capacidad publicada</dt>
            <dd>
              {station.capacity === null
                ? 'No publicada'
                : plural(station.capacity, 'anclaje', 'anclajes')}
            </dd>
            <dt>Última observación</dt>
            <dd>
              {state.lastObservedAt === null ? (
                'Ninguna'
              ) : (
                <time dateTime={state.lastObservedAt}>{formatDateTime(state.lastObservedAt)}</time>
              )}
            </dd>
          </>
        )}
        <dt>Fuente</dt>
        <dd>
          {response.source.kind === 'synthetic'
            ? 'Demo con datos inventados'
            : response.source.name}
          <span className="station-detail__id"> (identificador {station.sourceStationId})</span>
        </dd>
      </dl>

      {(state.qualityFlags.length > 0 || station.metadataAssumed) && (
        <ul className="station-detail__notes">
          {state.qualityFlags.map((flag) => (
            <li key={flag}>{QUALITY_FLAG_LABEL[flag] ?? flag}</li>
          ))}
          {station.metadataAssumed && (
            <li>
              El nombre, la ubicación y la capacidad son de una publicación posterior a este
              momento.
            </li>
          )}
        </ul>
      )}
    </article>
  );
}
