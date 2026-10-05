import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

// Herramientas que no son pruebas: capturas de revisión visual y mediciones de carga.
//   npx playwright test --config e2e/tools.config.ts --grep captura
//   npx playwright test --config e2e/tools.config.ts --grep medicion
export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: ['*.capture.ts', '*.measure.ts'],
  outputDir: '../test-results/tools',
  fullyParallel: false,
  workers: 1,
});
