/**
 * Build-Konfiguration (Vite) inkl. PWA (Offline-Fähigkeit, App-Symbol, Manifest).
 *
 * BASE_PATH: Unterordner auf GitHub Pages, z. B. „/PharmaCRM/“.
 * Wird im GitHub-Workflow automatisch gesetzt (.github/workflows/deploy.yml).
 */
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const base = process.env.BASE_PATH ?? '/';
const buildDate = new Date().toISOString().slice(0, 10);

export default defineConfig({
  base,
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(`${pkg.version} (${buildDate})`),
  },
  build: {
    target: 'safari15',
    chunkSizeWarningLimit: 800,
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'RepMap',
        short_name: 'RepMap',
        description: 'Gebietskarte, Praxen, Besuche und Produkte für den Außendienst',
        lang: 'de',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f2f4f8',
        theme_color: '#1d5fbf',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App-Dateien und PLZ-Flächen werden beim ersten Öffnen für offline gespeichert
        globPatterns: ['**/*.{js,css,html,svg,png,geojson,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Bereits angesehene Kartenausschnitte offline verfügbar halten
            urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
