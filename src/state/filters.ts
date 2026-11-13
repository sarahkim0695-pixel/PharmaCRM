/**
 * Filter und Sortierung für Liste UND Karte (beide zeigen dieselbe Auswahl).
 */
import type { EventInterest, FacilityKind, Practice, ProductState, Visit } from '../types';
import { kindOf } from '../utils/kind';
import { STATE_KEYS, stateKeyOf, type StateKey } from '../utils/customer';
import { daysSince } from '../utils/dates';
import { collator, normalize } from '../utils/text';

export interface PracticeFilter {
  search: string;
  kinds: FacilityKind[]; // Praxis / Klinik
  statuses: StateKey[]; // Kundenstatus: aktiv, prozess, kein, offen
  cities: string[];
  specialties: string[];
  plz: string[];
  onlyReview: boolean; // nur „prüfen“
  locationProblem: boolean; // nicht gefunden / ungenau / noch offen
  stale: boolean; // Besuch fällig (laut Besuchsintervall)
  hasAppointment: boolean; // Termin geplant
  territory: 'all' | 'inside' | 'outside';
  productId: string;
  productState: '' | ProductState | 'any';
  eventId: string;
  /** offen = noch nicht angefragt */
  eventState: '' | EventInterest | 'offen';
}

export type SortKey =
  | 'name'
  | 'city'
  | 'plz'
  | 'specialty'
  | 'status'
  | 'lastVisit'
  | 'nextAppointment'
  | 'distance';

export const SORT_LABELS: Record<SortKey, string> = {
  name: 'Name',
  city: 'Ort',
  plz: 'PLZ',
  specialty: 'Fachrichtung',
  status: 'Status',
  lastVisit: 'Letzter Besuch (älteste zuerst)',
  nextAppointment: 'Nächster Termin',
  distance: 'Entfernung (in der Nähe)',
};

export const EMPTY_FILTER: PracticeFilter = {
  search: '',
  kinds: [],
  statuses: [],
  cities: [],
  specialties: [],
  plz: [],
  onlyReview: false,
  locationProblem: false,
  stale: false,
  hasAppointment: false,
  territory: 'all',
  productId: '',
  productState: '',
  eventId: '',
  eventState: '',
};

export interface FilterContext {
  lastVisit: (practiceId: string) => Visit | undefined;
  /** Besuchsintervall einer Praxis in Tagen */
  intervalOf: (p: Practice) => number;
  territory: Set<string>;
  today?: Date;
}

/** Wie viele Filter sind aktiv (ohne Suchtext)? */
export function activeFilterCount(f: PracticeFilter): number {
  return (
    (f.kinds?.length ? 1 : 0) +
    (f.statuses.length ? 1 : 0) +
    (f.cities.length ? 1 : 0) +
    (f.specialties.length ? 1 : 0) +
    (f.plz.length ? 1 : 0) +
    (f.onlyReview ? 1 : 0) +
    (f.locationProblem ? 1 : 0) +
    (f.stale ? 1 : 0) +
    (f.hasAppointment ? 1 : 0) +
    (f.territory !== 'all' ? 1 : 0) +
    (f.productId && f.productState ? 1 : 0) +
    (f.eventId && f.eventState ? 1 : 0)
  );
}

export function isStale(p: Practice, ctx: FilterContext): boolean {
  const last = ctx.lastVisit(p.id);
  return !last || daysSince(last.date, ctx.today) >= ctx.intervalOf(p);
}

export function matchesFilter(p: Practice, f: PracticeFilter, ctx: FilterContext): boolean {
  if (f.search) {
    const hay = normalize(
      `${p.name} ${p.specialty} ${p.street} ${p.plz} ${p.city} ${p.status} ${p.hint} ${p.phone}`,
    );
    const words = normalize(f.search).split(' ').filter(Boolean);
    if (!words.every((w) => hay.includes(w))) return false;
  }
  if (f.kinds?.length && !f.kinds.includes(kindOf(p))) return false;
  if (f.statuses.length && !f.statuses.includes(stateKeyOf(p))) return false;
  if (f.cities.length && !f.cities.includes(p.city)) return false;
  if (f.specialties.length && !f.specialties.includes(p.specialty)) return false;
  if (f.plz.length && !f.plz.includes(p.plz)) return false;
  if (f.onlyReview && !p.needsReview) return false;
  if (f.locationProblem && p.geoStatus !== 'not_found' && p.geoStatus !== 'approx' && p.geoStatus !== 'pending')
    return false;
  if (f.hasAppointment && !p.nextAppointment) return false;
  if (f.stale && !isStale(p, ctx)) return false;
  if (f.territory !== 'all') {
    const inside = ctx.territory.has(p.plz);
    if (f.territory === 'inside' ? !inside : inside) return false;
  }
  if (f.eventId && f.eventState) {
    const st = p.events?.[f.eventId];
    if (f.eventState === 'offen' ? st : st !== f.eventState) return false;
  }
  if (f.productId && f.productState) {
    const st = p.products?.[f.productId];
    if (f.productState === 'any' ? !st : st !== f.productState) return false;
  }
  return true;
}

/** Entfernung in km (Luftlinie). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function sortPractices(
  list: Practice[],
  key: SortKey,
  ctx: FilterContext & { position?: { lat: number; lng: number } | null },
): Practice[] {
  const byName = (a: Practice, b: Practice) => collator.compare(a.name, b.name);
  const cmp: Record<SortKey, (a: Practice, b: Practice) => number> = {
    name: byName,
    city: (a, b) => collator.compare(a.city, b.city) || byName(a, b),
    plz: (a, b) => a.plz.localeCompare(b.plz) || byName(a, b),
    specialty: (a, b) => collator.compare(a.specialty, b.specialty) || byName(a, b),
    status: (a, b) => collator.compare(a.status, b.status) || byName(a, b),
    lastVisit: (a, b) => {
      // nie besucht zuerst, dann älteste Besuche
      const da = ctx.lastVisit(a.id)?.date ?? '';
      const db = ctx.lastVisit(b.id)?.date ?? '';
      return da.localeCompare(db) || byName(a, b);
    },
    nextAppointment: (a, b) => {
      // Praxen ohne Termin ans Ende
      const da = a.nextAppointment ?? '9999';
      const db = b.nextAppointment ?? '9999';
      return da.localeCompare(db) || byName(a, b);
    },
    distance: (a, b) => {
      const pos = ctx.position;
      if (!pos) return byName(a, b);
      const da = a.lat !== undefined && a.lng !== undefined ? distanceKm(pos, { lat: a.lat, lng: a.lng }) : Infinity;
      const db = b.lat !== undefined && b.lng !== undefined ? distanceKm(pos, { lat: b.lat, lng: b.lng }) : Infinity;
      return da - db || byName(a, b);
    },
  };
  return [...list].sort(cmp[key]);
}

// ---------- Gemeinsamer Filterzustand (Liste + Karte) ----------

const STORAGE_KEY = 'repmap.filter';

class FilterState {
  filter: PracticeFilter = { ...EMPTY_FILTER };
  sort: SortKey = 'name';
  position: { lat: number; lng: number } | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (saved) {
        this.filter = { ...EMPTY_FILTER, ...saved.filter, search: '' };
        // alte gespeicherte Status-Filter (freier Text) verwerfen
        this.filter.statuses = (this.filter.statuses ?? []).filter((s) => STATE_KEYS.includes(s));
        this.sort = saved.sort === 'distance' ? 'name' : (saved.sort ?? 'name');
      }
    } catch {
      /* ohne gespeicherten Filter starten */
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(patch: Partial<PracticeFilter>): void {
    this.filter = { ...this.filter, ...patch };
    this.changed();
  }

  setSort(sort: SortKey): void {
    this.sort = sort;
    this.changed();
  }

  reset(): void {
    this.filter = { ...EMPTY_FILTER };
    this.changed();
  }

  private changed(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ filter: this.filter, sort: this.sort }));
    } catch {
      /* egal */
    }
    this.listeners.forEach((fn) => fn());
  }
}

export const filterState = new FilterState();
