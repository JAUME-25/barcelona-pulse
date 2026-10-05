import {
  AVAILABILITY_HINT,
  AVAILABILITY_LABEL,
  AVAILABILITY_ORDER,
  type Availability,
} from './availability';
import { OctagonGlyph } from './OctagonGlyph';

interface AvailabilityFilterProps {
  counts: Record<Availability, number>;
  visible: ReadonlySet<Availability>;
  onToggle: (category: Availability) => void;
}

/** La leyenda es también el filtro: cada categoría se muestra u oculta en mapa y lista. */
export function AvailabilityFilter({ counts, visible, onToggle }: AvailabilityFilterProps) {
  return (
    <fieldset className="availability-filter">
      <legend className="availability-filter__legend">Qué significa cada marcador</legend>
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
                  <span className="availability-filter__label">{AVAILABILITY_LABEL[category]}</span>
                  <span className="availability-filter__hint">{AVAILABILITY_HINT[category]}</span>
                </span>
                <span className="availability-filter__count">{counts[category]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="availability-filter__help">Pulsa una categoría para ocultarla o mostrarla.</p>
    </fieldset>
  );
}
