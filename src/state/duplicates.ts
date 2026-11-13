/**
 * Doppelte Standorte finden und zusammenführen.
 *
 * Als „möglicherweise doppelt“ gelten Einträge mit
 *  - gleicher Adresse (Straße mit Hausnummer + PLZ),
 *  - gleichem Namen (ohne Titel wie „Dr.“, „Praxis“) in derselben PLZ, oder
 *  - (fast) gleicher Kartenposition (< 15 m, nur genau gefundene/gesetzte Pins).
 *
 * Nichts wird automatisch gelöscht: In einem Ärztehaus sitzen oft mehrere echte
 * Praxen unter einer Adresse. Die Entscheidung trifft man auf der Prüfseite.
 */
import type { Practice, ProductState } from '../types';
import { normalize, normalizeStreet } from '../utils/text';
import { distanceKm } from './filters';

export type DuplicateReason = 'address' | 'name' | 'position';

export interface DuplicateGroup {
  id: string;
  reasons: DuplicateReason[];
  practices: Practice[];
}

export const REASON_LABEL: Record<DuplicateReason, string> = {
  address: 'gleiche Adresse',
  name: 'gleicher Name im selben PLZ-Gebiet',
  position: 'gleiche Position auf der Karte',
};

/** Schlüssel für ein Paar, unabhängig von der Reihenfolge */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Alle Paare einer Gruppe (zum Markieren als „verschieden“) */
export function allPairs(ids: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push(pairKey(ids[i], ids[j]));
  return out;
}

const TITLE_WORDS = new Set([
  'dr', 'med', 'dent', 'prof', 'dipl', 'univ', 'priv', 'doz', 'herr', 'frau', 'fur', 'und', 'gbr', 'partg', 'mbb',
  'praxis', 'gemeinschaftspraxis', 'facharztpraxis', 'hausarztpraxis', 'arztpraxis', 'zahnarztpraxis', 'praxisgemeinschaft',
]);

/** Kern des Namens: „Praxis Dr. med. Anna Muster“ → „anna muster“ */
export function coreName(name: string): string {
  return normalize(name)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w && !TITLE_WORDS.has(w))
    .join(' ');
}

function addressKey(p: Practice): string {
  const st = normalizeStreet(p.street);
  return st && /\d/.test(st) && p.plz ? `${st}|${p.plz}` : '';
}

const precise = (p: Practice) => p.lat !== undefined && p.lng !== undefined && (p.geoStatus === 'ok' || p.geoStatus === 'manual');

export function findDuplicates(list: Practice[], dismissed: Set<string> = new Set()): DuplicateGroup[] {
  const parent = new Map<string, string>(list.map((p) => [p.id, p.id]));
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const links: { a: string; b: string; reason: DuplicateReason }[] = [];
  const link = (a: Practice, b: Practice, reason: DuplicateReason) => {
    if (a.id === b.id || dismissed.has(pairKey(a.id, b.id))) return;
    links.push({ a: a.id, b: b.id, reason });
    parent.set(find(a.id), find(b.id));
  };
  const linkBuckets = (keyFn: (p: Practice) => string, reason: DuplicateReason) => {
    const buckets = new Map<string, Practice[]>();
    for (const p of list) {
      const k = keyFn(p);
      if (k) buckets.set(k, [...(buckets.get(k) ?? []), p]);
    }
    for (const group of buckets.values()) {
      for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) link(group[i], group[j], reason);
    }
  };

  linkBuckets(addressKey, 'address');
  linkBuckets((p) => {
    const c = coreName(p.name);
    return c.length >= 4 && p.plz ? `${c}|${p.plz}` : '';
  }, 'name');

  // Fast gleiche Position: nach Breitengrad sortieren und nur Nachbarn vergleichen
  const located = list.filter(precise).sort((a, b) => a.lat! - b.lat!);
  for (let i = 0; i < located.length; i++) {
    for (let j = i + 1; j < located.length && located[j].lat! - located[i].lat! < 0.0002; j++) {
      const a = located[i];
      const b = located[j];
      if (distanceKm({ lat: a.lat!, lng: a.lng! }, { lat: b.lat!, lng: b.lng! }) < 0.015) link(a, b, 'position');
    }
  }

  const byRoot = new Map<string, Practice[]>();
  for (const p of list) {
    const r = find(p.id);
    byRoot.set(r, [...(byRoot.get(r) ?? []), p]);
  }
  return [...byRoot.entries()]
    .filter(([, ps]) => ps.length > 1)
    .map(([root, practices]) => {
      const ids = new Set(practices.map((p) => p.id));
      const reasons = [...new Set(links.filter((l) => ids.has(l.a)).map((l) => l.reason))];
      return { id: root, reasons, practices };
    });
}

const rank: Record<ProductState, number> = { angeboten: 1, kauft: 2 };

/**
 * Führt Einträge zusammen: `keep` bleibt, fehlende Angaben werden aus den anderen
 * ergänzt, Produkte vereint („kauft“ schlägt „angeboten“), Hinweise aneinandergehängt.
 */
export function mergeRecords(keep: Practice, others: Practice[]): Practice {
  const m: Practice = { ...keep, products: { ...keep.products } };
  const hints = new Set([keep.hint].filter(Boolean));
  for (const o of others) {
    for (const [id, st] of Object.entries(o.products ?? {})) {
      const cur = m.products[id];
      if (!cur || rank[st] > rank[cur]) m.products[id] = st;
    }
    for (const [id, st] of Object.entries(o.events ?? {})) {
      m.events = { ...(m.events ?? {}) };
      if (!m.events[id] || st === 'interesse') m.events[id] = st;
    }
    if (o.hint) hints.add(o.hint);
    m.specialty ||= o.specialty;
    m.phone ||= o.phone;
    m.status ||= o.status;
    m.needsReview ||= o.needsReview;
    if (!m.openingHours && o.openingHours) {
      m.openingHours = o.openingHours;
      m.openingText = o.openingText;
    }
    m.parkMinutes ??= o.parkMinutes;
    m.visitMinutes ??= o.visitMinutes;
    if (!precise(m) && precise(o)) {
      Object.assign(m, { lat: o.lat, lng: o.lng, geoStatus: o.geoStatus, geoLabel: o.geoLabel });
    }
    if (o.nextAppointment && (!m.nextAppointment || o.nextAppointment < m.nextAppointment)) {
      m.nextAppointment = o.nextAppointment;
      m.nextAppointmentNote = o.nextAppointmentNote;
    }
  }
  m.hint = [...hints].join(' · ');
  return m;
}
