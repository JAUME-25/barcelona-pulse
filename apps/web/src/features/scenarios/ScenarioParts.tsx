import { useId } from 'react';
import type { CoverageResponse, StudyAreaItem } from '../../api/client';
import { THEME } from '../../app/theme';
import { octagonPoints, svgPath } from '../stations/octagon';
import type { Figures } from './figures';
import { RADIUS_MAX, RADIUS_MIN, RADIUS_STEP } from './scenario';
import { noEffectMessage, TOOLS, type ChangeItem, type Tool } from './scenarioView';
import type { ScenarioState } from './useScenario';
import './scenarios.css';

type CoverageModel = CoverageResponse['model'];

const [, , LIT, BRIGHT] = THEME.coverage;
const OCTAGON = svgPath(octagonPoints(2, 2, 16));

/** Estación hipotética, como en el mapa: rombo cian con una cruz. */
export function DiamondGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M10 2 L18 10 L10 18 L2 10 Z"
        fill={THEME.night}
        stroke={BRIGHT}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M7 10 H13 M10 7 V13" stroke={BRIGHT} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Hueco de una estación real quitada (con aspa) o movida (sin ella). */
export function GhostGlyph({ cross = true, size = 18 }: { cross?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d={OCTAGON}
        fill={THEME.night}
        stroke={BRIGHT}
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      {cross && (
        <path d="M7 7 L13 13 M13 7 L7 13" stroke={BRIGHT} strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Alcance de una estación nueva o movida: su círculo en discontinuo, como en el mapa. */
export function ReachGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke={BRIGHT}
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="10" cy="10" r="1.8" fill={BRIGHT} />
    </svg>
  );
}

/** Estación real en el modo escenario: sin estado, solo dónde está. */
export function NetworkGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d={OCTAGON} fill={THEME.networkMarker.color} stroke={THEME.night} strokeWidth="1.2" />
    </svg>
  );
}

function ToolIcon({ tool }: { tool: Exclude<Tool, null> }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
    focusable: false,
  } as const;
  switch (tool) {
    case 'add':
      return (
        <svg {...common}>
          <path
            d="M12 3 L21 12 L12 21 L3 12 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8.5 12 H15.5 M12 8.5 V15.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case 'move':
      return (
        <svg {...common}>
          <path
            d="M12 3 V21 M3 12 H21 M12 3 L9 6 M12 3 L15 6 M12 21 L9 18 M12 21 L15 18 M3 12 L6 9 M3 12 L6 15 M21 12 L18 9 M21 12 L18 15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'remove':
      return (
        <svg {...common}>
          <path
            d={svgPath(octagonPoints(3, 3, 18))}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 9 L15 15 M15 9 L9 15" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

/** Herramientas del mapa. Pulsar la activa la suelta. */
export function ToolButtons({ tool, onChange }: { tool: Tool; onChange: (tool: Tool) => void }) {
  return (
    <div className="tool-buttons" role="group" aria-label="Herramientas del escenario">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tool-button"
          aria-pressed={tool === t.id}
          title={t.hint}
          onClick={() => {
            onChange(tool === t.id ? null : t.id);
          }}
        >
          <ToolIcon tool={t.id} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Qué hace la herramienta activa; sin herramienta, cómo empezar. */
export function ToolHint({ tool }: { tool: Tool }) {
  const hint =
    TOOLS.find((t) => t.id === tool)?.hint ?? 'Elige una herramienta para cambiar la red.';
  return (
    <p className="tool-hint" aria-live="polite">
      {hint}
    </p>
  );
}

export function RadiusField({
  radius,
  onChange,
}: {
  radius: number;
  onChange: (radius: number) => void;
}) {
  const id = useId();
  return (
    <div className="radius-field">
      <label htmlFor={id} className="radius-field__label">
        Radio
        <output htmlFor={id} className="radius-field__value">
          {radius} m
        </output>
      </label>
      <input
        id={id}
        type="range"
        min={RADIUS_MIN}
        max={RADIUS_MAX}
        step={RADIUS_STEP}
        value={radius}
        aria-valuetext={`${String(radius)} metros`}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
      />
    </div>
  );
}

export function AreaField({
  areas,
  value,
  onChange,
}: {
  areas: readonly StudyAreaItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const municipality = areas.filter((a) => a.kind === 'municipality');
  const districts = areas
    .filter((a) => a.kind === 'district')
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return (
    <div className="area-field">
      <label htmlFor={id} className="area-field__label">
        Área de estudio
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {areas.length === 0 && <option value={value}>Barcelona</option>}
        {municipality.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        {districts.length > 0 && (
          <optgroup label="Distritos">
            {districts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

/** Marca de lo inventado: el escenario nunca se presenta como dato observado. */
export function HypotheticalBadge() {
  return <span className="hypothetical-badge">Hipotético</span>;
}

/** Diferencia entre la red real y el escenario, con el signo y una flecha. */
export function Delta({ figures }: { figures: Figures }) {
  const { direction } = figures;
  return (
    <span className={`delta delta--${direction}`}>
      {direction !== 'same' && (
        <>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path
              d={direction === 'up' ? 'M6 1 L11 9 H1 Z' : 'M6 11 L11 3 H1 Z'}
              fill="currentColor"
            />
          </svg>
          <span className="visually-hidden">{direction === 'up' ? 'Sube' : 'Baja'}</span>
        </>
      )}
      {figures.delta}
    </span>
  );
}

/**
 * Por qué no se mueve nada, si es el caso: una estación en zona ya cubierta no gana superficie y
 * sin explicación parece que no ha pasado nada. Solo con el cálculo del escenario a la vista.
 */
export function NoEffectNote({ state }: { state: ScenarioState }) {
  const current = state.result.status === 'ready' && !state.pending ? state.result.data : null;
  const message = current === null ? null : noEffectMessage(state.scenario, current);
  if (message === null) return null;
  return (
    <p className="no-effect-note" role="status">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {message}
    </p>
  );
}

function ChangeGlyph({ what }: { what: ChangeItem['what'] }) {
  if (what === 'añadida') return <DiamondGlyph size={16} />;
  return <GhostGlyph cross={what === 'quitada'} size={16} />;
}

export function ChangesList({ items, empty }: { items: readonly ChangeItem[]; empty: string }) {
  if (items.length === 0) return <p className="changes-list changes-list--empty">{empty}</p>;
  return (
    <ul className="changes-list">
      {items.map((item) => (
        <li key={item.key}>
          <ChangeGlyph what={item.what} />
          <span className="changes-list__name">{item.name}</span>
          <span className="changes-list__what">{item.what}</span>
          <button
            type="button"
            className="changes-list__undo"
            aria-label={`${item.undoLabel}: ${item.name}`}
            onClick={item.undo}
          >
            {item.undoLabel}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Assumptions({ model }: { model: CoverageModel }) {
  return (
    <div className="assumptions">
      <ul>
        {model.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <p className="assumptions__model">
        Modelo «{model.name}», versión {model.version}.
      </p>
    </div>
  );
}

/** Leyenda del mapa en modo escenario. */
export function CoverageLegend() {
  return (
    <div className="coverage-legend">
      <p className="coverage-legend__title">Qué se ve en el mapa</p>
      <ul>
        <li>
          <span className="swatch" style={{ background: LIT, opacity: 0.5 }} aria-hidden="true" />
          Cubierto por la red real
        </li>
        <li>
          <span className="swatch" style={{ background: BRIGHT }} aria-hidden="true" />
          Lo que gana el escenario
        </li>
        <li>
          <span className="swatch swatch--hatch" aria-hidden="true" />
          Lo que pierde
        </li>
        <li>
          <span
            className="swatch swatch--line"
            style={{ borderColor: THEME.tokens['--ink-2'] }}
            aria-hidden="true"
          />
          Límite del área de estudio
        </li>
        <li>
          <NetworkGlyph size={16} />
          Estación real
        </li>
        <li>
          <DiamondGlyph size={16} />
          Estación nueva (hipotética)
        </li>
        <li>
          <ReachGlyph size={16} />
          Alcance de una nueva o movida
        </li>
        <li>
          <GhostGlyph size={16} />
          Estación quitada
        </li>
      </ul>
    </div>
  );
}
