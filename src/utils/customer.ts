/**
 * Kundenstatus und Besuchsintervall.
 *
 * Kundenstatus als Ampel:
 *   grün   = Bestellender Kunde
 *   orange = In den Startlöchern (Gespräche laufen)
 *   rot    = Nicht in Kontakt
 * In der App gesetzt oder aus dem Status-Text der Excel abgeleitet
 * („Kunde“, „Interessent“, „kein Kunde“ …). Ohne/unbekannter Status = rot.
 *
 * Besuchsintervall: je Praxis einstellbar, sonst Standard je Kundenstatus.
 * Daraus ergibt sich, wann der nächste Besuch fällig ist.
 */
import type { CustomerState, Practice, Settings } from '../types';
import { daysSince } from './dates';
import { normalize } from './text';

export type StateKey = CustomerState;
export const STATE_KEYS: StateKey[] = ['aktiv', 'prozess', 'kein'];

export const STATE_LABEL: Record<StateKey, string> = {
  aktiv: 'Bestellender Kunde',
  prozess: 'In den Startlöchern',
  kein: 'Nicht in Kontakt',
};
export const STATE_HINT: Record<StateKey, string> = {
  aktiv: 'bestellt',
  prozess: 'Gespräche laufen',
  kein: 'noch kein Kontakt',
};
export const STATE_COLOR: Record<StateKey, string> = {
  aktiv: '#1f9d55', // grün
  prozess: '#ef8a00', // orange
  kein: '#d64545', // rot
};
/** Standard: alle 3 Monate (91 Tage = 13 Wochen), für jeden Kundenstatus einzeln änderbar */
export const DEFAULT_INTERVALS: Record<StateKey, number> = { aktiv: 91, prozess: 91, kein: 91 };

/** Status-Text aus der Excel → Kundenstatus (undefined = nicht zuzuordnen) */
export function stateFromText(text: string): CustomerState | undefined {
  const t = normalize(text);
  if (!t) return undefined;
  if (/\b(kein|keine|nicht|ehemalig|ehemaliger|abgesagt|verloren|abgelehnt|inaktiv|gekundigt)\b/.test(t)) return 'kein';
  if (/neukunde|stammkunde|bestandskunde|\baktiv|bestell/.test(t)) return 'aktiv';
  if (/interess|gesprach|prozess|angebot|test|muster|potenzial|potential|lead|verhandl|in arbeit|akquise|kontakt/.test(t)) return 'prozess';
  if (/kunde/.test(t)) return 'aktiv';
  return undefined;
}

export function stateOf(p: Pick<Practice, 'customerState' | 'status'>): CustomerState | undefined {
  return p.customerState ?? stateFromText(p.status);
}

export function stateKeyOf(p: Pick<Practice, 'customerState' | 'status'>): StateKey {
  return stateOf(p) ?? 'kein'; // ohne/unbekannter Status = nicht in Kontakt
}

export function stateColor(key: StateKey, settings?: Pick<Settings, 'statusColors'>): string {
  return settings?.statusColors?.[key] ?? STATE_COLOR[key];
}

/** Pin-/Punktfarbe einer Praxis */
export function practiceColor(p: Pick<Practice, 'customerState' | 'status'>, settings?: Pick<Settings, 'statusColors'>): string {
  return stateColor(stateKeyOf(p), settings);
}

/** Besuchsintervall in Tagen (eigener Wert oder Standard je Kundenstatus) */
export function intervalOf(p: Pick<Practice, 'customerState' | 'status' | 'visitIntervalDays'>, settings?: Pick<Settings, 'intervalDefaults'>): number {
  const key = stateKeyOf(p);
  return p.visitIntervalDays ?? settings?.intervalDefaults?.[key] ?? DEFAULT_INTERVALS[key];
}

export interface DueInfo {
  never: boolean;
  interval: number;
  daysSince?: number;
  /** Tage bis fällig (negativ = überfällig) */
  dueInDays: number;
  /** Tage seit Besuch ÷ Intervall (≥ 1 = fällig); nie besucht = 1,5 */
  ratio: number;
}

export function dueInfo(
  p: Pick<Practice, 'customerState' | 'status' | 'visitIntervalDays'>,
  lastVisitDate: string | undefined,
  settings?: Pick<Settings, 'intervalDefaults'>,
  today = new Date(),
): DueInfo {
  const interval = intervalOf(p, settings);
  if (!lastVisitDate) return { never: true, interval, dueInDays: 0, ratio: 1.5 };
  const ds = daysSince(lastVisitDate, today);
  return { never: false, interval, daysSince: ds, dueInDays: interval - ds, ratio: ds / interval };
}

/** Kurztext zur Fälligkeit, z. B. „überfällig seit 12 Tagen“ */
export function dueText(d: DueInfo): string {
  if (d.never) return 'noch nie besucht';
  if (d.dueInDays > 0) return `fällig in ${d.dueInDays} ${d.dueInDays === 1 ? 'Tag' : 'Tagen'}`;
  if (d.dueInDays === 0) return 'heute fällig';
  return `überfällig seit ${-d.dueInDays} ${d.dueInDays === -1 ? 'Tag' : 'Tagen'}`;
}

/** 28 → „4 Wochen“, 91 → „3 Monate“ */
export function formatInterval(days: number): string {
  const months: Record<number, string> = { 30: '1 Monat', 31: '1 Monat', 60: '2 Monate', 61: '2 Monate', 90: '3 Monate', 91: '3 Monate', 182: '6 Monate', 183: '6 Monate', 365: '1 Jahr' };
  if (months[days]) return months[days];
  if (days % 7 === 0) return days === 7 ? '1 Woche' : `${days / 7} Wochen`;
  return `${days} Tage`;
}

/** Auswahl für das Intervall in der App */
export const INTERVAL_CHOICES = [7, 14, 21, 28, 42, 56, 91, 182];

/** „4 Wochen“, „14 Tage“, „monatlich“, „Quartal“, „28“ → Tage */
export function parseInterval(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return v > 0 && v < 1000 ? Math.round(v) : undefined;
  const t = normalize(String(v)).replace(',', '.');
  const words: [RegExp, number][] = [
    [/halbjahr/, 182],
    [/quartal|vierteljahr/, 91],
    [/jahrlich|jahrl/, 365],
    [/zweiwoch|14.?tagig|alle zwei wochen/, 14],
    [/wochentl|jede woche/, 7],
    [/monatl|jeden monat/, 30],
  ];
  for (const [re, days] of words) if (re.test(t)) return days;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(tag|tage|t\b|woche|wochen|wo\b|w\b|monat|monate|mon\b|m\b)?/);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2] ?? '';
  const factor = /^w/.test(unit) ? 7 : /^m/.test(unit) ? 30 : 1;
  const days = Math.round(n * factor);
  return days > 0 && days < 1000 ? days : undefined;
}
