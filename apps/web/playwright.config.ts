import { defineConfig, devices } from '@playwright/test';

// Requiere la API local con el demo importado (ver README, «Pruebas»).
// Por defecto compila y sirve el frontend con `vite preview`, que reenvía /api a la API.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'America/New_York', // a propósito: las horas deben salir en hora de Barcelona igualmente
    trace: 'retain-on-failure',
  },
  webServer:
    process.env.E2E_BASE_URL === undefined
      ? {
          command: 'npm run build && npm run preview',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 180_000,
        }
      : undefined,
  projects: [
    {
      name: 'escritorio',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'movil',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
