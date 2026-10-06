// Dónde se va el tiempo de la carga con la red real en un móvil medio (CPU ×4): cuándo llegan
// los recursos y las respuestas de la API, cuándo aparece la lista en el DOM y qué tareas largas
// ocupan el hilo principal. Tiempos del propio navegador (performance.now). No es una prueba.
// Con la compilación de producción:
//   npx playwright test --config e2e/tools.config.ts --grep perfil --project movil
import { test } from '@playwright/test';

interface Profile {
  tasks: { start: number; duration: number }[];
  listAt: number | null;
  resources: { name: string; start: number; end: number; kb: number }[];
  domContentLoaded: number;
}

test('medicion: perfil de la carga con la red real', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'Usa CDP');
  test.setTimeout(120_000);
  const mobile = testInfo.project.name === 'movil';
  const cdp = await page.context().newCDPSession(page);
  if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // Antes que el código de la app: tareas largas y el momento en que aparece la primera fila.
  await page.addInitScript(() => {
    const w = window as unknown as { bpTasks: Profile['tasks']; bpListAt: number | null };
    w.bpTasks = [];
    w.bpListAt = null;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries())
        w.bpTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ type: 'longtask', buffered: true });
    new MutationObserver((_, observer) => {
      if (document.querySelector('.station-list__item') !== null) {
        w.bpListAt = performance.now();
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/?fuente=bicing-bcn', { waitUntil: 'domcontentloaded' });
  await page.locator('.station-list__item').first().waitFor();
  await page.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });

  const profile = await page.evaluate((): Profile => {
    const w = window as unknown as { bpTasks: Profile['tasks']; bpListAt: number | null };
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      tasks: w.bpTasks,
      listAt: w.bpListAt,
      domContentLoaded: nav.domContentLoadedEventEnd,
      resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter((r) => r.name.includes('/api/') || r.name.endsWith('.js'))
        .map((r) => ({
          name: new URL(r.name).pathname,
          start: Math.round(r.startTime),
          end: Math.round(r.responseEnd),
          kb: Math.round(r.transferSize / 1024),
        })),
    };
  });
  console.log(
    JSON.stringify(
      {
        project: testInfo.project.name,
        domContentLoaded: Math.round(profile.domContentLoaded),
        listAt: profile.listAt === null ? null : Math.round(profile.listAt),
        resources: profile.resources,
      },
      null,
      1,
    ),
  );
  console.log(
    'tareas largas (inicio+duración, ms):',
    profile.tasks.map((t) => `${t.start.toFixed(0)}+${t.duration.toFixed(0)}`).join(' '),
  );
});
