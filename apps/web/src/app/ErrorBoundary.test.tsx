import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('Fallo de prueba al pintar');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('si algo falla al pintar, lo dice y deja recargar en vez de dejar la página en blanco', () => {
    // React avisa del error en la consola: aquí es lo esperado.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain(
      'Algo ha fallado al pintar la aplicación.',
    );
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
  });

  it('sin fallos, pinta lo de dentro', () => {
    render(
      <ErrorBoundary>
        <p>Todo bien</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Todo bien')).toBeTruthy();
  });
});
