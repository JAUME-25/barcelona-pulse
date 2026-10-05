import type { StationsResponse } from '../../api/client';
import { formatDay, formatTime } from '../../shared/format';

function Moment({ label, iso }: { label: string; iso: string }) {
  return (
    <p className="source-notice__moment">
      <span className="source-notice__label">{label}</span>
      <time className="source-notice__time" dateTime={iso}>
        {formatDay(iso)}, <strong>{formatTime(iso)}</strong>
      </time>
      <span className="source-notice__tz">hora de Barcelona</span>
    </p>
  );
}

/**
 * Procedencia siempre visible: qué fuente es, si los datos son reales y de qué momento.
 * «En directo» no se usa: queda reservado a una integración con frescura comprobada.
 */
export function SourceNotice({ response }: { response: StationsResponse }) {
  const { source } = response;

  if (source.kind === 'synthetic') {
    return (
      <div className="source-notice source-notice--demo">
        <p className="source-notice__lead">
          <span className="source-notice__badge">Demo</span>
          Datos inventados para probar la aplicación. No es la disponibilidad real de Bicing.
        </p>
        <Moment label="Momento mostrado" iso={response.at} />
      </div>
    );
  }

  // Un instante pedido en una fuente observada es un momento del pasado (histórico).
  const historical = response.atBasis === 'requested';
  const latest = response.stations
    .map((s) => s.state.lastObservedAt)
    .filter((t): t is string => t !== null)
    .sort()
    .at(-1);

  return (
    <div className="source-notice source-notice--observed">
      <p className="source-notice__lead">
        <span className="source-notice__badge source-notice__badge--real">Datos reales</span>
        {historical ? 'Es un momento del pasado, no el estado actual.' : `${source.name}.`}
      </p>
      {historical ? (
        <Moment label="Momento mostrado" iso={response.at} />
      ) : latest === undefined ? (
        <p className="source-notice__moment">Sin observaciones en este momento.</p>
      ) : (
        <Moment label="Última observación" iso={latest} />
      )}
      <p className="source-notice__credit">
        {source.attribution}
        {source.license !== null && <> Licencia {source.license}.</>}{' '}
        {source.url !== null && (
          <a href={source.url} target="_blank" rel="noreferrer">
            Ver el conjunto de datos
          </a>
        )}
      </p>
    </div>
  );
}
