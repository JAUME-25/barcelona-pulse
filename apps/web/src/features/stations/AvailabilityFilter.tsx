import { t } from '../../i18n';
import {
  availabilityHint,
  availabilityLabel,
  AVAILABILITY_ORDER,
  type Availability,
} from './availability';
import { OctagonGlyph, TransitGlyph } from './OctagonGlyph';

interface AvailabilityFilterProps {
  counts: Record<Availability, number>;
  visible: ReadonlySet<Availability>;
  onToggle: (category: Availability) => void;
}

/** La leyenda es también el filtro: cada categoría se muestra u oculta en mapa y lista. */
export function AvailabilityFilter({ counts, visible, onToggle }: AvailabilityFilterProps) {
  const m = t().availability;
  return (
    <fieldset className="availability-filter">
      <legend className="availability-filter__legend">{m.legend}</legend>
      <ul className="availability-filter__list">
        {AVAILABILITY_ORDER.map((category) => {
          const on = visible.has(category);
          return (
            <li key={category}>
              <button
                type="button"
                className="availability-filter__item"
                aria-pressed={on}
                onClick={() => {
                  onToggle(category);
                }}
              >
                <OctagonGlyph category={category} size={18} />
                <span className="availability-filter__text">
                  <span className="availability-filter__label">{availabilityLabel(category)}</span>
                  <span className="availability-filter__hint">{availabilityHint(category)}</span>
                </span>
                <span className="availability-filter__count">{counts[category]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="availability-filter__help">{m.legendHelp}</p>
      {/* Lo que el mapa base dibuja aparte de las estaciones, para orientarse. */}
      <ul className="map-key" aria-label={m.mapKey}>
        <li>
          <span className="map-key__lane" aria-hidden="true" />
          {m.bikeLane}
        </li>
        <li>
          <TransitGlyph size={15} />
          {m.transit}
        </li>
      </ul>
    </fieldset>
  );
}
