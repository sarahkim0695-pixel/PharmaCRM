/**
 * PLZ-Flächen laden.
 *
 * 1. Mitgelieferte Datei `public/data/plz.geojson` (Ober-/Niederbayern, Schwaben).
 *    Sie wird vom Service Worker gespeichert und ist damit offline verfügbar.
 * 2. Zusätzliche PLZ, die dort fehlen, werden bei Bedarf über die Overpass-API
 *    (nur Deutschland) nachgeladen und im Gerät gespeichert.
 */
import { store } from '../state/store';
import type { PlzFeature, PlzFeatureCollection } from '../types';
import { overpassQueryForPlz, overpassToPlzFeatures, type OverpassResponse } from './osm';

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

let basePromise: Promise<Map<string, PlzFeature>> | null = null;

/** Lädt die mitgelieferte PLZ-Datei (nur einmal). */
export function loadBaseShapes(): Promise<Map<string, PlzFeature>> {
  if (!basePromise) {
    basePromise = fetch(`${import.meta.env.BASE_URL}data/plz.geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(`PLZ-Daten nicht gefunden (${r.status})`);
        return r.json() as Promise<PlzFeatureCollection>;
      })
      .then((fc) => new Map(fc.features.map((f) => [f.properties.plz, f])))
      .catch((err) => {
        basePromise = null; // später erneut versuchen
        throw err;
      });
  }
  return basePromise;
}

/** Alle bekannten PLZ-Flächen (mitgeliefert + nachgeladen). */
export async function allShapes(): Promise<Map<string, PlzFeature>> {
  const base = await loadBaseShapes();
  if (!store.extraShapes.size) return base;
  return new Map([...base, ...store.extraShapes]);
}

/** Lädt fehlende PLZ-Flächen über Overpass nach (nur Deutschland). */
export async function fetchMissingShapes(plzList: string[]): Promise<{ found: string[]; missing: string[] }> {
  const known = await allShapes();
  const wanted = plzList.filter((p) => !known.has(p));
  if (!wanted.length) return { found: [], missing: [] };

  const found: PlzFeature[] = [];
  // In Paketen zu 40 PLZ abfragen, damit die Anfragen klein bleiben
  for (let i = 0; i < wanted.length; i += 40) {
    const chunk = wanted.slice(i, i + 40);
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ data: overpassQueryForPlz(chunk) }),
    });
    if (!res.ok) throw new Error(`Overpass-Server antwortet nicht (${res.status}). Bitte später erneut versuchen.`);
    const data = (await res.json()) as OverpassResponse;
    found.push(...overpassToPlzFeatures(data).collection.features.filter((f) => chunk.includes(f.properties.plz)));
  }
  await store.saveExtraShapes(found);
  const foundSet = new Set(found.map((f) => f.properties.plz));
  return { found: [...foundSet], missing: wanted.filter((p) => !foundSet.has(p)) };
}

/** Grober Mittelpunkt der größten Teilfläche – für die PLZ-Beschriftung. */
export function labelPoint(f: PlzFeature): [number, number] {
  let best: number[][] = [];
  let bestArea = -1;
  for (const poly of f.geometry.coordinates) {
    const ring = poly[0];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of ring) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  // Schwerpunkt des Rings (Flächenschwerpunkt)
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = best.length - 1; i < best.length; j = i++) {
    const f2 = best[j][0] * best[i][1] - best[i][0] * best[j][1];
    a += f2;
    cx += (best[j][0] + best[i][0]) * f2;
    cy += (best[j][1] + best[i][1]) * f2;
  }
  if (Math.abs(a) < 1e-12) return [best[0][1], best[0][0]];
  return [cy / (3 * a), cx / (3 * a)]; // [lat, lng]
}
