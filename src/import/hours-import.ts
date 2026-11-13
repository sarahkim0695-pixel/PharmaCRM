/**
 * Öffnungszeiten aus der Excel lesen – möglichst viele übliche Varianten:
 *
 *  - eine oder mehrere Textspalten: „Öffnungszeiten“, „Sprechzeiten“, „Öffnungszeiten vormittags“ …
 *    mit z. B. „Mo-Fr 8-12, Mo Di Do 14-18“ (siehe parseOpeningHours)
 *  - je Wochentag eine Spalte: „Mo“, „Montag“, „Öffnungszeiten Montag“ –
 *    auch geteilt: „Mo vormittags“ / „Mo nachmittags“ oder „Mo von“ / „Mo bis“
 *  - Spalten für mehrere Tage: „Mo-Fr“, „Mo-Do nachmittags“
 *  - Spalte „Mittagspause“ (wird von allen Tagen abgezogen)
 *  - Excel-Uhrzeiten (Zahl wie 0,333 = 08:00) und von Excel in ein Datum verwandelte
 *    Eingaben („8-12“ → 08. Dez.)
 *  - ohne eigene Spalte: der Hinweis, wenn er nur aus Öffnungszeiten besteht
 */
import { DAY_SHORT, formatTime, normalizeRanges, parseDayCell, parseOpeningHours, parseTime, subtractRange } from '../tour/opening-hours';
import type { TimeRange, WeekHours } from '../types';
import { normalize } from '../utils/text';
import type { CellValue } from './xlsx-reader';

export type DayColumnRole = 'text' | 'from' | 'to';

export interface HoursLayout {
  /** Spalten mit Öffnungszeiten als Text */
  textCols: number[];
  /** je Wochentag (0 = Montag) die zugehörigen Spalten in Spaltenreihenfolge */
  dayCols: { idx: number; role: DayColumnRole }[][];
  /** Spalten „Mittagspause“ */
  pauseCols: number[];
  /** Beschreibung für die Vorschau, z. B. „Spalte „Sprechzeiten““ */
  labels: string[];
}

const compact = (raw: string) => normalize(raw).replace(/[^a-z0-9]/g, '');

const DAY_NAMES = [
  ['montags', 'montag', 'mo'],
  ['dienstags', 'dienstag', 'di'],
  ['mittwochs', 'mittwoch', 'mi'],
  ['donnerstags', 'donnerstag', 'do'],
  ['freitags', 'freitag', 'fr'],
  ['samstags', 'samstag', 'sa'],
  ['sonntags', 'sonntag', 'so'],
];
const DAY_ALT = DAY_NAMES.flat().sort((a, b) => b.length - a.length).join('|');
const dayIndex = (name: string) => DAY_NAMES.findIndex((names) => names.includes(name));

const PREFIX = '(?:offnungszeiten?|oeffnungszeiten?|sprechzeiten?|sprechstunden?|praxiszeiten?|zeiten?)?';
const PART = '(?:vormittags?|vorm|vm|morgens|fruh|nachmittags?|nachm|nm|abends)';
const FROM = '(?:von|ab|beginn|start|anfang|offnet)';
const TO = '(?:bis|ende|schliesst)';
// „Mo“, „Montag“, „Öffnungszeiten Montag“, „Mo vormittags“, „VM Mo“, „Mo von“, „Mo NM bis“, „Mo 2“
const DAY_HEADER = new RegExp(`^${PREFIX}(?:${PART})?(${DAY_ALT})(?:${PART})?(${FROM}|${TO})?[1-3]?(?:${PART})?$`);
// „Mo-Fr“, „Mo bis Do nachmittags“
const RANGE_HEADER = new RegExp(`^${PREFIX}(?:${PART})?(${DAY_ALT})(?:bis)?(${DAY_ALT})(?:${PART})?$`);
const TEXT_HEADER = /^(offnungszeit|oeffnungszeit|sprechzeit|sprechstunde|praxiszeit|praxisoffnungszeit|openinghours|zeiten$|uhrzeiten$|geoffnet)/;
const PAUSE_HEADER = /^(mittagspause|mittagpause|pause|mittagszeit|mittag)$/;

/**
 * Erkennt, in welchen Spalten Öffnungszeiten stehen.
 * `taken` = Spalten, die schon zu anderen Angaben gehören (Name, PLZ …).
 */
export function detectHoursLayout(header: string[], taken: Set<number> = new Set()): HoursLayout {
  const layout: HoursLayout = { textCols: [], dayCols: DAY_NAMES.map(() => []), pauseCols: [], labels: [] };
  const dayLabels: string[] = [];
  header.forEach((raw, idx) => {
    const c = compact(raw ?? '');
    if (!c) return;
    const range = c.match(RANGE_HEADER);
    if (range && !taken.has(idx)) {
      const a = dayIndex(range[1]);
      const b = dayIndex(range[2]);
      if (a >= 0 && b >= 0 && a !== b) {
        for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) layout.dayCols[d].push({ idx, role: 'text' });
        dayLabels.push(raw.trim());
        return;
      }
    }
    const day = c.match(DAY_HEADER);
    if (day && !taken.has(idx)) {
      const role: DayColumnRole = !day[2] ? 'text' : new RegExp(`^${FROM}$`).test(day[2]) ? 'from' : 'to';
      layout.dayCols[dayIndex(day[1])].push({ idx, role });
      dayLabels.push(raw.trim());
      return;
    }
    if (PAUSE_HEADER.test(c) || c.includes('mittagspause')) {
      layout.pauseCols.push(idx);
      return;
    }
    // „Öffnungszeiten“ gehört evtl. schon zu den Standardspalten – trotzdem hier mitnehmen
    if (TEXT_HEADER.test(c)) layout.textCols.push(idx);
  });
  for (const idx of layout.textCols) layout.labels.push(`Spalte „${header[idx].trim()}“`);
  if (dayLabels.length) layout.labels.push(`Spalten je Wochentag (${dayLabels.slice(0, 4).join(', ')}${dayLabels.length > 4 ? ' …' : ''})`);
  for (const idx of layout.pauseCols) layout.labels.push(`„${header[idx].trim()}“ wird abgezogen`);
  return layout;
}

export const hasHoursColumns = (l: HoursLayout) => l.textCols.length > 0 || l.dayCols.some((d) => d.length > 0);

// ---------- Zellen lesen ----------

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Eine Zelle als Text für Öffnungszeiten:
 * - Excel-Uhrzeit (0,333…) → „08:00“
 * - Zahl wie 8 oder 8,3 → „08:00“ / „08:30“
 * - von Excel in ein Datum verwandeltes „8-12“ (= 8. Dezember) → „8-12“
 */
export function hoursCellText(v: CellValue | undefined): string {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  if (typeof v === 'number') {
    const t = numberToMinutes(v);
    if (t !== null) return formatTime(t);
    if (Number.isInteger(v) && v > 20000 && v < 80000) {
      const d = new Date(EXCEL_EPOCH + v * 86_400_000);
      const a = Math.min(d.getUTCDate(), d.getUTCMonth() + 1);
      const b = Math.max(d.getUTCDate(), d.getUTCMonth() + 1);
      if (a < b) return `${a}-${b}`; // „8-12“ wurde zu 08.12. (oder 12.08.)
    }
    return String(v);
  }
  return String(v).replace(/[ \t]+/g, ' ').trim();
}

/** Zahl aus einer Uhrzeit-Zelle → Minuten (Excel-Uhrzeit oder 8 / 8,30) */
function numberToMinutes(v: number): number | null {
  if (v >= 0 && v < 1) return Math.round(v * 1440);
  if (v >= 1 && v <= 24) {
    const h = Math.floor(v);
    const m = Math.round((v - h) * 100);
    if (m < 60) return h * 60 + m;
  }
  return null;
}

/** Eine einzelne Uhrzeit aus „von“- oder „bis“-Spalten */
function timeValue(v: CellValue | undefined): number | null {
  if (typeof v === 'number') return numberToMinutes(v);
  const m = String(v ?? '').match(/\d{1,2}(?:[:.]\d{2}(?:[:.]\d{2})?)?/);
  return m ? parseTime(m[0]) : null;
}

/** Ein Wochentag aus seinen Spalten: undefined = keine Angabe, [] = geschlossen */
function readDay(cols: HoursLayout['dayCols'][number], cells: { value: CellValue }[]): { ranges?: TimeRange[]; raw: string } {
  const ranges: TimeRange[] = [];
  const texts: string[] = [];
  const raws: string[] = [];
  let pendingFrom: number | null = null;
  let understood = false;
  for (const col of [...cols].sort((a, b) => a.idx - b.idx)) {
    const value = cells[col.idx]?.value;
    const raw = hoursCellText(value);
    if (!raw) continue;
    raws.push(raw);
    if (col.role === 'text') {
      texts.push(raw);
      continue;
    }
    const t = timeValue(value);
    if (t === null) {
      if (parseDayCell(raw)?.length === 0) understood = true; // „geschlossen“
      continue;
    }
    if (col.role === 'from') pendingFrom = t;
    else if (pendingFrom !== null && t > pendingFrom) {
      ranges.push({ from: pendingFrom, to: t });
      pendingFrom = null;
      understood = true;
    }
  }
  if (texts.length) {
    const r = parseDayCell(texts.join(', '));
    if (r !== undefined) {
      ranges.push(...r);
      understood = true;
    }
  }
  if (!raws.length) return { raw: '' };
  return { ranges: understood ? normalizeRanges(ranges) : undefined, raw: raws.join(' ') };
}

export interface HoursRead {
  hours?: WeekHours;
  /** Originaltext (zur Anzeige) */
  text?: string;
  /** Text vorhanden, aber nicht lesbar */
  unreadable?: string;
  /** aus dem Hinweis übernommen */
  fromHint?: boolean;
}

/** Öffnungszeiten einer Zeile lesen */
export function readHours(cells: { value: CellValue }[], layout: HoursLayout, hint = ''): HoursRead {
  const out: HoursRead = {};
  let hours: WeekHours | null = null;

  // 1. Textspalten (mehrere werden zusammengefasst, z. B. „vormittags“ + „nachmittags“)
  const texts = layout.textCols.map((c) => hoursCellText(cells[c]?.value)).filter(Boolean);
  if (texts.length) {
    out.text = texts.join('; ');
    hours = parseOpeningHours(out.text).hours;
  }

  // 2. Spalten je Wochentag
  if (!hours && layout.dayCols.some((d) => d.length)) {
    const days = layout.dayCols.map((cols) => readDay(cols, cells));
    const dayText = days.map((d, i) => (d.raw ? `${DAY_SHORT[i]} ${d.raw}` : '')).filter(Boolean).join('; ');
    if (days.some((d) => d.ranges !== undefined)) {
      hours = days.map((d) => d.ranges ?? []);
      out.text = dayText;
    } else if (dayText) {
      out.text = out.text ? `${out.text}; ${dayText}` : dayText;
    }
  }

  // 3. Ohne Spalte für Öffnungszeiten: Hinweis, wenn er nur aus Öffnungszeiten besteht
  if (!hours && !hasHoursColumns(layout) && hint) {
    const parsed = parseOpeningHours(hint);
    if (parsed.hours && !parsed.problems.length) {
      hours = parsed.hours;
      out.text = hint;
      out.fromHint = true;
    }
  }

  if (!hours) {
    if (out.text) out.unreadable = out.text;
    return out;
  }

  // Mittagspause abziehen
  const pauses = layout.pauseCols.flatMap((c) => parseDayCell(hoursCellText(cells[c]?.value)) ?? []);
  if (pauses.length) hours = hours.map((day) => pauses.reduce((rs, p) => subtractRange(rs, p), day));
  out.hours = hours.map(normalizeRanges);
  return out;
}
