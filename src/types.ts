/**
 * Zentrale Datentypen von RepMap.
 * Alle Daten liegen lokal im Gerät (IndexedDB), siehe src/db/database.ts.
 */

/** Ergebnis der Adresssuche (Geocoding) einer Praxis. */
export type GeoStatus =
  | 'pending' // wartet auf Adresssuche
  | 'ok' // Adresse gefunden
  | 'approx' // nur ungefähr gefunden (z. B. nur Straße/Ort) – bitte prüfen
  | 'not_found' // nicht gefunden – Pin bitte von Hand setzen
  | 'manual'; // Pin wurde von Hand gesetzt

/** Was mit einem Produkt bei einer Praxis passiert ist. */
export type ProductState = 'angeboten' | 'kauft';

export interface Practice {
  id: string;
  name: string; // Spalte „Praxis“
  specialty: string; // „Fachrichtung“
  street: string; // „Straße“
  plz: string; // „PLZ“ (immer 5-stellig als Text)
  city: string; // „Ort“
  status: string; // „Status“ – frei, z. B. „Kunde“, „kein Kunde“, „Interessent“
  hint: string; // „Hinweis“
  phone: string; // optional „Telefon“
  /** Gelb markierte Zeile in der Excel bzw. von Hand gesetzt → „prüfen“ */
  needsReview: boolean;
  lat?: number;
  lng?: number;
  geoStatus: GeoStatus;
  geoLabel?: string; // Adresse laut Kartendienst
  /** Nächster geplanter Termin, Format „YYYY-MM-DD“ oder „YYYY-MM-DDTHH:mm“ */
  nextAppointment?: string;
  nextAppointmentNote?: string;
  /** Produkt-ID → Zustand */
  products: Record<string, ProductState>;
  source: 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  practiceId: string;
  date: string; // „YYYY-MM-DD“
  contact: string; // Ansprechpartner
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  note: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MapViewState {
  lat: number;
  lng: number;
  zoom: number;
}

export interface Settings {
  /** Postleitzahlen des eigenen Gebiets */
  territoryPlz: string[];
  /** Status-Schlüssel (kleingeschrieben) → Farbe */
  statusColors: Record<string, string>;
  /** „Lange nicht besucht“ ab so vielen Tagen */
  staleDays: number;
  /** Backup-Erinnerung nach so vielen Tagen */
  backupReminderDays: number;
  lastBackupAt?: string;
  /** Backup-Erinnerung bis zu diesem Zeitpunkt nicht zeigen („Später“) */
  backupSnoozeUntil?: string;
  /** Zeitpunkt der letzten Datenänderung (für die Backup-Erinnerung) */
  lastChangeAt?: string;
  mapView?: MapViewState;
  /** Wurde der Willkommens-Hinweis schon gezeigt? */
  onboardingDone?: boolean;
}

/** GeoJSON einer PLZ-Fläche */
export interface PlzFeature {
  type: 'Feature';
  properties: { plz: string; ort: string };
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface PlzFeatureCollection {
  type: 'FeatureCollection';
  features: PlzFeature[];
}

/** Zwischengespeichertes Ergebnis der Adresssuche */
export interface GeocodeCacheEntry {
  query: string;
  lat?: number;
  lng?: number;
  status: 'ok' | 'approx' | 'not_found';
  label?: string;
  fetchedAt: string;
}

/** Inhalt einer Backup-Datei */
export interface BackupFile {
  app: 'RepMap';
  formatVersion: 1;
  exportedAt: string;
  practices: Practice[];
  visits: Visit[];
  products: Product[];
  settings: Settings;
  extraPlzShapes: PlzFeature[];
}
