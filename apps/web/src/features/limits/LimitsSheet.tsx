import { useEffect, useMemo, useRef } from 'react';
import type { SourceSummary, StationsResponse } from '../../api/client';
import { formatDateTime, formatMonths, plural } from '../../shared/format';
import type { Coverage } from '../history/series';
import { dayOfMonth, formatLocalDay, formatShortWeekday, weekStart } from '../history/time';
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

const COVERAGE_TEXT: Record<Coverage, string> = {
  complete: 'casi todas con dato',
  partial: 'faltan algunas',
  none: 'ninguna con dato',
};

const SILENCE_TITLE: Record<Silence, [string, string]> = {
  never: ['Ningún dato hasta este momento', 'Ningún dato hasta este momento'],
  days: ['Lleva días sin informar', 'Llevan días sin informar'],
  hours: ['Lleva horas sin informar', 'Llevan horas sin informar'],
  minutes: ['Acaba de dejar de informar', 'Acaban de dejar de informar'],
};
const SILENCE_ORDER: readonly Silence[] = ['never', 'days', 'hours', 'minutes'];

const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

function monthOf(day: string): string {
  const [y = '', m = '1'] = day.split('-');
  return `${monthName.format(Date.UTC(Number(y), Number(m) - 1, 15))} de ${y}`;
}

const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 });

/** Rejilla de huecos: un día por fila, una hora por casilla; pulsar un día lo reproduce. */
function HoleGrid({
  rows,
  onPickDay,
}: {
  rows: readonly DayRow[];
  onPickDay: (day: string) => void;
}) {
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
              aria-label={`${formatLocalDay(r.day)}: ${COVERAGE_TEXT[r.worst]} en el peor momento. Reproducir ese día.`}
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

/** Los huecos de todo lo importado: resumen, rejilla y leyenda. */
function Holes({ source, onPickDay }: { source: SourceSummary; onPickDay: (day: string) => void }) {
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
        Midiendo los huecos…
      </p>
    );
  }
  if (state.status === 'error' || summary === null) {
    return (
      <div className="limits-sheet__note" role="alert">
        <p>No se han podido medir los huecos. {state.status === 'error' && state.error.message}</p>
        <button type="button" className="button" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  }
  const below = summary.incomplete + summary.empty;
  return (
    <>
      <p className="limits-sheet__text">
        De media, el {percent.format(summary.average)} de las estaciones tienen dato en cada paso de{' '}
        {QUALITY_STEP_MINUTES} minutos.{' '}
        {below === 0
          ? 'Ningún paso por debajo del 95 %.'
          : `${String(below)} de ${String(summary.steps)} pasos por debajo del 95 %: ${listDays(summary.daysWithGaps)}.`}
      </p>
      <HoleGrid rows={rows} onPickDay={onPickDay} />
      <ul className="hole-legend" aria-label="Qué significa cada casilla">
        <li>
          <span className="hole-grid__cell hole-grid__cell--complete" aria-hidden="true" />
          95 % o más con dato
        </li>
        <li>
          <span className="hole-grid__cell hole-grid__cell--partial" aria-hidden="true" />
          Faltan algunas
        </li>
        <li>
          <span className="hole-grid__cell hole-grid__cell--none" aria-hidden="true" />
          Ninguna
        </li>
      </ul>
      <p className="limits-sheet__note">
        Cada fila es un día y cada casilla, una hora (medida cada {QUALITY_STEP_MINUTES} minutos).
        Pulsa un día para reproducirlo.
      </p>
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
  const silent = silentStations(response.stations, response.at);
  const total = response.stations.length;
  if (silent.length === 0) {
    return (
      <p className="limits-sheet__text">
        {formatDateTime(response.at)}: las {total} estaciones tienen dato.
      </p>
    );
  }
  const groups = SILENCE_ORDER.map((silence) => ({
    silence,
    items: silent.filter((s) => s.silence === silence),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <p className="limits-sheet__text">
        {formatDateTime(response.at)}: {silent.length} de {total} estaciones sin dato. No cuentan
        como vacías: su estado es desconocido.
      </p>
      {groups.map((g) => (
        <section key={g.silence} className="silent-group">
          <h4 className="silent-group__title">
            {SILENCE_TITLE[g.silence][g.items.length === 1 ? 0 : 1]}{' '}
            <span className="silent-group__count">{g.items.length}</span>
          </h4>
          <ul className="silent-group__list">
            {g.items.map((s) => {
              const content = (
                <>
                  <span className="silent-group__name">{s.station.name}</span>
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
  onClose,
  onPickDay,
  onSelectStation,
}: {
  source: SourceSummary;
  /** Estado de las estaciones en el momento mostrado. */
  response: StationsResponse;
  /** Mover el foco al título: sí si la persona la acaba de abrir, no al llegar con un enlace. */
  focusOnOpen: boolean;
  onClose: () => void;
  onPickDay: (day: string) => void;
  /** Abre la estación (detalle y marca en el mapa). Sin ella (al experimentar), solo texto. */
  onSelectStation?: (id: number) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const months = formatMonths(source.days);
  const period = periodText(source.days);

  useEffect(() => {
    if (focusOnOpen) headingRef.current?.focus();
  }, [focusOnOpen]);

  return (
    <article className="limits-sheet" aria-labelledby="limits-sheet-title">
      <button type="button" className="station-detail__back" onClick={onClose}>
        Volver
      </button>
      <h2 id="limits-sheet-title" className="limits-sheet__title" tabIndex={-1} ref={headingRef}>
        Qué muestra y qué no
      </h2>
      <p className="limits-sheet__lead">
        Cómo estaban las {source.stationCount} estaciones de Bicing {period}, según el archivo que
        publica el Ajuntament de Barcelona. Es el pasado: no lo que pasa ahora.
      </p>

      <h3 className="limits-sheet__heading">Los datos</h3>
      <dl className="limits-facts">
        <dt>Periodo</dt>
        <dd>
          {period} ({plural(source.days.length, 'día', 'días')})
        </dd>
        {source.period !== null && (
          <>
            <dt>Último dato</dt>
            <dd>{formatDateTime(source.period.to)}</dd>
          </>
        )}
        <dt>Ritmo</dt>
        <dd>Una foto de toda la red cada 5 minutos</dd>
        <dt>Caducidad</dt>
        <dd>
          A los {source.toleranceMinutes} minutos sin informar, el estado de una estación pasa a
          desconocido
        </dd>
        <dt>Estaciones</dt>
        <dd>{source.stationCount}</dd>
      </dl>

      <h3 className="limits-sheet__heading">Huecos</h3>
      <Holes source={source} onPickDay={onPickDay} />

      <h3 className="limits-sheet__heading">Sin dato en este momento</h3>
      <Silent response={response} onSelectStation={onSelectStation} />

      <h3 className="limits-sheet__heading">Lo que no dice</h3>
      <ul className="limits-sheet__list">
        {notSaid(source.toleranceMinutes).map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>

      <h3 className="limits-sheet__heading">De dónde sale cada cosa</h3>
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
            El conjunto de datos de Bicing en Open Data BCN
          </a>
        </p>
      )}
      <p className="limits-sheet__text">
        Código, decisiones y mediciones:{' '}
        <a href={CODE_URL} target="_blank" rel="noreferrer">
          github.com/JAUME-25/barcelona-pulse
        </a>
      </p>
    </article>
  );
}
