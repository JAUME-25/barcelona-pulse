// Capturas de «Reproducir» con el mapa real (no es una prueba).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep reproducir
// Necesita la semana del 17 al 23 de agosto de 2026 importada y el demo.
// Además de capturar, lo usa: pista, botones de ±5 min, teclado, reproducir y pausar y días.
import { expect, test, type Page } from '@playwright/test';

const REAL = '/?fuente=bicing-bcn&modo=reproducir&dia=2026-08-20&hora=08:30';
const DEMO = '/?fuente=demo&modo=reproducir&hora=08:30';

async function waitForReplay(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await expect(page.getByRole('slider', { name: 'Momento del día' })).toHaveAttribute(
    'aria-valuetext',
    /con dato|Sin datos/,
    { timeout: 15_000 },
  );
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

async function showDeck(page: Page) {
  await page.locator('.replay-deck').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
}

test('reproducir: un día real y el demo con huecos', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'movil';
  const shot = (name: string) =>
    page.screenshot({ path: `captures/reproducir-${testInfo.project.name}-${name}.png` });

  await page.goto(REAL);
  await waitForReplay(page);
  const slider = page.getByRole('slider', { name: 'Momento del día' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^08:30, jueves, 20 de agosto de 2026\./);
  if (mobile) await shot('inicio');
  await showDeck(page);
  await shot('0830');

  // Botones de ±5 min.
  await page.getByRole('button', { name: '5 minutos después' }).click();
  await expect(slider).toHaveAttribute('aria-valuetext', /^08:35,/);
  await page.getByRole('button', { name: '5 minutos antes' }).click();
  await page.getByRole('button', { name: '5 minutos antes' }).click();
  await expect(slider).toHaveAttribute('aria-valuetext', /^08:25,/);

  // Pulsar a tres cuartos de la pista: hacia las 18:00.
  const box = await slider.boundingBox();
  if (box === null) throw new Error('La pista no se ve');
  await page.mouse.click(box.x + box.width * 0.75, box.y + 40);
  await expect(slider).toHaveAttribute('aria-valuetext', /^(17:5\d|18:0\d),/);

  // Teclado: principio del día y de hora en hora.
  await slider.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('PageDown');
  await expect(slider).toHaveAttribute('aria-valuetext', /^01:00,/);
  await page.keyboard.press('PageDown');
  await page.keyboard.press('PageDown');
  await expect(slider).toHaveAttribute('aria-valuetext', /^03:00,/);

  // Reproducir y pausar: el reloj avanza.
  await page.getByRole('button', { name: 'Reproducir el día' }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(slider).not.toHaveAttribute('aria-valuetext', /^03:00,/);

  // Otro día desde su reloj.
  await page.getByRole('button', { name: 'dom 23' }).click();
  await expect(page.getByRole('button', { name: 'dom 23' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(slider).toHaveAttribute('aria-valuetext', /domingo, 23 de agosto de 2026/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await shot('domingo');

  // El demo tiene huecos: así se ven las horas sin datos.
  await page.goto(DEMO);
  await waitForReplay(page);
  await showDeck(page);
  await shot('demo');

  // El móvil más estrecho que se admite.
  if (mobile) {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(REAL);
    await waitForReplay(page);
    await showDeck(page);
    await shot('320');
  }
});
