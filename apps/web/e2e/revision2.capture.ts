// Capturas de la segunda revisión del diseño (8-10-2026): cabecera con la explicación del modo,
// leyenda al reproducir, pliegue de la leyenda en móvil y aviso al pasar por un marcador. Con el
// mapa real. No es una prueba.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep "revision2"
import { test, type Page } from '@playwright/test';

const BASE = '/?fuente=bicing-bcn&dia=2026-05-13&hora=08:30';
const LANGS = ['es', 'ca', 'en'] as const;

async function waitForMap(page: Page) {
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
}

/** Alto de la leyenda y de lo que contiene: si el contenido mide más, se desplaza dentro. */
async function legendFit(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('.map-legend');
    if (el === null) return 'sin leyenda';
    const r = el.getBoundingClientRect();
    return `leyenda ${String(Math.round(r.height))} px, contenido ${String(el.scrollHeight)} px`;
  });
}

/** Proyección de Mercator a píxeles del mapa, con la cámara plana (sin rumbo ni inclinación). */
function project(zoom: number, center: [number, number], width: number, height: number) {
  const world = 512 * 2 ** zoom;
  const x = (lon: number) => ((lon + 180) / 360) * world;
  const y = (lat: number) =>
    ((180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360) *
    world;
  return (lon: number, lat: number) => ({
    x: width / 2 + x(lon) - x(center[0]),
    y: height / 2 + y(lat) - y(center[1]),
  });
}

interface StationPoint {
  longitude: number;
  latitude: number;
}

test('revision2: vistas', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const mobile = testInfo.project.name === 'movil';
  const shot = (name: string) =>
    page.screenshot({ path: `captures/revision2-${testInfo.project.name}-${name}.png` });

  for (const lang of LANGS) {
    await page.goto(`${BASE}&idioma=${lang}`);
    await waitForMap(page);
    await shot(`${lang}-explorar`);
  }

  await page.goto(`${BASE}&modo=reproducir`);
  await waitForMap(page);
  await page.waitForTimeout(1500);
  await shot('es-reproducir');
  console.log(`[${testInfo.project.name}] reproducir: ${await legendFit(page)}`);

  if (!mobile) {
    // Al pasar el ratón por un marcador: a escala de calle y con la cámara plana, para saber
    // dónde cae cada estación en pantalla.
    const zoom = 15.3;
    const center: [number, number] = [2.1715, 41.3935];
    await page.goto(`${BASE}#mapa=${String(zoom)}/${String(center[1])}/${String(center[0])}/0/0`);
    await waitForMap(page);
    const box = await page.locator('.station-map__canvas').boundingBox();
    const response = await page.request.get(
      '/api/stations?source=bicing-bcn&at=2026-05-13T06:30:00Z',
    );
    const { stations } = (await response.json()) as { stations: StationPoint[] };
    if (box !== null) {
      const at = project(zoom, center, box.width, box.height);
      // La estación más cercana al centro de la parte del mapa que no tapa el panel.
      const target = { x: box.width * 0.62, y: box.height * 0.5 };
      const nearest = stations
        .map((s) => at(s.longitude, s.latitude))
        .sort(
          (a, b) =>
            Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
        )[0];
      if (nearest !== undefined) {
        await page.mouse.move(box.x + nearest.x, box.y + nearest.y);
        await page.waitForTimeout(400);
      }
    }
    await shot('es-calle-aviso');

    await page.goto(
      `${BASE}&modo=balance#mapa=${String(zoom)}/${String(center[1])}/${String(center[0])}/0/0`,
    );
    await waitForMap(page);
    await page.waitForTimeout(1500);
    if (box !== null) {
      const at = project(zoom, center, box.width, box.height);
      const target = { x: box.width * 0.62, y: box.height * 0.5 };
      const nearest = stations
        .map((s) => at(s.longitude, s.latitude))
        .sort(
          (a, b) =>
            Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y),
        )[0];
      if (nearest !== undefined) {
        await page.mouse.move(box.x + nearest.x, box.y + nearest.y);
        await page.waitForTimeout(400);
      }
    }
    await shot('es-balance-aviso');

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${BASE}&modo=reproducir`);
    await waitForMap(page);
    await page.waitForTimeout(1500);
    await shot('es-1366-reproducir');
    console.log(`[1366x768] reproducir: ${await legendFit(page)}`);
    await page.locator('.legend-fold__summary').click();
    await page.waitForTimeout(300);
    await shot('es-1366-reproducir-leyenda');
    console.log(`[1366x768] reproducir, leyenda abierta: ${await legendFit(page)}`);
  } else {
    await page.goto(BASE);
    await waitForMap(page);
    await page.locator('.legend-fold__summary').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot('es-leyenda-plegada');
    await page.locator('.legend-fold__summary').click();
    await page.waitForTimeout(300);
    await shot('es-leyenda-abierta');

    await page.setViewportSize({ width: 320, height: 712 });
    await page.goto(BASE);
    await waitForMap(page);
    await shot('es-320-explorar');
    await page.locator('.legend-fold__summary').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot('es-320-leyenda-plegada');
    await page.goto(`${BASE}&modo=reproducir`);
    await waitForMap(page);
    await page.waitForTimeout(1500);
    await shot('es-320-reproducir');
  }
});
