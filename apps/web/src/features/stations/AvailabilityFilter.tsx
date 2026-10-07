import { t } from '../../i18n';
import {
  activePreset,
  availabilityHint,
  availabilityLabel,
  AVAILABILITY_ORDER,
  PRESETS,
  type Availability,
  type NumberMode,
  type Preset,
} from './availability';
import { BoltGlyph, MeGlyph, OctagonGlyph, TransitGlyph } from './OctagonGlyph';

export type { NumberMode } from './availability';

interface AvailabilityFilterProps {
  counts: Record<Availability, number>;
  visible: ReadonlySet<Availability>;
  onToggle: (category: Availability) => void;
  /** Interruptor del número: todas las bicis, solo las eléctricas o los anclajes libres. */
  numberMode: NumberMode;
  onNumberMode: (mode: NumberMode) => void;
  /** Atajos: «Quiero una bici» y «Quiero aparcar» cambian lo visible y el número a la vez. */
  onPreset: (preset: Preset) => void;
  /** El punto de «Cerca de mí» está en el mapa: se explica en la clave. */
  showMe?: boolean;
}

/**
 * La leyenda es también el filtro: cada categoría se muestra u oculta en mapa y lista. Arriba, el
 * interruptor del número: con «Eléctricas», marcadores y lista dicen cuántas eléctricas hay y las
 * estaciones sin ninguna se atenúan. Las categorías no cambian: son las de la API.
 */
export function AvailabilityFilter({
  counts,
  visible,
  onToggle,
  numberMode,
  onNumberMode,
  onPreset,
  showMe = false,
}: AvailabilityFilterProps) {
  const m = t().availability;
  const preset = activePreset(visible, numberMode);
  return (
    <fieldset className="availability-filter">
      <legend className="availability-filter__legend">{m.legend}</legend>
      {/* Las dos preguntas de siempre, a un toque: lo que se ve y el número cambian a la vez. */}
      <div className="number-mode" role="group" aria-label={m.presetsLabel}>
        <span className="number-mode__label">{m.presetsLabel}</span>
        {PRESETS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={preset === value}
            onClick={() => {
              onPreset(value);
            }}
          >
            {m.presets[value]}
          </button>
        ))}
      </div>
      <div className="number-mode" role="group" aria-label={m.numberLabel}>
        <span className="number-mode__label">{m.numberLabel}</span>
        <button
          type="button"
          aria-pressed={numberMode === 'bikes'}
          onClick={() => {
            onNumberMode('bikes');
          }}
        >
          {m.numberBikes}
        </button>
        <button
          type="button"
          aria-pressed={numberMode === 'ebikes'}
          onClick={() => {
            onNumberMode('ebikes');
          }}
        >
          <BoltGlyph size={14} />
          {m.numberEbikes}
        </button>
        <button
          type="button"
          aria-pressed={numberMode === 'docks'}
          onClick={() => {
            onNumberMode('docks');
          }}
        >
          {m.numberDocks}
        </button>
        {numberMode === 'ebikes' && <p className="number-mode__help">{m.numberEbikesHelp}</p>}
        {numberMode === 'docks' && <p className="number-mode__help">{m.numberDocksHelp}</p>}
      </div>
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
        {showMe && (
          <li>
            <MeGlyph size={15} />
            {m.me}
          </li>
        )}
      </ul>
    </fieldset>
  );
}
