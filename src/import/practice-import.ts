/**
 * Import der Praxisliste aus Excel.
 *
 * Erwartete Spalten (Groß-/Kleinschreibung egal, Reihenfolge egal):
 *   Praxis | Fachrichtung | Straße | PLZ | Ort | Status | Hinweis   (+ optional Telefon)
 *
 * Optional: Öffnungszeiten (eine Spalte „Öffnungszeiten“ ODER Spalten „Mo“, „Di“ …),
 * „Parken (Min)“ und „Vor Ort (Min)“ für den Zeitaufwand bei der Tourplanung.
 *
 * Gelb hinterlegte Zeilen werden als „prüfen“ markiert.
 * Bei einem erneuten Import werden vorhandene Praxen aktualisiert (Besuche,
 * Produkte und Pins bleiben erhalten), neue kommen hinzu.
 */
import { parseDayCell, parseOpeningHours } from '../tour/opening-hours';
import type { Practice, WeekHours } from '../types';
import { newId, nowIso } from '../utils/id';
import { normalize, normalizePlz, normalizeStreet } from '../utils/text';
import { isYellow, type CellValue, type SheetData } from './xlsx-reader';

export type Field =
  | 'name'
  | 'specialty'
  | 'street'
  | 'plz'
  | 'city'
  | 'status'
  | 'hint'
  | 'phone'
  | 'hours'
  | 'park'
  | 'visit';

/** Mögliche Spaltenüberschriften je Feld – verglichen ohne Leer- und Sonderzeichen. */
const HEADER_ALIASES: Record<Field, string[]> = {
  name: ['praxis', 'praxisname', 'name', 'arzt', 'praxisarzt', 'einrichtung'],
  specialty: ['fachrichtung', 'fachgebiet', 'fach', 'fachbereich'],
  street: ['strasse', 'str', 'adresse', 'anschrift', 'strassenr', 'strasseundhausnummer'],
  plz: ['plz', 'postleitzahl'],
  city: ['ort', 'stadt', 'gemeinde'],
  status: ['status', 'kundenstatus'],
  hint: ['hinweis', 'hinweise', 'bemerkung', 'bemerkungen', 'notiz', 'notizen', 'kommentar', 'info'],
  phone: ['telefon', 'tel', 'telefonnummer', 'phone'],
  hours: ['offnungszeiten', 'offnungszeit', 'oeffnungszeiten', 'sprechzeiten', 'sprechzeit', 'praxiszeiten', 'sprechstunden'],
  park: ['parken', 'parkenweg', 'parkenundweg', 'parkzeit', 'parkenfussweg', 'weg', 'fussweg'],
  visit: ['vorort', 'aufenthalt', 'dauer', 'besuchsdauer', 'zeitaufwand', 'zeitvorort'],
};

/** Spaltenüberschriften für einzelne Wochentage (Index 0 = Montag) */
const DAY_HEADERS = [
  ['mo', 'montag'],
  ['di', 'dienstag'],
  ['mi', 'mittwoch'],
  ['do', 'donnerstag'],
  ['fr', 'freitag'],
  ['sa', 'samstag'],
  ['so', 'sonntag'],
];

/** „Parken (Min.)“ → „parken“ – ohne Leer-/Sonderzeichen und Einheit */
function compactHeader(raw: string): string {
  return normalize(raw)
    .replace(/[^a-z0-9]/g, '')
    .replace(/(minuten|min)$/, '');
}

export const FIELD_LABELS: Record<Field, string> = {
  name: 'Praxis',
  specialty: 'Fachrichtung',
  street: 'Straße',
  plz: 'PLZ',
  city: 'Ort',
  status: 'Status',
  hint: 'Hinweis',
  phone: 'Telefon',
  hours: 'Öffnungszeiten',
  park: 'Parken (Min)',
  visit: 'Vor Ort (Min)',
};

export interface ImportRow {
  rowNumber: number; // Zeilennummer wie in Excel (1-basiert)
  name: string;
  specialty: string;
  street: string;
  plz: string;
  city: string;
  status: string;
  hint: string;
  phone: string;
  needsReview: boolean;
  /** undefined = keine Angabe in der Datei */
  openingHours?: WeekHours;
  openingText?: string;
  /** Öffnungszeiten standen da, waren aber nicht lesbar */
  hoursUnreadable?: boolean;
  parkMinutes?: number;
  visitMinutes?: number;
}

export interface ImportPreview {
  sheetName: string;
  headerRowNumber: number;
  columns: Partial<Record<Field, number>>;
  /** Spalten je Wochentag (falls vorhanden) */
  dayColumns: (number | undefined)[];
  missingColumns: Field[];
  rows: ImportRow[];
  skippedRows: number;
  reviewCount: number;
  statusCounts: Map<string, number>;
  hoursCount: number;
  /** Zeilen mit nicht lesbaren Öffnungszeiten */
  hoursProblems: { rowNumber: number; name: string; text: string }[];
}

const cellText = (v: CellValue | undefined): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\s+/g, ' ').trim();
};

/** Ordnet Überschriften den Feldern zu. */
export function detectColumns(header: string[]): Partial<Record<Field, number>> {
  const cols: Partial<Record<Field, number>> = {};
  header.forEach((raw, idx) => {
    const n = compactHeader(raw);
    if (!n) return;
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [Field, string[]][]) {
      if (cols[field] !== undefined) continue;
      if (aliases.includes(n)) {
        cols[field] = idx;
        return;
      }
    }
  });
  return cols;
}

/** Findet Spalten „Mo“ … „So“ bzw. „Montag“ … „Sonntag“. */
export function detectDayColumns(header: string[]): (number | undefined)[] {
  const compact = header.map(compactHeader);
  return DAY_HEADERS.map((names) => {
    const idx = compact.findIndex((h) => names.includes(h));
    return idx >= 0 ? idx : undefined;
  });
}

/** „15“, „15 min“, „1,5 h“ → Minuten */
export function parseMinutes(v: CellValue | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return v >= 0 && v < 600 ? Math.round(v) : undefined;
  const t = String(v).toLowerCase().replace(',', '.');
  const hours = t.match(/(\d+(?:\.\d+)?)\s*(h|std|stunde)/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const num = t.match(/\d+(?:\.\d+)?/);
  return num ? Math.round(Number(num[0])) : undefined;
}

/** Sucht in allen Blättern die Kopfzeile (in den ersten 20 Zeilen) und liest die Praxen. */
export function parsePracticeSheets(sheets: SheetData[]): ImportPreview {
  for (const sheet of sheets) {
    for (let r = 0; r < Math.min(20, sheet.rows.length); r++) {
      const header = (sheet.rows[r] ?? []).map((c) => cellText(c?.value));
      const columns = detectColumns(header);
      if (columns.name !== undefined && (columns.plz !== undefined || columns.city !== undefined)) {
        return readRows(sheet, r, columns, detectDayColumns(header));
      }
    }
  }
  throw new Error(
    'Keine passende Kopfzeile gefunden. Die Tabelle braucht mindestens die Spalten „Praxis“ und „PLZ“ oder „Ort“.',
  );
}

function readRows(
  sheet: SheetData,
  headerIdx: number,
  columns: Partial<Record<Field, number>>,
  dayColumns: (number | undefined)[],
): ImportPreview {
  const usedCols = Object.values(columns) as number[];
  const hasDayColumns = dayColumns.some((c) => c !== undefined);
  const hoursProblems: ImportPreview['hoursProblems'] = [];
  const rows: ImportRow[] = [];
  let skipped = 0;
  const statusCounts = new Map<string, number>();

  for (let r = headerIdx + 1; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    const get = (f: Field) => (columns[f] !== undefined ? cellText(cells[columns[f]!]?.value) : '');
    const name = get('name');
    if (!name) {
      if (usedCols.some((c) => cellText(cells[c]?.value))) skipped++;
      continue;
    }
    const yellow =
      isYellow(sheet.rowFills[r]) || usedCols.some((c) => isYellow(cells[c]?.fill));
    const row: ImportRow = {
      rowNumber: r + 1,
      name,
      specialty: get('specialty'),
      street: get('street'),
      plz: normalizePlz(get('plz')),
      city: get('city'),
      status: get('status'),
      hint: get('hint'),
      phone: get('phone'),
      needsReview: yellow,
      parkMinutes: columns.park !== undefined ? parseMinutes(cells[columns.park]?.value) : undefined,
      visitMinutes: columns.visit !== undefined ? parseMinutes(cells[columns.visit]?.value) : undefined,
    };

    // Öffnungszeiten: eine Textspalte …
    const hoursText = get('hours');
    if (hoursText) {
      const parsed = parseOpeningHours(hoursText);
      row.openingText = hoursText;
      if (parsed.hours) row.openingHours = parsed.hours;
      else {
        row.hoursUnreadable = true;
        hoursProblems.push({ rowNumber: row.rowNumber, name, text: hoursText });
      }
    } else if (hasDayColumns) {
      // … oder je Wochentag eine Spalte
      const days = dayColumns.map((c) => (c !== undefined ? parseDayCell(cellText(cells[c]?.value)) : undefined));
      if (days.some((d) => d !== undefined)) {
        row.openingHours = days.map((d) => d ?? []);
        row.openingText = dayColumns
          .map((c, i) => (c !== undefined && cellText(cells[c]?.value) ? `${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]} ${cellText(cells[c]?.value)}` : ''))
          .filter(Boolean)
          .join('; ');
      }
    }
    rows.push(row);
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
  }

  const required: Field[] = ['name', 'specialty', 'street', 'plz', 'city', 'status', 'hint'];
  return {
    sheetName: sheet.name,
    headerRowNumber: headerIdx + 1,
    columns,
    missingColumns: required.filter((f) => columns[f] === undefined),
    rows,
    skippedRows: skipped,
    reviewCount: rows.filter((r) => r.needsReview).length,
    statusCounts,
    dayColumns,
    hoursCount: rows.filter((r) => r.openingHours).length,
    hoursProblems,
  };
}

// ---------- Zusammenführen mit vorhandenen Daten ----------

export interface MergeResult {
  toSave: Practice[];
  added: number;
  updated: number;
  unchanged: number;
  /** Praxen, die nicht (mehr) in der Excel stehen */
  notInFile: Practice[];
}

const matchKey = (name: string, plz: string) => `${normalize(name)}|${plz}`;

const addressOf = (p: { street: string; plz: string; city: string }) =>
  `${normalizeStreet(p.street)}|${p.plz}|${normalize(p.city)}`;

export function newPracticeFromRow(row: ImportRow): Practice {
  const ts = nowIso();
  return {
    id: newId(),
    name: row.name,
    specialty: row.specialty,
    street: row.street,
    plz: row.plz,
    city: row.city,
    status: row.status,
    hint: row.hint,
    phone: row.phone,
    needsReview: row.needsReview,
    geoStatus: 'pending',
    products: {},
    ...timeFields(row),
    source: 'import',
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Öffnungszeiten/Zeitaufwand nur übernehmen, wenn die Datei Angaben enthält. */
function timeFields(row: ImportRow): Partial<Practice> {
  const out: Partial<Practice> = {};
  if (row.openingHours) out.openingHours = row.openingHours;
  if (row.openingText) out.openingText = row.openingText;
  if (row.parkMinutes !== undefined) out.parkMinutes = row.parkMinutes;
  if (row.visitMinutes !== undefined) out.visitMinutes = row.visitMinutes;
  return out;
}

/**
 * Führt importierte Zeilen mit vorhandenen Praxen zusammen.
 * Zuordnung über Praxisname + PLZ (bei mehreren Treffern zusätzlich Straße).
 */
export function mergeImport(existing: Practice[], rows: ImportRow[]): MergeResult {
  const byKey = new Map<string, Practice[]>();
  for (const p of existing) {
    const k = matchKey(p.name, p.plz);
    byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const used = new Set<string>();
  const toSave: Practice[] = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of rows) {
    const candidates = (byKey.get(matchKey(row.name, row.plz)) ?? []).filter((p) => !used.has(p.id));
    const match =
      candidates.find((p) => normalizeStreet(p.street) === normalizeStreet(row.street)) ?? candidates[0];
    if (!match) {
      toSave.push(newPracticeFromRow(row));
      added++;
      continue;
    }
    used.add(match.id);
    const addressChanged = addressOf(match) !== addressOf(row);
    const next: Practice = {
      ...match,
      name: row.name,
      specialty: row.specialty,
      street: row.street,
      plz: row.plz,
      city: row.city,
      status: row.status,
      hint: row.hint,
      phone: row.phone || match.phone,
      needsReview: row.needsReview,
      // leere Zellen überschreiben nichts, was in der App gepflegt wurde
      ...timeFields(row),
    };
    if (addressChanged) {
      next.geoStatus = 'pending';
      delete next.lat;
      delete next.lng;
      delete next.geoLabel;
    }
    const changed = (Object.keys(next) as (keyof Practice)[]).some(
      (k) => JSON.stringify(next[k]) !== JSON.stringify(match[k]),
    );
    if (changed) {
      toSave.push(next);
      updated++;
    } else {
      unchanged++;
    }
  }

  return {
    toSave,
    added,
    updated,
    unchanged,
    notInFile: existing.filter((p) => !used.has(p.id) && p.source === 'import'),
  };
}
