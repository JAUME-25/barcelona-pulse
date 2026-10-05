import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StationItem } from '../api/client';
import {
  demoSource,
  observedResponse,
  observedSource,
  stationFixture,
  stationsResponse,
} from '../test/fixtures';
import { App } from './App';

// MapLibre necesita WebGL: en jsdom se sustituye por un mapa mínimo que expone sus
// marcadores como botones, para comprobar que mapa y lista seleccionan lo mismo.
vi.mock('../features/stations/StationMap', () => ({
  StationMap: function FakeMap(props: {
    stations: readonly StationItem[];
    selectedId: number | null;
    onSelect: (id: number) => void;
    onStatusChange: (s: { kind: 'ready' }) => void;
  }) {
    const { onStatusChange } = props;
    useEffect(() => {
      onStatusChange({ kind: 'ready' });
    }, [onStatusChange]);
    return (
      <div role="region" aria-label="Mapa de estaciones">
        {props.stations.map((s) => (
          <button
            key={s.id}
            type="button"
            data-marker={s.id}
            data-selected={props.selectedId === s.id}
            onClick={() => {
              props.onSelect(s.id);
            }}
          >
            Marcador {s.name}
          </button>
        ))}
      </div>
    );
  },
}));

const stations = [
  stationFixture({ id: 11, sourceStationId: 'demo-001', name: 'Pl. de Catalunya' }),
  stationFixture({
    id: 12,
    sourceStationId: 'demo-024',
    name: 'Pl. de Lesseps',
    state: {
      freshness: 'stale',
      status: 'unknown',
      lastObservedAt: '2026-03-10T06:45:00+00:00',
      bikesAvailable: null,
      mechanicalBikesAvailable: null,
      ebikesAvailable: null,
      docksAvailable: null,
      bikesDisabled: null,
      docksDisabled: null,
    },
  }),
  stationFixture({
    id: 13,
    sourceStationId: 'demo-013',
    name: 'Pl. de la Barceloneta',
    state: { status: 'closed', bikesAvailable: 0, docksAvailable: 0, docksDisabled: 27 },
  }),
];

const requests: URL[] = [];

function mockApi(handler: (path: string) => Response) {
  requests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url);
      requests.push(url);
      return Promise.resolve(handler(url.pathname));
    }),
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function renderApp() {
  return render(<App />);
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('muestra la procedencia demo, la leyenda y la lista', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    renderApp();

    expect(await screen.findByText(/Datos inventados para probar la aplicación/)).toBeTruthy();
    // La hora va en su propio <time>: se comprueba el texto completo del elemento.
    expect(document.querySelector('.source-notice__time')?.textContent).toMatch(
      /10 de marzo de 2026.*10:00/,
    );
    expect(screen.getByText('3 estaciones')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sin dato reciente/ })).toBeTruthy();
  });

  it('seleccionar en el mapa abre el mismo detalle que la lista y lo marca en el mapa', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Marcador Pl. de Lesseps' }));

    const detail = screen.getByRole('article');
    expect(within(detail).getByRole('heading', { name: 'Pl. de Lesseps' })).toBeTruthy();
    // La hora va en un <time> dentro de la frase: se comprueba el texto completo.
    expect(detail.textContent).toMatch(/La última observación es de las 07:45, 2 h 15 min antes/);
    expect(within(detail).queryByText('Bicis disponibles')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('estacion')).toBe('demo-024');
    expect(
      screen.getByRole('button', { name: 'Marcador Pl. de Lesseps' }).getAttribute('data-selected'),
    ).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Volver a la lista' }));
    await user.click(screen.getByRole('button', { name: /^Pl\. de Lesseps/ }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pl. de Lesseps' })).toBeTruthy();
  });

  it('la búsqueda y la leyenda siguen a mano con el detalle abierto', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?estacion=demo-013');
    renderApp();

    await screen.findByRole('heading', { level: 2, name: 'Pl. de la Barceloneta' });
    expect(screen.getByRole('button', { name: /^Llena/ })).toBeTruthy();

    const search = screen.getByLabelText('Buscar estación');
    await user.type(search, 'lesseps');

    // Escribir cierra el detalle, muestra resultados y deja el foco en la búsqueda.
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByText('1 de 3 estaciones')).toBeTruthy();
    expect(document.activeElement).toBe(search);
    expect(new URLSearchParams(window.location.search).get('estacion')).toBeNull();
  });

  it('una estación cerrada se explica como no operativa, no como vacía', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    window.history.replaceState(null, '', '/?estacion=demo-013');
    renderApp();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pl. de la Barceloneta' }),
    ).toBeTruthy();
    expect(screen.getByText('Fuera de servicio (cerrada)')).toBeTruthy();
    expect(screen.getByText(/La estación no está operativa/)).toBeTruthy();
  });

  it('si la API falla lo dice y permite reintentar', async () => {
    let fail = true;
    mockApi((path) => {
      if (path === '/api/sources') return json([demoSource]);
      if (fail) return json({ title: 'Error', detail: 'Base de datos no disponible.' }, 503);
      return json(stationsResponse(stations));
    });
    const user = userEvent.setup();
    renderApp();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Base de datos no disponible/)).toBeTruthy();

    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(screen.getByText('3 estaciones')).toBeTruthy();
    });
  });

  it('el histórico real se muestra en su último momento y avisa de que no es el estado actual', async () => {
    const real = [
      stationFixture({
        id: 21,
        sourceStationId: '1',
        name: 'GRAN VIA CORTS CATALANES, 760',
        district: 'Eixample',
        neighbourhood: 'el Fort Pienc',
        state: { lastObservedAt: '2026-08-20T21:54:08+00:00', isRenting: false },
      }),
    ];
    mockApi((path) =>
      json(path === '/api/sources' ? [demoSource, observedSource] : observedResponse(real)),
    );
    window.history.replaceState(null, '', '/?estacion=1');
    renderApp();

    expect(await screen.findByText('Datos reales')).toBeTruthy();
    expect(screen.getByText(/Es un momento del pasado, no el estado actual./)).toBeTruthy();
    expect(document.querySelector('.source-notice__time')?.textContent).toMatch(
      /20 de agosto de 2026.*23:55/,
    );
    const stationsRequest = requests.find((u) => u.pathname === '/api/stations');
    expect(stationsRequest?.searchParams.get('source')).toBe('bicing-bcn');
    expect(stationsRequest?.searchParams.get('at')).toBe('2026-08-20T21:55:02+00:00');

    expect(screen.getByText('el Fort Pienc, Eixample')).toBeTruthy();
    expect(screen.getByText(/no permite coger bicis/)).toBeTruthy();
  });

  it('la fuente se puede fijar por la URL', async () => {
    mockApi((path) =>
      json(path === '/api/sources' ? [demoSource, observedSource] : stationsResponse(stations)),
    );
    window.history.replaceState(null, '', '/?fuente=demo');
    renderApp();

    expect(await screen.findByText(/Datos inventados/)).toBeTruthy();
    const stationsRequest = requests.find((u) => u.pathname === '/api/stations');
    expect(stationsRequest?.searchParams.get('source')).toBe('demo');
    expect(stationsRequest?.searchParams.has('at')).toBe(false);
  });

  it('sin fuentes cargadas indica cómo importar la demo', async () => {
    mockApi(() => json([]));
    renderApp();

    expect(await screen.findByText('Todavía no hay datos cargados.')).toBeTruthy();
  });
});
