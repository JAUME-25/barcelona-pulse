// «Solo las del mapa»: la lista que sigue al mapa, con el mapa real (no es una prueba de la CI).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep "lista-mapa"
// Necesita el histórico real importado. Además de capturar, lo usa: con `lista=mapa` a nivel de
// calle la lista se queda con las estaciones a la vista, al arrastrar el mapa cambia, y al
// alejarse vuelven a entrar. En escritorio y a 375 px.
import { expect, test, type Page } from '@playwright/test';

const VIEW =
  '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30&lista=mapa#mapa=15.2/41.3955/2.1705/0/0';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

function shown(page: Page): Promise<number> {
  return page
    .locator('.panel-tools__count')
    .textContent()
    .then((text) => Number(/^(\d+)/.exec(text ?? '')?.[1]));
}

test('lista-mapa: la lista sigue al mapa', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const [name, width, height] = mobile
    ? (['375', 375, 812] as const)
    : (['escritorio', 1440, 900] as const);
  await page.setViewportSize({ width, height });
  await page.goto(VIEW);
  await waitForMap(page);

  await expect(page.getByRole('checkbox', { name: 'Solo las del mapa' })).toBeChecked();
  const atStreet = await shown(page);
  expect(atStreet).toBeGreaterThan(0);
  expect(atStreet).toBeLessThan(60);
  await page.screenshot({ path: `captures/lista-mapa-${name}.png` });

  // Mover el mapa cambia lo que se ve y, con ello, la lista. En escritorio, arrastrando con el
  // ratón; en móvil (donde el ratón de Playwright no arrastra el mapa), moviendo la cámara.
  const names = () => page.locator('.station-list__name').allTextContents();
  const before = await names();
  if (mobile) {
    await page.evaluate(() => {
      window.location.hash = '#mapa=15.2/41.3875/2.1795/0/0';
    });
  } else {
    const box = await page.locator('.station-map__canvas canvas').boundingBox();
    if (box === null) throw new Error('El mapa no tiene lienzo.');
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6 - 260, box.y + box.height * 0.5 - 120, {
      steps: 12,
    });
    await page.mouse.up();
  }
  await page.waitForTimeout(900);
  expect(await names()).not.toEqual(before);

  // Al alejarse entran muchas más.
  await page.evaluate(() => {
    window.location.hash = '#mapa=12/41.395/2.165/0/0';
  });
  await page.waitForTimeout(1500);
  expect(await shown(page)).toBeGreaterThan(atStreet * 3);
});
