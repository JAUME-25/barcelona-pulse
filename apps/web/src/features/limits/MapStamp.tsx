import type { SourceKind } from '../../api/client';
import { t } from '../../i18n';
import { formatDateTime } from '../../shared/format';
import './limits.css';

/**
 * Sello sobre el mapa, solo en móvil (en escritorio el panel está siempre al lado): qué es y de
 * cuándo, para que el mapa lo diga solo aunque el aviso de procedencia haya quedado arriba.
 */
export function MapStamp({
  kind,
  at,
  experiment,
  hypothetical,
}: {
  kind: SourceKind;
  at: string | undefined;
  experiment: boolean;
  hypothetical: boolean;
}) {
  const m = t().stamp;
  if (kind === 'synthetic') {
    return (
      <p className="map-stamp map-stamp--demo">
        <span className="map-stamp__label">{m.demo}</span>
        <span className="map-stamp__value">{m.demoValue}</span>
      </p>
    );
  }
  return (
    <p className="map-stamp">
      <span className="map-stamp__label">{experiment ? m.network : m.historical}</span>
      <span className="map-stamp__value">{at === undefined ? '…' : formatDateTime(at)}</span>
      {experiment && hypothetical && <span className="map-stamp__extra">{m.hypothetical}</span>}
    </p>
  );
}
