// «Contrato de la API» (/contrato.html, 8-10-2026): la página entera en escritorio y la parte de
// arriba y una ruta a 375 y 320 px, en los tres idiomas. Sin mapa: no depende de teselas.
//   npx playwright test --config e2e/tools.config.ts --grep contrato
import { expect, test } from '@playwright/test';

test('contrato: escritorio, página entera', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'escritorio', 'solo en escritorio');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/contrato.html');
  await expect(page.locator('.contract-endpoint')).toHaveCount(9);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'captures/contrato-escritorio-arriba.png' });
  await page.locator('#get-api-stations').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'captures/contrato-escritorio-ruta.png' });
  await page.screenshot({ path: 'captures/contrato-escritorio.png', fullPage: true });
});

for (const [lang, title] of [
  ['es', 'Contrato de la API'],
  ['ca', 'Contracte de l’API'],
  ['en', 'API contract'],
] as const) {
  test(`contrato en ${lang} a 375 y 320 px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo en móvil');
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`/contrato.html?idioma=${lang}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      await expect(page.locator('.contract-endpoint')).toHaveCount(9);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({ path: `captures/contrato-${lang}-${String(width)}.png` });
      await page.locator('#get-api-stations').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `captures/contrato-${lang}-${String(width)}-ruta.png` });
    }
  });
}
