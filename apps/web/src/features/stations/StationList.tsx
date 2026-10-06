import { memo, useCallback, useEffect, useRef } from 'react';
import type { StationItem } from '../../api/client';
import { formatTime } from '../../shared/format';
import { AVAILABILITY_LABEL, availabilityOf, type Availability } from './availability';
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

interface StationRowProps {
  id: number;
  name: string;
  category: Availability;
  summaryText: string;
  bikes: number | null;
  docks: number | null;
  current: boolean;
  onSelect: (id: number) => void;
}

/**
 * Solo valores simples: al reproducir, cada paso trae objetos nuevos para las 540 estaciones y
 * así solo se vuelven a pintar las filas que cambian de verdad.
 */
const StationRow = memo(function StationRow({
  id,
  name,
  category,
  summaryText,
  bikes,
  docks,
  current,
  onSelect,
}: StationRowProps) {
  return (
    <li>
      <button
        type="button"
        className="station-list__item"
        data-station-id={id}
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          onSelect(id);
        }}
      >
        <OctagonGlyph category={category} size={22} />
        <span className="station-list__text">
          <span className="station-list__name">{name}</span>
          <span className="station-list__summary">
            {summaryText}
            {bikes !== null && (
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
});

/** Alternativa accesible al mapa: cada estación es un botón con su estado en texto. */
export function StationList({ stations, selectedId, onSelect }: StationListProps) {
  // La función que llega cambia con los datos; las filas reciben siempre la misma.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const select = useCallback((id: number) => {
    onSelectRef.current(id);
  }, []);

  return (
    <ul className="station-list">
      {stations.map((station) => {
        const category = availabilityOf(station.state);
        // Sin dato o fuera de servicio no se enseñan cifras: se leerían como disponibles.
        const known = category !== 'unknown' && category !== 'outOfService';
        return (
          <StationRow
            key={station.id}
            id={station.id}
            name={station.name}
            category={category}
            summaryText={summary(station)}
            bikes={known ? station.state.bikesAvailable : null}
            docks={known ? station.state.docksAvailable : null}
            current={station.id === selectedId}
            onSelect={select}
          />
        );
      })}
    </ul>
  );
}
