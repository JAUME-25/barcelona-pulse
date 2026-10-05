// Reproduce un minuto seguido con datos reales y comprueba que la API no corta (429) y que el
// mapa sigue al reloj. Necesita la semana del 17 al 23 de agosto de 2026 importada.
//   E2E_BASE_URL=http://localhost:5173 npx playwright test --config e2e/tools.config.ts --grep medicion --project escritorio
import { expect, test } from '@playwright/test';

test('medicion: un minuto de reproducción sin pasar del límite de la API', async ({ page }) => {
  test.setTimeout(120_000);
  const stations: { at: string | null; status: number }[] = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/api/stations') {
      stations.push({ at: url.searchParams.get('at'), status: response.status() });
    }
  });

  await page.goto('/?fuente=bicing-bcn&modo=reproducir&dia=2026-08-20&hora=00:00');
  const slider = page.getByRole('slider', { name: 'Momento del día' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^00:00, .*con dato/, {
    timeout: 30_000,
  });
  await page.getByLabel('Velocidad').selectOption('lenta');
  await page.getByRole('button', { name: 'Reproducir el día' }).click();
  await page.waitForTimeout(60_000);
  await page.getByRole('button', { name: 'Pausar' }).click();

  const throttled = stations.filter((s) => s.status === 429);
  const clock = (await slider.getAttribute('aria-valuetext')) ?? '';
  console.log(
    `peticiones a /api/stations: ${String(stations.length)}; 429: ${String(throttled.length)}; reloj: ${clock.slice(0, 5)}`,
  );
  expect(throttled).toHaveLength(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  // A 5 min por fotograma cada 0,7 s, un minuto avanza unas 7 horas del día.
  expect(clock).toMatch(/^0[6-7]:\d\d,/);
});
