// Capturas de la procedencia de los datos reales en los tres modos (no es una prueba): que se lea
// «Datos históricos · <meses>», que no es el estado actual y la fecha completa del instante.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep procedencia
// Necesita mayo de 2026 importado.
import { expect, test } from '@playwright/test';

const MODES = [
  { name: 'explorar', query: '' },
  { name: 'reproducir', query: '&modo=reproducir&dia=2026-05-12&hora=08:30' },
  { name: 'experimentar', query: '&modo=experimentar' },
];

for (const mode of MODES) {
  test(`procedencia: datos históricos al ${mode.name}`, async ({ page }, testInfo) => {
    await page.goto(`/?fuente=bicing-bcn${mode.query}`);
    await expect(page.locator('.source-notice__lead')).toContainText(
      /Datos históricos · .*mayo.* de 2026\. No es el estado actual\./,
      { timeout: 30_000 },
    );
    if (mode.name === 'reproducir') {
      await expect(page.locator('.replay-clock__day')).toHaveText('martes, 12 de mayo de 2026');
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `captures/procedencia-${mode.name}-${testInfo.project.name}.png`,
    });
  });
}
