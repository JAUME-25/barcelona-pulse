// Imagen de la vista previa al compartir un enlace (og:image, 1200 × 630), con la red real a
// nivel de calle (no es una prueba). Deja `public/og.jpg`, que se publica con la web.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep "og:" --project escritorio
import { test, type Page } from '@playwright/test';

// La Dreta de l'Eixample, un laborable a las 08:30 del histórico importado, sin inclinación.
const VIEW = '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30#mapa=14.6/41.3935/2.1685/0/0';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

test('og: imagen de la vista previa', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio', 'Solo a tamaño de escritorio.');
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.goto(VIEW);
  await waitForMap(page);
  await page.screenshot({ path: 'public/og.jpg', type: 'jpeg', quality: 82 });
});
