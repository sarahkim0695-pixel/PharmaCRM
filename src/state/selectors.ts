/** Abgeleitete Daten aus Store + Filter (für Liste und Karte). */
import type { Practice } from '../types';
import { intervalOf, STATE_KEYS, STATE_LABEL, stateKeyOf, type StateKey } from '../utils/customer';
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

/** Praxen, die zum aktuellen Filter passen (unsortiert). */
export function filteredPractices(): Practice[] {
  const ctx = filterContext();
  return store.practiceList().filter((p) => matchesFilter(p, filterState.filter, ctx));
}

/** Gefilterte und sortierte Praxen für die Liste. */
export function listPractices(): Practice[] {
  return sortPractices(filteredPractices(), filterState.sort, {
    ...filterContext(),
    position: filterState.position,
  });
}

/** Kundenstatus mit Anzahl (nur vorkommende) – für Legende und Filter. */
export function statusOptions(): { key: StateKey; label: string; count: number }[] {
  const counts = new Map<StateKey, number>();
  for (const p of store.practices.values()) {
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
