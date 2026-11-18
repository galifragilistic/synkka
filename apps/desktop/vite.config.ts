import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Dev only: SYNKKA_ST_URL + SYNKKA_ST_KEY proxy /rest to a Syncthing instance so the browser
// preview can run against a real engine (the key stays in the dev server, never in the page).
const stUrl = process.env.SYNKKA_ST_URL;
const stKey = process.env.SYNKKA_ST_KEY ?? '';

// Tauri expects a fixed port and no screen clearing (see tauri.conf.json devUrl).
/** Dev-only stand-in for the Tauri ignore-file commands (same rule: only <folder>/.stglobalignore). */
const devIgnoreFile = {
  name: 'synkka-dev-ignores',
  configureServer(server: { middlewares: { use: (p: string, h: (req: any, res: any) => void) => void } }) {
    server.middlewares.use('/__synkka/ignores', (req, res) => {
      const folder = new URL(req.url, 'http://x').searchParams.get('path') ?? '';
      const file = path.join(path.resolve(folder), '.stglobalignore');
      if (req.method === 'PUT') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c));
        req.on('end', () => {
          writeFileSync(file, body);
          res.end();
        });
        return;
      }
      if (!existsSync(file)) {
        res.statusCode = 404;
        return res.end();
      }
      res.end(readFileSync(file, 'utf8'));
    });
  },
};

export default defineConfig({
  plugins: stUrl ? [react(), devIgnoreFile] : [react()],
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
