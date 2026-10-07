import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CoverageRequest,
  CoverageResponse,
  FramesResponse,
  IngestionsResponse,
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
    label?: 'bikes' | 'ebikes';
    onSelect: (id: number) => void;
    onStatusChange: (s: { kind: 'ready' }) => void;
  }) {
    const { onStatusChange } = props;
    useEffect(() => {
      onStatusChange({ kind: 'ready' });
    }, [onStatusChange]);
    return (
      <div role="region" aria-label="Mapa de estaciones" data-label={props.label ?? 'bikes'}>
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

/** «Cómo suele estar» de una estación, sin días importados: la ficha lo dice y nada más. */
function emptyPattern(url: URL): Response {
  const id = Number(url.pathname.split('/')[3]);
  return json({
    source: stationsResponse([]).source,
    stationId: id,
    sourceStationId: `demo-${String(id)}`,
    stepMinutes: 15,
    toleranceMinutes: 30,
    fewBikesMax: 3,
    weekdays: [],
    weekendDays: [],
    hours: [],
  });
}

function mockApi(
  handler: (path: string, url: URL) => Response,
  pattern: (url: URL) => Response = emptyPattern,
) {
  requests.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Request) => {
      const url = new URL(input.url);
      requests.push(url);
      if (url.pathname.endsWith('/pattern')) return Promise.resolve(pattern(url));
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
      stationsCountedEbikes: withData ? 2 : 0,
      ebikesAvailable: withData ? 8 : null,
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

/** El 20 de agosto importado dos veces: la primera con todo nuevo y la segunda con todo repetido. */
function ingestionsFor(): IngestionsResponse {
  const base = {
    startedAt: '2026-10-05T20:00:00+00:00',
    finishedAt: '2026-10-05T20:00:30+00:00',
    coveredFrom: '2026-08-19T22:00:00+00:00',
    coveredTo: '2026-08-20T22:00:00+00:00',
    days: ['2026-08-20'],
    purgedAt: null,
    stationsReceived: 549,
    stationsRejected: 0,
    stationVersionsCreated: 549,
    observationsReceived: 155_364,
  };
  return {
    source: stationsResponse([]).source,
    ingestions: [
      {
        ...base,
        id: 1,
        status: 'succeeded_with_issues',
        observationsAccepted: 154_389,
        observationsDuplicate: 773,
        observationsConflicting: 202,
        observationsRejected: 2,
        rejections: [{ recordKind: 'observation', reason: 'negative_count', count: 2 }],
      },
      {
        ...base,
        id: 2,
        status: 'succeeded',
        observationsAccepted: 0,
        observationsDuplicate: 154_389,
        observationsConflicting: 0,
        observationsRejected: 0,
        rejections: [],
      },
    ],
  };
}

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

  it('la ficha dice cómo suele estar a cada hora, sin llamarlo previsión', async () => {
    mockApi(
      (path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)),
      (url) =>
        json({
          source: stationsResponse([]).source,
          stationId: Number(url.pathname.split('/')[3]),
          sourceStationId: 'demo-001',
          stepMinutes: 15,
          toleranceMinutes: 30,
          fewBikesMax: 3,
          weekdays: ['2026-03-10'],
          weekendDays: [],
          // Sin dato de 0 a 6; de 8 a 9, vacía 3 de 4 veces.
          hours: Array.from({ length: 24 }, (_, hour) => ({
            dayType: 'weekday',
            hour,
            steps: 4,
            unknown: hour < 6 ? 4 : 0,
            outOfService: 0,
            empty: hour === 8 ? 3 : 0,
            few: hour === 8 ? 1 : 0,
            available: hour < 6 || hour === 8 ? 0 : 4,
            full: 0,
            medianBikes: hour < 6 ? null : 8,
          })),
        }),
    );
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByRole('button', { name: /^Pl\. de Catalunya/ }));
    const section = await screen.findByRole('region', { name: 'Cómo suele estar' });
    expect(within(section).getByText(/Es lo que pasó, no una previsión/)).toBeTruthy();
    expect(within(section).getByRole('heading', { name: 'Laborables 1 día' })).toBeTruthy();
    expect(
      within(section).getByText(/^De 8 a 9 h estuvo sin bicis el 75\s%\sdel tiempo\./),
    ).toBeTruthy();
    expect(within(section).getByText(/Sin dato el 25\s%\sdel tiempo\.$/)).toBeTruthy();
    // La clave solo explica lo que sale en esta estación.
    expect(
      within(within(section).getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Sin bicis', 'Pocas bicis', 'Con bicis', 'Sin dato', 'Hora que se ve en el mapa']);
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

  it('el histórico real abre en el último laborable a las 08:30 y avisa de que no es el estado actual', async () => {
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
    // Como la API, la respuesta lleva el instante pedido.
    mockApi((path, url) =>
      path === '/api/sources'
        ? json([demoSource, observedSource])
        : json({ ...observedResponse(real), at: url.searchParams.get('at') ?? '' }),
    );
    window.history.replaceState(null, '', '/?estacion=1');
    renderApp();

    expect(await screen.findByText('Datos reales')).toBeTruthy();
    // El periodo importado, con el mes y el año, y que no es el estado actual.
    expect(
      screen.getByText(/Datos históricos · agosto de 2026\. No es el estado actual\./),
    ).toBeTruthy();
    // No el domingo a las 23:55 con que acaba el periodo: un laborable (el 20-8-2026 es jueves) a
    // primera hora, con el día de la semana a la vista.
    expect(document.querySelector('.source-notice__time')?.textContent).toMatch(
      /jueves, 20 de agosto de 2026.*08:30/,
    );
    const stationsRequest = requests.find((u) => u.pathname === '/api/stations');
    expect(stationsRequest?.searchParams.get('source')).toBe('bicing-bcn');
    expect(stationsRequest?.searchParams.get('at')).toBe('2026-08-20T06:30:00.000Z');

    expect(screen.getByText('el Fort Pienc, Eixample')).toBeTruthy();
    expect(screen.getByText(/no permite coger bicis/)).toBeTruthy();
  });

  it('la lista se ordena por cifras, enseña el barrio, y la búsqueda encuentra por barrio e Intro abre la primera', async () => {
    const real = [
      stationFixture({
        id: 31,
        sourceStationId: '31',
        name: 'C/ GRAN DE GRÀCIA, 141',
        district: 'Gràcia',
        neighbourhood: 'la Vila de Gràcia',
        state: { bikesAvailable: 2, ebikesAvailable: 2, docksAvailable: 20 },
      }),
      stationFixture({
        id: 32,
        sourceStationId: '32',
        name: 'C/ PUJADES, 174',
        district: 'Sant Martí',
        neighbourhood: 'el Poblenou',
        state: { bikesAvailable: 15, ebikesAvailable: 1, docksAvailable: 5 },
      }),
      stationFixture({
        id: 33,
        sourceStationId: '33',
        name: 'C/ ARAGÓ, 288',
        district: 'Eixample',
        neighbourhood: "la Dreta de l'Eixample",
        state: { freshness: 'none', status: 'unknown', bikesAvailable: null, docksAvailable: null },
      }),
    ];
    mockApi((path) => json(path === '/api/sources' ? [observedSource] : observedResponse(real)));
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/');
    renderApp();

    const names = () =>
      [...document.querySelectorAll('.station-list__name')].map((n) => n.textContent);
    await screen.findByText('3 estaciones');
    expect(names()).toEqual(['C/ Aragó, 288', 'C/ Gran de Gràcia, 141', 'C/ Pujades, 174']);
    // El barrio junto al estado, para situar la estación.
    expect(screen.getByText('· el Poblenou')).toBeTruthy();

    // Por bicis, de más a menos; la que no tiene dato, al final.
    await user.selectOptions(screen.getByLabelText('Orden'), 'bikes');
    expect(names()).toEqual(['C/ Pujades, 174', 'C/ Gran de Gràcia, 141', 'C/ Aragó, 288']);
    await user.selectOptions(screen.getByLabelText('Orden'), 'ebikes');
    expect(names()).toEqual(['C/ Gran de Gràcia, 141', 'C/ Pujades, 174', 'C/ Aragó, 288']);

    // «poblenou» no está en ningún nombre: se encuentra por el barrio. Intro abre la primera.
    const search = screen.getByLabelText('Buscar estación');
    await user.type(search, 'poblenou');
    expect(screen.getByText('1 de 3 estaciones')).toBeTruthy();
    expect(names()).toEqual(['C/ Pujades, 174']);
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 2, name: 'C/ Pujades, 174' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('estacion')).toBe('32');
  });

  it('con «Eléctricas», el número del mapa y la cifra de la lista pasan a eléctricas', async () => {
    mockApi((path) => json(path === '/api/sources' ? [demoSource] : stationsResponse(stations)));
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?fuente=demo');
    renderApp();

    const catalunya = () => screen.getByRole('button', { name: /^Pl\. de Catalunya/ });
    await screen.findByText('3 estaciones');
    // Por defecto, todas las bicis: 10 bicis y 15 anclajes libres.
    expect(within(catalunya()).getByText('bicis')).toBeTruthy();
    expect(within(catalunya()).getByText('10')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mapa de estaciones' }).dataset['label']).toBe(
      'bikes',
    );

    await user.click(screen.getByRole('button', { name: 'Eléctricas' }));
    expect(within(catalunya()).getByText('eléc.')).toBeTruthy();
    expect(within(catalunya()).getByText('4')).toBeTruthy();
    expect(within(catalunya()).getByText('15')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Mapa de estaciones' }).dataset['label']).toBe(
      'ebikes',
    );
    expect(screen.getByText(/Las que no tienen ninguna se atenúan/)).toBeTruthy();
    // Las categorías no cambian: la leyenda sigue contando con bicis sobre el total.
    expect(screen.getByRole('button', { name: /^Con bicis/ }).textContent).toContain('1');

    await user.click(screen.getByRole('button', { name: 'Bicis' }));
    expect(within(catalunya()).getByText('bicis')).toBeTruthy();
  });

  it('«Cambiar momento» lleva a Reproducir en ese momento y, al volver, se queda el elegido', async () => {
    mockApi((path, url) => {
      if (path === '/api/sources') return json([observedSource]);
      if (path === '/api/stations') {
        return json({ ...observedResponse(stations), at: url.searchParams.get('at') ?? '' });
      }
      if (path.endsWith('/timeline')) return json(timelineFor(url));
      if (path.endsWith('/frames')) return json(framesFor(url));
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/');
    renderApp();

    expect(await screen.findByText('Datos reales')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cambiar momento' }));

    // Reproducir, parado en el mismo momento y con el foco en la pista.
    const slider = await screen.findByRole('slider', { name: 'Momento del día' });
    await waitFor(() => {
      expect(slider.getAttribute('aria-valuetext')).toMatch(/^08:30, jueves, 20 de agosto de 2026/);
    });
    expect(document.activeElement).toBe(slider);
    expect(new URLSearchParams(window.location.search).get('modo')).toBe('reproducir');

    await user.click(screen.getByRole('button', { name: '5 minutos después' }));
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^08:35,/);

    // De vuelta a Explorar: el momento elegido, en el aviso, en la petición y en la URL.
    await user.click(screen.getByRole('button', { name: 'Explorar' }));
    await waitFor(() => {
      expect(document.querySelector('.source-notice__time')?.textContent).toMatch(
        /jueves, 20 de agosto de 2026.*08:35/,
      );
    });
    const last = requests.filter((u) => u.pathname === '/api/stations').at(-1);
    expect(last?.searchParams.get('at')).toBe('2026-08-20T06:35:00.000Z');
    const params = new URLSearchParams(window.location.search);
    expect(params.get('modo')).toBeNull();
    expect(params.get('dia')).toBe('2026-08-20');
    expect(params.get('hora')).toBe('08:35');
  });

  it('la tabla por distrito resume el momento y su nombre filtra lista, mapa, recuento y leyenda', async () => {
    const real = [
      stationFixture({
        id: 31,
        sourceStationId: '1',
        name: 'GRAN VIA CORTS CATALANES, 760',
        district: 'Eixample',
        state: { lastObservedAt: '2026-08-20T21:54:08+00:00', bikesAvailable: 0 },
      }),
      stationFixture({
        id: 32,
        sourceStationId: '2',
        name: 'C/ ROGER DE FLOR, 126',
        district: 'Eixample',
        state: { lastObservedAt: '2026-08-20T21:54:08+00:00' },
      }),
      stationFixture({
        id: 33,
        sourceStationId: '3',
        name: 'PL. DE LA VILA DE GRACIA',
        district: 'Gràcia',
        state: {
          freshness: 'stale',
          status: 'unknown',
          lastObservedAt: '2026-08-17T10:00:00+00:00',
          bikesAvailable: null,
          docksAvailable: null,
        },
      }),
    ];
    mockApi((path) => json(path === '/api/sources' ? [observedSource] : observedResponse(real)));
    const user = userEvent.setup();
    renderApp();

    // La suma arriba; en Gràcia nadie informó: de vacías y llenas no se dice ni cero.
    const table = await screen.findByRole('table');
    const rows = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => [
        within(row).getByRole('button').textContent,
        ...within(row)
          .getAllByRole('cell')
          .map((c) => c.textContent),
      ]);
    expect(rows).toEqual([
      ['Todos los distritos', '3', '1', '0', '1'],
      ['Eixample', '2', '1', '0', '0'],
      ['Gràcia', '1', '–', '–', '1'],
    ]);
    expect(
      within(table)
        .getByRole('button', { name: 'Todos los distritos' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    // El Eixample: lista, marcadores, recuento y leyenda solo con sus dos estaciones.
    const eixample = within(table).getByRole('button', { name: 'Eixample' });
    await user.click(eixample);
    expect(eixample.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('2 estaciones')).toBeTruthy();
    // En el orden de la lista: por el nombre que se ve («C/ Roger…» antes que «Gran Via…»).
    expect(screen.getAllByRole('button', { name: /^Marcador/ }).map((b) => b.textContent)).toEqual([
      'Marcador C/ ROGER DE FLOR, 126',
      'Marcador GRAN VIA CORTS CATALANES, 760',
    ]);
    expect(screen.queryByRole('button', { name: /^Pl\. de la Vila de Gracia/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Sin dato reciente/ }).textContent).toMatch(/0$/);

    // Pulsado otra vez, deja de filtrar; la tabla sigue entera mientras tanto.
    await user.click(eixample);
    expect(eixample.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('3 estaciones')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Marcador/ })).toHaveLength(3);
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
      if (path === '/api/sources/bicing-bcn/ingestions') return json(ingestionsFor());
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

    // Lo que entró, según el registro de la ingesta: las cifras reales, día a día, y los rechazos.
    expect(
      await within(sheet).findByText(
        '2 importaciones en 1 día: 154.389 observaciones nuevas, 155.162 repetidas, 202 en conflicto y 2 rechazadas.',
      ),
    ).toBeTruthy();
    await user.click(within(sheet).getByText('Lo que entró cada día'));
    const dayRow = within(sheet).getByText('155.162').closest('tr');
    expect(dayRow?.querySelector('th')?.textContent).toBe('jue 20 2 veces');
    expect(Array.from(dayRow?.querySelectorAll('td') ?? []).map((c) => c.textContent)).toEqual([
      '154.389',
      '155.162',
      '202',
      '2',
    ]);
    expect(within(sheet).getByText('2 observaciones: recuento negativo')).toBeTruthy();
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

    // Las bicis y los anclajes sumados del paso, con en cuántas estaciones; y su línea en la
    // pista, que es un solo tramo (07:00 a 10:30) porque fuera no hay recuento.
    expect(document.querySelector('.replay-counts__totals')?.textContent).toBe(
      '20 bicis (8 eléctricas) y 30 anclajes libres en 2 estaciones',
    );
    const bikesLine = document.querySelector('.replay-deck__bikes')?.getAttribute('d') ?? '';
    expect(bikesLine.match(/M/g)).toHaveLength(1);
    expect(screen.getByText('bicis en las estaciones: de 0 a 20')).toBeTruthy();

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
    // La hora va a la URL cuando la pista se queda quieta, no en cada paso.
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get('hora')).toBe('00:00');
    });
  });

  it('si no llega el día, lo dice y deja reintentar; la semana sin llegar no parece vacía', async () => {
    let dayAttempts = 0;
    mockApi((path, url) => {
      if (path === '/api/sources') return json([demoSource]);
      if (path === '/api/sources/demo/frames') return json(framesFor(url));
      if (path === '/api/sources/demo/timeline') {
        if (url.searchParams.get('step') === '60') return json({ title: 'Error' }, 500);
        dayAttempts += 1;
        return dayAttempts === 1 ? json({ title: 'Error' }, 500) : json(timelineFor(url));
      }
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?fuente=demo&modo=reproducir&hora=08:30');
    const { container } = renderApp();

    const failed = await screen.findByText('No se ha podido cargar el día.');
    expect(screen.queryByText('Cargando el día…')).toBeNull();
    // El día importado, sin su semana, no se dibuja con el discontinuo de «sin datos».
    const imported = screen.getByRole('button', { name: 'mar 10' });
    expect(imported.querySelectorAll('.week-dial__gap')).toHaveLength(0);
    expect(container.querySelectorAll('.week-dial__gap').length).toBeGreaterThan(0);

    await user.click(
      within(failed.closest('[role="alert"]') as HTMLElement).getByRole('button', {
        name: 'Reintentar',
      }),
    );
    const slider = await screen.findByRole('slider', { name: 'Momento del día' });
    await waitFor(() => {
      expect(slider.getAttribute('aria-valuetext')).toMatch(/^08:30,/);
    });
    expect(dayAttempts).toBe(2);
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

  it('al reproducir, la URL no cambia en cada paso (la hora se escribe al pararse)', async () => {
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
      expect(
        within(screen.getByRole('button', { name: /^Pl\. de Catalunya/ })).getByText('30'),
      ).toBeTruthy();
    });
    const replaceState = vi.spyOn(window.history, 'replaceState');
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: '5 minutos después' }));
    }
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^08:45,/);
    expect(replaceState).not.toHaveBeenCalled();
    replaceState.mockRestore();
  });

  it('al reproducir con una estación abierta, el foco se queda en la pista al cambiar de hora', async () => {
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
    const catalunya = await screen.findByRole('button', { name: /^Pl\. de Catalunya/ });
    await waitFor(() => {
      expect(within(catalunya).getByText('30')).toBeTruthy();
    });

    // La persona abre la estación: el foco va a su nombre.
    await user.click(catalunya);
    const heading = await screen.findByRole('heading', { name: 'Pl. de Catalunya' });
    expect(document.activeElement).toBe(heading);

    // Vuelve a la pista y salta a una hora sin cargar: al llegar, el detalle vuelve a estar y el
    // foco sigue en la pista (antes se lo llevaba el nombre de la estación).
    slider.focus();
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(screen.getByText('Cargando el estado de las estaciones…')).toBeTruthy();
    });
    expect(
      await screen.findByRole('heading', { name: 'Pl. de Catalunya' }, { timeout: 3000 }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(slider);
  });

  it('al cambiar de día se queda la misma hora de reloj, también en un día de 25 horas', async () => {
    // El 25-10-2026 se atrasa la hora: el día tiene 300 pasos de 5 min.
    const october = {
      ...demoSource,
      period: {
        from: '2026-10-23T22:00:00+00:00',
        to: '2026-10-25T22:55:00+00:00',
        observationCount: 30,
      },
      days: ['2026-10-24', '2026-10-25'],
    };
    mockApi((path, url) => {
      if (path === '/api/sources') return json([october]);
      if (path === '/api/sources/demo/timeline') return json(timelineFor(url));
      if (path === '/api/sources/demo/frames') return json(framesFor(url));
      return json({ title: 'Petición inesperada' }, 500);
    });
    const user = userEvent.setup();
    window.history.replaceState(
      null,
      '',
      '/?fuente=demo&modo=reproducir&dia=2026-10-24&hora=20:00',
    );
    renderApp();

    const slider = await screen.findByRole('slider', { name: 'Momento del día' });
    await waitFor(() => {
      expect(slider.getAttribute('aria-valuetext')).toMatch(/^20:00, sábado, 24 de octubre/);
    });
    await user.click(screen.getByRole('button', { name: '5 minutos después' }));
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^20:05, sábado/);
    await user.click(screen.getByRole('button', { name: 'dom 25' }));
    // Con el mismo índice serían las 19:05: la hora de 02:00 a 03:00 se repite ese día.
    await waitFor(() => {
      expect(slider.getAttribute('aria-valuetext')).toMatch(/^20:05, domingo, 25 de octubre/);
    });
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
    // En la URL, con el identificador de la fuente (vale en cualquier copia); a la API, el interno.
    expect(new URLSearchParams(window.location.search).get('retiradas')).toBe('demo-001');
    await waitFor(() => {
      expect(bodies.at(-1)?.removed).toEqual([11]);
    });
    expect(await within(deck).findByText('49,9 %')).toBeTruthy();
    expect(within(deck).getByText('pierde 0,10 km²')).toBeTruthy();

    // Recuperarla la devuelve al mapa y a la red.
    await user.click(screen.getByRole('button', { name: 'Recuperar: Pl. de Catalunya' }));
    expect(screen.getByRole('button', { name: 'Marcador Pl. de Catalunya' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('retiradas')).toBeNull();
  });

  it('si falla el cálculo de la cobertura, no enseña el anterior como si fuera el del escenario', async () => {
    let fail = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        const url = new URL(input.url);
        if (url.pathname === '/api/sources') return json([demoSource]);
        if (url.pathname === '/api/stations') return json(stationsResponse(stations));
        if (url.pathname === '/api/study-areas') return json([barcelona]);
        if (url.pathname === '/api/scenarios/coverage') {
          if (fail) return json({ title: 'Error' }, 500);
          return json(coverageFor((await input.json()) as CoverageRequest));
        }
        return json({ title: 'Petición inesperada' }, 500);
      }),
    );
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?modo=experimentar');
    renderApp();

    const deck = await screen.findByRole('region', { name: 'Escenario de cobertura' });
    await waitFor(() => {
      expect(within(deck).getAllByText('50,0 %')).toHaveLength(2);
    });

    fail = true;
    await user.click(within(deck).getByRole('button', { name: 'Quitar' }));
    await user.click(screen.getByRole('button', { name: 'Marcador Pl. de Catalunya' }));
    expect(await within(deck).findByText(/No se ha podido calcular la cobertura/)).toBeTruthy();
    expect(within(deck).queryByText('50,0 %')).toBeNull();
  });

  it.each([
    ['con el identificador de la fuente', 'retiradas=demo-001'],
    ['con el interno de los enlaces anteriores', 'quitadas=11'],
  ])('un enlace a un escenario %s quita la misma estación', async (_, link) => {
    const bodies: CoverageRequest[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        const url = new URL(input.url);
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
    window.history.replaceState(null, '', `/?modo=experimentar&${link}`);
    renderApp();

    expect(await screen.findByText('quitada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Marcador Pl. de Catalunya' })).toBeNull();
    await waitFor(() => {
      expect(bodies.at(-1)?.removed).toEqual([11]);
    });
    // Nunca se calculó con la estación todavía en la red, y el enlace queda en el formato nuevo.
    expect(bodies.every((b) => b.removed?.length === 1)).toBe(true);
    const params = new URLSearchParams(window.location.search);
    expect([params.get('retiradas'), params.get('quitadas')]).toEqual(['demo-001', null]);
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
