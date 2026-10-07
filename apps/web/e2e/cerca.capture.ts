// «Cerca de mí» y «Cercanas» con el mapa real (no es una prueba de la CI).
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep cerca
// Necesita el histórico real importado. Además de capturar, lo usa: con la ubicación concedida,
// la lista se ordena desde donde está la persona (metros en cada fila), la ficha enseña las
// cercanas y «Volver» conserva el orden; sin permiso, el aviso dice por qué. En escritorio y a
// 375 px.
import { expect, test, type Page } from '@playwright/test';

const VIEW = '/?fuente=bicing-bcn&dia=2026-08-28&hora=08:30';
// Consell de Cent con Enric Granados (Eixample).
const ME = { latitude: 41.389, longitude: 2.157 };

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

function sizeOf(project: string) {
  return project === 'movil' ? (['375', 375, 812] as const) : (['escritorio', 1440, 900] as const);
}

test.describe('con la ubicación concedida', () => {
  test.use({ geolocation: ME, permissions: ['geolocation'] });

  test('cerca: la lista se ordena desde la persona y la ficha enseña las cercanas', async ({
    page,
  }, testInfo) => {
    const [name, width, height] = sizeOf(testInfo.project.name);
    await page.setViewportSize({ width, height });
    await page.goto(VIEW);
    await waitForMap(page);

    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await expect(page.getByText(/de más cerca a más lejos/)).toBeVisible();
    await expect(page.getByLabel('Orden')).toHaveValue('distance');
    const summaries = page.locator('.station-list__summary');
    await expect(summaries.first()).toHaveText(/^\d+ m · /);
    // Exacto: el aviso también dice «Tu ubicación no sale del navegador».
    await expect(page.getByText('Tu ubicación', { exact: true })).toBeVisible();
    // La cámara se ha ido a la persona, a nivel de calle.
    await page.waitForTimeout(1000);
    expect(page.url()).toMatch(/#mapa=1[5-8]/);
    await page.screenshot({ path: `captures/cerca-${name}.png` });

    // La ficha: las cercanas, con su distancia desde la estación.
    const first = page.locator('.station-list__name').first();
    const firstName = await first.textContent();
    await page.locator('.station-list__item').first().click();
    await expect(page.getByRole('heading', { level: 2, name: firstName ?? '' })).toBeVisible();
    const nearby = page.getByRole('region', { name: 'Cercanas' });
    await nearby.scrollIntoViewIfNeeded();
    await expect(nearby.locator('.station-list__item')).toHaveCount(5);
    await expect(nearby.locator('.station-list__summary').first()).toHaveText(/^\d+ m · /);
    await page.screenshot({ path: `captures/cercanas-${name}.png` });

    // «Volver» conserva el orden por distancia, que no va en la URL.
    await page.getByRole('button', { name: 'Volver a la lista' }).click();
    await expect(page.getByLabel('Orden')).toHaveValue('distance');
    expect(new URL(page.url()).searchParams.get('orden')).toBeNull();
  });
});

test.describe('sin permiso', () => {
  test.use({ permissions: [] });

  test('cerca: sin permiso lo dice y la lista no cambia', async ({ page }, testInfo) => {
    const [name, width, height] = sizeOf(testInfo.project.name);
    await page.setViewportSize({ width, height });
    await page.goto(VIEW);
    await waitForMap(page);
    const before = await page.locator('.station-list__name').first().textContent();

    await page.getByRole('button', { name: 'Cerca de mí' }).click();
    await expect(page.getByText(/no ha dado permiso/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Orden')).toHaveValue('name');
    expect(await page.locator('.station-list__name').first().textContent()).toBe(before);
    await page.screenshot({ path: `captures/cerca-denegado-${name}.png` });
  });
});
