/**
 * Fahrzeiten und Strecken zwischen Orten.
 *
 * Online: OSRM-Routingserver der FOSSGIS (routing.openstreetmap.de, Daten © OpenStreetMap).
 *   Regeln: Quellenangabe anzeigen, höchstens 1 Anfrage/Sekunde, keine Massenabfragen.
 *   Pro Tourberechnung brauchen wir 1 Anfrage für die Fahrzeiten-Tabelle und 1 für den Streckenverlauf.
 * Offline / bei Fehlern: grobe Schätzung aus der Luftlinie (Umwegfaktor + Durchschnittsgeschwindigkeit).
 */
import { distanceKm } from '../state/filters';

export const OSRM_URL = 'https://routing.openstreetmap.de/routed-car';
export const ROUTING_ATTRIBUTION = 'Fahrzeiten: OSRM-Routing der FOSSGIS, Kartendaten © OpenStreetMap-Mitwirkende';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TravelMatrix {
  /** Minuten (ohne Verkehrszuschlag) */
  minutes: number[][];
  km: number[][];
  source: 'osrm' | 'estimate';
}

type FetchFn = (url: string) => Promise<Response>;
const defaultFetch: FetchFn = (url) => fetch(url);

let lastRequest = 0;
async function politeFetch(url: string, fetchFn: FetchFn): Promise<Response> {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  return fetchFn(url);
}

const coordList = (points: LatLng[]) => points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');

/** Grobe Schätzung ohne Internet: Luftlinie × 1,3, Tempo je nach Entfernung. */
export function estimateTravel(a: LatLng, b: LatLng): { minutes: number; km: number } {
  const air = distanceKm(a, b);
  if (air < 0.05) return { minutes: 0, km: 0 };
  const km = air * 1.3;
  const speed = km < 5 ? 25 : km < 20 ? 40 : km < 50 ? 60 : 75; // km/h
  return { minutes: (km / speed) * 60 + 3, km };
}

export function estimateMatrix(points: LatLng[]): TravelMatrix {
  const minutes = points.map((a) => points.map((b) => estimateTravel(a, b).minutes));
  const km = points.map((a) => points.map((b) => estimateTravel(a, b).km));
  return { minutes, km, source: 'estimate' };
}

const cache = new Map<string, TravelMatrix>();

/** Fahrzeiten zwischen allen Punkten (online, sonst geschätzt). */
export async function travelMatrix(points: LatLng[], fetchFn: FetchFn = defaultFetch): Promise<TravelMatrix> {
  const key = coordList(points);
  const cached = cache.get(key);
  if (cached) return cached;
  if (points.length < 2) return estimateMatrix(points);
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
    const res = await politeFetch(`${OSRM_URL}/table/v1/driving/${key}?annotations=duration,distance`, fetchFn);
    if (!res.ok) throw new Error(`Routing ${res.status}`);
    const data = (await res.json()) as { code: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
    if (data.code !== 'Ok' || !data.durations || !data.distances) throw new Error(`Routing: ${data.code}`);
    const fallback = estimateMatrix(points);
    const result: TravelMatrix = {
      minutes: data.durations.map((row, i) => row.map((s, j) => (s === null ? fallback.minutes[i][j] : s / 60))),
      km: data.distances.map((row, i) => row.map((m, j) => (m === null ? fallback.km[i][j] : m / 1000))),
      source: 'osrm',
    };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.warn('Fahrzeiten werden geschätzt:', err);
    return estimateMatrix(points);
  }
}

/** Streckenverlauf für die Karte ([lat, lng]); bei Fehlern gerade Linien. */
export async function routeGeometry(points: LatLng[], fetchFn: FetchFn = defaultFetch): Promise<[number, number][]> {
  const straight = points.map((p) => [p.lat, p.lng] as [number, number]);
  if (points.length < 2) return straight;
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return straight;
    const res = await politeFetch(
      `${OSRM_URL}/route/v1/driving/${coordList(points)}?overview=simplified&geometries=geojson&steps=false`,
      fetchFn,
    );
    if (!res.ok) return straight;
    const data = (await res.json()) as { code: string; routes?: { geometry: { coordinates: [number, number][] } }[] };
    const coords = data.routes?.[0]?.geometry.coordinates;
    return coords?.length ? coords.map(([lng, lat]) => [lat, lng] as [number, number]) : straight;
  } catch {
    return straight;
  }
}

/** Nur für Tests */
export function clearTravelCache(): void {
  cache.clear();
  lastRequest = 0;
}
