/**
 * Adresssuche (Geocoding) über Nominatim (OpenStreetMap).
 *
 * Regeln von Nominatim: höchstens 1 Anfrage pro Sekunde, Ergebnisse speichern.
 * Deshalb arbeitet eine Warteschlange die Praxen nacheinander ab und speichert
 * jedes Ergebnis – sowohl bei der Praxis als auch in einem Zwischenspeicher.
 */
import { getDb } from '../db/database';
import { store } from '../state/store';
import type { GeocodeCacheEntry, Practice } from '../types';
import { nowIso } from '../utils/id';
import { normalize } from '../utils/text';

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Mindestabstand zwischen zwei Anfragen in Millisekunden. */
export const MIN_INTERVAL_MS = 1100;

export interface GeocodeResult {
  status: 'ok' | 'approx' | 'not_found';
  lat?: number;
  lng?: number;
  label?: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  place_rank?: number;
  address?: { postcode?: string };
}

type FetchFn = (url: string) => Promise<Response>;

/** Schlüssel für den Zwischenspeicher. */
export function addressKey(p: Pick<Practice, 'street' | 'plz' | 'city'>): string {
  return normalize(`${p.street}|${p.plz}|${p.city}`);
}

/** Straße bereinigen: „Hauptstr. 5, 1. OG“ → „Hauptstr. 5“ */
export function cleanStreet(street: string): string {
  return street
    .split(/[,/(]|\s-\s/)[0]
    .replace(/\b(\d+\.?\s*(OG|Stock|Etage)|EG|DG|UG)\b.*$/i, '')
    .trim();
}

const AUSTRIAN_GERMAN_PLZ = new Set(['87567', '87568', '87569', '87491']);

let lastRequest = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttledFetch(url: string, fetchFn: FetchFn): Promise<NominatimHit[]> {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest = Date.now();
  const res = await fetchFn(url);
  if (res.status === 429 || res.status === 503) throw new RateLimitError();
  if (!res.ok) throw new Error(`Adresssuche fehlgeschlagen (${res.status})`);
  return (await res.json()) as NominatimHit[];
}

export class RateLimitError extends Error {
  constructor() {
    super('Zu viele Anfragen – kurze Pause');
  }
}

function evaluate(hit: NominatimHit, p: Pick<Practice, 'street' | 'plz'>): GeocodeResult {
  const rank = hit.place_rank ?? 30;
  const hasHouseNumber = /\d/.test(p.street);
  const postcodeMismatch = !!(p.plz && hit.address?.postcode && hit.address.postcode !== p.plz);
  // 30 = Gebäude, 26–27 = Straße, darunter Ortsteil/Ort
  const precise = rank >= 28 || (rank >= 26 && !hasHouseNumber);
  return {
    status: precise && !postcodeMismatch ? 'ok' : 'approx',
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    label: hit.display_name,
  };
}

/** Sucht die Koordinaten einer Adresse (ohne Zwischenspeicher). */
export async function geocodeAddress(
  p: Pick<Practice, 'street' | 'plz' | 'city'>,
  fetchFn: FetchFn = (u) => fetch(u, { headers: { 'Accept-Language': 'de' } }),
): Promise<GeocodeResult> {
  const street = cleanStreet(p.street);
  // Nur Deutschland – Ausnahme: deutsche PLZ auf österreichischem Gebiet
  // (Kleinwalsertal 87567–87569, Jungholz 87491)
  const countries = AUSTRIAN_GERMAN_PLZ.has(p.plz) ? 'de,at' : 'de';
  const common = `format=jsonv2&limit=1&addressdetails=1&countrycodes=${countries}&accept-language=de`;

  // 1. Strukturierte Suche (Straße, PLZ, Ort getrennt) – am genauesten
  if (street) {
    const params = new URLSearchParams({ street, postalcode: p.plz, city: p.city });
    if (!p.plz) params.delete('postalcode');
    if (!p.city) params.delete('city');
    const hits = await throttledFetch(`${NOMINATIM_URL}?${params}&${common}`, fetchFn);
    if (hits.length) return evaluate(hits[0], p);
  }

  // 2. Freitextsuche „Straße, PLZ Ort“
  const q = [street, `${p.plz} ${p.city}`.trim()].filter(Boolean).join(', ');
  if (q) {
    const hits = await throttledFetch(`${NOMINATIM_URL}?q=${encodeURIComponent(q)}&${common}`, fetchFn);
    if (hits.length) return evaluate(hits[0], p);
  }
  return { status: 'not_found' };
}

/** Wie geocodeAddress, aber mit Zwischenspeicher in IndexedDB. */
export async function geocodeCached(p: Practice, fetchFn?: FetchFn): Promise<GeocodeResult> {
  const db = await getDb();
  const key = addressKey(p);
  const cached = await db.get('geocodeCache', key);
  if (cached) return cached;
  const result = await geocodeAddress(p, fetchFn);
  const entry: GeocodeCacheEntry = { query: key, ...result, fetchedAt: nowIso() };
  await db.put('geocodeCache', entry);
  return result;
}

// ---------- Warteschlange ----------

export type QueueState = 'idle' | 'running' | 'paused' | 'offline' | 'waiting';

export interface QueueStatus {
  state: QueueState;
  done: number;
  total: number;
  found: number;
  notFound: number;
}

class GeocodeQueue {
  status: QueueStatus = { state: 'idle', done: 0, total: 0, found: 0, notFound: 0 };
  private listeners = new Set<(s: QueueStatus) => void>();
  private stopRequested = false;
  fetchFn: FetchFn | undefined;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.status.state === 'offline') this.start();
      });
    }
  }

  subscribe(fn: (s: QueueStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<QueueStatus>) {
    this.status = { ...this.status, ...patch };
    this.listeners.forEach((fn) => fn(this.status));
  }

  pendingCount(): number {
    return store.practiceList().filter((p) => p.geoStatus === 'pending').length;
  }

  /** Startet die Abarbeitung aller Praxen mit Status „pending“. */
  start(): void {
    if (this.status.state === 'running' || this.status.state === 'waiting') return;
    const total = this.pendingCount();
    if (!total) {
      this.set({ state: 'idle' });
      return;
    }
    this.stopRequested = false;
    this.set({ state: 'running', done: 0, total, found: 0, notFound: 0 });
    void this.run();
  }

  pause(): void {
    this.stopRequested = true;
    this.set({ state: 'paused' });
  }

  private async run(): Promise<void> {
    while (!this.stopRequested) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.set({ state: 'offline' });
        return;
      }
      const next = store.practiceList().find((p) => p.geoStatus === 'pending');
      if (!next) break;
      try {
        const result = await geocodeCached(next, this.fetchFn);
        // Praxis neu lesen – sie könnte inzwischen bearbeitet worden sein
        const current = store.getPractice(next.id);
        if (current && current.geoStatus === 'pending' && addressKey(current) === addressKey(next)) {
          await store.savePractice({
            ...current,
            geoStatus: result.status,
            lat: result.lat,
            lng: result.lng,
            geoLabel: result.label,
          });
        }
        this.set({
          done: this.status.done + 1,
          found: this.status.found + (result.status === 'not_found' ? 0 : 1),
          notFound: this.status.notFound + (result.status === 'not_found' ? 1 : 0),
          total: Math.max(this.status.total, this.status.done + 1 + this.pendingCount()),
        });
      } catch (err) {
        if (err instanceof RateLimitError) {
          this.set({ state: 'waiting' });
          await sleep(60_000);
          if (!this.stopRequested) this.set({ state: 'running' });
          continue;
        }
        // Netzwerkfehler → offline; wird bei „online“ automatisch fortgesetzt
        console.warn('Adresssuche unterbrochen:', err);
        this.set({ state: 'offline' });
        return;
      }
    }
    if (!this.stopRequested) this.set({ state: 'idle' });
  }
}

export const geocodeQueue = new GeocodeQueue();

/** Adresse einer Praxis erneut suchen (Zwischenspeicher für diese Adresse wird verworfen). */
export async function retryGeocode(p: Practice): Promise<void> {
  const db = await getDb();
  await db.delete('geocodeCache', addressKey(p));
  await store.savePractice({ ...p, geoStatus: 'pending' });
  geocodeQueue.start();
}

/** Freitext-Adresse suchen (z. B. die eigene Startadresse). */
export async function geocodeText(
  q: string,
  fetchFn: FetchFn = (u) => fetch(u, { headers: { 'Accept-Language': 'de' } }),
): Promise<{ lat: number; lng: number; label: string } | null> {
  const hits = await throttledFetch(
    `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=jsonv2&limit=1&countrycodes=de,at&accept-language=de`,
    fetchFn,
  );
  if (!hits.length) return null;
  return { lat: parseFloat(hits[0].lat), lng: parseFloat(hits[0].lon), label: hits[0].display_name };
}
