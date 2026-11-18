import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: SYNKKA_ST_URL + SYNKKA_ST_KEY proxy /rest to a Syncthing instance so the browser
// preview can run against a real engine (the key stays in the dev server, never in the page).
const stUrl = process.env.SYNKKA_ST_URL;
const stKey = process.env.SYNKKA_ST_KEY ?? '';

// Tauri expects a fixed port and no screen clearing (see tauri.conf.json devUrl).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: { 'import.meta.env.VITE_ST_PROXY': JSON.stringify(stUrl ? '1' : '') },
  server: {
    port: 1420,
    strictPort: true,
    proxy: stUrl ? { '/rest': { target: stUrl, headers: { 'X-API-Key': stKey } } } : undefined,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022', outDir: 'dist' },
});
