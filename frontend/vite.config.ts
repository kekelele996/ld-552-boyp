import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1300,
  },
  server: {
    host: '0.0.0.0',
    port: 38402,
    proxy: {
      '/api': 'http://localhost:38502',
    },
  },
  preview: { host: '0.0.0.0', port: 38402 },
});
