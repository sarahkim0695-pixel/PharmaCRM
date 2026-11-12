import { describe, expect, it } from 'vitest';
import { formatWeekHours, hoursOn, openNow, parseDayCell, parseOpeningHours, parseTime } from '../../src/tour/opening-hours';

const fmt = (text: string) => formatWeekHours(parseOpeningHours(text).hours ?? undefined);

describe('Öffnungszeiten lesen', () => {
  it('Uhrzeiten', () => {
    expect(parseTime('8')).toBe(480);
    expect(parseTime('08:30')).toBe(510);
    expect(parseTime('14.15')).toBe(855);
    expect(parseTime('25')).toBeNull();
  });

  it('typische Praxis: vormittags täglich, nachmittags Mo/Di/Do', () => {
    expect(fmt('Mo-Fr 8-12, Mo Di Do 14-18')).toBe('Mo, Di, Do 08:00–12:00, 14:00–18:00 · Mi, Fr 08:00–12:00');
  });

  it('verschiedene Schreibweisen', () => {
    expect(fmt('Mo–Fr: 08:00 – 12:00 Uhr und 15:00 bis 18:00 Uhr')).toBe('Mo–Fr 08:00–12:00, 15:00–18:00');
    expect(fmt('Montag, Dienstag, Donnerstag 8.30-12.30 / Mittwoch 8-13')).toBe('Mo, Di, Do 08:30–12:30 · Mi 08:00–13:00');
    expect(fmt('Mo,Tu,Th 15:00-18:00; Mo-Fr 08:00-12:00; PH off')).toBe('Mo, Di, Do 08:00–12:00, 15:00–18:00 · Mi, Fr 08:00–12:00');
    expect(fmt('8-12 und 14-17')).toBe('Mo–Fr 08:00–12:00, 14:00–17:00'); // ohne Tage → Mo–Fr
    expect(fmt('Mo-Do 8-18, Fr 8-13')).toBe('Mo–Do 08:00–18:00 · Fr 08:00–13:00');
  });

  it('spätere Angaben ersetzen überlappende Zeiten', () => {
    expect(fmt('Mo-Fr 8-18; Mi 8-12')).toBe('Mo, Di, Do, Fr 08:00–18:00 · Mi 08:00–12:00');
  });

  it('„nachmittags geschlossen“', () => {
    expect(fmt('Mo-Fr 8-12 und 14-18, Mi nachmittag geschlossen')).toBe('Mo, Di, Do, Fr 08:00–12:00, 14:00–18:00 · Mi 08:00–12:00');
    expect(fmt('Mo-Fr 8-12, 14-18; Fr geschlossen')).toBe('Mo–Do 08:00–12:00, 14:00–18:00');
  });

  it('meldet Unverständliches', () => {
    expect(parseOpeningHours('nach Vereinbarung').hours).toBeNull();
    const r = parseOpeningHours('Mo-Fr 8-12 (Vertreter nur dienstags)');
    expect(r.hours?.[0]).toEqual([{ from: 480, to: 720 }]);
    expect(r.problems).toContain('vertreter');
  });

  it('einzelne Tageszellen', () => {
    expect(parseDayCell('8-12, 14-18')).toEqual([{ from: 480, to: 720 }, { from: 840, to: 1080 }]);
    expect(parseDayCell('geschlossen')).toEqual([]);
    expect(parseDayCell('-')).toEqual([]);
    expect(parseDayCell('')).toBeUndefined();
  });

  it('Abfragen für ein Datum', () => {
    const h = parseOpeningHours('Mo-Fr 8-12, Mo Di Do 14-18').hours!;
    const mittwoch = new Date(2026, 10, 11, 13, 0);
    expect(hoursOn(h, mittwoch)).toEqual([{ from: 480, to: 720 }]);
    expect(hoursOn(undefined, mittwoch)).toBeUndefined();
    expect(openNow(h, new Date(2026, 10, 9, 10, 0))).toEqual({ open: true, until: 720 }); // Montag 10:00
    expect(openNow(h, new Date(2026, 10, 9, 13, 0))).toEqual({ open: false, next: 840 });
    expect(formatWeekHours(undefined)).toBe('unbekannt');
  });
});
