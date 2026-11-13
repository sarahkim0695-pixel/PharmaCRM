/** Abgeleitete Daten aus Store + Filter (für Liste und Karte). */
import type { FacilityKind, Practice } from '../types';
import { intervalOf, STATE_KEYS, STATE_LABEL, stateKeyOf, type StateKey } from '../utils/customer';
import { KIND_KEYS, kindOf } from '../utils/kind';
import { collator } from '../utils/text';
import { findDuplicates, type DuplicateGroup } from './duplicates';
import { filterState, matchesFilter, sortPractices, type FilterContext } from './filters';
import { store } from './store';

export function filterContext(): FilterContext {
  return {
    lastVisit: (id) => store.lastVisit(id),
    intervalOf: (p) => intervalOf(p, store.settings),
    territory: store.territorySet(),
  };
}

/** Einträge, die zum aktuellen Filter passen (unsortiert) – optional nur bestimmte Gruppen. */
export function filteredPractices(kinds?: FacilityKind[]): Practice[] {
  const ctx = filterContext();
  const only = kinds ? new Set(kinds) : undefined;
  return store.practiceList().filter((p) => (!only || only.has(kindOf(p))) && matchesFilter(p, filterState.filter, ctx));
}

/** Gefilterte und sortierte Einträge für die Liste (gewählter Reiter). */
export function listPractices(): Practice[] {
  return sortPractices(filteredPractices([filterState.listKind]), filterState.sort, {
    ...filterContext(),
    position: filterState.position,
  });
}

/** Einträge für die Karte (gewählte Gruppen + Filter). */
export function mapPractices(): Practice[] {
  return filteredPractices(filterState.mapKinds);
}

/** Anzahl je Gruppe – mit Suche/Filter (filtered) bzw. insgesamt (total). */
export function kindCounts(): Record<FacilityKind, { total: number; filtered: number }> {
  const out = Object.fromEntries(KIND_KEYS.map((k) => [k, { total: 0, filtered: 0 }])) as Record<FacilityKind, { total: number; filtered: number }>;
  const ctx = filterContext();
  for (const p of store.practices.values()) {
    const c = out[kindOf(p)];
    c.total++;
    if (matchesFilter(p, filterState.filter, ctx)) c.filtered++;
  }
  return out;
}

/** Kundenstatus mit Anzahl (nur vorkommende) – für Legende und Filter, optional nur bestimmte Gruppen. */
export function statusOptions(kinds?: FacilityKind[]): { key: StateKey; label: string; count: number }[] {
  const counts = new Map<StateKey, number>();
  const only = kinds ? new Set(kinds) : undefined;
  for (const p of store.practices.values()) {
    if (only && !only.has(kindOf(p))) continue;
    const k = stateKeyOf(p);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return STATE_KEYS.filter((k) => counts.get(k)).map((key) => ({ key, label: STATE_LABEL[key], count: counts.get(key)! }));
}

/** Eindeutige, sortierte Werte eines Feldes (für Auswahllisten). */
export function distinctValues(field: 'city' | 'specialty' | 'plz' | 'status'): string[] {
  const set = new Set<string>();
  for (const p of store.practices.values()) if (p[field]) set.add(p[field]);
  return [...set].sort(collator.compare);
}

/** Mögliche doppelte Standorte (ohne die als „verschieden“ markierten). */
export function duplicateGroups(): DuplicateGroup[] {
  return findDuplicates(store.practiceList(), new Set(store.settings.dismissedDuplicates ?? []));
}
