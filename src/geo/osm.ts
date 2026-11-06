/**
 * Umwandlung von Overpass-Antworten (OSM-Relationen mit `out geom`) in GeoJSON.
 *
 * Wird an zwei Stellen genutzt:
 *  - im Skript `scripts/fetch-plz.ts`, das die PLZ-Grenzen einmalig herunterlädt,
 *  - in der App, wenn eine PLZ hinzugefügt wird, die noch nicht in der
 *    mitgelieferten Datei steckt (Nachladen bei Bedarf).
 */
import type { PlzFeature, PlzFeatureCollection } from '../types';

type LatLon = { lat: number; lon: number };
type Position = [number, number]; // [lng, lat] wie in GeoJSON

export interface OverpassMember {
  type: 'node' | 'way' | 'relation';
  role?: string;
  geometry?: LatLon[];
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  members?: OverpassMember[];
}

export interface OverpassResponse {
  elements: OverpassElement[];
}

/** Grobe Grenzen Deutschlands – schützt vor Treffern im Ausland (z. B. Spanien). */
export const GERMANY_BBOX = { minLat: 47.2, maxLat: 55.1, minLng: 5.8, maxLng: 15.1 };

const key = (p: Position) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/** Fügt einzelne Wege zu geschlossenen Ringen zusammen. */
export function assembleRings(ways: Position[][]): Position[][] {
  const remaining = ways.filter((w) => w.length >= 2).map((w) => [...w]);
  const rings: Position[][] = [];

  while (remaining.length) {
    let ring = remaining.shift()!;
    let guard = 0;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && guard++ < 100000) {
      const end = key(ring[ring.length - 1]);
      const idx = remaining.findIndex(
        (w) => key(w[0]) === end || key(w[w.length - 1]) === end,
      );
      if (idx === -1) break; // Ring lässt sich nicht schließen
      const next = remaining.splice(idx, 1)[0];
      if (key(next[0]) !== end) next.reverse();
      ring = ring.concat(next.slice(1));
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) {
      rings.push(ring);
    }
  }
  return rings;
}

/** Punkt-in-Polygon (Ray-Casting) für einen einzelnen Ring. */
export function pointInRing(pt: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Wandelt eine Postleitzahl-Relation in ein GeoJSON-MultiPolygon um. */
export function relationToMultiPolygon(rel: OverpassElement): Position[][][] | null {
  const outerWays: Position[][] = [];
  const innerWays: Position[][] = [];
  for (const m of rel.members ?? []) {
    if (m.type !== 'way' || !m.geometry) continue;
    const coords = m.geometry.map((g) => [g.lon, g.lat] as Position);
    if (m.role === 'inner') innerWays.push(coords);
    else outerWays.push(coords);
  }
  const outers = assembleRings(outerWays);
  if (!outers.length) return null;
  const inners = assembleRings(innerWays);

  const polygons: Position[][][] = outers.map((o) => [o]);
  for (const inner of inners) {
    const host = polygons.find((p) => pointInRing(inner[0], p[0]));
    if (host) host.push(inner);
  }
  return polygons;
}

/** Liegt die Fläche (komplett) im Bereich Deutschlands? */
export function isInGermany(polygons: Position[][][]): boolean {
  const b = GERMANY_BBOX;
  return polygons.every((poly) =>
    poly[0].every(([lng, lat]) => lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng),
  );
}

/** Ort aus den Tags lesen, z. B. note="80331 München" → "München". */
function placeName(tags: Record<string, string>, plz: string): string {
  const raw = tags['note'] ?? tags['name'] ?? '';
  return raw.replace(plz, '').replace(/^[\s,–-]*\d{4,5}\s*/, '').replace(/^[\s,–-]+/, '').trim();
}

/**
 * Baut aus einer Overpass-Antwort eine FeatureCollection mit einer Fläche pro PLZ.
 * Mehrere Relationen mit gleicher PLZ werden zusammengeführt.
 * Flächen außerhalb Deutschlands werden verworfen.
 */
export function overpassToPlzFeatures(data: OverpassResponse): {
  collection: PlzFeatureCollection;
  rejected: string[];
} {
  const byPlz = new Map<string, PlzFeature>();
  const rejected: string[] = [];

  for (const el of data.elements) {
    // „postal_code:DE“: deutsche PLZ auf österreichischem Gebiet (Kleinwalsertal, Jungholz)
    const rawPlz = el.tags?.['postal_code:DE'] ?? el.tags?.postal_code;
    if (el.type !== 'relation' || !rawPlz) continue;
    const plz = rawPlz.trim();
    if (!/^\d{5}$/.test(plz)) continue;
    const polys = relationToMultiPolygon(el);
    if (!polys) {
      rejected.push(`${plz} (Geometrie unvollständig)`);
      continue;
    }
    if (!isInGermany(polys)) {
      rejected.push(`${plz} (außerhalb Deutschlands)`);
      continue;
    }
    const existing = byPlz.get(plz);
    if (existing) {
      existing.geometry.coordinates.push(...polys);
    } else {
      byPlz.set(plz, {
        type: 'Feature',
        properties: { plz, ort: placeName(el.tags ?? {}, plz) },
        geometry: { type: 'MultiPolygon', coordinates: polys },
      });
    }
  }

  const features = [...byPlz.values()].sort((a, b) =>
    a.properties.plz.localeCompare(b.properties.plz),
  );
  return { collection: { type: 'FeatureCollection', features }, rejected };
}

/** Overpass-Abfrage für einzelne PLZ – ausschließlich innerhalb Deutschlands. */
export function overpassQueryForPlz(plzList: string[]): string {
  const regex = plzList.map((p) => p.replace(/\D/g, '')).filter(Boolean).join('|');
  return `[out:json][timeout:60];
area["ISO3166-1"="DE"][admin_level=2]->.de;
(
  relation["boundary"="postal_code"]["postal_code"~"^(${regex})$"](area.de);
  relation["boundary"="postal_code"]["postal_code:DE"~"^(${regex})$"];
);
out geom;`;
}
