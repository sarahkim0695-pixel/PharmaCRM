import { describe, expect, it } from 'vitest';
import { parsePracticeSheets, mergeImport } from '../../src/import/practice-import';
import {
  dueInfo,
  dueText,
  formatInterval,
  intervalOf,
  parseInterval,
  practiceColor,
  stateFromText,
  stateKeyOf,
} from '../../src/utils/customer';

const settings = { intervalDefaults: { aktiv: 28, prozess: 14, kein: 90, offen: 60 }, statusColors: {} };

describe('Kundenstatus', () => {
  it('leitet den Status aus dem Excel-Text ab', () => {
    expect(stateFromText('Kunde')).toBe('aktiv');
    expect(stateFromText('Stammkunde')).toBe('aktiv');
    expect(stateFromText('bestellt regelmäßig')).toBe('aktiv');
    expect(stateFromText('kein Kunde')).toBe('kein');
    expect(stateFromText('inaktiv')).toBe('kein');
    expect(stateFromText('Interessent')).toBe('prozess');
    expect(stateFromText('im Gespräch')).toBe('prozess');
    expect(stateFromText('Angebot gesendet')).toBe('prozess');
    expect(stateFromText('Muster da')).toBe('prozess');
    expect(stateFromText('')).toBeUndefined();
    expect(stateFromText('xyz')).toBeUndefined();
  });

  it('in der App gesetzter Status hat Vorrang', () => {
    expect(stateKeyOf({ status: 'Kunde' })).toBe('aktiv');
    expect(stateKeyOf({ status: 'Kunde', customerState: 'kein' })).toBe('kein');
    expect(stateKeyOf({ status: 'irgendwas' })).toBe('offen');
    expect(practiceColor({ status: 'Interessent' })).toBe('#e07b00');
    expect(practiceColor({ status: 'Kunde' }, { statusColors: { aktiv: '#000000' } })).toBe('#000000');
  });
});

describe('Besuchsintervall', () => {
  it('liest Angaben aus der Excel', () => {
    expect(parseInterval('4 Wochen')).toBe(28);
    expect(parseInterval('14 Tage')).toBe(14);
    expect(parseInterval('alle 2 Monate')).toBe(60);
    expect(parseInterval('monatlich')).toBe(30);
    expect(parseInterval('Quartal')).toBe(91);
    expect(parseInterval('halbjährlich')).toBe(182);
    expect(parseInterval('wöchentlich')).toBe(7);
    expect(parseInterval('6 Wo')).toBe(42);
    expect(parseInterval(21)).toBe(21);
    expect(parseInterval('')).toBeUndefined();
  });

  it('formatiert verständlich', () => {
    expect(formatInterval(7)).toBe('1 Woche');
    expect(formatInterval(28)).toBe('4 Wochen');
    expect(formatInterval(91)).toBe('3 Monate');
    expect(formatInterval(10)).toBe('10 Tage');
  });

  it('eigenes Intervall oder Standard je Status; Fälligkeit', () => {
    expect(intervalOf({ status: 'Kunde' }, settings)).toBe(28);
    expect(intervalOf({ status: 'Interessent' }, settings)).toBe(14);
    expect(intervalOf({ status: 'Kunde', visitIntervalDays: 42 }, settings)).toBe(42);
    const today = new Date(2026, 10, 20);
    const d = dueInfo({ status: 'Kunde' }, '2026-10-13', settings, today); // vor 38 Tagen, Intervall 28
    expect(d).toMatchObject({ never: false, daysSince: 38, dueInDays: -10 });
    expect(dueText(d)).toBe('überfällig seit 10 Tagen');
    expect(dueText(dueInfo({ status: 'Kunde' }, '2026-11-10', settings, today))).toBe('fällig in 18 Tagen');
    expect(dueText(dueInfo({ status: 'Kunde' }, undefined, settings, today))).toBe('noch nie besucht');
  });
});

describe('Import und Kundenstatus', () => {
  const sheet = (status: string, interval = '') => [{
    name: 'T',
    rows: [
      ['Praxis', 'PLZ', 'Ort', 'Status', 'Intervall'].map((value) => ({ value })),
      ['Praxis A', 80331, 'München', status, interval].map((value) => ({ value })),
    ],
    rowFills: [],
  }];

  it('liest das Intervall und behält einen in der App gesetzten Status', () => {
    const first = parsePracticeSheets(sheet('Interessent', '3 Wochen'));
    expect(first.rows[0].visitIntervalDays).toBe(21);
    const existing = mergeImport([], first.rows).toSave.map((p) => ({ ...p, customerState: 'aktiv' as const }));
    // gleicher Excel-Status → App-Einstellung bleibt
    expect(mergeImport(existing, parsePracticeSheets(sheet('Interessent', '3 Wochen')).rows).updated).toBe(0);
    // Excel-Status geändert → gilt wieder die Excel
    const changed = mergeImport(existing, parsePracticeSheets(sheet('kein Kunde', '3 Wochen')).rows).toSave[0];
    expect(changed.customerState).toBeUndefined();
    expect(stateKeyOf(changed)).toBe('kein');
  });
});
