import type { StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { formatDayMonth } from '../../i18n/intl';
import { formatDayWithWeekday, formatTime } from '../../shared/format';
import { formatShortWeekday, localParts } from '../history/time';
import { ShareLink } from './ShareLink';
import { sourceAttribution, sourceName } from './sources';
import '../limits/limits.css';

/**
 * El momento, con el día de la semana (si es un laborable se nota) y, si se puede, cambiarlo o
 * saltar al día importado que más se parece a hoy a la hora de ahora («A esta hora»).
 */
function Moment({
  label,
  iso,
  onChange,
  onThisHour,
}: {
  label: string;
  iso: string;
  onChange?: () => void;
  onThisHour?: () => void;
}) {
  return (
    <p className="source-notice__moment">
      <span className="source-notice__label">{label}</span>
      <time className="source-notice__time" dateTime={iso}>
        {formatDayWithWeekday(iso)}, <strong>{formatTime(iso)}</strong>
      </time>
      <span className="source-notice__tz">{t().source.timeZone}</span>
      {onChange !== undefined && (
        <button type="button" className="limits-link" onClick={onChange}>
          {t().source.changeMoment}
        </button>
      )}
      {onThisHour !== undefined && (
        <button type="button" className="limits-link" onClick={onThisHour}>
          {t().source.thisHour}
        </button>
      )}
    </p>
  );
}

/** «Qué muestra y qué no» y «Copiar enlace», en una línea (se parten si no caben). */
function Links({
  onLimits,
  shareWithoutCamera,
}: {
  onLimits: (() => void) | undefined;
  shareWithoutCamera: boolean;
}) {
  return (
    <p className="source-notice__links">
      {onLimits !== undefined && (
        <span className="source-notice__limits">
          <button type="button" className="limits-link" onClick={onLimits}>
            {t().source.limits}
          </button>
        </span>
      )}
      <ShareLink withoutCamera={shareWithoutCamera} />
    </p>
  );
}

/**
 * Procedencia siempre visible: qué fuente es, si los datos son reales y de qué momento.
 * «En directo» no se usa: queda reservado a una integración con frescura comprobada.
 */
export function SourceNotice({
  response,
  compact = false,
  summaryTime = true,
  months = null,
  onLimits,
  onChangeMoment,
  onThisHour,
  shareWithoutCamera = false,
  fold = false,
}: {
  response: StationsResponse;
  /** Sin el momento: al reproducir, lo enseña el control de tiempo. */
  compact?: boolean;
  /**
   * En móvil, la línea plegada lleva el momento. Al reproducir no: `response.at` sería el final
   * del periodo, no el paso que se ve (ese lo dicen el reproductor y el sello del mapa).
   */
  summaryTime?: boolean;
  /** Meses de los datos importados («mayo de 2026»), para el histórico. */
  months?: string | null;
  /** Abre «Qué muestra y qué no», que lleva también el enlace al conjunto de datos. */
  onLimits?: () => void;
  /** Lleva a Reproducir, parado en el momento mostrado, para elegir otro. */
  onChangeMoment?: () => void;
  /** Pone el día importado que más se parece a hoy, a la hora de reloj de ahora. */
  onThisHour?: () => void;
  /** Con «Cerca de mí», el enlace va sin la cámara del mapa, que apunta a la persona. */
  shareWithoutCamera?: boolean;
  /**
   * En móvil: plegado a una línea («Datos reales · vie 28 de agosto, 08:30 · Más») que se
   * despliega entera, para que el mapa empiece antes (elegido el 7-10-2026 entre tres).
   */
  fold?: boolean;
}) {
  const m = t().source;
  const { source } = response;

  if (source.kind === 'synthetic') {
    return (
      <div className="source-notice source-notice--demo">
        <p className="source-notice__lead">
          <span className="source-notice__badge">{m.demoBadge}</span>
          {m.demoLead}
        </p>
        {!compact && <Moment label={m.shownMoment} iso={response.at} />}
        <Links onLimits={undefined} shareWithoutCamera={shareWithoutCamera} />
      </div>
    );
  }

  // Un instante pedido en una fuente observada es un momento del pasado (histórico).
  const historical = response.atBasis === 'requested';
  const latest = response.stations
    .map((s) => s.state.lastObservedAt)
    .filter((x): x is string => x !== null)
    .sort()
    .at(-1);

  if (fold && historical) {
    return (
      <div className="source-notice source-notice--observed source-notice--fold">
        <details className="source-notice__fold">
          <summary>
            <span className="source-notice__badge source-notice__badge--real">{m.realBadge}</span>
            {summaryTime ? (
              <time className="source-notice__fold-time" dateTime={response.at}>
                {formatShortWeekday(localParts(Date.parse(response.at)).date)}{' '}
                {formatDayMonth(response.at)}, <strong>{formatTime(response.at)}</strong>
              </time>
            ) : (
              months !== null && <span className="source-notice__fold-time">{months}</span>
            )}
            <span className="source-notice__fold-more" aria-hidden="true">
              <span className="source-notice__fold-open">{m.more}</span>
              <span className="source-notice__fold-close">{m.less}</span>
            </span>
          </summary>
          <p className="source-notice__lead">{months === null ? m.past : m.historical(months)}</p>
          {!compact && (
            <Moment
              label={m.shownMoment}
              iso={response.at}
              onChange={onChangeMoment}
              onThisHour={onThisHour}
            />
          )}
          <p className="source-notice__credit">
            {sourceAttribution(source)}
            {source.license !== null && <> {m.license(source.license)}</>}
          </p>
          <Links onLimits={onLimits} shareWithoutCamera={shareWithoutCamera} />
        </details>
      </div>
    );
  }

  return (
    <div className="source-notice source-notice--observed">
      <p className="source-notice__lead">
        <span className="source-notice__badge source-notice__badge--real">{m.realBadge}</span>
        {!historical ? `${sourceName(source)}.` : months === null ? m.past : m.historical(months)}
      </p>
      {compact ? null : historical ? (
        <Moment
          label={m.shownMoment}
          iso={response.at}
          onChange={onChangeMoment}
          onThisHour={onThisHour}
        />
      ) : latest === undefined ? (
        <p className="source-notice__moment">{m.noObservations}</p>
      ) : (
        <Moment label={m.lastObservation} iso={latest} />
      )}
      <p className="source-notice__credit">
        {sourceAttribution(source)}
        {source.license !== null && <> {m.license(source.license)}</>}{' '}
        {onLimits === undefined && source.url !== null && (
          <a href={source.url} target="_blank" rel="noreferrer">
            {m.dataset}
          </a>
        )}
      </p>
      <Links onLimits={onLimits} shareWithoutCamera={shareWithoutCamera} />
    </div>
  );
}
