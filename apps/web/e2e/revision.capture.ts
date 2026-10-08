// Capturas de revisión del diseño (8-10-2026): las cuatro vistas, la ficha y «Qué muestra y qué
// no», en escritorio y móvil, con el mapa real. No es una prueba.
//   E2E_BASE_URL=http://127.0.0.1:5173 npx playwright test --config e2e/tools.config.ts --grep "revision"
import { test, type Page } from '@playwright/test';

const BASE = '/?fuente=bicing-bcn&dia=2026-05-13&hora=08:30';
const LANG = process.env.REVISION_LANG ?? '';
const SUFFIX = LANG === '' ? '' : `&idioma=${LANG}`;
const TAG = LANG === '' ? 'es' : LANG;

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

test('revision: vistas', async ({ page }, testInfo) => {
  // Muchas vistas seguidas con el mapa real: más que los 30 s de una prueba.
  test.setTimeout(240_000);
  const mobile = testInfo.project.name === 'movil';
  const shot = (name: string, fullPage = false) =>
    page.screenshot({
      path: `captures/revision-${TAG}-${testInfo.project.name}-${name}.png`,
      fullPage,
    });

  await page.goto(`${BASE}${SUFFIX}`);
  await waitForMap(page);
  await shot('explorar');
  if (mobile) {
    await shot('explorar-pagina', true);
    await page.locator('.source-notice__fold summary').click();
    await page.waitForTimeout(300);
    await shot('explorar-abierta');
  }

  await page.goto(`${BASE}&estacion=1${SUFFIX}`);
  await waitForMap(page);
  await page.waitForTimeout(1500);
  await shot('ficha', true);

  await page.goto(`${BASE}&vista=limites${SUFFIX}`);
  await waitForMap(page);
  await page.waitForTimeout(1500);
  await shot('limites', true);

  await page.goto(`${BASE}&modo=reproducir${SUFFIX}`);
  await waitForMap(page);
  await page.waitForTimeout(1500);
  await shot('reproducir');
  if (mobile) await shot('reproducir-pagina', true);

  await page.goto(`${BASE}&modo=balance${SUFFIX}`);
  await waitForMap(page);
  await page.waitForTimeout(2000);
  await shot('balance');
  await shot('balance-pagina', true);

  await page.goto(`${BASE}&modo=experimentar${SUFFIX}`);
  await waitForMap(page);
  await page.waitForTimeout(2000);
  await shot('experimentar');
  if (mobile) await shot('experimentar-pagina', true);

  if (mobile) {
    await page.setViewportSize({ width: 320, height: 712 });
    await page.goto(`${BASE}${SUFFIX}`);
    await waitForMap(page);
    await shot('320-explorar');
    await page.goto(`${BASE}&modo=reproducir${SUFFIX}`);
    await waitForMap(page);
    await page.waitForTimeout(1500);
    await shot('320-reproducir');
  }
});
