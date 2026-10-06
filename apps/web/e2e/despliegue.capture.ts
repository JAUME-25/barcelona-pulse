// Comprobación de un despliegue (no es una prueba de la CI): la web servida por nginx con sus
// cabeceras funciona en los tres modos, con el mapa, sin errores en la consola (la política de
// seguridad bloquearía en silencio lo que no esté permitido), con la procedencia a la vista y con
// «Qué muestra y qué no» midiendo los huecos de todo lo importado.
//   E2E_BASE_URL=https://pulse.jaumeperez.com npx playwright test --config e2e/tools.config.ts --grep despliegue
import { expect, test } from '@playwright/test';

test('despliegue: «Qué muestra y qué no» con los huecos medidos', async ({ page }, testInfo) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/?fuente=bicing-bcn');
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });
  const started = Date.now();
  await page.getByRole('button', { name: 'Qué muestra y qué no' }).click();
  await expect(page.locator('.hole-grid')).toBeVisible({ timeout: 60_000 });
  testInfo.annotations.push({
    type: 'huecos',
    description: `rejilla en ${String(Date.now() - started)} ms`,
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `captures/despliegue-ficha-${testInfo.project.name}.png` });
  expect(problems).toEqual([]);
});

const MODES = [
  { name: 'explorar', query: '' },
  { name: 'reproducir', query: '&modo=reproducir' },
  { name: 'experimentar', query: '&modo=experimentar&nuevas=2.16600,41.36350' },
];

for (const mode of MODES) {
  test(`despliegue: ${mode.name} con el mapa y sin errores`, async ({ page }, testInfo) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    const response = await page.goto(`/?fuente=bicing-bcn${mode.query}`);
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    await page.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });
    await expect(page.locator('.source-notice__lead')).toContainText(
      /Datos históricos · .* de 20\d\d\. No es el estado actual\./,
    );
    if (mode.name === 'experimentar') {
      await expect(page.getByText('Calculando la cobertura…')).toHaveCount(0, { timeout: 20_000 });
      // Entre la cifra y el % va un espacio de no separación.
      await expect(page.locator('.scenario-deck__share').first()).toHaveText(/^\d+,\d\s%$/);
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `captures/despliegue-${mode.name}-${testInfo.project.name}.png`,
    });

    // El móvil más estrecho que se admite, sin scroll horizontal.
    if (testInfo.project.name === 'movil') {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
      await page.screenshot({ path: `captures/despliegue-${mode.name}-320.png` });
    }

    expect(problems).toEqual([]);
  });
}
