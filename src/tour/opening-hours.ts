/**
 * Öffnungszeiten lesen, speichern und anzeigen.
 *
 * Verstanden werden z. B.:
 *   „Mo-Fr 8-12, Mo Di Do 14-18“
 *   „Mo–Fr 08:00–12:00 und 15:00–18:00 Uhr; Mi nachmittag geschlossen“
 *   „Mo,Tu,Th 15:00-18:00“ (englische Kürzel wie in OpenStreetMap)
 *   „Mo.-Fr. 8.00-18.00 Uhr, Mittagspause 12-14“ (Pause wird abgezogen)
 *   „Mo-Fr 8-12 außer Mi“, „8h30-12h“, „08:00:00-12:00:00“
 *   mehrzeilig: „Montag 8-12 14-18 ⏎ Dienstag 8-12 …“ (Zeile ohne Tag gilt für die Tage davor)
 *   Einzelne Tageszellen: „8-12, 14-18“ oder „geschlossen“
 *
 * Gespeichert wird je Wochentag (0 = Montag … 6 = Sonntag) eine Liste von
 * Zeitfenstern in Minuten seit Mitternacht.
 */
import type { TimeRange, WeekHours } from '../types';

export const DAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const DAY_WORDS: Record<string, number[]> = {
  mo: [0], mon: [0], montag: [0], montags: [0],
  di: [1], tu: [1], tue: [1], dienstag: [1], dienstags: [1],
  mi: [2], we: [2], wed: [2], mittwoch: [2], mittwochs: [2],
  do: [3], th: [3], thu: [3], donnerstag: [3], donnerstags: [3],
  fr: [4], fri: [4], freitag: [4], freitags: [4],
  sa: [5], sat: [5], samstag: [5], samstags: [5],
  so: [6], su: [6], sun: [6], sonntag: [6], sonntags: [6],
  werktags: [0, 1, 2, 3, 4],
  wochentags: [0, 1, 2, 3, 4],
  taglich: [0, 1, 2, 3, 4, 5, 6],
};
const CLOSED_WORDS = new Set(['geschlossen', 'off', 'closed', 'zu', 'frei']);
const MORNING_WORDS = new Set(['vormittag', 'vormittags', 'vorm']);
const AFTERNOON_WORDS = new Set(['nachmittag', 'nachmittags', 'nachm']);
const PAUSE_WORDS = new Set(['mittagspause', 'mittagpause', 'pause', 'mittagszeit']);
const EXCEPT_WORDS = new Set(['außer', 'ausser', 'ausgenommen', 'except']);
/** Füllwörter, die ohne Bedeutung überlesen werden */
const FILLER_WORDS = new Set([
  'und', 'u', 'uhr', 'von', 'bis', 'sowie', 'h', 'ab', 'jeweils', 'je', 'ph',
  'offnungszeiten', 'offnungszeit', 'oeffnungszeiten', 'sprechzeiten', 'sprechzeit', 'sprechstunde', 'sprechstunden',
  'praxiszeiten', 'zeiten', 'geoffnet', 'offen', 'praxis', 'durchgehend', 'jeden', 'jede', 'am', 'an', 'um', 'nur', 'zwischen',
]);

export function emptyWeek(): WeekHours {
  return [[], [], [], [], [], [], []];
}

// ---------- Zeiten ----------

/** „8“, „8:30“, „08.30“, „08:30:00“ → Minuten seit Mitternacht */
export function parseTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})(?:[:.](\d{2})(?:[:.]\d{2})?)?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** 510 → „08:30“ */
export function formatTime(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Sortieren, Überlappungen zusammenfassen, ungültige verwerfen. */
export function normalizeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((r) => r.to > r.from).sort((a, b) => a.from - b.from);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

export function formatRanges(ranges: TimeRange[]): string {
  return ranges.map((r) => `${formatTime(r.from)}–${formatTime(r.to)}`).join(', ');
}

// ---------- Text lesen ----------

type Token =
  | { t: 'day'; days: number[] }
  | { t: 'time'; v: number; raw: string }
  | { t: 'dash' }
  | { t: 'closed' }
  | { t: 'part'; v: 'am' | 'pm' }
  | { t: 'sep' }
  | { t: 'pause' }
  | { t: 'except' }
  | { t: 'word'; v: string };

function tokenize(text: string): Token[] {
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // ä → a usw.
    .replace(/[–—−]/g, '-')
    .replace(/(\d{1,2})\s*h\s*(\d{2})\b/g, '$1:$2'); // „8h30“ → „8:30“
  const tokens: Token[] = [];
  for (const m of norm.matchAll(/[a-zß]+|\d{1,2}(?:[:.]\d{2}(?:[:.]\d{2})?)?|[-;\n|]/g)) {
    const w = m[0];
    if (w === '-') tokens.push({ t: 'dash' });
    else if (/^[;\n|]$/.test(w)) tokens.push({ t: 'sep' });
    else if (/^\d/.test(w)) tokens.push({ t: 'time', v: parseTime(w) ?? -1, raw: w });
    else if (w === 'bis') tokens.push({ t: 'dash' });
    else if (DAY_WORDS[w]) tokens.push({ t: 'day', days: DAY_WORDS[w] });
    else if (CLOSED_WORDS.has(w)) tokens.push({ t: 'closed' });
    else if (MORNING_WORDS.has(w)) tokens.push({ t: 'part', v: 'am' });
    else if (AFTERNOON_WORDS.has(w)) tokens.push({ t: 'part', v: 'pm' });
    else if (PAUSE_WORDS.has(w)) tokens.push({ t: 'pause' });
    else if (EXCEPT_WORDS.has(w)) tokens.push({ t: 'except' });
    else if (!FILLER_WORDS.has(w)) tokens.push({ t: 'word', v: w });
  }
  return tokens;
}

interface Group {
  days: number[];
  /** „außer Mi“ */
  except: number[];
  ranges: TimeRange[];
  /** „Mittagspause 12-14“ */
  pauses: TimeRange[];
  closed: boolean;
  part?: 'am' | 'pm';
}

export interface ParseResult {
  /** null = keine Zeiten erkannt */
  hours: WeekHours | null;
  /** Nicht verstandene Teile (zur Info) */
  problems: string[];
}

const newGroup = (): Group => ({ days: [], except: [], ranges: [], pauses: [], closed: false });
const WORKDAYS = [0, 1, 2, 3, 4];

/** Zeitfenster ohne die Pause („8-18“ minus „12-14“ → „8-12, 14-18“) */
export function subtractRange(ranges: TimeRange[], pause: TimeRange): TimeRange[] {
  const out: TimeRange[] = [];
  for (const r of ranges) {
    if (pause.to <= r.from || pause.from >= r.to) out.push(r);
    else {
      if (pause.from > r.from) out.push({ from: r.from, to: pause.from });
      if (pause.to < r.to) out.push({ from: pause.to, to: r.to });
    }
  }
  return out;
}

/**
 * Liest Öffnungszeiten aus einem Text.
 * Tage ohne Angabe gelten als geschlossen. Steht vor Zeiten kein Tag, gelten die Tage
 * der Angabe davor – ganz am Anfang Mo–Fr.
 * Spätere Angaben ergänzen frühere – überschneiden sie sich, ersetzen sie sie
 * (z. B. „Mo-Fr 8-18; Mi 8-12“ → mittwochs nur 8–12).
 */
export function parseOpeningHours(text: string): ParseResult {
  const tokens = tokenize(text ?? '');
  const problems: string[] = [];
  const groups: Group[] = [];
  let cur = newGroup();
  let exceptMode = false;
  let pauseNext = false;
  let lastWasRange = false;
  const flush = () => {
    // „…; außer Mi“ als eigene Angabe = an diesen Tagen geschlossen
    if (!cur.ranges.length && !cur.closed && !cur.pauses.length && cur.except.length) {
      cur = { ...cur, days: cur.except, except: [], closed: true };
    }
    if (cur.ranges.length || cur.closed || cur.pauses.length) groups.push(cur);
    else if (cur.days.length) problems.push(`${cur.days.map((d) => DAY_SHORT[d]).join(', ')} ohne Uhrzeit`);
    cur = newGroup();
    exceptMode = false;
    pauseNext = false;
  };
  /** Tag oder Bereich „Mo-Fr“ ab Position i; liefert die Tage und die Anzahl verbrauchter Tokens */
  const readDays = (i: number): [number[], number] => {
    const tok = tokens[i] as Extract<Token, { t: 'day' }>;
    const next = tokens[i + 1];
    const after = tokens[i + 2];
    if (next?.t === 'dash' && after?.t === 'day') {
      const days: number[] = [];
      const a = tok.days[0];
      const b = after.days[0];
      for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) days.push(d);
      return [days, 3];
    }
    return [tok.days, 1];
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    const after = tokens[i + 2];
    const wasRange = lastWasRange;
    lastWasRange = false;
    switch (tok.t) {
      case 'day': {
        const [days, used] = readDays(i);
        i += used - 1;
        if (exceptMode) {
          cur.except.push(...days);
          break;
        }
        if (cur.ranges.length || cur.closed || cur.pauses.length) flush();
        cur.days.push(...days);
        break;
      }
      case 'time':
        if (next?.t === 'dash' && after?.t === 'time') {
          if (tok.v >= 0 && after.v > tok.v) {
            const r = { from: tok.v, to: after.v };
            if (pauseNext) cur.pauses.push(r);
            else cur.ranges.push(r);
            lastWasRange = !pauseNext;
          } else {
            problems.push(`${tok.raw}-${after.raw}`);
          }
          pauseNext = false;
          exceptMode = false;
          i += 2;
        } else {
          problems.push(tok.raw);
        }
        break;
      case 'closed':
        cur.closed = true;
        break;
      case 'part':
        cur.part = tok.v;
        break;
      case 'pause':
        // „Mittagspause 12-14“ oder „12-14 Mittagspause“
        if (next?.t === 'time') pauseNext = true;
        else if (wasRange && cur.ranges.length) cur.pauses.push(cur.ranges.pop()!);
        break;
      case 'except':
        exceptMode = true;
        break;
      case 'sep':
        flush();
        break;
      case 'word':
        problems.push(tok.v);
        break;
      default:
        break;
    }
  }
  flush();

  if (!groups.some((g) => g.ranges.length)) return { hours: null, problems };

  const week = emptyWeek();
  const pauses: { days: number[] | null; range: TimeRange }[] = [];
  let prevDays: number[] | undefined;
  for (const g of groups) {
    const ownDays = [...new Set(g.days)];
    // Pausen gelten für alle Tage – außer bei „Mi Mittagspause 13-14“ (nur Tag + Pause)
    for (const range of g.pauses) pauses.push({ days: ownDays.length && !g.ranges.length ? ownDays : null, range });
    if (!g.ranges.length && !g.closed) continue;
    // „geschlossen“ ohne Tag (z. B. „PH off“ = Feiertage) betrifft keinen Wochentag
    if (!g.ranges.length && !ownDays.length) continue;
    const days = (ownDays.length ? ownDays : (prevDays ?? WORKDAYS)).filter((d) => !g.except.includes(d));
    if (ownDays.length) prevDays = ownDays;
    for (const d of days) {
      if (g.closed && !g.ranges.length) {
        // „Mi nachmittag geschlossen“ entfernt nur die Nachmittagszeiten
        if (g.part === 'pm') week[d] = week[d].filter((r) => r.from < 12 * 60).map((r) => ({ from: r.from, to: Math.min(r.to, 13 * 60) }));
        else if (g.part === 'am') week[d] = week[d].filter((r) => r.to > 13 * 60).map((r) => ({ from: Math.max(r.from, 12 * 60), to: r.to }));
        else week[d] = [];
        continue;
      }
      const overlaps = g.ranges.some((n) => week[d].some((o) => n.from < o.to && o.from < n.to));
      week[d] = normalizeRanges(overlaps ? [...g.ranges] : [...week[d], ...g.ranges]);
    }
  }
  for (const p of pauses) {
    for (let d = 0; d < 7; d++) if (!p.days || p.days.includes(d)) week[d] = subtractRange(week[d], p.range);
  }
  return { hours: week.map(normalizeRanges), problems };
}

/**
 * Liest eine einzelne Tageszelle („8-12, 14-18“, „geschlossen“).
 * undefined = Zelle leer, [] = geschlossen.
 */
export function parseDayCell(text: string): TimeRange[] | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  const tokens = tokenize(t);
  const ranges: TimeRange[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i];
    const dash = tokens[i + 1];
    const b = tokens[i + 2];
    if (a.t === 'time' && dash?.t === 'dash' && b?.t === 'time' && a.v >= 0 && b.v > a.v) {
      ranges.push({ from: a.v, to: b.v });
      i += 2;
    }
  }
  if (!ranges.length && tokens.some((x) => x.t === 'closed' || (x.t === 'word' && x.v === 'nein'))) return [];
  if (!ranges.length && /^[-–]$/.test(t)) return [];
  return ranges.length ? normalizeRanges(ranges) : undefined;
}

// ---------- Anzeige ----------

function formatDays(days: number[]): string {
  // aufeinanderfolgende Tage (≥ 3) als Bereich „Mo–Fr“
  const parts: string[] = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_SHORT[days[i]]}–${DAY_SHORT[days[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_SHORT[days[k]]);
    i = j + 1;
  }
  return parts.join(', ');
}

/** Kurzform, z. B. „Mo, Di, Do 08:00–12:00, 14:00–18:00 · Mi, Fr 08:00–12:00“ */
export function formatWeekHours(h: WeekHours | undefined): string {
  if (!h) return 'unbekannt';
  const groups = new Map<string, number[]>();
  h.forEach((ranges, d) => {
    if (!ranges.length) return;
    const key = formatRanges(ranges);
    groups.set(key, [...(groups.get(key) ?? []), d]);
  });
  if (!groups.size) return 'immer geschlossen';
  return [...groups].map(([ranges, days]) => `${formatDays(days)} ${ranges}`).join(' · ');
}

// ---------- Abfragen ----------

/** Wochentag eines Datums: 0 = Montag … 6 = Sonntag */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Öffnungszeiten an einem Tag (undefined = unbekannt, [] = geschlossen). */
export function hoursOn(h: WeekHours | undefined, d: Date): TimeRange[] | undefined {
  return h ? (h[weekdayIndex(d)] ?? []) : undefined;
}

/** Ist die Praxis zu diesem Zeitpunkt geöffnet? (undefined = unbekannt) */
export function openNow(h: WeekHours | undefined, now = new Date()): { open: boolean; until?: number; next?: number } | undefined {
  const today = hoursOn(h, now);
  if (!today) return undefined;
  const m = now.getHours() * 60 + now.getMinutes();
  const cur = today.find((r) => m >= r.from && m < r.to);
  if (cur) return { open: true, until: cur.to };
  const next = today.find((r) => r.from > m);
  return { open: false, next: next?.from };
}

/** Typische Arztpraxis – als Vorlage im Editor */
export const TYPICAL_HOURS_TEXT = 'Mo-Fr 8-12, Mo Di Do 14-18';
