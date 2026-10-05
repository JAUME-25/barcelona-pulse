// Capturas de revisión visual con el mapa base real (no es una prueba).
//   npx playwright test --config e2e/tools.config.ts --grep captura
// Deja las imágenes en test-results/captures/.
import { test, type Page } from '@playwright/test';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

// Eixample a nivel de calle, con edificios en 3D (z16, inclinación 55°).
const EIXAMPLE_3D = '#mapa=16.2/41.3905/2.1655/-20/55';

test('captura: vista inicial, detalle y 3D', async ({ page }, testInfo) => {
  const shot = (name: string, fullPage = false) =>
    page.screenshot({
      path: `test-results/captures/fanals-${testInfo.project.name}-${name}.png`,
      fullPage,
    });

  await page.goto('/');
  await waitForMap(page);
  await shot('inicio');
  if (testInfo.project.name === 'movil') await shot('pagina', true);

  await page.getByRole('button', { name: /^Liceu/ }).click();
  await waitForMap(page);
  await shot('detalle');

  await page.goto(`/${EIXAMPLE_3D}`);
  await waitForMap(page);
  await shot('3d');
});
