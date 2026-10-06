// Fluidez del mapa con la red real (unas 540 estaciones): fotogramas por segundo y tareas largas
// mientras se arrastra el mapa y se acerca hasta ver los edificios en 3D, en cada modo.
// No es una prueba: escribe los resultados en test-results/measurements.json.
// Con la compilación de producción (sin E2E_BASE_URL, Playwright compila y abre vite preview):
//   npx playwright test --config e2e/tools.config.ts --grep fluidez
// En «movil», CPU ×4. Necesita el día 20-8-2026 importado.
import { expect, test, type Page } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';

// Con la GPU, como un navegador normal: sin ella, Chromium pinta WebGL por software.
test.use({
  launchOptions: { args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] },
});

const MODES = [
  { name: 'explorar', query: '' },
  { name: 'reproducir', query: '&modo=reproducir&dia=2026-08-20&hora=08:30' },
  { name: 'experimentar', query: '&modo=experimentar&nuevas=2.16600,41.36350' },
];

interface Sample {
  frames: number[];
  longTasks: number[];
  seconds: number;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? Number.NaN;
}

async function startCounting(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      bpFrames: number[];
      bpLongTasks: number[];
      bpStop: boolean;
      bpStart: number;
    };
    w.bpFrames = [];
    w.bpLongTasks = [];
    w.bpStop = false;
    w.bpStart = performance.now();
    let last = performance.now();
    const tick = (t: number) => {
      w.bpFrames.push(t - last);
      last = t;
      if (!w.bpStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.bpLongTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: false });
  });
}

async function stopCounting(page: Page): Promise<Sample> {
  return page.evaluate(() => {
    const w = window as unknown as {
      bpFrames: number[];
      bpLongTasks: number[];
      bpStop: boolean;
      bpStart: number;
    };
    w.bpStop = true;
    return {
      frames: w.bpFrames.slice(1),
      longTasks: w.bpLongTasks,
      seconds: (performance.now() - w.bpStart) / 1000,
    };
  });
}

/** Arrastrar a un lado y volver, y después acercar cuatro pasos y alejar otros cuatro. */
async function moveTheMap(page: Page) {
  const canvas = page.locator('.station-map__canvas canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('El mapa no se ve');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const reach = Math.min(240, box.width / 3);
  for (const dx of [reach, -reach]) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dx / 4, { steps: 40 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  for (const delta of [-240, -240, -240, -240, 240, 240, 240, 240]) {
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(450);
  }
}

for (const mode of MODES) {
  test(`medicion: fluidez del mapa al ${mode.name}`, async ({ page, browserName }, testInfo) => {
    test.setTimeout(120_000);
    const mobile = testInfo.project.name === 'movil';
    await page.goto(`/?fuente=bicing-bcn${mode.query}`);
    await page.locator('[data-map-status="ready"]').waitFor({ timeout: 60_000 });
    await expect(
      page.locator('.station-list__item, .scenario-deck, .replay-deck').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    if (mobile && browserName === 'chromium') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }

    await startCounting(page);
    await moveTheMap(page);
    const sample = await stopCounting(page);

    const frames = sample.frames;
    const summary = {
      project: testInfo.project.name,
      mode: mode.name,
      seconds: Number(sample.seconds.toFixed(1)),
      fps: Number((frames.length / sample.seconds).toFixed(1)),
      frameMsP50: Number(percentile(frames, 0.5).toFixed(1)),
      frameMsP95: Number(percentile(frames, 0.95).toFixed(1)),
      framesOver50ms: frames.filter((f) => f > 50).length,
      longTasks: sample.longTasks.length,
      longestTaskMs: Math.round(Math.max(0, ...sample.longTasks)),
      measuredAt: new Date().toISOString(),
    };
    mkdirSync('test-results', { recursive: true });
    appendFileSync('test-results/measurements.json', JSON.stringify(summary) + '\n');
    console.log(JSON.stringify(summary));
  });
}
