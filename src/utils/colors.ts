/** Farben für Status-Pins. */
import { normalize } from './text';

/** Feste Farben für die wichtigsten Status. */
export const DEFAULT_STATUS_COLORS: Record<string, string> = {
  kunde: '#1f9d55', // grün
  'kein kunde': '#d64545', // rot
  '': '#8a94a6', // ohne Status → grau
};

/** Weitere Farben, die neuen Status automatisch zugeteilt werden. */
export const PALETTE = [
  '#2f6fdb', // blau
  '#e07b00', // orange
  '#8e44ad', // lila
  '#0f9fa8', // türkis
  '#c2185b', // pink
  '#795548', // braun
  '#5c6b00', // oliv
  '#37474f', // schiefer
];

/** Status-Text → Schlüssel (z. B. „Kein Kunde “ → „kein kunde“). */
export function statusKey(status: string): string {
  const k = normalize(status).replace(/[-_]/g, ' ');
  if (k === 'nicht kunde' || k === 'kein kd' || k === 'keinkunde') return 'kein kunde';
  return k;
}

/** Farbe für einen Status; unbekannte Status bekommen eine stabile Palettenfarbe. */
export function colorForStatus(status: string, custom: Record<string, string> = {}): string {
  const key = statusKey(status);
  if (custom[key]) return custom[key];
  if (key in DEFAULT_STATUS_COLORS) return DEFAULT_STATUS_COLORS[key];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/** Anzeigename für einen Status. */
export function statusLabel(status: string): string {
  return status.trim() || 'ohne Status';
}
