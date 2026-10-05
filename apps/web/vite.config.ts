/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api va a la API de Docker Compose (API_PORT en .env, 5080 por defecto).
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://127.0.0.1:5080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: apiTarget, changeOrigin: false } },
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
