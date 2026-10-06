// Capturas de los límites visibles con el mapa real (no es una prueba): la ficha «Qué muestra y
// qué no», las notas junto a los datos y el sello del mapa en móvil.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep limites
// Necesita la red real importada (bicing-bcn, mayo de 2026) y las áreas de estudio. Además de
// capturar, usa los controles: abre la ficha desde el aviso, va a una estación sin dato, deja solo
// esas en el mapa y elige un día de la rejilla; abre las notas de «con dato» y de la cobertura.
// En móvil, a 375 y 320 px y sin scroll lateral.
import { expect, test, type Page } from '@playwright/test';

const REAL = '/?fuente=bicing-bcn';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

async function scrollTo(page: Page, selector: string, block: 'start' | 'center' = 'start') {
  await page
    .locator(selector)
    .first()
    .evaluate((el, where) => {
      el.scrollIntoView({ block: where });
    }, block);
  await page.waitForTimeout(600);
}

async function noSideScroll(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
}

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `captures/limites-${name}.png` });

function sizes(mobile: boolean) {
  return mobile
    ? ([
        ['375', 375, 812],
        ['320', 320, 640],
      ] as const)
    : ([['escritorio', 1440, 900]] as const);
}

async function openSheet(page: Page) {
  await page.getByRole('button', { name: 'Qué muestra y qué no' }).click();
  await expect(page.getByRole('heading', { name: 'Qué muestra y qué no' })).toBeFocused();
  await expect(page.getByText('Midiendo los huecos…')).toHaveCount(0, { timeout: 30_000 });
}

test('limites: la ficha lleva a una estación sin dato y a reproducir un día', async ({
  page,
}, testInfo) => {
  const problems = watchErrors(page);
  const mobile = testInfo.project.name === 'movil';
  for (const [name, width, height] of sizes(mobile)) {
    await page.setViewportSize({ width, height });
    await page.goto(REAL);
    await waitForMap(page);
    await openSheet(page);
    if (mobile) await noSideScroll(page, width);
    await shot(page, `${name}-ficha`);
    await scrollTo(page, '.hole-grid', mobile ? 'start' : 'center');
    await shot(page, `${name}-huecos`);
    await scrollTo(page, '.silent-group', mobile ? 'start' : 'center');
    await shot(page, `${name}-sin-dato`);
    await scrollTo(page, '.limits-origins', 'center');
    await shot(page, `${name}-fuentes`);

    // Una estación sin dato (la de La Rambla, sin datos desde 2025) abre su detalle y se marca
    // en el mapa.
    // La fuente lo publica como «LA RAMBLA, 75»; se ve escrito para leerse.
    await page.getByRole('button', { name: /^La Rambla, 75/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'La Rambla, 75' })).toBeVisible();
    await expect(page).not.toHaveURL(/vista=limites/);
    await page.waitForTimeout(1200);
    await shot(page, `${name}-estacion`);
    if (mobile) {
      await scrollTo(page, '.map-area');
      await shot(page, `${name}-estacion-mapa`);
    }

    // En la lista, desde cuándo con la fecha: no «desde las 10:54».
    await page.getByRole('button', { name: 'Volver a la lista' }).click();
    await expect(page.getByText('Sin dato reciente desde el 12 de junio de 2025')).toBeAttached();
  }
  // Un día de la rejilla se reproduce.
  await page.goto(`${REAL}&vista=limites`);
  await waitForMap(page);
  await expect(page.getByText('Midiendo los huecos…')).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('button', { name: /^miércoles, 20 de mayo de 2026/ }).click();
  await expect(page).toHaveURL(/modo=reproducir/);
  await expect(page).toHaveURL(/dia=2026-05-20/);
  await expect(page.getByText('miércoles, 20 de mayo de 2026')).toBeVisible({ timeout: 20_000 });
  expect(problems).toEqual([]);
});

test('limites: notas junto a los datos y sello del mapa en móvil', async ({ page }, testInfo) => {
  const problems = watchErrors(page);
  const mobile = testInfo.project.name === 'movil';
  for (const [name, width, height] of sizes(mobile)) {
    await page.setViewportSize({ width, height });

    // El sello dice qué es y de cuándo, solo en móvil.
    await page.goto(REAL);
    await waitForMap(page);
    const stamp = page.locator('.map-stamp');
    if (mobile) {
      await expect(stamp).toContainText('Histórico, no es tiempo real');
      await scrollTo(page, '.map-area');
      await shot(page, `${name}-sello`);
    } else {
      await expect(stamp).toBeHidden();
    }

    // Reproducir un miércoles con huecos: a qué horas y quién cuenta como «con dato».
    await page.goto(`${REAL}&modo=reproducir&dia=2026-05-20&hora=10:00`);
    await waitForMap(page);
    await expect(page.locator('.gap-caption')).toContainText('de 03:10 a 04:20', {
      timeout: 20_000,
    });
    await page.getByRole('button', { name: /con dato$/ }).click();
    await expect(page.getByRole('note')).toContainText('no cuentan como vacías');
    if (mobile) {
      await noSideScroll(page, width);
      await scrollTo(page, '.replay-deck');
    }
    await shot(page, `${name}-reproducir`);

    // Experimentar: qué mide el porcentaje y qué no, junto al resultado.
    await page.goto(`${REAL}&modo=experimentar&nuevas=2.16600,41.36350`);
    await waitForMap(page);
    await expect(page.getByText('Calculando la cobertura…')).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Superficie, no población' }).click();
    await expect(page.getByRole('note')).toContainText('no sobre la población');
    if (mobile) {
      await noSideScroll(page, width);
      await scrollTo(page, '.map-area');
      await shot(page, `${name}-experimentar-sello`);
      await scrollTo(page, '.scenario-deck__result');
    }
    await shot(page, `${name}-experimentar`);
  }
  expect(problems).toEqual([]);
});
