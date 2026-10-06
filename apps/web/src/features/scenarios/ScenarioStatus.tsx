import type { ScenarioState } from './useScenario';

/** Primer cálculo, error o recálculo en curso. Con un resultado a la vista, no dice nada. */
export function ScenarioStatus({ state }: { state: ScenarioState }) {
  if (state.result.status === 'error') {
    return (
      <div className="scenario-status scenario-status--error" role="alert">
        <p>No se ha podido calcular la cobertura. {state.result.error.message}</p>
        <button type="button" className="button" onClick={state.retry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (state.shown === undefined) {
    return (
      <p className="scenario-status" role="status">
        Calculando la cobertura…
      </p>
    );
  }
  return null;
}

/** Aviso discreto mientras se recalcula: los números a la vista son del cambio anterior. */
export function PendingNote({ pending }: { pending: boolean }) {
  return (
    <span className="pending-note" role="status" aria-live="polite">
      {pending ? 'Recalculando…' : ''}
    </span>
  );
}
