import { t } from '../../i18n';
import type { ScenarioState } from './useScenario';

/** Primer cálculo, error o recálculo en curso. Con un resultado a la vista, no dice nada. */
export function ScenarioStatus({ state }: { state: ScenarioState }) {
  const m = t().scenario;
  if (state.result.status === 'error') {
    return (
      <div className="scenario-status scenario-status--error" role="alert">
        <p>
          {m.error} {state.result.error.message}
        </p>
        <button type="button" className="button" onClick={state.retry}>
          {t().app.retry}
        </button>
      </div>
    );
  }
  if (state.shown === undefined) {
    return (
      <p className="scenario-status" role="status">
        {m.calculating}
      </p>
    );
  }
  return null;
}

/** Aviso discreto mientras se recalcula: los números a la vista son del cambio anterior. */
export function PendingNote({ pending }: { pending: boolean }) {
  return (
    <span className="pending-note" role="status" aria-live="polite">
      {pending ? t().scenario.recalculating : ''}
    </span>
  );
}
