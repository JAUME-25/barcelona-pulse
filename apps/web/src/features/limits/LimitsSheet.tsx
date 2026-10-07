import { Fragment, useEffect, useMemo, useRef } from 'react';
import type { SourceSummary, StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { numberFormat } from '../../i18n/intl';
import { formatDateTime, formatMonths, formatWhole } from '../../shared/format';
import { dayOfMonth, formatLocalDay, formatShortWeekday, weekStart } from '../history/time';
import { stationName } from '../stations/names';
import {
  byDay,
  ingestionTotals,
  reasonLabel,
  rejectionsByReason,
  useIngestions,
  type DayIngestion,
} from './ingestions';
import {
  CODE_URL,
  listDays,
  notSaid,
  origins,
  periodText,
  silenceLabel,
  silentStations,
  type Silence,
} from './limits';
import { hourGrid, qualitySummary, QUALITY_STEP_MINUTES, useQuality, type DayRow } from './quality';
import './limits.css';

const SILENCE_ORDER: readonly Silence[] = ['never', 'days', 'hours', 'minutes'];

/** «mayo de 2026», sobre cada mes de la rejilla. */
function monthOf(day: string): string {
  const [y = '', m = '1'] = day.split('-');
  return t().limits.month(Number(y), Number(m));
}

/** Rejilla de huecos: un día por fila, una hora por casilla; pulsar un día lo reproduce. */
function HoleGrid({
  rows,
  onPickDay,
}: {
  rows: readonly DayRow[];
  onPickDay: (day: string) => void;
}) {
  const m = t().limits;
  return (
    <div className="hole-grid">
      <div className="hole-grid__hours" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => (
          <span key={h} style={{ gridColumn: h + 2 }}>
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      {rows.map((r, i) => {
        const newMonth = i === 0 || rows[i - 1]?.day.slice(0, 7) !== r.day.slice(0, 7);
        return (
          <div key={r.day}>
            {newMonth && <p className="hole-grid__month">{monthOf(r.day)}</p>}
            <button
              type="button"
              className="hole-grid__row"
              data-week-start={weekStart(r.day) === r.day ? '' : undefined}
              aria-label={m.dayRow(formatLocalDay(r.day), m.coverage[r.worst])}
              onClick={() => {
                onPickDay(r.day);
              }}
            >
              <span className="hole-grid__day">
                {formatShortWeekday(r.day)} {dayOfMonth(r.day)}
              </span>
              {r.hours.map((c, h) => (
                <span key={h} className={`hole-grid__cell hole-grid__cell--${c ?? 'missing'}`} />
              ))}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** «jue 20» o, si una importación cubre varios días, «22–24». */
function periodLabel(days: readonly string[]): string {
  const [first, last] = [days[0], days.at(-1)];
  if (first === undefined || last === undefined) return '';
  if (first === last) return `${formatShortWeekday(first)} ${String(dayOfMonth(first))}`;
  return `${String(dayOfMonth(first))}–${String(dayOfMonth(last))}`;
}

/** Una fila por día importado: lo que entró, lo repetido, lo que chocó y lo rechazado. */
function IngestionTable({ rows }: { rows: readonly DayIngestion[] }) {
  const m = t().limits;
  return (
    <table className="ingestion-table">
      <thead>
        <tr>
          <th scope="col">{m.ingestionDay}</th>
          <th scope="col">{m.ingestionNew}</th>
          <th scope="col">{m.ingestionDuplicate}</th>
          <th scope="col">{m.ingestionConflicting}</th>
          <th scope="col">{m.ingestionRejected}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const day = r.days[0] ?? '';
          const newMonth = i === 0 || rows[i - 1]?.days[0]?.slice(0, 7) !== day.slice(0, 7);
          // Importado más de una vez, fallido o borrado después: junto al día.
          const flags = [
            r.runs > 1 ? m.ingestionTimes(r.runs) : null,
            r.failed ? m.ingestionFailed : null,
            r.purged ? m.ingestionPurged : null,
          ].filter((f): f is string => f !== null);
          return (
            <Fragment key={r.key}>
              {newMonth && (
                <tr className="ingestion-table__month">
                  <th scope="rowgroup" colSpan={5}>
                    {monthOf(day)}
                  </th>
                </tr>
              )}
              <tr data-purged={r.purged ? '' : undefined} data-failed={r.failed ? '' : undefined}>
                <th scope="row">
                  {periodLabel(r.days)}
                  {flags.length > 0 && (
                    <span className="ingestion-table__flag"> {flags.join(' · ')}</span>
                  )}
                </th>
                <td>{formatWhole(r.accepted)}</td>
                <td>{formatWhole(r.duplicate)}</td>
                <td>{formatWhole(r.conflicting)}</td>
                <td>{formatWhole(r.rejected)}</td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Lo que entró de verdad en cada importación, según el registro de la ingesta. */
function Ingestions({ source }: { source: SourceSummary }) {
  const m = t().limits;
  const { state, retry } = useIngestions(source);
  const items = state.status === 'ready' ? state.data : null;
  const rows = useMemo(() => (items === null ? [] : byDay(items)), [items]);
  const reasons = useMemo(() => (items === null ? [] : rejectionsByReason(items)), [items]);

  if (state.status === 'loading') {
    return (
      <p className="limits-sheet__note" role="status">
        {m.ingestionsLoading}
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="limits-sheet__note" role="alert">
        <p>
          {m.ingestionsError} {state.error.message}
        </p>
        <button type="button" className="button" onClick={retry}>
          {t().app.retry}
        </button>
      </div>
    );
  }
  if (rows.length === 0) return <p className="limits-sheet__note">{m.ingestionsNone}</p>;
  const totals = ingestionTotals(rows);
  return (
    <section className="ingestions" aria-label={m.ingestionsTitle}>
      <p className="limits-sheet__text">
        {m.ingestionsLead({
          periods: totals.periods,
          runs: totals.runs,
          accepted: formatWhole(totals.accepted),
          duplicate: formatWhole(totals.duplicate),
          conflicting: formatWhole(totals.conflicting),
          rejected: formatWhole(totals.rejected),
          failed: totals.failed,
          purged: totals.purged,
        })}
      </p>
      <details className="ingestions__days">
        <summary>{m.ingestionsTitle}</summary>
        <IngestionTable rows={rows} />
        <p className="limits-sheet__note">{m.ingestionsNote}</p>
      </details>
      {reasons.length === 0 ? (
        <p className="limits-sheet__text">{m.noRejections}</p>
      ) : (
        <>
          <p className="limits-sheet__text ingestions__reasons-title">{m.rejectionsTitle}</p>
          <ul className="limits-sheet__list">
            {reasons.map((r) => (
              <li key={`${r.recordKind}:${r.reason}`}>
                {m.rejectionLine(r.count, r.recordKind, reasonLabel(r.reason))}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Los huecos de todo lo importado: resumen, rejilla y leyenda. */
function Holes({ source, onPickDay }: { source: SourceSummary; onPickDay: (day: string) => void }) {
  const m = t().limits;
  const { state, retry } = useQuality(source);
  const points = state.status === 'ready' ? state.data : null;
  const rows = useMemo(
    () => (points === null ? [] : hourGrid(points, source.days)),
    [points, source.days],
  );
  const summary = useMemo(
    () => (points === null ? null : qualitySummary(points, source.days)),
    [points, source.days],
  );

  if (state.status === 'loading') {
    return (
      <p className="limits-sheet__note" role="status">
        {m.measuring}
      </p>
    );
  }
  if (state.status === 'error' || summary === null) {
    return (
      <div className="limits-sheet__note" role="alert">
        <p>
          {m.holesError} {state.status === 'error' && state.error.message}
        </p>
        <button type="button" className="button" onClick={retry}>
          {t().app.retry}
        </button>
      </div>
    );
  }
  const below = summary.incomplete + summary.empty;
  const average = numberFormat({ style: 'percent', maximumFractionDigits: 1 }).format(
    summary.average,
  );
  return (
    <>
      <p className="limits-sheet__text">
        {m.average(average, QUALITY_STEP_MINUTES)}{' '}
        {below === 0 ? m.noneBelow : m.below(below, summary.steps, listDays(summary.daysWithGaps))}
      </p>
      <HoleGrid rows={rows} onPickDay={onPickDay} />
      <ul className="hole-legend" aria-label={m.legend}>
        <li>
          <span className="hole-grid__cell hole-grid__cell--complete" aria-hidden="true" />
          {m.legendComplete}
        </li>
        <li>
          <span className="hole-grid__cell hole-grid__cell--partial" aria-hidden="true" />
          {m.legendPartial}
        </li>
        <li>
          <span className="hole-grid__cell hole-grid__cell--none" aria-hidden="true" />
          {m.legendNone}
        </li>
      </ul>
      <p className="limits-sheet__note">{m.gridNote(QUALITY_STEP_MINUTES)}</p>
    </>
  );
}

/** Las estaciones sin dato en el momento mostrado, agrupadas por el motivo. */
function Silent({
  response,
  onSelectStation,
}: {
  response: StationsResponse;
  onSelectStation?: (id: number) => void;
}) {
  const m = t().limits;
  const silent = silentStations(response.stations, response.at);
  const total = response.stations.length;
  if (silent.length === 0) {
    return (
      <p className="limits-sheet__text">{m.allWithData(formatDateTime(response.at), total)}</p>
    );
  }
  const groups = SILENCE_ORDER.map((silence) => ({
    silence,
    items: silent.filter((s) => s.silence === silence),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <p className="limits-sheet__text">
        {m.someSilent(formatDateTime(response.at), silent.length, total)}
      </p>
      {groups.map((g) => (
        <section key={g.silence} className="silent-group">
          <h4 className="silent-group__title">
            {m.silenceTitle[g.silence][g.items.length === 1 ? 0 : 1]}{' '}
            <span className="silent-group__count">{g.items.length}</span>
          </h4>
          <ul className="silent-group__list">
            {g.items.map((s) => {
              const content = (
                <>
                  <span className="silent-group__name">{stationName(s.station)}</span>
                  {/* Sin ningún dato, el título del grupo ya lo dice todo. */}
                  {s.silence !== 'never' && (
                    <span className="silent-group__why">{silenceLabel(s, response.at)}</span>
                  )}
                </>
              );
              return (
                <li key={s.station.id}>
                  {onSelectStation === undefined ? (
                    <span className="silent-group__item">{content}</span>
                  ) : (
                    <button
                      type="button"
                      className="silent-group__item"
                      onClick={() => {
                        onSelectStation(s.station.id);
                      }}
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * «Qué muestra y qué no»: la explicación completa de los límites, en el panel y con el mapa a
 * la vista. Se abre desde el aviso de procedencia.
 */
export function LimitsSheet({
  source,
  response,
  focusOnOpen,
  onFocused,
  onClose,
  onPickDay,
  onSelectStation,
}: {
  source: SourceSummary;
  /** Estado de las estaciones en el momento mostrado. */
  response: StationsResponse;
  /** Mover el foco al título: sí si la persona la acaba de abrir, no al llegar con un enlace. */
  focusOnOpen: boolean;
  /** Ya tiene el foco: al volver a montarse no lo pide otra vez. */
  onFocused: () => void;
  onClose: () => void;
  onPickDay: (day: string) => void;
  /** Abre la estación (detalle y marca en el mapa). Sin ella (al experimentar), solo texto. */
  onSelectStation?: (id: number) => void;
}) {
  const m = t().limits;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const months = formatMonths(source.days);
  const period = periodText(source.days);

  useEffect(() => {
    if (!focusOnOpen) return;
    headingRef.current?.focus();
    onFocused();
  }, [focusOnOpen, onFocused]);

  return (
    <article className="limits-sheet" aria-labelledby="limits-sheet-title">
      <button type="button" className="station-detail__back" onClick={onClose}>
        {m.back}
      </button>
      <h2 id="limits-sheet-title" className="limits-sheet__title" tabIndex={-1} ref={headingRef}>
        {m.title}
      </h2>
      <p className="limits-sheet__lead">{m.lead(source.stationCount, period)}</p>

      <h3 className="limits-sheet__heading">{m.data}</h3>
      <dl className="limits-facts">
        <dt>{m.period}</dt>
        <dd>{m.periodValue(period, source.days.length)}</dd>
        {source.period !== null && (
          <>
            <dt>{m.lastData}</dt>
            <dd>{formatDateTime(source.period.to)}</dd>
          </>
        )}
        <dt>{m.rhythm}</dt>
        <dd>{m.rhythmValue}</dd>
        <dt>{m.expiry}</dt>
        <dd>{m.expiryValue(source.toleranceMinutes)}</dd>
        <dt>{m.stations}</dt>
        <dd>{source.stationCount}</dd>
        {source.period !== null && (
          <>
            <dt>{m.observations}</dt>
            <dd>{formatWhole(source.period.observationCount)}</dd>
          </>
        )}
        {source.lastIngestion !== null && (
          <>
            <dt>{m.lastIngestion}</dt>
            <dd>
              {m.lastIngestionValue(
                formatDateTime(source.lastIngestion.finishedAt ?? source.lastIngestion.startedAt),
                m.ingestionStatus[source.lastIngestion.status],
                formatWhole(source.lastIngestion.observationsAccepted),
                formatWhole(source.lastIngestion.observationsDuplicate),
                formatWhole(source.lastIngestion.observationsConflicting),
                formatWhole(source.lastIngestion.observationsRejected),
              )}
            </dd>
          </>
        )}
      </dl>
      <Ingestions source={source} />

      <h3 className="limits-sheet__heading">{m.holes}</h3>
      <Holes source={source} onPickDay={onPickDay} />

      <h3 className="limits-sheet__heading">{m.silent}</h3>
      <Silent response={response} onSelectStation={onSelectStation} />

      <h3 className="limits-sheet__heading">{m.notSaidTitle}</h3>
      <ul className="limits-sheet__list">
        {notSaid(source.toleranceMinutes).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>

      <h3 className="limits-sheet__heading">{m.originsTitle}</h3>
      <dl className="limits-origins">
        {origins(months).map((o) => (
          <div key={o.what}>
            <dt>{o.what}</dt>
            <dd>
              {o.who}
              <span className="limits-origins__terms">{o.terms}</span>
            </dd>
          </div>
        ))}
      </dl>
      {source.url !== null && (
        <p className="limits-sheet__text">
          <a href={source.url} target="_blank" rel="noreferrer">
            {m.dataset}
          </a>
        </p>
      )}
      <p className="limits-sheet__text">
        {m.code}{' '}
        <a href={CODE_URL} target="_blank" rel="noreferrer">
          github.com/JAUME-25/barcelona-pulse
        </a>
      </p>
    </article>
  );
}
