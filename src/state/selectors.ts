/** Abgeleitete Daten aus Store + Filter (für Liste und Karte). */
import type { Practice } from '../types';
import { statusKey } from '../utils/colors';
import { collator } from '../utils/text';
import { filterState, matchesFilter, sortPractices, type FilterContext } from './filters';
import { store } from './store';

export function filterContext(): FilterContext {
  return {
    lastVisit: (id) => store.lastVisit(id),
    staleDays: store.settings.staleDays,
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

/** Alle vorkommenden Status mit Anzahl und Anzeigename (erste Schreibweise). */
export function statusOptions(): { key: string; label: string; count: number }[] {
  const m = new Map<string, { key: string; label: string; count: number }>();
  for (const p of store.practices.values()) {
    const key = statusKey(p.status);
    const entry = m.get(key) ?? { key, label: p.status.trim() || 'ohne Status', count: 0 };
    entry.count++;
    m.set(key, entry);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || collator.compare(a.label, b.label));
}

/** Eindeutige, sortierte Werte eines Feldes (für Auswahllisten). */
export function distinctValues(field: 'city' | 'specialty' | 'plz' | 'status'): string[] {
  const set = new Set<string>();
  for (const p of store.practices.values()) if (p[field]) set.add(p[field]);
  return [...set].sort(collator.compare);
}
