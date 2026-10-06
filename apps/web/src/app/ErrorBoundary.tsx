import { Component, type ReactNode } from 'react';
import { t } from '../i18n';

/**
 * Si algo falla al pintar, la página no se queda en blanco: lo dice y deja recargar. Lo que va
 * en la URL (modo, día, hora, estación, escenario) se conserva al recargar.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const m = t().app;
    return (
      <main className="app-crash" role="alert">
        <p>{m.crashed}</p>
        <button
          type="button"
          className="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {m.reload}
        </button>
      </main>
    );
  }
}
