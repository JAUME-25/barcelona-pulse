import { memo, useCallback, useEffect, useRef } from 'react';
import type { StationItem } from '../../api/client';
import { t } from '../../i18n';
import { availabilityLabel, availabilityOf, type Availability } from './availability';
import { stationName } from './names';
import { OctagonGlyph } from './OctagonGlyph';

interface StationListProps {
  stations: readonly StationItem[];
  /** Momento mostrado: para decir desde cuándo no hay dato. */
  at: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function summary(station: StationItem, at: string): string {
  const m = t().list;
  const category = availabilityOf(station.state);
  const label = availabilityLabel(category);
  const last = station.state.lastObservedAt;
  // Con la fecha si no es del mismo día: «desde las 10:54» no puede querer decir junio de 2025.
  if (station.state.freshness === 'stale' && last !== null) return m.staleSince(label, last, at);
  if (station.state.freshness === 'none') return m.never;
  if (category !== 'outOfService' && station.state.isRenting === false) return m.noRenting(label);
  if (category !== 'outOfService' && station.state.isReturning === false) {
    return m.noReturning(label);
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
  /** El barrio, para situar la estación cuando se busca o se ordena por cifras. */
  place: string | null;
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
  place,
  category,
  summaryText,
  bikes,
  docks,
  current,
  onSelect,
}: StationRowProps) {
  const m = t().list;
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
            {place !== null && <span className="station-list__place"> · {place}</span>}
            {bikes !== null && (
              <span className="visually-hidden">
                , {m.srBikes(bikes)}
                {docks !== null && `, ${m.srDocks(docks)}`}
              </span>
            )}
          </span>
        </span>
        <span className="station-list__figures" aria-hidden="true">
          <Figure value={bikes} unit={m.unitBikes(bikes ?? 0)} />
          <Figure value={docks} unit={m.unitDocks} />
        </span>
      </button>
    </li>
  );
});

/** Alternativa accesible al mapa: cada estación es un botón con su estado en texto. */
export function StationList({ stations, at, selectedId, onSelect }: StationListProps) {
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
            name={stationName(station)}
            place={station.neighbourhood}
            category={category}
            summaryText={summary(station, at)}
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
