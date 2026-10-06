import type { SourceKind } from '../../api/client';
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
  if (kind === 'synthetic') {
    return (
      <p className="map-stamp map-stamp--demo">
        <span className="map-stamp__label">Demo</span>
        <span className="map-stamp__value">Datos inventados</span>
      </p>
    );
  }
  return (
    <p className="map-stamp">
      <span className="map-stamp__label">
        {experiment ? 'Red real del' : 'Histórico, no es tiempo real'}
      </span>
      <span className="map-stamp__value">{at === undefined ? '…' : formatDateTime(at)}</span>
      {experiment && hypothetical && (
        <span className="map-stamp__extra">con cambios hipotéticos</span>
      )}
    </p>
  );
}
