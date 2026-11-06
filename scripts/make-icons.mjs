/**
 * Erzeugt die App-Symbole (PNG) aus public/favicon.svg.
 * Aufruf: npm run icons   (braucht Playwright mit Chromium)
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/favicon.svg'), 'utf8');

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  // „maskable“: Hintergrund randlos, Motiv etwas kleiner (Sicherheitszone)
  const inner = t.maskable
    ? svg.replace('rx="112"', 'rx="0"').replace('<path', '<g transform="translate(51 51) scale(0.8)"><path').replace('</svg>', '</g></svg>')
    : svg;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner.replace('<svg ', `<svg width="${t.size}" height="${t.size}" `)}</body></html>`);
  await page.screenshot({ path: join(root, 'public/icons', t.file), omitBackground: !t.maskable });
  console.log('✔', t.file);
}
await browser.close();
