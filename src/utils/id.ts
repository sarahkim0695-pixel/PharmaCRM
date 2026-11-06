/** Erzeugt eine eindeutige ID (z. B. für Praxen, Besuche, Produkte). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Aktueller Zeitpunkt als ISO-Text. */
export const nowIso = () => new Date().toISOString();
