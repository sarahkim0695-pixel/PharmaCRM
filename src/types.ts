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

/** Kundenstatus (Ampel): aktiv = bestellender Kunde (grün), prozess = in den Startlöchern (orange), kein = nicht in Kontakt (rot) */
export type CustomerState = 'aktiv' | 'prozess' | 'kein';

/** Interesse an einer Veranstaltung (fehlt = noch nicht angefragt) */
export type EventInterest = 'interesse' | 'kein';

/** Veranstaltung (z. B. Fortbildung, Messe, Praxis-Event) – gilt für alle Praxen */
export interface EventItem {
  id: string;
  name: string;
  date?: string; // „YYYY-MM-DD“
  place: string;
  note: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Art der Einrichtung */
export type FacilityKind = 'praxis' | 'klinik';

/** Was mit einem Produkt bei einer Praxis passiert ist. */
export type ProductState = 'angeboten' | 'kauft';

/**
 * Eine Einrichtung – Praxis oder Klinik (Name „Practice“ aus historischen Gründen).
 */
export interface Practice {
  id: string;
  /** Praxis oder Klinik (fehlt = Praxis) */
  kind?: FacilityKind;
  name: string; // Spalte „Praxis“ bzw. „Klinik“
  specialty: string; // „Fachrichtung“
  street: string; // „Straße“
  plz: string; // „PLZ“ (immer 5-stellig als Text)
  city: string; // „Ort“
  status: string; // „Status“ wie in der Excel – frei, z. B. „Kunde“, „kein Kunde“, „Interessent“
  /** Kundenstatus, in der App gesetzt (fehlt = aus dem Status-Text abgeleitet) */
  customerState?: CustomerState;
  /** Eigenes Besuchsintervall in Tagen (fehlt = Standard je Kundenstatus) */
  visitIntervalDays?: number;
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
  /** Veranstaltungs-ID → Interesse (fehlt = noch nicht angefragt) */
  events?: Record<string, EventInterest>;
  /** Öffnungszeiten (undefined = unbekannt) */
  openingHours?: WeekHours;
  /** Öffnungszeiten als Text, wie in Excel/Schnelleingabe geschrieben */
  openingText?: string;
  /** Zeitaufwand in Minuten (leer = Standard aus den Einstellungen) */
  parkMinutes?: number; // Parken & Fußweg
  visitMinutes?: number; // Aufenthalt vor Ort
  source: 'import' | 'manual';
  createdAt: string;
  updatedAt: string;
}

/** Zeitfenster in Minuten seit Mitternacht, z. B. 8:00–12:00 = { from: 480, to: 720 } */
export interface TimeRange {
  from: number;
  to: number;
}

/** Öffnungszeiten je Wochentag: Index 0 = Montag … 6 = Sonntag */
export type WeekHours = TimeRange[][];

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
  /** Startadresse für Touren („Zuhause“) */
  home?: { address: string; lat: number; lng: number };
  /** Vorgaben für neue Touren */
  tourDefaults: TourDefaults;
  /** Datum der Tour, die gerade geplant wird (für „Zur Tour hinzufügen“) */
  activeTourDate?: string;
  /** Standard-Besuchsintervall in Tagen je Kundenstatus */
  intervalDefaults: Record<CustomerState, number>;
  /** Paare von Einträgen, die als „verschieden, kein Duplikat“ markiert wurden („idA|idB“) */
  dismissedDuplicates?: string[];
  /** Wurde der Willkommens-Hinweis schon gezeigt? */
  onboardingDone?: boolean;
}

export interface TourDefaults {
  dayStart: number; // Abfahrt frühestens (Minuten seit Mitternacht)
  dayEnd: number; // Feierabend spätestens
  returnHome: boolean;
  lunchEnabled: boolean;
  lunchFrom: number; // Mittagspause frühestens ab …
  lunchTo: number; // … und spätestens zu Ende um
  lunchMinutes: number;
  parkMinutes: number; // Standard: Parken & Fußweg
  visitMinutes: number; // Standard: Aufenthalt vor Ort
  trafficPercent: number; // Zuschlag auf die berechneten Fahrzeiten
  maxVisits: number; // höchstens so viele Besuche pro Tag
}

// ---------- Tourplanung ----------

export interface TourStop {
  practiceId: string;
  /** Muss auf jeden Fall in die Tour (z. B. Termin) */
  must: boolean;
  /** Automatisch vorgeschlagen – fliegt wieder raus, wenn sie nicht passt */
  suggested?: boolean;
  /** Was ich zu diesem Besuch mitbringen möchte (nur für diesen Tag) */
  bring?: string;
}

export interface Tour {
  id: string; // = Datum „YYYY-MM-DD“ (eine Tour pro Tag)
  date: string;
  startMode: 'home' | 'here';
  dayStart: number;
  dayEnd: number;
  returnHome: boolean;
  lunch: { enabled: boolean; from: number; to: number; minutes: number };
  /** Höchstens so viele Besuche (fehlt = Standard) */
  maxVisits?: number;
  /** Region für Vorschläge: Orte + Umkreis */
  region?: { cities: string[]; radiusKm: number };
  stops: TourStop[];
  /** Notizen für diesen Tag (z. B. was ich einpacken muss) */
  dayNote?: string;
  /** Abgehakte Einträge der Packliste */
  packed?: string[];
  plan?: TourPlan;
  createdAt: string;
  updatedAt: string;
}

export type PlanEntry =
  | { kind: 'start'; time: number; label: string }
  | { kind: 'drive'; from: number; to: number; minutes: number; km: number }
  | { kind: 'visit'; practiceId: string; arrive: number; start: number; end: number; wait: number; park: number; fixed: boolean }
  | { kind: 'break'; start: number; end: number }
  | { kind: 'end'; time: number; label: string };

export interface TourPlan {
  computedAt: string;
  /** Woher die Fahrzeiten stammen */
  source: 'osrm' | 'estimate';
  startPoint: { lat: number; lng: number; label: string };
  entries: PlanEntry[];
  dropped: { practiceId: string; reason: string }[];
  totals: {
    departure: number;
    end: number;
    visits: number;
    driveMinutes: number;
    waitMinutes: number;
    km: number;
  };
  /** Streckenverlauf für die Karte [lat, lng] */
  geometry?: [number, number][];
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
  tours?: Tour[];
  events?: EventItem[];
}
