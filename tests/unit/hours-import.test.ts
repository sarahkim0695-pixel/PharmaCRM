import { describe, expect, it } from 'vitest';
import { detectHoursLayout, hoursCellText } from '../../src/import/hours-import';
import { parsePracticeSheets } from '../../src/import/practice-import';
import type { CellValue, SheetData } from '../../src/import/xlsx-reader';
import { formatWeekHours, parseOpeningHours } from '../../src/tour/opening-hours';

const fmt = (text: string) => formatWeekHours(parseOpeningHours(text).hours ?? undefined);

/** Tabelle wie aus Excel: Kopfzeile + Zeilen */
function sheet(header: string[], ...rows: CellValue[][]): SheetData {
  return {
    name: 'Praxen',
    rows: [header, ...rows].map((r) => r.map((value) => ({ value }))),
    rowFills: [],
  };
}
const BASE = ['Praxis', 'Fachrichtung', 'Straße', 'PLZ', 'Ort'];
const base = (name = 'Praxis A'): CellValue[] => [name, 'Orthopädie', 'Hauptstr. 1', '80331', 'München'];
const hoursOf = (s: SheetData) => formatWeekHours(parsePracticeSheets([s]).rows[0].openingHours);

describe('Öffnungszeiten – weitere Schreibweisen', () => {
  it('Mittagspause wird abgezogen', () => {
    expect(fmt('Mo.-Fr. 8.00-18.00 Uhr, Mittagspause 12-14')).toBe('Mo–Fr 08:00–12:00, 14:00–18:00');
    expect(fmt('Mo-Fr 8-18; Mittagspause 12.30-14')).toBe('Mo–Fr 08:00–12:30, 14:00–18:00');
    expect(fmt('Mo-Fr 8-18, 12-13 Uhr Mittagspause')).toBe('Mo–Fr 08:00–12:00, 13:00–18:00');
  });
  it('„außer“', () => {
    expect(fmt('Mo-Fr 8-12 und 14-18 Uhr außer Mi')).toBe('Mo, Di, Do, Fr 08:00–12:00, 14:00–18:00');
    expect(fmt('Mo-Fr 8-12; außer Mittwoch')).toBe('Mo, Di, Do, Fr 08:00–12:00');
  });
  it('weitere Zeitformate', () => {
    expect(fmt('8h30-12h')).toBe('Mo–Fr 08:30–12:00');
    expect(fmt('08:00:00-12:00:00')).toBe('Mo–Fr 08:00–12:00');
    expect(fmt('wochentags 9 bis 17 Uhr')).toBe('Mo–Fr 09:00–17:00');
    const r = parseOpeningHours('Öffnungszeiten: Mo-Fr 8-12');
    expect(r.problems).toEqual([]);
  });
  it('mehrzeilig – Zeile ohne Tag gilt für den Tag davor', () => {
    expect(fmt('Montag 8-12 14-18\nDienstag 8-12\nMittwoch 8-12\nDonnerstag 8-12 14-18\nFreitag 8-12')).toBe(
      'Mo, Do 08:00–12:00, 14:00–18:00 · Di, Mi, Fr 08:00–12:00',
    );
    expect(fmt('Mo: 8-12\n14-18\nFr: 8-12')).toBe('Mo 08:00–12:00, 14:00–18:00 · Fr 08:00–12:00');
  });
});

describe('Öffnungszeiten aus Excel – Spaltenvarianten', () => {
  it('Spalte „Sprechzeiten“ mit Zeilenumbrüchen', () => {
    const s = sheet([...BASE, 'Sprechzeiten'], [...base(), 'Mo-Fr 8-12\nMo, Di, Do 14-18']);
    expect(hoursOf(s)).toBe('Mo, Di, Do 08:00–12:00, 14:00–18:00 · Mi, Fr 08:00–12:00');
  });

  it('zwei Spalten „Öffnungszeiten vormittags“ und „… nachmittags“', () => {
    const s = sheet([...BASE, 'Öffnungszeiten vormittags', 'Öffnungszeiten nachmittags'], [...base(), 'Mo-Fr 8-12', 'Mo Di Do 15-18']);
    expect(hoursOf(s)).toBe('Mo, Di, Do 08:00–12:00, 15:00–18:00 · Mi, Fr 08:00–12:00');
  });

  it('je Wochentag geteilt in vormittags / nachmittags', () => {
    const header = [...BASE, 'Mo vormittags', 'Mo nachmittags', 'Di vormittags', 'Di nachmittags', 'Mi vormittags', 'Mi nachmittags'];
    const s = sheet(header, [...base(), '8-12', '14-18', '8-12', '', '8-12', 'geschlossen']);
    expect(hoursOf(s)).toBe('Mo 08:00–12:00, 14:00–18:00 · Di, Mi 08:00–12:00');
  });

  it('je Wochentag „von“ / „bis“ als Excel-Uhrzeit', () => {
    const header = [...BASE, 'Montag von', 'Montag bis', 'Montag von 2', 'Montag bis 2', 'Dienstag von', 'Dienstag bis'];
    // Excel speichert 08:00 als 1/3 Tag, 12:30 als 0,5208…
    const s = sheet(header, [...base(), 8 / 24, 12.5 / 24, 14 / 24, 18 / 24, 7.5 / 24, 13 / 24]);
    expect(hoursOf(s)).toBe('Mo 08:00–12:30, 14:00–18:00 · Di 07:30–13:00');
  });

  it('Spalte „Mo-Fr“ und „Mittagspause“', () => {
    const s = sheet([...BASE, 'Mo-Fr', 'Sa', 'Mittagspause'], [...base(), '8-18', '9-12', '12-14']);
    expect(hoursOf(s)).toBe('Mo–Fr 08:00–12:00, 14:00–18:00 · Sa 09:00–12:00');
  });

  it('„8-12“, das Excel in ein Datum verwandelt hat (08. Dez.)', () => {
    const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;
    expect(hoursCellText(serial(2026, 12, 8))).toBe('8-12');
    expect(hoursCellText(serial(2026, 8, 12))).toBe('8-12'); // amerikanisch: 12. Aug.
    const s = sheet([...BASE, 'Mo', 'Di'], [...base(), serial(2026, 12, 8), '14-18']);
    expect(hoursOf(s)).toBe('Mo 08:00–12:00 · Di 14:00–18:00');
  });

  it('ohne eigene Spalte: Hinweis nur, wenn er ausschließlich Öffnungszeiten enthält', () => {
    const s = sheet([...BASE, 'Hinweis'], [...base('A'), 'Mo-Fr 8-12 Uhr'], [...base('B'), 'Ansprechpartnerin Fr. Test'], [...base('C'), 'Termin nur vormittags 8-12']);
    const preview = parsePracticeSheets([s]);
    expect(formatWeekHours(preview.rows[0].openingHours)).toBe('Mo–Fr 08:00–12:00');
    expect(preview.rows[1].openingHours).toBeUndefined();
    expect(preview.rows[2].openingHours).toBeUndefined();
    expect(preview.hoursFromHint).toBe(1);
    expect(preview.rows[0].hint).toBe('Mo-Fr 8-12 Uhr'); // Hinweis bleibt
  });

  it('erkennt keine falschen Tagesspalten', () => {
    const layout = detectHoursLayout(['Praxis', 'Mobil', 'Status', 'Sonstiges', 'Dokumente', 'Fax', 'Datum']);
    expect(layout.dayCols.every((d) => !d.length)).toBe(true);
    expect(layout.textCols).toEqual([]);
  });

  it('Vorschau nennt die Quelle und meldet Unlesbares', () => {
    const s = sheet([...BASE, 'Öffnungszeiten'], [...base('A'), 'Mo-Fr 8-12'], [...base('B'), 'nach Vereinbarung']);
    const preview = parsePracticeSheets([s]);
    expect(preview.hoursSources).toEqual(['Spalte „Öffnungszeiten“']);
    expect(preview.hoursCount).toBe(1);
    expect(preview.hoursProblems).toEqual([{ rowNumber: 3, name: 'B', text: 'nach Vereinbarung' }]);
  });
});
