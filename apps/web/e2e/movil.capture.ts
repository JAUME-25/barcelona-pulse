// La cabecera plegable en móvil (elegida el 7-10-2026 entre tres direcciones): capturas a 375 y
// 320 px con el mapa real, plegada y desplegada, y a qué altura empieza el mapa.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep "movil: cabecera" --project movil
// (Con `--grep movil` a secas casan todas las pruebas del proyecto «movil».)
import { expect, test, type Page } from '@playwright/test';

const VIEW = '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30';

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

for (const width of [375, 320]) {
  test(`movil: cabecera plegable a ${String(width)} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(VIEW);
    await waitForMap(page);

    // Plegada: una línea con el día de la semana y «Más»; los modos siguen arriba.
    const fold = page.locator('.source-notice__fold');
    await expect(fold).not.toHaveAttribute('open', '');
    await expect(fold.locator('summary')).toHaveText(
      /Datos reales\s*vie 28 de agosto, 08:30\s*Más/,
    );
    await expect(page.getByRole('button', { name: 'Explorar' })).toBeVisible();
    const box = await page.locator('.station-map').boundingBox();
    expect(box).not.toBeNull();
    // A 320 px, el cuarto modo («Balance», 8-10-2026) pasa a una segunda fila: unos 36 px más.
    expect(box?.y ?? 9999).toBeLessThan(width === 320 ? 340 : 300);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    console.log(
      `[movil] ${String(width)} px: el mapa empieza a ${String(Math.round(box?.y ?? -1))} px`,
    );
    await page.screenshot({ path: `captures/movil-${String(width)}.png` });

    // Desplegada: el momento con sus dos enlaces, el crédito y los enlaces de siempre.
    await fold.locator('summary').click();
    await expect(fold).toHaveAttribute('open', '');
    await expect(page.getByRole('button', { name: 'Cambiar momento' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'A esta hora' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Qué muestra y qué no' })).toBeVisible();
    await expect(fold.locator('summary')).toHaveText(/Menos$/);
    await page.screenshot({ path: `captures/movil-abierta-${String(width)}.png` });
  });
}
