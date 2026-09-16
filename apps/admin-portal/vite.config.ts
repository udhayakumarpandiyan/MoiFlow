import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@moiflow/shared': fileURLToPath(new URL('../../shared/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // DEV ONLY: proxy /api to the local backend. In production the client
      // prepends VITE_API_URL (see src/api/client.ts + .env.production) and
      // calls the API host directly, so this proxy is not used.
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
