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
      // Proxy API calls to the FastAPI backend during development.
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
