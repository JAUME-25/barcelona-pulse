import { useLayoutEffect, useRef } from 'react';
import type { StationItem, StudyAreaItem } from '../../api/client';
import { t } from '../../i18n';
import { formatDateTime } from '../../shared/format';
import { ScopeNotes } from '../limits/Notes';
import { figuresOf } from './figures';
import { hasChanges } from './scenario';
import {
  AreaField,
  Assumptions,
  ChangesList,
  Delta,
  HypotheticalBadge,
  NoEffectNote,
  RadiusField,
  ToolButtons,
  ToolHint,
} from './ScenarioParts';
import { PendingNote, ScenarioStatus } from './ScenarioStatus';
import { changeItems, type Tool } from './scenarioView';
import type { ScenarioState } from './useScenario';

export interface ScenarioViewProps {
  state: ScenarioState;
  areas: readonly StudyAreaItem[];
  /** Red base en su sitio real. */
  stations: readonly StationItem[];
  tool: Tool;
  onTool: (tool: Tool) => void;
}

/**
 * Mando de «Experimentar», bajo el mapa como el de Reproducir: herramientas, radio y área a un
 * lado; al otro, la comparación red real → escenario, grande, con qué mide y qué no.
 */
export function ScenarioDeck({ state, areas, tool, onTool }: ScenarioViewProps) {
  const f = state.shown === undefined ? undefined : figuresOf(state.shown);
  const deckRef = useRef<HTMLElement>(null);

  // En escritorio la leyenda va encima del mando, mida lo que mida.
  useLayoutEffect(() => {
    const deck = deckRef.current;
    const area = deck?.parentElement;
    if (deck === null || area == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      area.style.setProperty('--scenario-deck-height', `${String(deck.offsetHeight)}px`);
    });
    observer.observe(deck);
    return () => {
      observer.disconnect();
      area.style.removeProperty('--scenario-deck-height');
    };
  }, []);

  const m = t().scenario;
  return (
    <section ref={deckRef} className="scenario-deck" aria-label={m.deck}>
      <div className="scenario-deck__controls">
        <ToolButtons tool={tool} onChange={onTool} />
        <ToolHint tool={tool} />
        <div className="scenario-deck__fields">
          <RadiusField radius={state.scenario.radius} onChange={state.setRadius} />
          <AreaField areas={areas} value={state.scenario.area} onChange={state.setArea} />
        </div>
      </div>

      <div className="scenario-deck__result">
        <ScenarioStatus state={state} />
        {f !== undefined && (
          <>
            <div className="scenario-deck__compare">
              <p className="scenario-deck__side">
                <span className="scenario-deck__label">{m.real}</span>
                <span className="scenario-deck__share">{f.baseShare}</span>
                <span className="scenario-deck__sub">{m.stations(f.baseStations)}</span>
              </p>
              <svg
                className="scenario-deck__arrow"
                width="34"
                height="16"
                viewBox="0 0 34 16"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M1 8 H31 M24 2 L31 8 L24 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
              <p className="scenario-deck__side scenario-deck__side--scenario">
                <span className="scenario-deck__label">
                  {m.label} <HypotheticalBadge />
                </span>
                <span className="scenario-deck__share">{f.scenarioShare}</span>
                <span className="scenario-deck__sub">{m.stations(f.scenarioStations)}</span>
              </p>
            </div>
            <p className="scenario-deck__diff">
              <Delta figures={f} />
              <span>{m.gains(f.gained)}</span>
              <span>{m.loses(f.lost)}</span>
              <PendingNote pending={state.pending} />
            </p>
            <NoEffectNote state={state} />
            <p className="scenario-deck__of">{m.of(f.areaName, f.areaSize, f.radius)}</p>
            <ScopeNotes />
          </>
        )}
        <div className="scenario-deck__actions">
          <button
            type="button"
            className="ghost-button"
            disabled={!state.canUndo}
            onClick={state.undo}
          >
            {m.undo}
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!hasChanges(state.scenario)}
            onClick={state.reset}
          >
            {m.reset}
          </button>
        </div>
      </div>
    </section>
  );
}

/** Panel de «Experimentar»: qué se mide, los cambios hechos y los supuestos. */
export function ScenarioPanel({ state, stations }: ScenarioViewProps) {
  const m = t().scenario;
  const items = changeItems(state.scenario, stations, state);
  const reference = state.shown?.reference;
  return (
    <div className="scenario-panel">
      <h2 className="scenario-panel__title">{m.panelTitle}</h2>
      <p className="scenario-panel__lead">{m.panelLead}</p>
      {reference !== undefined && (
        <p className="scenario-panel__reference">
          {m.reference(formatDateTime(reference.at), reference.stations)}
        </p>
      )}
      <h3 className="scenario-panel__heading">
        {m.changes} <span className="scenario-panel__count">{items.length}</span>
      </h3>
      <ChangesList items={items} empty={m.empty} />
      {state.shown !== undefined && (
        <details className="scenario-panel__details">
          <summary>{m.assumptions}</summary>
          <Assumptions model={state.shown.model} />
        </details>
      )}
    </div>
  );
}
