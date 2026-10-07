import { api, toApiError, type StationPatternResponse } from '../../api/client';
import { t } from '../../i18n';
import { numberFormat } from '../../i18n/intl';
import { isWeekday } from '../history/moment';
import { localParts } from '../history/time';
import { periodText } from '../limits/limits';
import { availabilityLabel } from './availability';
import {
  DAY_TYPES,
  daysOf,
  hoursOf,
  partsPresent,
  PATTERN_PARTS,
  peakHour,
  shareOf,
  totalShare,
  withBikesShare,
  type DayType,
  type PatternHourRow,
  type PatternPart,
} from './pattern';
import { useRemote, type Remote } from './useStationData';
import './pattern.css';

/**
 * Patrones ya pedidos en esta página, y los que están llegando: al reproducir, el detalle se
 * vuelve a montar al llegar otro día y no hace falta pedirlo otra vez (la API admite 120
 * peticiones por minuto). La petición no se cancela al desmontarse: si no, cada montaje la
 * empezaba de nuevo.
 */
const LOADED = new Map<number, StationPatternResponse>();
const PENDING = new Map<number, Promise<StationPatternResponse>>();

function loadPattern(stationId: number): Promise<StationPatternResponse> {
  const pending = PENDING.get(stationId);
  if (pending !== undefined) return pending;
  const request = (async () => {
    const { data, error, response } = await api.GET('/api/stations/{id}/pattern', {
      params: { path: { id: stationId } },
    });
    if (data === undefined) throw toApiError(error, response);
    LOADED.set(stationId, data);
    return data;
  })().finally(() => {
    PENDING.delete(stationId);
  });
  PENDING.set(stationId, request);
  return request;
}

function usePattern(stationId: number): {
  state: Remote<StationPatternResponse>;
  retry: () => void;
} {
  const cached = LOADED.get(stationId);
  const remote = useRemote<StationPatternResponse>(
    cached === undefined ? `pattern:${String(stationId)}` : null,
    () => loadPattern(stationId),
  );
  return cached === undefined
    ? remote
    : { state: { status: 'ready', data: cached }, retry: remote.retry };
}

const percent = (share: number) =>
  numberFormat({ style: 'percent', maximumFractionDigits: 0 }).format(share);

function dayTypeLabel(dayType: DayType): string {
  const m = t().pattern;
  return dayType === 'weekday' ? m.weekdays : m.weekend;
}

function partLabel(part: PatternPart): string {
  return part === 'unknown' ? t().pattern.unknown : availabilityLabel(part);
}

/**
 * Lo que dice cada tipo de día en palabras: primero la hora que se ve en el mapa (cuántas veces
 * tuvo alguna bici y la mediana), y después cuándo se quedó sin bicis, cuándo se llenó y cuánto
 * falta. También es lo que oye un lector de pantalla (las columnas no se leen).
 */
function Summary({
  rows,
  shown,
}: {
  rows: readonly PatternHourRow[];
  /** La hora del momento mostrado, si este tipo de día es el suyo. */
  shown: PatternHourRow | null;
}) {
  const m = t().pattern;
  const empty = peakHour(rows, 'empty');
  const full = peakHour(rows, 'full');
  const unknown = totalShare(rows, 'unknown');
  return (
    <p className="station-pattern__summary">
      {shown !== null && shown.steps > 0 && (
        <>{m.atHour(shown.hour, percent(withBikesShare(shown)), shown.medianBikes)} </>
      )}
      {empty === null ? m.emptyRare : m.emptyMost(empty.hour, percent(empty.share))}
      {full !== null && <> {m.fullMost(full.hour, percent(full.share))}</>}
      {unknown >= 0.1 && <> {m.unknownShare(percent(unknown))}</>}
    </p>
  );
}

const HOUR_MARKS = [0, 6, 12, 18];
const COLUMN = 10;
const HEIGHT = 56;

/**
 * Una columna por hora, partida en las veces que se vio cada estado: sin bicis abajo, en rojo,
 * como en la leyenda. Una hora sin pasos (el cambio de hora de marzo) queda en discontinuo.
 */
function Columns({ rows, nowHour }: { rows: readonly PatternHourRow[]; nowHour: number }) {
  return (
    <svg
      className="pattern-columns"
      viewBox={`0 0 ${String(24 * COLUMN)} ${String(HEIGHT + 12)}`}
      aria-hidden="true"
      focusable="false"
    >
      {rows.map((row) => {
        const x = row.hour * COLUMN + 0.5;
        if (row.steps === 0)
          return (
            <rect
              key={row.hour}
              x={x}
              y={0}
              width={COLUMN - 1}
              height={HEIGHT}
              className="pattern-part--unknown"
            />
          );
        let y = HEIGHT;
        return (
          <g key={row.hour}>
            {PATTERN_PARTS.map((part) => {
              const h = shareOf(row, part) * HEIGHT;
              y -= h;
              return h <= 0 ? null : (
                <rect
                  key={part}
                  x={x}
                  y={y}
                  width={COLUMN - 1}
                  height={h}
                  className={`pattern-part--${part}`}
                />
              );
            })}
          </g>
        );
      })}
      <rect
        x={nowHour * COLUMN}
        y={0}
        width={COLUMN}
        height={HEIGHT}
        className="pattern-now"
        rx={1.5}
      />
      {HOUR_MARKS.map((hour) => (
        <text key={hour} x={hour * COLUMN + 0.5} y={HEIGHT + 10} className="pattern-hour">
          {String(hour).padStart(2, '0')}
        </text>
      ))}
    </svg>
  );
}

/** Los colores que salen en esta estación, como en la leyenda del mapa, y la hora mostrada. */
function Key({ parts }: { parts: readonly PatternPart[] }) {
  return (
    <ul className="pattern-key">
      {parts.map((part) => (
        <li key={part}>
          <span className={`pattern-key__swatch pattern-key__swatch--${part}`} aria-hidden="true" />
          {partLabel(part)}
        </li>
      ))}
      <li>
        <span className="pattern-key__swatch pattern-key__swatch--now" aria-hidden="true" />
        {t().pattern.now}
      </li>
    </ul>
  );
}

/**
 * «Cómo suele estar»: en la ficha de una estación, cómo estuvo a cada hora en los días
 * importados, en laborables y en fin de semana. Es lo que pasó, no una previsión.
 */
export function StationPatternSection({ stationId, at }: { stationId: number; at: string }) {
  const m = t().pattern;
  const { state, retry } = usePattern(stationId);
  const shownParts = localParts(Date.parse(at));
  const nowHour = shownParts.hour;
  // El tipo de día del momento mostrado: su frase va solo en ese bloque.
  const shownType: DayType = isWeekday(shownParts.date) ? 'weekday' : 'weekend';

  let body;
  if (state.status === 'loading') {
    body = <p className="station-pattern__status">{m.loading}</p>;
  } else if (state.status === 'error') {
    body = (
      <div className="station-pattern__status" role="alert">
        <p>{m.failed}</p>
        <button type="button" className="button" onClick={retry}>
          {t().app.retry}
        </button>
      </div>
    );
  } else {
    const pattern = state.data;
    const days = [...pattern.weekdays, ...pattern.weekendDays].sort();
    if (days.length === 0) {
      body = <p className="station-pattern__status">{m.noDays}</p>;
    } else {
      const types = DAY_TYPES.filter((d) => daysOf(pattern, d).length > 0);
      const rows = Object.fromEntries(types.map((d) => [d, hoursOf(pattern, d)])) as Record<
        DayType,
        PatternHourRow[]
      >;
      body = (
        <>
          <p className="station-pattern__lead">
            {m.lead(days.length, periodText(days) ?? '')}
            {pattern.source.kind === 'synthetic' && <> {m.demo}</>}
          </p>
          {types.map((dayType) => (
            <div key={dayType} className="station-pattern__type">
              <h4 className="station-pattern__type-title">
                {dayTypeLabel(dayType)}{' '}
                <span className="station-pattern__days">
                  {m.days(daysOf(pattern, dayType).length)}
                </span>
              </h4>
              <Columns rows={rows[dayType]} nowHour={nowHour} />
              <Summary
                rows={rows[dayType]}
                shown={dayType === shownType ? (rows[dayType][nowHour] ?? null) : null}
              />
            </div>
          ))}
          <Key parts={partsPresent(types.flatMap((d) => rows[d]))} />
          <p className="station-pattern__note">{m.holidays}</p>
        </>
      );
    }
  }

  return (
    <section className="station-pattern" aria-labelledby="station-pattern-title">
      <h3 id="station-pattern-title" className="station-pattern__title">
        {m.title}
      </h3>
      {body}
    </section>
  );
}
