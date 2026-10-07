import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapBoundary } from './MapBoundary';

function Broken(): never {
  throw new Error('No se ha podido descargar el fragmento del mapa');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapBoundary', () => {
  it('si el mapa falla al pintarse, solo falta el mapa y lo avisa', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    render(
      <>
        <MapBoundary onError={onError}>
          <Broken />
        </MapBoundary>
        <p>Lista de estaciones</p>
      </>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(screen.getByText('Lista de estaciones')).toBeTruthy();
  });
});
