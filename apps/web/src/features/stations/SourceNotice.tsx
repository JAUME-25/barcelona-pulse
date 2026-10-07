import type { StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { formatDayWithWeekday, formatTime } from '../../shared/format';
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

/**
 * Procedencia siempre visible: qué fuente es, si los datos son reales y de qué momento.
 * «En directo» no se usa: queda reservado a una integración con frescura comprobada.
 */
export function SourceNotice({
  response,
  compact = false,
  months = null,
  onLimits,
  onChangeMoment,
  onThisHour,
  shareWithoutCamera = false,
}: {
  response: StationsResponse;
  /** Sin el momento: al reproducir, lo enseña el control de tiempo. */
  compact?: boolean;
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
        <p className="source-notice__share">
          <ShareLink withoutCamera={shareWithoutCamera} />
        </p>
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
      {onLimits !== undefined && (
        <p className="source-notice__limits">
          <button type="button" className="limits-link" onClick={onLimits}>
            {m.limits}
          </button>
        </p>
      )}
      <p className="source-notice__share">
        <ShareLink withoutCamera={shareWithoutCamera} />
      </p>
    </div>
  );
}
