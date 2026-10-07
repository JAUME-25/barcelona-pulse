/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api va a la API de Docker Compose (API_PORT en .env, 5080 por defecto).
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:5080';

export default defineConfig({
  plugins: [react()],
  build: {
    // Dos páginas: la aplicación y el contrato de la API (/contrato.html), que comparte tema,
    // fuentes e idiomas pero no carga el mapa.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        contrato: fileURLToPath(new URL('./contrato.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    // Las pruebas de la página del contrato leen el OpenAPI generado por la API, fuera de la web.
    fs: { allow: ['.', fileURLToPath(new URL('../api/openapi', import.meta.url))] },
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Las peticiones de las pruebas necesitan una URL absoluta; fetch está simulado.
    env: { VITE_API_BASE_URL: 'http://api.test' },
  },
});
