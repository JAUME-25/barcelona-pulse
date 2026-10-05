// Medición de carga con la compilación de producción servida por `vite preview` en local.
// No es una prueba: escribe los tiempos en test-results/measurements.json.
// En el proyecto «movil» se ralentiza la CPU ×4 para aproximar un teléfono medio.
import { test } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

const RUNS = 5;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

test('medicion: tiempos de carga de la vista inicial', async ({ page, browserName }, testInfo) => {
  test.setTimeout(180_000);
  const mobile = testInfo.project.name === 'movil';
  const results: { domContentLoaded: number; listReady: number; mapReady: number; jsKb: number }[] =
    [];

  for (let i = 0; i < RUNS; i++) {
    const browser = page.context().browser();
    if (browser === null) throw new Error('Sin navegador');
    const context = await browser.newContext(testInfo.project.use);
    const tab = await context.newPage();
    if (mobile && browserName === 'chromium') {
      const cdp = await context.newCDPSession(tab);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    let jsBytes = 0;
    tab.on('response', (response) => {
      if (response.url().endsWith('.js')) {
        void response
          .body()
          .then((b) => (jsBytes += b.length))
          .catch(() => undefined);
      }
    });

    const start = Date.now();
    await tab.goto('/', { waitUntil: 'domcontentloaded' });
    const domContentLoaded = Date.now() - start;
    await tab.getByText('46 estaciones').waitFor();
    const listReady = Date.now() - start;
    await tab.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });
    const mapReady = Date.now() - start;
    results.push({ domContentLoaded, listReady, mapReady, jsKb: Math.round(jsBytes / 1024) });
    await context.close();
  }

  const summary = {
    project: testInfo.project.name,
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
