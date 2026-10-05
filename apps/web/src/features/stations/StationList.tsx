import type { StationItem } from '../../api/client';
import { formatTime } from '../../shared/format';
import { AVAILABILITY_LABEL, availabilityOf } from './availability';
import { OctagonGlyph } from './OctagonGlyph';

interface StationListProps {
  stations: readonly StationItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function summary(station: StationItem): string {
  const category = availabilityOf(station.state);
  const label = AVAILABILITY_LABEL[category];
  const last = station.state.lastObservedAt;
  if (station.state.freshness === 'stale' && last !== null) {
    return `${label} desde las ${formatTime(last)}`;
  }
  if (category !== 'outOfService' && station.state.isRenting === false) {
    return `${label}, sin préstamo`;
  }
  if (category !== 'outOfService' && station.state.isReturning === false) {
    return `${label}, sin devoluciones`;
  }
  return label;
}

function Figure({ value, unit }: { value: number | null; unit: string }) {
  return (
    <span className="station-list__figure">
      <span className="station-list__number">{value ?? '–'}</span>
      <span className="station-list__unit">{unit}</span>
    </span>
  );
}

/** Alternativa accesible al mapa: cada estación es un botón con su estado en texto. */
export function StationList({ stations, selectedId, onSelect }: StationListProps) {
  return (
    <ul className="station-list">
      {stations.map((station) => {
        const category = availabilityOf(station.state);
        // Sin dato o fuera de servicio no se enseñan cifras: se leerían como disponibles.
        const known = category !== 'unknown' && category !== 'outOfService';
        const bikes = known ? station.state.bikesAvailable : null;
        const docks = known ? station.state.docksAvailable : null;
        return (
          <li key={station.id}>
            <button
              type="button"
              className="station-list__item"
              data-station-id={station.id}
              aria-current={station.id === selectedId ? 'true' : undefined}
              onClick={() => {
                onSelect(station.id);
              }}
            >
              <OctagonGlyph category={category} size={22} />
              <span className="station-list__text">
                <span className="station-list__name">{station.name}</span>
                <span className="station-list__summary">
                  {summary(station)}
                  {known && bikes !== null && (
                    <span className="visually-hidden">
                      , {bikes === 1 ? '1 bici' : `${bikes} bicis`}
                      {docks !== null &&
                        `, ${docks === 1 ? '1 anclaje libre' : `${docks} anclajes libres`}`}
                    </span>
                  )}
                </span>
              </span>
              <span className="station-list__figures" aria-hidden="true">
                <Figure value={bikes} unit={bikes === 1 ? 'bici' : 'bicis'} />
                <Figure value={docks} unit="libres" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
