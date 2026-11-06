/** Hilfsfunktionen für Texte (Suche, Vergleiche, PLZ). */

/** Für Vergleiche: klein, ohne Akzente, ß→ss, Leerzeichen zusammengefasst. */
export function normalize(s: string | undefined | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Straßennamen vereinheitlichen („Hauptstraße 5“ = „Hauptstr. 5“). */
export function normalizeStreet(s: string): string {
  return normalize(s).replace(/str(\.|asse|\b)/g, 'str').replace(/\s+/g, '');
}

/** PLZ als 5-stelligen Text (Excel speichert sie oft als Zahl). */
export function normalizePlz(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length < 5 ? digits.padStart(5, '0') : digits.slice(0, 5);
}

/** Liest beliebig getrennte PLZ aus einem Text („80331, 80333; 81245 …“). */
export function parsePlzList(text: string): string[] {
  const found = text.match(/\b\d{5}\b/g) ?? [];
  return [...new Set(found)].sort();
}

/** HTML-sicher machen (für Popups, die als Text gebaut werden). */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Deutsche Sortierung (Umlaute richtig). */
export const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

/** „1 Praxis“ / „3 Praxen“ */
export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}
