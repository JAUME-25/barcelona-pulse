import { Component, type ReactNode } from 'react';

/**
 * Si el mapa no llega a pintarse (p. ej., no se descarga su fragmento), solo falta el mapa: la
 * lista y el resto de la página siguen, y el aviso del mapa lo dice.
 */
export class MapBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    if (this.state.failed) return <div className="station-map" aria-hidden="true" />;
    return this.props.children;
  }
}
