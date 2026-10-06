// Reproduce un día entero a la velocidad más alta con datos reales: cuenta peticiones (una por
// hora con fotogramas, ninguna a /api/stations), comprueba que la API no corta (429) y mide las
// tareas largas del navegador (tirones). Necesita la semana del 17 al 23-8-2026 importada.
// Con la compilación de producción (sin E2E_BASE_URL, Playwright compila y abre vite preview):
//   npx playwright test --config e2e/tools.config.ts --grep "un día a la velocidad" --project escritorio
import { expect, test } from '@playwright/test';

// Con la GPU (Direct3D en Windows), como un navegador normal. Sin ventana, Chromium dibuja WebGL
// por software: con el servidor de desarrollo, cada paso tardaba ~260 ms en vez de 150.
test.use({
  launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
});

test('medicion: un día a la velocidad más alta sin pasar del límite de la API', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const requests: { path: string; status: number }[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/'))
      requests.push({ path: url.pathname, status: response.status() });
  });

  await page.goto('/?fuente=bicing-bcn&modo=reproducir&dia=2026-08-20&hora=00:00');
  const slider = page.getByRole('slider', { name: 'Momento del día' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^00:00, .*con dato/, {
    timeout: 30_000,
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    const w = window as unknown as { longTasks: number[] };
    w.longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
  const before = requests.length;
  const started = Date.now();

  await page.getByLabel('Velocidad').selectOption('rapida');
  await page.getByRole('button', { name: 'Reproducir el día' }).click();
  // Al llegar al final se para sola.
  await expect(page.getByRole('button', { name: 'Reproducir el día' })).toBeVisible({
    timeout: 90_000,
  });
  const seconds = (Date.now() - started) / 1000;

  const during = requests.slice(before);
  const longTasks = await page.evaluate(
    () => (window as unknown as { longTasks: number[] }).longTasks,
  );
  const clock = (await slider.getAttribute('aria-valuetext')) ?? '';
  console.log(
    [
      `duración: ${seconds.toFixed(1)} s; reloj al final: ${clock.slice(0, 5)}`,
      `peticiones: ${String(during.length)} (fotogramas ${String(during.filter((r) => r.path.endsWith('/frames')).length)}, /api/stations ${String(during.filter((r) => r.path === '/api/stations').length)}, 429: ${String(during.filter((r) => r.status === 429).length)})`,
      `tareas largas: ${String(longTasks.length)}, la mayor ${Math.max(0, ...longTasks).toFixed(0)} ms, total ${longTasks.reduce((a, b) => a + b, 0).toFixed(0)} ms`,
    ].join('\n'),
  );

  expect(clock).toMatch(/^23:55,/);
  expect(during.filter((r) => r.status === 429)).toHaveLength(0);
  expect(during.filter((r) => r.path === '/api/stations')).toHaveLength(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
