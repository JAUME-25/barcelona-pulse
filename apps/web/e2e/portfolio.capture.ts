// Capturas para el caso de jaumeperez.com (no es una prueba): lo que enseña la página, desde
// producción, a 1440 × 900 con densidad 2 (2880 × 1800, como las de Cuadra).
//   E2E_BASE_URL=https://pulse.jaumeperez.com npx playwright test --config e2e/tools.config.ts --grep portfolio --project escritorio
// Dejan captures/portfolio-*.png; en jaumeperez-web van a src/assets/pulse/ con su procedencia.
import { expect, test, type Page } from '@playwright/test';

test.use({ deviceScaleFactor: 2 });

// El miércoles 13 de mayo de 2026 a las 09:00 es el momento con más estaciones vacías y llenas
// de esa semana (118 y 33), y esa madrugada tiene uno de los huecos del archivo.
const REPLAY = '/?fuente=bicing-bcn&modo=reproducir&dia=2026-05-13&hora=09:00';

// Nou Barris, con tres estaciones nuevas (Ciutat Meridiana, Vallbona y Torre Baró): del 56,5 %
// al 60,4 % de su superficie a menos de 300 m.
const SCENARIO =
  '/?fuente=bicing-bcn&modo=experimentar&radio=300&area=districte-08' +
  '&nuevas=2.17400,41.46100;2.18000,41.46350;2.16550,41.46000' +
  '#mapa=13.7/41.4430/2.1690/-12/45';

const LIMITS = '/?fuente=bicing-bcn&vista=limites';

async function settle(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 90_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
}

const DESKTOP_ONLY = 'La página del caso usa capturas de escritorio';

test.describe('portfolio', () => {
  test('portfolio: reproducir', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'escritorio', DESKTOP_ONLY);
    await page.goto(REPLAY);
    await expect(page.getByRole('slider', { name: 'Momento del día' })).toHaveAttribute(
      'aria-valuetext',
      /^09:00, miércoles, 13 de mayo de 2026\./,
      { timeout: 60_000 },
    );
    await settle(page);
    await page.screenshot({ path: 'captures/portfolio-reproducir.png' });
  });

  test('portfolio: experimentar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'escritorio', DESKTOP_ONLY);
    await page.goto(SCENARIO);
    await settle(page);
    await expect(page.getByText('Calculando la cobertura…')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'captures/portfolio-experimentar.png' });
  });

  test('portfolio: límites', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'escritorio', DESKTOP_ONLY);
    await page.goto(LIMITS);
    await expect(page.locator('.hole-grid')).toBeVisible({ timeout: 60_000 });
    await settle(page);
    await page.getByRole('heading', { name: 'Huecos' }).evaluate((heading) => {
      heading.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'captures/portfolio-limites.png' });
  });
});
