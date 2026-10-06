// Medición de carga con la compilación de producción servida por `vite preview` en local.
// No es una prueba: escribe los tiempos en test-results/measurements.json.
// Tiempos del propio navegador (desde el inicio de la navegación): con la CPU ralentizada, el
// reloj de Playwright añade el retraso de sus propias comprobaciones.
// En el proyecto «movil» se ralentiza la CPU ×4 para aproximar un teléfono medio.
// Con la demo (46 estaciones) y con la red real (unas 540; necesita el histórico importado).
import { test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

const RUNS = 5;

const SOURCES = [
  { id: 'demo', name: 'demo' },
  { id: 'bicing-bcn', name: 'red real' },
];

interface Timings {
  domContentLoaded: number;
  listReady: number;
  mapReady: number;
  jsKb: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

for (const source of SOURCES) {
  test(`medicion: tiempos de carga de la vista inicial con la ${source.name}`, async ({
    page,
    browserName,
  }, testInfo) => {
    test.setTimeout(240_000);
    const mobile = testInfo.project.name === 'movil';
    const results: Timings[] = [];

    for (let i = 0; i < RUNS; i++) {
      const browser = page.context().browser();
      if (browser === null) throw new Error('Sin navegador');
      const context = await browser.newContext(testInfo.project.use);
      const tab = await context.newPage();
      if (mobile && browserName === 'chromium') {
        const cdp = await context.newCDPSession(tab);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      // Antes que la app: cuándo aparece la primera fila de la lista y cuándo está listo el mapa.
      await tab.addInitScript(() => {
        const w = window as unknown as { bpList: number | null; bpMap: number | null };
        w.bpList = null;
        w.bpMap = null;
        new MutationObserver((_, observer) => {
          w.bpList ??= document.querySelector('.station-list__item') ? performance.now() : null;
          w.bpMap ??= document.querySelector('[data-map-status="ready"]')
            ? performance.now()
            : null;
          if (w.bpList !== null && w.bpMap !== null) observer.disconnect();
        }).observe(document, { childList: true, subtree: true, attributes: true });
      });

      await tab.goto(`/?fuente=${source.id}`, { waitUntil: 'domcontentloaded' });
      await tab.locator('.station-list__item').first().waitFor();
      await tab.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });
      results.push(
        await tab.evaluate((): Timings => {
          const w = window as unknown as { bpList: number | null; bpMap: number | null };
          const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          const js = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .filter((r) => r.name.endsWith('.js'))
            .reduce((sum, r) => sum + r.decodedBodySize, 0);
          return {
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
            listReady: Math.round(w.bpList ?? Number.NaN),
            mapReady: Math.round(w.bpMap ?? Number.NaN),
            jsKb: Math.round(js / 1024),
          };
        }),
      );
      await context.close();
    }

    const summary = {
      project: testInfo.project.name,
      source: source.id,
      runs: RUNS,
      medianMs: {
        domContentLoaded: median(results.map((r) => r.domContentLoaded)),
        listReady: median(results.map((r) => r.listReady)),
        mapReady: median(results.map((r) => r.mapReady)),
      },
      jsKbUncompressed: median(results.map((r) => r.jsKb)),
      measuredAt: new Date().toISOString(),
    };
    mkdirSync('test-results', { recursive: true });
    appendFileSync('test-results/measurements.json', JSON.stringify(summary) + '\n');
    console.log(JSON.stringify(summary));
  });
}
