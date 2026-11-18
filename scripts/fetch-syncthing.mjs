#!/usr/bin/env node
// Downloads the official Syncthing release for the desktop app, verifies its SHA-256 against
// the release's sha256sum file, and places it where Tauri expects sidecars:
//   apps/desktop/src-tauri/binaries/syncthing-<target-triple>[.exe]
// Usage: node scripts/fetch-syncthing.mjs [macos|windows]   (default: current OS)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SYNCTHING_VERSION = 'v2.1.7';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'apps/desktop/src-tauri/binaries');
const target = process.argv[2] ?? (process.platform === 'win32' ? 'windows' : 'macos');

const PLATFORMS = {
  macos: {
    asset: `syncthing-macos-universal-${SYNCTHING_VERSION}.zip`,
    exe: 'syncthing',
    // One universal binary serves every macOS target triple Tauri may build for.
    triples: ['aarch64-apple-darwin', 'x86_64-apple-darwin', 'universal-apple-darwin'],
  },
  windows: {
    asset: `syncthing-windows-amd64-${SYNCTHING_VERSION}.zip`,
    exe: 'syncthing.exe',
    triples: ['x86_64-pc-windows-msvc'],
  },
};

const p = PLATFORMS[target];
if (!p) throw new Error(`Unknown platform ${target}`);

const base = `https://github.com/syncthing/syncthing/releases/download/${SYNCTHING_VERSION}`;
const want = (name) => p.triples.map((t) => path.join(outDir, `syncthing-${t}${name.endsWith('.exe') ? '.exe' : ''}`));
if (want(p.exe).every(existsSync)) {
  console.log(`Syncthing ${SYNCTHING_VERSION} (${target}) already present.`);
  process.exit(0);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const sums = (await download(`${base}/sha256sum.txt.asc`)).toString('utf8');
const expected = sums.split('\n').find((l) => l.trim().endsWith(p.asset))?.split(/\s+/)[0];
if (!expected) throw new Error(`No checksum for ${p.asset}`);

console.log(`Downloading ${p.asset}…`);
const zip = await download(`${base}/${p.asset}`);
const actual = createHash('sha256').update(zip).digest('hex');
if (actual !== expected) throw new Error(`Checksum mismatch for ${p.asset}: ${actual} != ${expected}`);

const tmp = mkdtempSync(path.join(tmpdir(), 'synkka-st-'));
const zipPath = path.join(tmp, p.asset);
writeFileSync(zipPath, zip);
execFileSync('tar', ['-xf', zipPath, '-C', tmp]); // bsdtar handles zip on macOS and Windows
const dir = readdirSync(tmp).find((d) => d.startsWith('syncthing-') && !d.endsWith('.zip'));
const exe = path.join(tmp, dir, p.exe);

mkdirSync(outDir, { recursive: true });
for (const dest of want(p.exe)) {
  copyFileSync(exe, dest);
  chmodSync(dest, 0o755);
  console.log(`→ ${path.relative(root, dest)}`);
}
copyFileSync(path.join(tmp, dir, 'LICENSE.txt'), path.join(outDir, 'SYNCTHING-LICENSE.txt'));
console.log(`Syncthing ${SYNCTHING_VERSION} ready (sha256 ${actual.slice(0, 12)}…).`);
