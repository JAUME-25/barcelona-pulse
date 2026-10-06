import { useLayoutEffect, useRef } from 'react';
import type { StationItem, StudyAreaItem } from '../../api/client';
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

  return (
    <section ref={deckRef} className="scenario-deck" aria-label="Escenario de cobertura">
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
                <span className="scenario-deck__label">Red real</span>
                <span className="scenario-deck__share">{f.baseShare}</span>
                <span className="scenario-deck__sub">{f.baseStations} estaciones</span>
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
                  Escenario <HypotheticalBadge />
                </span>
                <span className="scenario-deck__share">{f.scenarioShare}</span>
                <span className="scenario-deck__sub">{f.scenarioStations} estaciones</span>
              </p>
            </div>
            <p className="scenario-deck__diff">
              <Delta figures={f} />
              <span>gana {f.gained}</span>
              <span>pierde {f.lost}</span>
              <PendingNote pending={state.pending} />
            </p>
            <NoEffectNote state={state} />
            <p className="scenario-deck__of">
              Del área de {f.areaName} ({f.areaSize}) a menos de {f.radius} m en línea recta.
            </p>
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
            Deshacer
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={!hasChanges(state.scenario)}
            onClick={state.reset}
          >
            Volver a la red real
          </button>
        </div>
      </div>
    </section>
  );
}

/** Panel de «Experimentar»: qué se mide, los cambios hechos y los supuestos. */
export function ScenarioPanel({ state, stations }: ScenarioViewProps) {
  const items = changeItems(state.scenario, stations, state);
  const reference = state.shown?.reference;
  return (
    <div className="scenario-panel">
      <h2 className="scenario-panel__title">Escenario de cobertura</h2>
      <p className="scenario-panel__lead">
        Qué parte de la ciudad queda cerca de una estación, en línea recta. Cambia la red sobre el
        mapa y compara. Mide geometría: no dice cuántos viajes habría.
      </p>
      {reference !== undefined && (
        <p className="scenario-panel__reference">
          Red real del {formatDateTime(reference.at)}: {reference.stations} estaciones.
        </p>
      )}
      <h3 className="scenario-panel__heading">
        Cambios <span className="scenario-panel__count">{items.length}</span>
      </h3>
      <ChangesList
        items={items}
        empty="Todavía es la red real. Elige Añadir, Mover o Quitar y toca el mapa."
      />
      {state.shown !== undefined && (
        <details className="scenario-panel__details">
          <summary>Supuestos del cálculo</summary>
          <Assumptions model={state.shown.model} />
        </details>
      )}
    </div>
  );
}
