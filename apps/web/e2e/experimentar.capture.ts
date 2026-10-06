// Capturas de «Experimentar» con el mapa real (no es una prueba).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep experimentar
// Necesita la red real importada (bicing-bcn) y las áreas de estudio (ingest study-areas).
// Además de capturar, la usa: añade una estación tocando el mapa, deshace, carga un escenario,
// mueve, quita y recupera una estación real, cambia radio y área, y comprueba el aviso.
// En móvil, capturas de la pantalla del teléfono (no de página completa: en páginas muy largas
// Chromium no pinta el WebGL del mapa en la captura).
import { expect, test, type Page } from '@playwright/test';

const BASE = '/?fuente=bicing-bcn&modo=experimentar';
// Dos nuevas sin cobertura (Montjuïc y Zona Franca), una quitada (C/ 60, 25) y una movida
// (Pg. Zona Franca, 9) en la Zona Franca, con sus identificadores de Bicing.
const CHANGES =
  '&nuevas=2.16600,41.36350;2.13500,41.34500&retiradas=10&trasladadas=437:2.15200,41.35600';
// Encuadre con los cuatro cambios a la vista en escritorio (a la derecha del panel).
const ZONA_FRANCA = '#mapa=13.6/41.3415/2.1483/-12/45';
const ZONA_FRANCA_MOBILE = '#mapa=13.2/41.3530/2.1500/-12/45';

// Una estación nueva donde la red real ya lo cubre todo a 400 m (Navas): no gana nada, y la
// pantalla tiene que decirlo y enseñar su alcance. Y otra en Montjuïc, que gana su círculo.
const COVERED = '&radio=400&nuevas=2.18350,41.41650#mapa=15/41.4165/2.1835/-12/45';
const UNCOVERED = '&nuevas=2.16600,41.36350#mapa=15/41.3635/2.1660/-12/45';
const COVERED_NOTE =
  'Esta estación no añade superficie: en Barcelona, todo lo que está a menos de 400 m de ella ya lo cubre la red real.';

async function waitForScenario(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await expect(page.getByText('Calculando la cobertura…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.pending-note')).toHaveText('', { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function scrollTo(page: Page, selector: string, block: 'start' | 'center' = 'start') {
  await page
    .locator(selector)
    .first()
    .evaluate((el, where) => {
      el.scrollIntoView({ block: where });
    }, block);
  await page.waitForTimeout(700);
}

function shooter(page: Page, project: string) {
  return (name: string) =>
    page.screenshot({ path: `captures/experimentar-${project}-${name}.png` });
}

test('experimentar: añadir tocando el mapa, deshacer y un escenario con cambios', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const shot = shooter(page, testInfo.project.name);

  await page.goto(BASE);
  await waitForScenario(page);
  await shot('inicio');

  // Añadir una estación tocando el centro del mapa y quitarla desde la lista de cambios.
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  const canvas = page.locator('.station-map__canvas canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('El mapa no se ve');
  const center = { x: box.width / 2, y: box.height / 2 };
  if (mobile) await canvas.tap({ position: center });
  else await canvas.click({ position: center });
  await expect(page.getByText('Nueva 1')).toBeVisible({ timeout: 10_000 });
  expect(page.url()).toContain('nuevas=');
  await waitForScenario(page);
  if (!mobile) await shot('anadida');
  await page.getByRole('button', { name: 'Quitar: Nueva 1' }).click();
  await expect(page.getByText('Nueva 1')).toHaveCount(0);

  // Un escenario con cambios, de cerca.
  if (!mobile) {
    await page.goto(`${BASE}${CHANGES}${ZONA_FRANCA}`);
    await waitForScenario(page);
    await shot('cambios');
    return;
  }
  for (const [name, width, height] of [
    ['375', 375, 812],
    ['320', 320, 640],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`${BASE}${CHANGES}${ZONA_FRANCA_MOBILE}`);
    await waitForScenario(page);
    // Nada se sale por los lados.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await shot(`${name}-arriba`);
    await scrollTo(page, '.map-area');
    await shot(`${name}-mapa`);
    await scrollTo(page, '.scenario-deck');
    await shot(`${name}-mando`);
    await scrollTo(page, '.scenario-panel');
    await shot(`${name}-panel`);
  }
});

test('experimentar: aviso y alcance de una estación en zona ya cubierta', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const shot = shooter(page, testInfo.project.name);

  await page.goto(`${BASE}${COVERED}`);
  await waitForScenario(page);
  const note = page.getByText(COVERED_NOTE);
  await expect(note).toBeVisible();
  await expect(page.getByText('sin cambio', { exact: true })).toBeVisible();
  if (mobile) {
    await scrollTo(page, '.map-area');
    await shot('alcance-mapa');
    await scrollTo(page, '.no-effect-note', 'center');
  }
  await shot('alcance-cubierta');

  await page.goto(`${BASE}${UNCOVERED}`);
  await waitForScenario(page);
  await expect(page.locator('.no-effect-note')).toHaveCount(0);
  if (mobile) await scrollTo(page, '.map-area');
  await shot('alcance-sin-cubrir');
});

// Con la cámara cenital sobre una estación conocida (PG. ZONA FRANCA, 9): queda en el centro
// exacto del mapa.
test('experimentar: mover, quitar y recuperar una estación real; radio y área', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'movil', 'Con ratón; el toque se prueba al añadir.');
  // Su identificador en Bicing: es el que va en la URL.
  const station = '437';
  await page.goto(`${BASE}#mapa=17/41.3513237/2.1450958/0/0`);
  await waitForScenario(page);
  const canvas = page.locator('.station-map__canvas canvas');
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('El mapa no se ve');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Mover: arrastrar la estación 120 px a la derecha.
  await page.getByRole('button', { name: 'Mover', exact: true }).click();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy, { steps: 6 });
  await page.mouse.move(cx + 120, cy, { steps: 6 });
  await page.mouse.up();
  const moved = page.getByText('movida', { exact: true });
  const removed = page.getByText('quitada', { exact: true });
  await expect(moved).toBeVisible();
  expect(page.url()).toContain(`trasladadas=${station}%3A`);
  await waitForScenario(page);

  // Quitar: tocarla en su sitio nuevo.
  await page.getByRole('button', { name: 'Quitar', exact: true }).click();
  await page.mouse.click(cx + 120, cy);
  await expect(removed).toBeVisible();
  await expect(moved).toHaveCount(0);
  expect(page.url()).toContain(`retiradas=${station}`);
  await waitForScenario(page);
  await page.screenshot({ path: 'captures/experimentar-escritorio-quitada.png' });

  // Recuperarla desde la lista.
  await page.getByRole('button', { name: /^Recuperar: / }).click();
  await expect(page.getByText('Todavía es la red real.')).toBeVisible();
  expect(page.url()).not.toContain('retiradas=');

  // Radio con el teclado y otra área de estudio.
  const radius = page.getByRole('slider', { name: /Radio/ });
  await radius.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(radius).toHaveAttribute('aria-valuetext', '400 metros');
  await page.getByLabel('Área de estudio').selectOption('districte-02');
  await waitForScenario(page);
  await expect(page.getByText(/Del área de Eixample .* a menos de 400 m/)).toBeVisible();
  expect(page.url()).toContain('radio=400');
  expect(page.url()).toContain('area=districte-02');
});
