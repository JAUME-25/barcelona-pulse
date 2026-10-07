import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import document from '../../../api/openapi/barcelona-pulse-api.json?raw';
import { setLang } from '../i18n';
import { LanguageRoot } from '../i18n/LanguageRoot';
import { ContractPage, DOCUMENT_PATH } from './ContractPage';

function mockDocument(status = 200) {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push(url);
      return Promise.resolve(
        new Response(status === 200 ? document : '{}', {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  return requests;
}

function renderPage() {
  return render(<LanguageRoot>{(lang) => <ContractPage key={lang} />}</LanguageRoot>);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setLang('es');
  window.history.replaceState(null, '', '/contrato.html');
});

describe('la página del contrato', () => {
  it('lee el documento de la API y enseña rutas, parámetros, respuestas y esquemas', async () => {
    const requests = mockDocument();
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Contrato de la API' })).toBeTruthy();
    const stations = await screen.findByRole('heading', { level: 3, name: 'GET /api/stations' });
    expect(requests[0]).toMatch(new RegExp(`${DOCUMENT_PATH}$`));
    expect(window.document.title).toBe('Contrato de la API · Barcelona Pulse');

    // Las reglas comunes, el índice y la ruta con sus parámetros.
    expect(screen.getByText(/Límite de 120 peticiones por minuto e IP/)).toBeTruthy();
    const section = stations.closest('section');
    expect(section).not.toBeNull();
    if (section === null) return;
    expect(
      within(section).getByText('Estaciones de una fuente y su estado en un instante'),
    ).toBeTruthy();
    const source = within(section).getByText('source').closest('li');
    expect(source?.textContent).toContain('en la consulta');
    expect(source?.textContent).toContain('string');
    expect(source?.textContent).toContain('Obligatorio. Identificador de la fuente');
    expect(within(section).getByText('304')).toBeTruthy();
    // La respuesta enlaza con su esquema, que está en la página.
    const link = within(section).getByRole('link', { name: 'StationsResponse' });
    expect(link.getAttribute('href')).toBe('#schema-StationsResponse');
    expect(window.document.getElementById('schema-StationsResponse')).not.toBeNull();
    const altitude = within(
      window.document.getElementById('schema-StationItem') as HTMLElement,
    ).getByText('altitude');
    expect(altitude.closest('li')?.textContent).toContain('number (double) | null');
    // Solo los esquemas que alguna ruta nombra.
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThan(9);
  });

  it('si el documento no llega, lo dice y deja reintentar; el idioma cambia la página', async () => {
    mockDocument(500);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('No se ha podido leer el contrato de la API.')).toBeTruthy();
    mockDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'GET /api/sources' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'API contract' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 3, name: 'GET /api/sources' })).toBeTruthy();
    expect(window.document.title).toBe('API contract · Barcelona Pulse');
  });
});
