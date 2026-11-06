import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeImport, parsePracticeSheets, detectColumns, newPracticeFromRow } from '../../src/import/practice-import';
import { applyTint, columnIndex, isYellow, readXlsx } from '../../src/import/xlsx-reader';

const fixture = new Uint8Array(readFileSync(resolve(__dirname, '../fixtures/Beispiel-Praxisliste.xlsx')));

describe('xlsx-reader', () => {
  it('liest Spaltenbuchstaben', () => {
    expect(columnIndex('A1')).toBe(0);
    expect(columnIndex('Z9')).toBe(25);
    expect(columnIndex('AB12')).toBe(27);
  });

  it('erkennt Gelbtöne, aber nicht Blau/Weiß/Orange', () => {
    expect(isYellow('FFFF00')).toBe(true);
    expect(isYellow('FFF2CC')).toBe(true); // hellgelb (Gold, heller 80 %)
    expect(isYellow('FFC000')).toBe(true); // Gold
    expect(isYellow('FFFF99')).toBe(true);
    expect(isYellow('DDEBF7')).toBe(false);
    expect(isYellow('FFFFFF')).toBe(false);
    expect(isYellow('ED7D31')).toBe(false); // Orange
    expect(isYellow('00B050')).toBe(false); // Grün
    expect(isYellow(undefined)).toBe(false);
  });

  it('wendet Excel-Aufhellung an', () => {
    expect(applyTint('FFC000', 0)).toBe('FFC000');
    expect(applyTint('000000', 0.5)).toBe('808080');
  });

  it('liest Werte und Füllfarben der Beispieldatei', () => {
    const sheets = readXlsx(fixture);
    expect(sheets).toHaveLength(1);
    const rows = sheets[0].rows;
    expect(rows[2].map((c) => c.value)).toEqual(['Praxis', 'Fachrichtung', 'Straße', 'PLZ', 'Ort', 'Status', 'Hinweis']);
    expect(rows[3][3].value).toBe(80331);
    expect(rows[4][0].fill).toBe('FFFF00');
  });

  it('meldet kaputte Dateien verständlich', () => {
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow(/keine gültige Excel-Datei/);
  });
});

describe('Praxis-Import', () => {
  it('ordnet Überschriften tolerant zu', () => {
    expect(detectColumns(['Praxisname', 'Fachgebiet', 'Strasse', 'Postleitzahl', 'Stadt', 'Status', 'Bemerkung', 'Tel.'])).toEqual({
      name: 0, specialty: 1, street: 2, plz: 3, city: 4, status: 5, hint: 6, phone: 7,
    });
  });

  it('findet die Kopfzeile und markiert gelbe Zeilen als „prüfen“', () => {
    const preview = parsePracticeSheets(readXlsx(fixture));
    expect(preview.headerRowNumber).toBe(3);
    expect(preview.missingColumns).toEqual([]);
    expect(preview.rows).toHaveLength(9);
    const review = preview.rows.filter((r) => r.needsReview).map((r) => r.name);
    expect(review).toEqual([
      'Hausarztpraxis Muster', // RGB-Gelb
      'Praxis am Dom', // Designfarbe Gold mit Aufhellung
      'Praxis Allgäu', // indizierte Farbe, nur eine Zelle
      'Praxis Rosenheim', // Gold in einer Zelle
    ]);
    expect(preview.reviewCount).toBe(4);
    expect(preview.rows[0]).toMatchObject({ name: 'Praxis Dr. Anna Beispiel', plz: '80331', city: 'München', status: 'Kunde', rowNumber: 4 });
    expect([...preview.statusCounts.keys()].sort()).toEqual(['', 'Interessent', 'Kunde', 'kein Kunde']);
  });

  it('meldet fehlende Kopfzeile', () => {
    expect(() => parsePracticeSheets([{ name: 'X', rows: [[{ value: 'foo' }]], rowFills: [] }])).toThrow(/Kopfzeile/);
  });

  it('aktualisiert beim erneuten Import und behält Besuchsdaten/Pins', () => {
    const preview = parsePracticeSheets(readXlsx(fixture));
    const first = mergeImport([], preview.rows);
    expect(first.added).toBe(9);
    const existing = first.toSave.map((p, i) => ({ ...p, lat: 48 + i / 100, lng: 11, geoStatus: 'ok' as const, products: { x: 'kauft' as const } }));

    // Gleiche Datei nochmal → nichts ändert sich
    const again = mergeImport(existing, preview.rows);
    expect(again).toMatchObject({ added: 0, updated: 0, unchanged: 9 });

    // Status geändert + Adresse geändert + neue Praxis
    const rows = preview.rows.map((r) => ({ ...r }));
    rows[0].status = 'kein Kunde';
    rows[1].street = 'Leopoldstraße 52';
    rows.push({ ...rows[0], name: 'Neue Praxis', rowNumber: 99 });
    const res = mergeImport(existing, rows.slice(1));
    expect(res.added).toBe(1);
    expect(res.notInFile.map((p) => p.name)).toEqual(['Praxis Dr. Anna Beispiel']);
    const moved = res.toSave.find((p) => p.name === 'Hausarztpraxis Muster')!;
    expect(moved.geoStatus).toBe('pending'); // neue Adresse → neu suchen
    expect(moved.lat).toBeUndefined();
    expect(moved.products).toEqual({ x: 'kauft' }); // Produkte bleiben
    expect(moved.id).toBe(existing[1].id);
  });

  it('legt neue Praxen mit Status „pending“ an', () => {
    const p = newPracticeFromRow({ rowNumber: 2, name: 'A', specialty: '', street: 'X 1', plz: '80331', city: 'München', status: 'Kunde', hint: '', phone: '', needsReview: true });
    expect(p).toMatchObject({ geoStatus: 'pending', needsReview: true, source: 'import', products: {} });
  });
});
