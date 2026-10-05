// Capturas de revisión visual con el mapa base real (no es una prueba).
//   npx playwright test --config e2e/tools.config.ts --grep captura
// Deja las imágenes en captures/. La parte «real» necesita el día del
// histórico importado (ingest bicing-archive --day 2026-08-20).
import { test, type Page } from '@playwright/test';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

// Eixample a nivel de calle, con edificios en 3D (z16, inclinación 55°).
const EIXAMPLE_3D = '#mapa=16.2/41.3905/2.1655/-20/55';

test('captura: demo, detalle, 3D y datos reales', async ({ page }, testInfo) => {
  const shot = (name: string, fullPage = false) =>
    page.screenshot({
      path: `captures/fanals-${testInfo.project.name}-${name}.png`,
      fullPage,
    });

  await page.goto('/?fuente=demo');
  await waitForMap(page);
  await shot('inicio');
  if (testInfo.project.name === 'movil') await shot('pagina', true);

  await page.getByRole('button', { name: /^Liceu/ }).click();
  await waitForMap(page);
  await shot('detalle');

  await page.goto(`/?fuente=demo${EIXAMPLE_3D}`);
  await waitForMap(page);
  await shot('3d');

  await page.goto('/?fuente=bicing-bcn');
  await waitForMap(page);
  await shot('real');

  await page.goto('/?fuente=bicing-bcn&estacion=1');
  await waitForMap(page);
  await shot('real-detalle');
});
