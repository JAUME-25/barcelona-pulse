// Capturas de la aplicación en catalán e inglés con el mapa real (no es una prueba): las cuatro
// vistas en cada idioma, a 1440, 375 y 320 px, y el selector usado como lo usaría alguien.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep idiomas
// Necesita la red real importada (bicing-bcn, mayo de 2026) y las áreas de estudio. Además de
// capturar, busca en el texto visible palabras que solo pueden ser castellano (o catalán, en
// inglés): un texto que se haya quedado sin traducir.
import { expect, test, type Page } from '@playwright/test';

const REAL = '/?fuente=bicing-bcn';

// Cinco vistas por tamaño, cada una con el mapa cargado: no cabe en los 30 s por defecto.
test.describe.configure({ timeout: 240_000 });

type Lang = 'es' | 'ca' | 'en';

const SPANISH = [
  'estaciones',
  'Sin',
  'datos',
  'Cargando',
  'Volver',
  'Qué',
  'llenas',
  'anclajes',
  'Buscar',
  'Reintentar',
  'hipotético',
  'Escenario',
  'Semana',
  'Velocidad',
  'Huecos',
  'desde',
];
const CATALAN = [
  'estacions',
  'Sense',
  'dades',
  'Carregant',
  'Tornar',
  'Què',
  'ancoratges',
  'Cercar',
  'Escenari',
  'Setmana',
  'des',
];

/** Palabras que en ese idioma no deberían salir. Los nombres de calles y barrios son datos. */
const FOREIGN: Record<Exclude<Lang, 'es'>, readonly string[]> = {
  ca: SPANISH,
  en: [...SPANISH, ...CATALAN],
};

/** Palabras enteras, con letras acentuadas: «Què» no es «Qu» seguido de algo. */
const wordsIn = (text: string, words: readonly string[]) =>
  text.match(new RegExp(`(?<!\\p{L})(${words.join('|')})(?!\\p{L})`, 'gu'));

const VIEWS = [
  ['explorar', ''],
  ['estacion', '&estacion=1'],
  ['reproducir', '&modo=reproducir&dia=2026-05-20&hora=10:00'],
  ['experimentar', '&modo=experimentar&nuevas=2.16600,41.36350'],
  ['limites', '&vista=limites'],
] as const;

const PANEL: Partial<Record<(typeof VIEWS)[number][0], string>> = {
  estacion: '.station-detail',
  experimentar: '.scenario-panel',
  limites: '.limits-sheet',
};

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
}

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  return problems;
}

function sizes(mobile: boolean) {
  return mobile
    ? ([
        ['375', 375, 812],
        ['320', 320, 640],
      ] as const)
    : ([['escritorio', 1440, 900]] as const);
}

/** Lo que se ve escrito fuera de la lista de estaciones (sus nombres son datos). */
async function interfaceText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const copy = document.body.cloneNode(true) as HTMLElement;
    copy
      .querySelectorAll(
        'noscript, script, style, .station-list, .station-detail__name, .station-detail__area, .silent-group__name, .changes-list__name',
      )
      .forEach((el) => {
        el.remove();
      });
    return copy.innerText;
  });
}

async function settle(page: Page, view: string) {
  if (view === 'experimentar') {
    await expect(page.locator('.scenario-status')).toHaveCount(0, { timeout: 15_000 });
  }
  if (view === 'limites') {
    await expect(page.locator('.hole-grid')).toBeVisible({ timeout: 30_000 });
  }
  if (view === 'reproducir') {
    await expect(page.locator('.gap-caption')).toBeVisible({ timeout: 20_000 });
  }
}

for (const lang of ['ca', 'en'] as const) {
  test(`idiomas: ${lang}, las cuatro vistas`, async ({ page }, testInfo) => {
    const problems = watchErrors(page);
    const mobile = testInfo.project.name === 'movil';
    for (const [size, width, height] of sizes(mobile)) {
      await page.setViewportSize({ width, height });
      for (const [view, query] of VIEWS) {
        await page.goto(`${REAL}${query}&idioma=${lang}`);
        await waitForMap(page);
        await settle(page, view);
        expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        const leftovers = wordsIn(await interfaceText(page), FOREIGN[lang]);
        expect(leftovers, `${lang} ${size} ${view}`).toBeNull();
        await page.screenshot({ path: `captures/idiomas-${lang}-${size}-${view}.png` });
        if (mobile && view !== 'explorar') {
          await page.locator('.map-area').scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          await page.screenshot({ path: `captures/idiomas-${lang}-${size}-${view}-abajo.png` });
          // En móvil, la ficha va bajo el mapa.
          const sheet = PANEL[view];
          if (sheet !== undefined) {
            await page.locator(sheet).evaluate((el) => {
              el.scrollIntoView({ block: 'start' });
            });
            await page.waitForTimeout(400);
            await page.screenshot({ path: `captures/idiomas-${lang}-${size}-${view}-ficha.png` });
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
}

test('idiomas: el selector cambia el idioma y conserva el resto', async ({ page }, testInfo) => {
  const problems = watchErrors(page);
  const mobile = testInfo.project.name === 'movil';
  for (const [size, width, height] of sizes(mobile)) {
    await page.setViewportSize({ width, height });
    await page.goto(`${REAL}&modo=reproducir&dia=2026-05-20&hora=10:00`);
    await waitForMap(page);
    await expect(page.getByRole('button', { name: 'Español' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.screenshot({ path: `captures/idiomas-es-${size}-reproducir.png` });

    await page.getByRole('button', { name: 'Català' }).click();
    await expect(page.getByRole('button', { name: 'Català' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Reproduir un dia' })).toBeAttached();
    await expect(page).toHaveURL(/idioma=ca/);
    await expect(page).toHaveURL(/dia=2026-05-20/);
    await expect(page).toHaveURL(/hora=10%3A00|hora=10:00/);

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'English' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Replay a day' })).toBeAttached();
    await waitForMap(page);
    await page.screenshot({ path: `captures/idiomas-en-${size}-selector.png` });

    // Una recarga se queda en el idioma elegido: va en la URL.
    await page.reload();
    await waitForMap(page);
    await expect(page.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Español' }).click();
    await expect(page.getByRole('region', { name: 'Reproducir un día' })).toBeAttached();
  }
  expect(problems).toEqual([]);
});
