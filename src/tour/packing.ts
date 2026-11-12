/**
 * Packliste für einen Tourtag: fasst die Tagesnotizen und die „Mitbringen“-Angaben
 * der einzelnen Besuche zu einer abhakbaren Liste zusammen. Gleiche Dinge
 * (z. B. „Katalog“ bei drei Praxen) erscheinen nur einmal – mit allen Praxen dazu.
 */
import type { Tour } from '../types';
import { normalize } from '../utils/text';

export interface PackItem {
  /** Schlüssel zum Abhaken (kleingeschrieben, ohne Akzente) */
  key: string;
  text: string;
  /** Für welche Praxen (leer = allgemein) */
  sources: string[];
}

/** „Muster A, Katalog\n- Visitenkarten“ → ['Muster A', 'Katalog', 'Visitenkarten'] */
export function splitItems(text: string | undefined): string[] {
  return (text ?? '')
    .split(/[\n,;]+/)
    .map((t) => t.replace(/^\s*(?:[-•*–]|\d+[.)])\s+/, '').trim())
    .filter(Boolean);
}

export function packingList(tour: Pick<Tour, 'dayNote' | 'stops' | 'plan'>, nameOf: (practiceId: string) => string | undefined): PackItem[] {
  const items = new Map<string, PackItem>();
  const add = (text: string, source?: string) => {
    const key = normalize(text);
    if (!key) return;
    const item = items.get(key) ?? { key, text, sources: [] };
    if (source && !item.sources.includes(source)) item.sources.push(source);
    items.set(key, item);
  };
  splitItems(tour.dayNote).forEach((t) => add(t));
  // Besuche in Fahrtreihenfolge (falls berechnet)
  const order = new Map<string, number>();
  tour.plan?.entries.forEach((e, i) => e.kind === 'visit' && order.set(e.practiceId, i));
  const stops = [...tour.stops].sort((a, b) => (order.get(a.practiceId) ?? 999) - (order.get(b.practiceId) ?? 999));
  for (const s of stops) splitItems(s.bring).forEach((t) => add(t, nameOf(s.practiceId)));
  return [...items.values()];
}
