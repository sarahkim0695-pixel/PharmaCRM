/**
 * Lokale Datenbank im Browser (IndexedDB) – hier liegen alle Daten.
 *
 * Tabellen („Object Stores“):
 *  - practices     Praxen
 *  - visits        Besuche (mit Index nach Praxis)
 *  - products      Produktliste
 *  - meta          Einstellungen (Schlüssel „settings“)
 *  - plzShapes     nachgeladene PLZ-Flächen, die nicht in der mitgelieferten Datei sind
 *  - geocodeCache  Ergebnisse der Adresssuche (spart Anfragen bei erneutem Import)
 *
 * Bei Änderungen am Aufbau: DB_VERSION erhöhen und in `upgrade` ergänzen.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GeocodeCacheEntry, PlzFeature, Practice, Product, Visit } from '../types';

export interface RepMapDB extends DBSchema {
  practices: { key: string; value: Practice };
  visits: { key: string; value: Visit; indexes: { 'by-practice': string } };
  products: { key: string; value: Product };
  meta: { key: string; value: unknown };
  plzShapes: { key: string; value: PlzFeature };
  geocodeCache: { key: string; value: GeocodeCacheEntry };
}

export type StoreName = 'practices' | 'visits' | 'products' | 'meta' | 'plzShapes' | 'geocodeCache';

export const DB_NAME = 'repmap';
export const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<RepMapDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<RepMapDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RepMapDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('practices', { keyPath: 'id' });
          const visits = db.createObjectStore('visits', { keyPath: 'id' });
          visits.createIndex('by-practice', 'practiceId');
          db.createObjectStore('products', { keyPath: 'id' });
          db.createObjectStore('meta');
          db.createObjectStore('plzShapes', { keyPath: 'properties.plz' });
          db.createObjectStore('geocodeCache', { keyPath: 'query' });
        }
      },
      blocked() {
        console.warn('Datenbank-Update blockiert – bitte andere RepMap-Fenster schließen.');
      },
    });
  }
  return dbPromise;
}

/** Nur für Tests: Verbindung schließen und zurücksetzen. */
export async function resetDbConnection(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

/** Bittet den Browser, die Daten dauerhaft zu behalten (nicht automatisch zu löschen). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
