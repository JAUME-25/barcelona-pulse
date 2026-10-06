import type { StationsResponse } from '../../api/client';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../shared/format';
import { sourceAttribution, sourceName } from './sources';
import '../limits/limits.css';

function Moment({ label, iso }: { label: string; iso: string }) {
  return (
    <p className="source-notice__moment">
      <span className="source-notice__label">{label}</span>
      <time className="source-notice__time" dateTime={iso}>
        {formatDay(iso)}, <strong>{formatTime(iso)}</strong>
      </time>
      <span className="source-notice__tz">{t().source.timeZone}</span>
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
}: {
  response: StationsResponse;
  /** Sin el momento: al reproducir, lo enseña el control de tiempo. */
  compact?: boolean;
  /** Meses de los datos importados («mayo de 2026»), para el histórico. */
  months?: string | null;
  /** Abre «Qué muestra y qué no», que lleva también el enlace al conjunto de datos. */
  onLimits?: () => void;
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
        <Moment label={m.shownMoment} iso={response.at} />
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
    </div>
  );
}
