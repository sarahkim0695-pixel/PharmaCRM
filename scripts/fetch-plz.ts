/**
 * Lädt die PLZ-Grenzen für Oberbayern, Niederbayern und Schwaben einmalig
 * über die Overpass-API (OpenStreetMap) und speichert sie vereinfacht als
 * `public/data/plz.geojson`. Die App lädt diese Datei – schnell und offline.
 *
 * Aufruf:  npm run plz:fetch
 *
 * Nur nötig, wenn sich PLZ-Grenzen ändern oder weitere Regionen dazukommen.
 * Wichtig: Abfragen sind auf Deutschland beschränkt (keine Treffer in Spanien o. Ä.).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { overpassToPlzFeatures, type OverpassResponse } from '../src/geo/osm';
import type { PlzFeatureCollection } from '../src/types';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'scripts', '.cache');
const RAW = join(CACHE, 'plz-raw.geojson');
const OUT = join(ROOT, 'public', 'data', 'plz.geojson');

/** Regierungsbezirke in Bayern (OSM admin_level 5) */
const EXTRA = 'extra-DE';
const REGIONS = ['Oberbayern', 'Niederbayern', 'Schwaben', EXTRA];
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

/**
 * Abfrage je Regierungsbezirk. Hinweis: Ein kleines `timeout` erhöht die Chance,
 * dass der (oft ausgelastete) Overpass-Server die Anfrage annimmt.
 */
function queryFor(region: string): string {
  if (region === EXTRA) {
    // Deutsche PLZ auf österreichischem Gebiet (Kleinwalsertal 87567–87569, Jungholz 87491)
    return `[out:json][timeout:60];
rel["boundary"="postal_code"]["postal_code:DE"];
out geom;`;
  }
  return `[out:json][timeout:180];
area["ISO3166-1"="DE"][admin_level=2]->.de;
area["ISO3166-2"="DE-BY"][admin_level=4]->.by;
rel["boundary"="administrative"]["admin_level"="5"]["name"="${region}"](area.by);
map_to_area->.region;
rel["boundary"="postal_code"]["postal_code"](area.region)(area.de);
out geom;`;
}

async function fetchRegion(region: string): Promise<OverpassResponse> {
  const cacheFile = join(CACHE, `overpass-${region}.json`);
  if (existsSync(cacheFile)) {
    console.log(`• ${region}: aus Zwischenspeicher`);
    return JSON.parse(readFileSync(cacheFile, 'utf8'));
  }
  // Overpass ist oft ausgelastet → mehrere Versuche mit wachsender Wartezeit
  for (let attempt = 1; attempt <= 6; attempt++) {
    console.log(`• ${region}: lade von Overpass, Versuch ${attempt} … (kann einige Minuten dauern)`);
    try {
      const res = await fetch(OVERPASS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'RepMap PLZ-Import (https://github.com/sarahkim0695-pixel/PharmaCRM)',
        },
        body: new URLSearchParams({ data: queryFor(region) }),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) {
        writeFileSync(cacheFile, text);
        return JSON.parse(text);
      }
      console.warn(`  Server meldet: ${res.status} ${text.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
    } catch (err) {
      console.warn(`  Verbindungsfehler: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, attempt * 30_000));
  }
  throw new Error(`Overpass hat für ${region} nicht geantwortet – später erneut versuchen.`);
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const elements: OverpassResponse['elements'] = [];
  for (const region of REGIONS) {
    const data = await fetchRegion(region);
    const rels = data.elements.filter((e) => e.type === 'relation');
    console.log(`  ${rels.length} PLZ-Relationen`);
    elements.push(...data.elements);
  }

  // Doppelte Relationen (PLZ an Bezirksgrenzen) nur einmal verwenden
  const seen = new Set<number>();
  const unique = elements.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  const { collection, rejected } = overpassToPlzFeatures({ elements: unique });
  if (rejected.length) console.warn(`⚠ verworfen: ${rejected.join(', ')}`);
  console.log(`→ ${collection.features.length} PLZ-Flächen (nur Deutschland)`);
  writeFileSync(RAW, JSON.stringify(collection));

  // Vereinfachen mit mapshaper (Topologie bleibt erhalten → keine Lücken zwischen PLZ)
  const mapshaper = join(ROOT, 'node_modules', '.bin', 'mapshaper');
  execFileSync(
    mapshaper,
    ['-i', RAW, '-simplify', '6%', 'keep-shapes', '-o', 'precision=0.00001', 'format=geojson', OUT],
    { stdio: 'inherit' },
  );

  // mapshaper macht aus einteiligen Flächen „Polygon“ – die App erwartet überall „MultiPolygon“
  const out = JSON.parse(readFileSync(OUT, 'utf8')) as PlzFeatureCollection;
  for (const f of out.features) {
    const g = f.geometry as { type: string; coordinates: unknown };
    if (g.type === 'Polygon') {
      g.type = 'MultiPolygon';
      g.coordinates = [g.coordinates];
    }
  }
  writeFileSync(OUT, JSON.stringify(out));

  // Kontrolle
  const bad = out.features.filter((f) => !/^\d{5}$/.test(f.properties.plz));
  if (bad.length) throw new Error(`Ungültige PLZ in Ausgabe: ${bad.length}`);
  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`✔ ${OUT} geschrieben (${out.features.length} PLZ, ${kb} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
