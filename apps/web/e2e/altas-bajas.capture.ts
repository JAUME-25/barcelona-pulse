// Capturas de las altas y bajas con el mapa real (no es una prueba): la ficha de una estación que
// la fuente empezó a listar en mayo y de una que dejó de listar en agosto, y la sección «Altas y
// bajas» de «Qué muestra y qué no».
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep altas
// Necesita la red real importada (bicing-bcn, mayo y agosto de 2026). En móvil, a 375 y 320 px y
// sin scroll lateral; la ficha, también en catalán y en inglés.
import { expect, test, type Page } from '@playwright/test';

/** C/ Espronceda, 298: la fuente la listó por primera vez el 12-5-2026 a las 12:25. */
const NEW = '/?fuente=bicing-bcn&dia=2026-05-13&hora=10:00&estacion=238';
/** C/ Villena, 1: listada por última vez el 26-8-2026; el 27 ya no estaba. */
const GONE = '/?fuente=bicing-bcn&dia=2026-08-28&hora=10:00&estacion=46';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
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
  page.screenshot({ path: `captures/altas-bajas-${name}.png` });

function sizes(mobile: boolean) {
  return mobile
    ? ([
        ['375', 375, 812],
        ['320', 320, 640],
      ] as const)
    : ([['escritorio', 1440, 900]] as const);
}

async function openSheet(page: Page) {
  // En móvil la procedencia va plegada: «Qué muestra y qué no» está detrás de «Más».
  const fold = page.locator('.source-notice__fold:not([open]) summary');
  if ((await fold.count()) > 0) await fold.click();
  await page.getByRole('button', { name: 'Qué muestra y qué no' }).click();
  await expect(page.getByRole('heading', { name: 'Qué muestra y qué no' })).toBeFocused();
}

async function showFacts(page: Page) {
  await page.locator('.station-detail__facts').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
}

test('altas y bajas: la ficha de un alta y de una baja, y la sección de los límites', async ({
  page,
}, testInfo) => {
  const problems = watchErrors(page);
  const mobile = testInfo.project.name === 'movil';
  for (const [name, width, height] of sizes(mobile)) {
    await page.setViewportSize({ width, height });

    // Un alta: entre los datos de la ficha, con el día importado anterior en que no estaba.
    await page.goto(NEW);
    await waitForMap(page);
    await expect(page.getByRole('heading', { name: 'C/ Espronceda, 298' })).toBeVisible();
    const facts = page.locator('.station-detail__facts');
    await expect(facts).toContainText('Alta');
    // La hora, con el separador que ponga Intl («, 12:25» o «a las 12:25»).
    await expect(facts).toContainText(
      /12 de mayo de 2026.*12:25 · el 11 de mayo no estaba en la lista de la fuente/,
    );
    await showFacts(page);
    if (mobile) await noSideScroll(page, width);
    await shot(page, `${name}-alta`);

    // Una baja, vista después: entre los datos y en por qué no hay dato.
    await page.goto(GONE);
    await waitForMap(page);
    await expect(page.getByRole('heading', { name: 'C/ Villena, 1' })).toBeVisible();
    await expect(facts).toContainText('Baja');
    await expect(facts).toContainText(
      '26 de agosto de 2026 · el 27 de agosto ya no estaba en la lista de la fuente',
    );
    await expect(
      page.getByText(
        'La fuente dejó de publicar esta estación: el 27 de agosto de 2026 ya no estaba en su lista.',
      ),
    ).toBeVisible();
    await showFacts(page);
    if (mobile) await noSideScroll(page, width);
    await shot(page, `${name}-baja`);

    // La sección de «Qué muestra y qué no»: las dos listas, con lo que cada fecha demuestra.
    await page.getByRole('button', { name: 'Volver a la lista' }).click();
    await openSheet(page);
    const heading = page.getByRole('heading', { name: 'Altas y bajas' });
    await expect(
      page.getByText(
        'En los días importados, la fuente empezó a publicar 3 estaciones y dejó de publicar 5 estaciones.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: /^Altas/ })).toBeVisible();
    await expect(page.getByRole('heading', { level: 4, name: /^Bajas/ })).toBeVisible();
    // El nombre accesible del botón separa el nombre y el motivo con un espacio.
    await expect(
      page.getByRole('button', { name: /^C\/ Espronceda, 298\s*Desde el 12 de mayo, 12:25/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: /^C\/ Villena, 1\s*Hasta el 26 de agosto; el 27 de agosto/,
      }),
    ).toBeVisible();
    // Las que ya no están, en «Sin dato en este momento», con ese motivo y no «lleva días».
    await expect(
      page.getByRole('button', {
        name: /^C\/ Villena, 1\s*Ya no publicada: el 27 de agosto no estaba/,
      }),
    ).toBeVisible();
    await heading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    if (mobile) await noSideScroll(page, width);
    await shot(page, `${name}-limites`);
  }
  expect(problems).toEqual([]);
});

test('altas y bajas: la ficha en catalán y en inglés', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'movil', 'solo en escritorio');
  const problems = watchErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  // La fecha y la hora, como las escriba Intl en cada idioma («del 2026, a les», «12 May 2026»).
  for (const [lang, label, text] of [
    ['ca', 'Alta', /12 de maig del? 2026.*12:25 · l’11 de maig no era a la llista de la font/],
    [
      'en',
      'Added',
      /(12 May 2026|May 12, 2026).*12:25.*· not in the source’s list on (11 May|May 11)/,
    ],
  ] as const) {
    await page.goto(`${NEW}&idioma=${lang}`);
    await waitForMap(page);
    const facts = page.locator('.station-detail__facts');
    await expect(facts).toContainText(label);
    await expect(facts).toContainText(text);
    await showFacts(page);
    await shot(page, lang);
  }
  expect(problems).toEqual([]);
});
