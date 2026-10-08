// Capturas del resumen y el filtro por distrito (no es una prueba).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep distritos
// Necesita el histórico real importado (mayo de 2026). Además de capturar, lo usa: filtra por el
// Eixample con el teclado, comprueba que lista, mapa, recuento y leyenda se quedan con sus
// estaciones, lo quita pulsándolo otra vez y pliega y despliega la tabla. En móvil, a 375 y 320 px
// y sin scroll lateral.
import { expect, test, type Page } from '@playwright/test';

const EXPLORE = '/?fuente=bicing-bcn';
const REPLAY = '/?fuente=bicing-bcn&modo=reproducir&dia=2026-05-21&hora=08:30';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

/** Deja el resumen por distrito arriba del panel, justo bajo la búsqueda fija. */
async function showSummary(page: Page) {
  await page.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('.district-section__summary');
    const tools = document.querySelector<HTMLElement>('.panel-tools');
    const body = document.querySelector<HTMLElement>('.panel-body');
    if (heading === null || tools === null || body === null) return;
    heading.scrollIntoView({ block: 'start' });
    const offset = tools.offsetHeight + 10;
    if (getComputedStyle(body).overflowY === 'auto') body.scrollTop -= offset;
    else window.scrollBy(0, -offset);
  });
  await page.waitForTimeout(400);
}

async function noSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

function sizes(mobile: boolean) {
  return mobile
    ? ([
        ['375', 375, 812],
        ['320', 320, 700],
      ] as const)
    : ([['escritorio', 1440, 900]] as const);
}

/**
 * Estaciones de una fila de la tabla, leídas de la propia tabla: la base local y producción no
 * tienen las mismas (548 con mayo y agosto, 547 solo con mayo). Sin `exact`: la fila elegida
 * lleva una marca delante del nombre.
 */
async function rowStations(page: Page, name: string): Promise<number> {
  const row = page.locator('tr', { has: page.getByRole('button', { name }) });
  return Number((await row.locator('td').first().textContent())?.trim());
}

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

test('distritos: resumen, filtro por el Eixample y reproducir', async ({ page }, testInfo) => {
  const problems = watchErrors(page);
  const mobile = testInfo.project.name === 'movil';
  for (const [name, width, height] of sizes(mobile)) {
    const shot = (what: string) =>
      page.screenshot({ path: `captures/distritos-${name}-${what}.png` });
    await page.setViewportSize({ width, height });

    await page.goto(EXPLORE);
    await waitForMap(page);
    await showSummary(page);
    const total = await rowStations(page, 'Todos los distritos');
    const inEixample = await rowStations(page, 'Eixample');
    expect(total).toBeGreaterThan(inEixample);
    expect(inEixample).toBeGreaterThan(0);
    await expect(page.locator('.panel-tools__count')).toHaveText(`${String(total)} estaciones`);
    if (mobile) await noSideScroll(page, width);
    await shot('explorar');

    // Filtrar con el teclado: el Eixample queda pulsado y lista, mapa, recuento y leyenda son los suyos.
    const eixample = page.getByRole('button', { name: 'Eixample' });
    await eixample.focus();
    await page.keyboard.press('Enter');
    await expect(eixample).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Todos los distritos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('.panel-tools__count')).toHaveText(
      `${String(inEixample)} estaciones`,
    );
    // La lista enseña un tramo: el botón trae el resto antes de contar las filas.
    const more = page.getByRole('button', { name: /^Mostrar las \d+ restantes/ });
    if ((await more.count()) > 0) await more.click();
    await expect(page.locator('.station-list__item')).toHaveCount(inEixample);
    const legendTotal = await page
      .locator('.availability-filter__count')
      .evaluateAll((els) => els.reduce((sum, el) => sum + Number(el.textContent), 0));
    expect(legendTotal).toBe(inEixample);
    await page.waitForTimeout(800);
    await showSummary(page);
    await shot('eixample');
    if (mobile) {
      await page.locator('.map-area').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot('eixample-mapa');
    }

    // Pulsado otra vez, deja de filtrar.
    await eixample.click();
    await expect(eixample).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.panel-tools__count')).toHaveText(`${String(total)} estaciones`);

    // Plegada, la lista queda a mano; se recuerda al recargar.
    await page.locator('.district-section__summary').click();
    await expect(page.locator('.district-table')).toBeHidden();
    await page.reload();
    await waitForMap(page);
    await expect(page.locator('.district-table')).toBeHidden();
    await page.locator('.district-section__summary').click();
    await expect(page.locator('.district-table')).toBeVisible();

    // Al reproducir, el resumen es el del instante mostrado.
    await page.goto(REPLAY);
    await waitForMap(page);
    await expect(page.getByRole('slider', { name: 'Momento del día' })).toHaveAttribute(
      'aria-valuetext',
      /con dato/,
      { timeout: 15_000 },
    );
    await showSummary(page);
    if (mobile) await noSideScroll(page, width);
    await shot('reproducir');
  }
  expect(problems).toEqual([]);
});
