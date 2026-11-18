#!/usr/bin/env node
// Generates the Android/Expo app icons from the same sync glyph and colour as the macOS icon
// (apps/desktop/assets/app-icon.svg), so every platform shows the same Synkka icon.
// Usage: node scripts/generate-icons.mjs   (then rebuild the apps)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => path.join(root, 'apps/mobile/assets', f);

// Single sources: brand colour from the design tokens, glyph from the shared icon set.
const tokens = readFileSync(path.join(root, 'packages/core/src/tokens.ts'), 'utf8');
const ACCENT = /accentDefault = '(#[0-9A-Fa-f]{6})'/.exec(tokens)[1];
const GLYPH = [
  'M21 12a9 9 0 0 1-15.5 6.2',
  'M3 12a9 9 0 0 1 15.5-6.2',
  'M18 2v4h-4',
  'M6 22v-4h4',
].map((d) => `<path d="${d}"/>`).join('');

/** Glyph (24-unit viewBox) centred on a 1024 canvas at `scale`. */
const glyph = (scale, color) => {
  const offset = 512 - 12 * scale;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g>`;
};
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;

function render(file, body, size = 1024) {
  const png = new Resvg(svg(body), { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();
  writeFileSync(out(file), png);
  console.log(`→ apps/mobile/assets/${file} (${size}px)`);
}

// Same proportions as the macOS icon: rounded square (rx 200 on 896) with the glyph at scale 25.
const macStyle = `<rect x="64" y="64" width="896" height="896" rx="200" fill="${ACCENT}"/>${glyph(25, '#FFFFFF')}`;

// Adaptive icon (108 dp canvas, ~72 dp visible after the launcher mask): glyph sized so it
// matches the macOS proportion inside the visible area and stays within the 66 dp safe zone.
const ADAPTIVE_SCALE = 19;

render('icon.png', `<rect width="1024" height="1024" fill="${ACCENT}"/>${glyph(25, '#FFFFFF')}`);
render('android-icon-background.png', `<rect width="1024" height="1024" fill="${ACCENT}"/>`);
render('android-icon-foreground.png', glyph(ADAPTIVE_SCALE, '#FFFFFF'));
render('android-icon-monochrome.png', glyph(ADAPTIVE_SCALE, '#000000'));
render('splash-icon.png', macStyle, 512);
render('favicon.png', macStyle, 48);

// macOS menu bar (template image: black + alpha, macOS tints it for light/dark menu bars).
// 22 pt tall at @2x; the glyph keeps a small margin like other menu bar icons.
{
  const tray = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-2 -2 28 28"><g fill="none" stroke="#000000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${GLYPH}</g></svg>`;
  const file = 'apps/desktop/src-tauri/icons/tray-template.png';
  writeFileSync(path.join(root, file), new Resvg(tray, { fitTo: { mode: 'width', value: 44 }, background: 'rgba(0,0,0,0)' }).render().asPng());
  console.log(`→ ${file} (44px)`);
}
