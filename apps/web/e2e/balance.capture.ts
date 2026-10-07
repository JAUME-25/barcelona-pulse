// «Balance», el cuarto modo (dirección «Marea», elegida el 8-10-2026 entre tres con capturas):
// con el mapa real y el histórico importado, el 13-5-2026 de 07:00 a 10:00. Además de capturar,
// lo usa: comprueba la clave, los totales y que una estación de la lista abre su ficha a nivel
// de calle, donde los marcadores llevan el número con signo. En escritorio y a 375 px (allí,
// también el panel bajo el mapa y la cabecera a 320 px).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep balance
import { expect, test, type Page } from '@playwright/test';

const VIEW = '/?fuente=bicing-bcn&modo=balance&dia=2026-05-13&desde=07:00&hora=10:00';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

test('balance: de 07:00 a 10:00 del 13 de mayo', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const [name, width, height] = mobile
    ? (['375', 375, 812] as const)
    : (['escritorio', 1440, 900] as const);
  await page.setViewportSize({ width, height });
  await page.goto(VIEW);
  await waitForMap(page);

  await expect(page.locator('.balance-key__title')).toHaveText('Balance de 07:00 a 10:00');
  await expect(page.locator('.balance-key__count').last()).not.toHaveText('…');
  const counts = (await page.locator('.balance-key__count').allTextContents()).map(Number);
  const total = counts.reduce((a, b) => a + b, 0);
  expect(total).toBeGreaterThan(500);
  await expect(page.locator('.balance__total--gain .balance__big')).toHaveText(/^\+\d+$/);
  await expect(page.locator('.balance__total--loss .balance__big')).toHaveText(/^−\d+$/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  console.log(
    `[balance] ${name}: ganan/pierden/igual/sin dato ${counts.join('/')} de ${String(total)}`,
  );
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `captures/balance-${name}.png` });

  if (mobile) {
    await page.locator('.balance__totals').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'captures/balance-375-panel.png' });
    await page.locator('.balance-bars').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'captures/balance-375-distritos.png' });
    // A 320 px, el selector de modos pasa a dos filas sin cortarse.
    await page.setViewportSize({ width: 320, height: 812 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);
    const narrow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(narrow).toBe(false);
    await page.screenshot({ path: 'captures/balance-320.png' });
    return;
  }

  // La que más se llena abre su ficha y el mapa se acerca a ella: el número con signo.
  await page.locator('.balance .station-list__item').first().click();
  await expect(page.getByRole('article')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'captures/balance-calle-escritorio.png' });
});

// En catalán y en inglés, a 375 px: la clave, el panel y que nada desborde.
for (const [lang, title] of [
  ['ca', 'Balanç de 07:00 a 10:00'],
  ['en', 'Balance from 07:00 to 10:00'],
] as const) {
  test(`balance en ${lang} a 375 px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'movil', 'solo en móvil');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${VIEW}&idioma=${lang}`);
    await waitForMap(page);
    await expect(page.locator('.balance-key__title')).toHaveText(title);
    await expect(page.locator('.balance-key__count').last()).not.toHaveText('…');
    await expect(page.locator('.balance__total--gain .balance__big')).toHaveText(/^\+\d+$/);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.locator('.balance__totals').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `captures/balance-375-${lang}.png` });
  });
}
