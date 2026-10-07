// «Anclajes», los atajos de la leyenda, «A esta hora» y la frase de la hora en «Cómo suele estar»,
// con el mapa real (no es una prueba de la CI).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep atajos
// Necesita el histórico real importado. Además de capturar, lo usa: «Quiero aparcar» acota la
// lista y pone los anclajes en el mapa; «A esta hora» cambia el momento; la ficha empieza por la
// hora que se ve en el mapa. En escritorio y a 375 px.
import { expect, test, type Page } from '@playwright/test';

const VIEW = '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

test('atajos: aparcar, anclajes, a esta hora y la frase de la hora', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const [name, width, height] = mobile
    ? (['375', 375, 812] as const)
    : (['escritorio', 1440, 900] as const);
  await page.setViewportSize({ width, height });
  await page.goto(VIEW);
  await waitForMap(page);

  const count = () => page.locator('.panel-tools__count').textContent();
  const total = Number(/^(\d+)/.exec((await count()) ?? '')?.[1]);
  expect(total).toBeGreaterThan(500);

  // «Quiero aparcar»: fuera las llenas, las que no operan y las sin dato; anclajes en el mapa.
  await page.getByRole('button', { name: 'Quiero aparcar' }).click();
  await expect(page.getByRole('button', { name: 'Quiero aparcar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Exacto: las filas de la lista también dicen «anclajes» en su nombre.
  await expect(page.getByRole('button', { name: 'Anclajes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(new URL(page.url()).searchParams.get('numero')).toBe('anclajes');
  expect(new URL(page.url()).searchParams.get('ocultar')).toBe('llenas,fuera-de-servicio,sin-dato');
  await expect(page.locator('.panel-tools__count')).toHaveText(/de \d+ estaciones/);
  await expect(
    page.locator('.station-list__item').first().locator('.station-list__unit').first(),
  ).toHaveText('libres');
  await page.waitForTimeout(800);
  if (mobile) await page.locator('.map-legend').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `captures/atajos-aparcar-${name}.png` });

  // «A esta hora»: otro día y la hora de ahora; el momento cambia en el aviso y en la URL.
  const before = await page.locator('.source-notice__time').textContent();
  await page.getByRole('button', { name: 'A esta hora' }).click();
  await expect(page.locator('.source-notice__time')).not.toHaveText(before ?? '');
  expect(new URL(page.url()).searchParams.get('hora')).toMatch(/^\d\d:\d[05]$/);

  // La ficha: la frase de la hora que se ve en el mapa va la primera.
  await page.locator('.station-list__item').first().click();
  const summary = page.locator('.station-pattern__summary').first();
  await expect(summary).toHaveText(/^De \d+ a \d+ h tuvo alguna bici el \d+\s%\sdel tiempo/, {
    timeout: 15_000,
  });
  await summary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `captures/atajos-patron-${name}.png` });
});
