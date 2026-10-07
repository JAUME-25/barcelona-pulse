// Capturas del número de eléctricas en el mapa y la lista (no es una prueba).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep electricas
// Necesita el histórico real importado. Además de capturar, lo usa: con «Eléctricas» elegido, los
// marcadores llevan ese número y las estaciones sin ninguna se atenúan; la lista pasa a «eléc.».
// En escritorio y a 375 px, sin scroll lateral.
import { expect, test, type Page } from '@playwright/test';

// La Dreta de l'Eixample a nivel de calle, sin inclinación: se ven los números de los marcadores.
const VIEW = '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30#mapa=15.2/41.3955/2.1705/0/0';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

/** Pliega la tabla por distrito, que ocupa el panel, para que las filas se vean. */
async function showList(page: Page) {
  const summary = page.locator('.district-section__summary');
  if ((await summary.count()) > 0) await summary.click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>('.panel-body');
    if (body === null) return;
    if (getComputedStyle(body).overflowY === 'auto') body.scrollTop = 0;
    else document.querySelector('.panel-tools')?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
}

test('electricas: el interruptor del número', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const [name, width, height] = mobile
    ? (['375', 375, 812] as const)
    : (['escritorio', 1440, 900] as const);
  await page.setViewportSize({ width, height });
  await page.goto(VIEW);
  await waitForMap(page);
  await showList(page);
  const firstUnit = page.locator('.station-list__unit').first();
  await expect(firstUnit).toHaveText(/bici/);
  await page.screenshot({ path: `captures/electricas-${name}-bicis.png` });

  await page.getByRole('button', { name: 'Eléctricas', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(firstUnit).toHaveText('eléc.');
  await expect(page.getByText(/Las que no tienen ninguna se atenúan/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  await page.screenshot({ path: `captures/electricas-${name}-electricas.png` });
  if (mobile) {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelector('.map-area')?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `captures/electricas-${name}-electricas-mapa.png` });
  }
});
