import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CoverageRequest,
  CoverageResponse,
  FramesResponse,
  StationItem,
  StudyAreaItem,
  TimelinePoint,
  TimelineResponse,
} from '../api/client';
import {
  demoSource,
  frameStation,
  observedResponse,
  observedSource,
  stationFixture,
  stationsResponse,
} from '../test/fixtures';
import { setLang } from '../i18n';
import { LanguageRoot } from '../i18n/LanguageRoot';
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

function mockApi(handler: (path: string, url: URL) => Response) {
  requests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url);
      requests.push(url);
      return Promise.resolve(handler(url.pathname, url));
    }),
  );
}

/** Línea temporal de la demo: 3 estaciones con dato de 07:00 a 10:30 (hora de Barcelona). */
function timelineFor(url: URL): TimelineResponse {
  const from = Date.parse(url.searchParams.get('from') ?? '');
  const to = Date.parse(url.searchParams.get('to') ?? '');
  const step = Number(url.searchParams.get('step')) * 60_000;
  const points: TimelinePoint[] = [];
  for (let t = from; t <= to; t += step) {
    const withData =
      t >= Date.parse('2026-03-10T06:00:00Z') && t <= Date.parse('2026-03-10T09:30:00Z');
    points.push({
      at: new Date(t).toISOString().replace('.000Z', '+00:00'),
      stationsKnown: 3,
      stationsWithData: withData ? 3 : 0,
      stationsCounted: withData ? 2 : 0,
      stationsEmpty: withData ? 1 : 0,
      stationsFull: 0,
      bikesAvailable: withData ? 20 : null,
      docksAvailable: withData ? 30 : null,
    });
  }
  return {
    source: stationsResponse([]).source,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    stepMinutes: step / 60_000,
    toleranceMinutes: 30,
    points,
  };
}

const iso = (t: number) => new Date(t).toISOString().replace('.000Z', '+00:00');

/** Fotogramas de una hora: Pl. de Catalunya tiene tantas bicis como el minuto del paso. */
function framesFor(url: URL): FramesResponse {
  const from = Date.parse(url.searchParams.get('from') ?? '');
  return {
    source: stationsResponse([]).source,
    from: iso(from),
    stepMinutes: 5,
    toleranceMinutes: 30,
    truncated: false,
    stations: stations.map((s) => frameStation(s)),
    frames: Array.from({ length: 12 }, (_, k) => {
      const at = from + k * 300_000;
      return {
        at: iso(at),
        states: stations.map((s, i) => ({
          station: i,
          state: i === 0 ? { ...s.state, bikesAvailable: new Date(at).getUTCMinutes() } : s.state,
        })),
      };
    }),
  };
}

const barcelona: StudyAreaItem = {
  id: 'barcelona',
  name: 'Barcelona',
  kind: 'municipality',
  areaSquareMeters: 100_000_000,
  source: 'prueba',
  attribution: 'prueba',
  license: null,
  note: null,
};

/**
 * Cobertura de prueba: la red base cubre la mitad del área y cada estación quitada resta
 * 100 000 m². Devuelve el escenario tal cual se pidió, como la API.
 */
function coverageFor(body: CoverageRequest): CoverageResponse {
  const removed = body.removed ?? [];
  const lost = removed.length * 100_000;
  const base = 50_000_000;
  return {
    model: { name: 'cobertura-geometrica', version: 1, assumptions: ['No es una isócrona.'] },
    reference: {
      source: stationsResponse([]).source,
      at: '2026-03-10T09:00:00+00:00',
      atBasis: 'now',
      stations: stations.length,
    },
    studyArea: barcelona,
    radiusMeters: body.radiusMeters,
    added: body.added ?? [],
    moved: body.moved ?? [],
    removed,
    base: { stations: stations.length, coveredSquareMeters: base, coveredShare: 0.5 },
    scenario: {
      stations: stations.length - removed.length,
      coveredSquareMeters: base - lost,
      coveredShare: (base - lost) / barcelona.areaSquareMeters,
    },
    difference: { gainedSquareMeters: 0, lostSquareMeters: lost },
    geometries: {
      studyArea: null,
      base: null,
      scenario: null,
      gained: null,
      lost: null,
      reach: [],
    },
  };
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
  setLang('es');
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
    // El periodo importado, con el mes y el año, y que no es el estado actual.
    expect(
      screen.getByText(/Datos históricos · agosto de 2026\. No es el estado actual\./),
    ).toBeTruthy();
    expect(document.querySelector('.source-notice__time')?.textContent).toMatch(
      /20 de agosto de 2026.*23:55/,
    );
    const stationsRequest = requests.find((u) => u.pathname === '/api/stations');
    expect(stationsRequest?.searchParams.get('source')).toBe('bicing-bcn');
    expect(stationsRequest?.searchParams.get('at')).toBe('2026-08-20T21:55:02+00:00');

    expect(screen.getByText('el Fort Pienc, Eixample')).toBeTruthy();
    expect(screen.getByText(/no permite coger bicis/)).toBeTruthy();
  });

  it('«Qué muestra y qué no» explica los límites y lleva a las estaciones sin dato', async () => {
    const real = [
      stationFixture({
        id: 21,
        sourceStationId: '1',
        name: 'GRAN VIA CORTS CATALANES, 760',
        state: { lastObservedAt: '2026-08-20T21:54:08+00:00' },
      }),
      stationFixture({
        id: 22,
        sourceStationId: '264',
        name: 'C/ FERRAN JUNOY, 10',
        state: {
          freshness: 'stale',
          status: 'unknown',
          lastObservedAt: '2026-08-17T10:00:00+00:00',
          bikesAvailable: null,
          docksAvailable: null,
        },
      }),
      stationFixture({
        id: 23,
        sourceStationId: '542',
        name: 'Copa América Barcelona - 542',
        state: {
          freshness: 'none',
          status: 'unknown',
          lastObservedAt: null,
          bikesAvailable: null,
          docksAvailable: null,
        },
      }),
    ];
    mockApi((path, url) => {
      if (path === '/api/sources') return json([observedSource]);
      if (path === '/api/stations') return json(observedResponse(real));
      if (path === '/api/sources/bicing-bcn/timeline') return json(timelineFor(url));
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: 'Qué muestra y qué no' }));
    const sheet = screen.getByRole('article');
    expect(document.activeElement).toBe(
      within(sheet).getByRole('heading', { name: 'Qué muestra y qué no' }),
    );
    expect(new URLSearchParams(window.location.search).get('vista')).toBe('limites');
    expect(
      within(sheet).getByText(/Cómo estaban las 3 estaciones de Bicing el 20 de agosto de 2026/),
    ).toBeTruthy();
    // Los huecos se miden con una petición por semana importada, cada 15 minutos.
    expect(await within(sheet).findByText(/pasos por debajo del 95/)).toBeTruthy();
    const weeks = requests.filter((u) => u.pathname.endsWith('/timeline'));
    expect(weeks.map((u) => u.searchParams.get('step'))).toEqual(['15']);
    expect(
      within(sheet).getByRole('button', { name: /^jueves, 20 de agosto de 2026/ }),
    ).toBeTruthy();

    // Las que no tienen dato, con el motivo, de la que más tiempo lleva callada a la que menos.
    expect(within(sheet).getByText(/2 de 3 estaciones sin dato/)).toBeTruthy();
    expect(
      within(sheet).getByRole('heading', { level: 4, name: /^Ningún dato hasta este momento/ }),
    ).toBeTruthy();
    const silent = Array.from(sheet.querySelectorAll('button.silent-group__item'));
    // Con el nombre escrito para leerse: la fuente lo publica en mayúsculas.
    expect(silent.map((b) => b.textContent)).toEqual([
      'Copa América Barcelona - 542',
      'C/ Ferran Junoy, 10Sin datos desde el 17 de agosto',
    ]);

    // Volver deja el foco en el enlace que la abrió.
    await user.click(within(sheet).getByRole('button', { name: 'Volver' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Qué muestra y qué no' }),
    );
    expect(new URLSearchParams(window.location.search).get('vista')).toBeNull();

    // Una estación de la ficha abre su detalle, con la explicación de por qué no hay dato.
    await user.click(screen.getByRole('button', { name: 'Qué muestra y qué no' }));
    await user.click(screen.getByRole('button', { name: /^C\/ Ferran Junoy, 10/ }));
    const detail = screen.getByRole('article');
    expect(within(detail).getByRole('heading', { name: 'C/ Ferran Junoy, 10' })).toBeTruthy();
    // Con la fecha, porque no es del mismo día: «del 17 de agosto», no «de las 12:00».
    expect(detail.textContent).toMatch(
      /La última observación es del 17 de agosto de 2026.*12:00, 3 días antes del momento mostrado/,
    );
    expect(detail.textContent).toMatch(/el estado se da por desconocido/);
    expect(new URLSearchParams(window.location.search).get('estacion')).toBe('264');
    expect(
      screen
        .getByRole('button', { name: 'Marcador C/ FERRAN JUNOY, 10' })
        .getAttribute('data-selected'),
    ).toBe('true');

    // En la lista, desde cuándo, con la fecha si no es del mismo día; y las que nunca informaron.
    await user.click(screen.getByRole('button', { name: 'Volver a la lista' }));
    expect(screen.getByRole('button', { name: /^C\/ Ferran Junoy, 10/ }).textContent).toContain(
      'Sin dato reciente desde el 17 de agosto',
    );
    expect(
      screen.getByRole('button', { name: /^Copa América Barcelona - 542/ }).textContent,
    ).toContain('Ningún dato hasta este momento');

    // Abierta dos veces, los huecos se han pedido una sola: cuentan para el límite de la API.
    await user.click(screen.getByRole('button', { name: 'Qué muestra y qué no' }));
    expect(await screen.findByText(/pasos por debajo del 95/)).toBeTruthy();
    expect(requests.filter((u) => u.pathname.endsWith('/timeline'))).toHaveLength(1);
  });

  it('la fuente se puede fijar por la URL', async () => {
    mockApi((path) =>
      json(path === '/api/sources' ? [demoSource, observedSource] : stationsResponse(stations)),
    );
    window.history.replaceState(null, '', '/?fuente=demo');
    renderApp();

    expect(await screen.findByText(/Datos inventados para probar/)).toBeTruthy();
    const stationsRequest = requests.find((u) => u.pathname === '/api/stations');
    expect(stationsRequest?.searchParams.get('source')).toBe('demo');
    expect(stationsRequest?.searchParams.has('at')).toBe(false);
  });

  it('al reproducir, el reloj, los recuentos y el mapa van al mismo instante', async () => {
    mockApi((path, url) => {
      if (path === '/api/sources') return json([demoSource]);
      if (path === '/api/sources/demo/timeline') return json(timelineFor(url));
      if (path === '/api/sources/demo/frames') return json(framesFor(url));
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?fuente=demo&modo=reproducir&hora=08:30');
    renderApp();

    const slider = await screen.findByRole('slider', { name: 'Momento del día' });
    await waitFor(() => {
      expect(slider.getAttribute('aria-valuetext')).toBe(
        '08:30, martes, 10 de marzo de 2026. 1 sin bicis, 0 llenas, 3 de 3 con dato.',
      );
    });
    // Las 08:30 en Barcelona son las 07:30 UTC: el paso de minuto 30 de esa hora.
    const catalunya = () => screen.getByRole('button', { name: /^Pl\. de Catalunya/ });
    await waitFor(() => {
      expect(within(catalunya()).getByText('30')).toBeTruthy();
    });

    await user.click(screen.getByRole('button', { name: '5 minutos después' }));
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^08:35,/);
    expect(within(catalunya()).getByText('35')).toBeTruthy();

    // Bajo la pista, a qué horas faltan datos; «con dato» explica quién cuenta.
    expect(
      screen.getByText(
        /^Menos del 95\s% de las estaciones con dato de 00:00 a 06:55 y de 10:35 a 23:55\.$/,
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '3 de 3 con dato' }));
    expect(screen.getByRole('note').textContent).toBe(
      'Las que informaron en los 30 minutos anteriores. Las demás no cuentan como vacías ni como llenas.',
    );

    // Una petición por hora (la actual y la siguiente, por adelantado), ninguna por paso.
    const framesFrom = requests
      .filter((u) => u.pathname === '/api/sources/demo/frames')
      .map((u) => u.searchParams.get('from'));
    expect(framesFrom).toEqual(['2026-03-10T07:00:00.000Z', '2026-03-10T08:00:00.000Z']);
    expect(requests.some((u) => u.pathname === '/api/stations')).toBe(false);

    // La semana entera del día: los días sin datos importados se ven, pero no se eligen.
    expect(screen.getByRole('button', { name: 'mar 10' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'lun 9, sin datos' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('button', { name: 'Semana anterior' })).toBeNull();

    // Antes de los datos no hay ceros: el momento dice que no hay datos.
    slider.focus();
    await user.keyboard('{Home}');
    expect(slider.getAttribute('aria-valuetext')).toBe(
      '00:00, martes, 10 de marzo de 2026. Sin datos.',
    );
    expect(screen.getByText(/Sin datos en este momento/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('hora')).toBe('00:00');
  });

  it('al saltar a una hora que no ha llegado no enseña la de antes; si falla, lo dice y reintenta', async () => {
    const far = '2026-03-10T22:00:00.000Z';
    let farAttempts = 0;
    let answerFar: (response: Response) => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: Request) => {
        const url = new URL(input.url);
        if (url.pathname === '/api/sources') return Promise.resolve(json([demoSource]));
        if (url.pathname === '/api/sources/demo/timeline')
          return Promise.resolve(json(timelineFor(url)));
        if (url.pathname === '/api/sources/demo/frames') {
          if (url.searchParams.get('from') !== far) return Promise.resolve(json(framesFor(url)));
          farAttempts += 1;
          if (farAttempts > 1) return Promise.resolve(json(framesFor(url)));
          return new Promise<Response>((resolve) => {
            answerFar = resolve;
          });
        }
        return Promise.resolve(json({ title: 'Petición inesperada' }, 500));
      }),
    );
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?fuente=demo&modo=reproducir&hora=08:30');
    renderApp();

    const slider = await screen.findByRole('slider', { name: 'Momento del día' });
    await waitFor(() => {
      expect(
        within(screen.getByRole('button', { name: /^Pl\. de Catalunya/ })).getByText('30'),
      ).toBeTruthy();
    });

    // A las 23:55 (las 22:55 UTC): mientras llega esa hora no se ven las 08:55 con otra hora.
    slider.focus();
    await user.keyboard('{End}');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^23:55,/);
    await waitFor(() => {
      expect(screen.getByText('Cargando el estado de las estaciones…')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: /Pl\. de Catalunya/ })).toBeNull();

    // Si falla, el mapa sigue vacío y lo dice con un «Reintentar» a mano.
    await waitFor(() => {
      expect(farAttempts).toBe(1);
    });
    answerFar(json({ title: 'Error' }, 500));
    const failed = (
      await screen.findByText('No se ha podido cargar el estado de las estaciones en este momento.')
    ).closest('[role="alert"]');
    expect(failed).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Pl\. de Catalunya/ })).toBeNull();

    await user.click(within(failed as HTMLElement).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => {
      expect(
        within(screen.getByRole('button', { name: /^Pl\. de Catalunya/ })).getByText('55'),
      ).toBeTruthy();
    });
    expect(farAttempts).toBe(2);
  });

  it('con días importados en dos semanas, se pasa de una a otra con las flechas', async () => {
    const twoWeeks = { ...observedSource, days: ['2026-08-21', '2026-08-24'] };
    mockApi((path, url) => {
      if (path === '/api/sources') return json([twoWeeks]);
      if (path.endsWith('/timeline')) return json(timelineFor(url));
      if (path.endsWith('/frames')) return json(framesFor(url));
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?modo=reproducir');
    renderApp();

    // Por defecto, el último día importado: el lunes 24, en la semana del 24 al 30.
    const monday = await screen.findByRole('button', { name: 'lun 24' });
    expect(monday.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toHaveProperty(
      'disabled',
      true,
    );

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(
      (await screen.findByRole('button', { name: 'vie 21' })).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(new URLSearchParams(window.location.search).get('dia')).toBe('2026-08-21');
    expect(screen.getByRole('button', { name: 'jue 20, sin datos' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('al experimentar, quitar una estación tocándola cambia el escenario y lo que se calcula', async () => {
    const bodies: CoverageRequest[] = [];
    requests.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        const url = new URL(input.url);
        requests.push(url);
        if (url.pathname === '/api/sources') return json([demoSource]);
        if (url.pathname === '/api/stations') return json(stationsResponse(stations));
        if (url.pathname === '/api/study-areas') return json([barcelona]);
        if (url.pathname === '/api/scenarios/coverage') {
          const body = (await input.json()) as CoverageRequest;
          bodies.push(body);
          return json(coverageFor(body));
        }
        return json({ title: 'Petición inesperada' }, 500);
      }),
    );
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?modo=experimentar');
    renderApp();

    // Sin cambios, la red real y el escenario coinciden y el escenario va marcado como hipotético.
    expect(await screen.findByText(/Todavía es la red real/)).toBeTruthy();
    const deck = screen.getByRole('region', { name: 'Escenario de cobertura' });
    await waitFor(() => {
      expect(within(deck).getAllByText('50,0 %')).toHaveLength(2);
    });
    expect(within(deck).getByText('Hipotético')).toBeTruthy();
    expect(within(deck).getByText('sin cambio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Experimentar' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(bodies[0]).toMatchObject({ source: 'demo', studyArea: 'barcelona', radiusMeters: 300 });

    // Junto al resultado, qué mide y qué no: cada nota se abre debajo.
    await user.click(within(deck).getByRole('button', { name: 'En línea recta' }));
    expect(within(deck).getByRole('note').textContent).toMatch(/no es una isócrona/);
    await user.click(within(deck).getByRole('button', { name: 'No mide viajes' }));
    expect(within(deck).getByRole('note').textContent).toMatch(/viajes, esperas o demanda/);

    // Con «Quitar», tocar una estación la saca del mapa y del cálculo.
    await user.click(within(deck).getByRole('button', { name: 'Quitar' }));
    await user.click(screen.getByRole('button', { name: 'Marcador Pl. de Catalunya' }));
    expect(screen.queryByRole('button', { name: 'Marcador Pl. de Catalunya' })).toBeNull();
    expect(screen.getByText('quitada')).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('quitadas')).toBe('11');
    await waitFor(() => {
      expect(bodies.at(-1)?.removed).toEqual([11]);
    });
    expect(await within(deck).findByText('49,9 %')).toBeTruthy();
    expect(within(deck).getByText('pierde 0,10 km²')).toBeTruthy();

    // Recuperarla la devuelve al mapa y a la red.
    await user.click(screen.getByRole('button', { name: 'Recuperar: Pl. de Catalunya' }));
    expect(screen.getByRole('button', { name: 'Marcador Pl. de Catalunya' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('quitadas')).toBeNull();
  });

  it('sin fuentes cargadas indica cómo importar la demo', async () => {
    mockApi(() => json([]));
    renderApp();

    expect(await screen.findByText('Todavía no hay datos cargados.')).toBeTruthy();
  });

  it('el selector de idioma cambia toda la interfaz y conserva lo que va en la URL', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    window.history.replaceState(null, '', '/?estacion=demo-024');
    const user = userEvent.setup();
    render(<LanguageRoot>{(lang) => <App key={lang} />}</LanguageRoot>);
    // La hora va en un <time> dentro de la frase: se comprueba el texto completo del detalle.
    expect((await screen.findByRole('article')).textContent).toMatch(
      /La última observación es de las 07:45/,
    );

    await user.click(screen.getByRole('button', { name: 'Català' }));

    // La estación abierta sigue abierta, ahora en catalán.
    expect(await screen.findByText(/Dades inventades per provar l’aplicació/)).toBeTruthy();
    expect((await screen.findByRole('article')).textContent).toMatch(
      /L’última observació és de les 07:45, 2 h 15 min abans/,
    );
    expect(new URLSearchParams(window.location.search).get('idioma')).toBe('ca');
    expect(new URLSearchParams(window.location.search).get('estacion')).toBe('demo-024');
    expect(document.documentElement.lang).toBe('ca');
    const catala = screen.getByRole('button', { name: 'Català' });
    expect(catala.getAttribute('aria-pressed')).toBe('true');
    // El foco no se pierde al volver a montar: queda en el idioma elegido.
    expect(document.activeElement).toBe(catala);

    await user.click(screen.getByRole('button', { name: 'Tornar a la llista' }));
    await user.click(screen.getByRole('button', { name: 'English' }));

    expect(await screen.findByText(/Made-up data for trying out the app/)).toBeTruthy();
    expect(screen.getByText('3 stations')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^No recent data/ })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('idioma')).toBe('en');
  });
});
