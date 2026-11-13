import { describe, expect, it } from 'vitest';
import { interpretCommand, splitClauses, type VoiceContext } from '../../src/tour/voice';

const pr = (id: string, name: string, city: string, specialty = 'Orthopädie', kind?: 'klinik') => ({ id, name, city, specialty, kind });
const ctx: VoiceContext = {
  today: new Date(2026, 10, 16), // Montag, 16.11.2026
  practices: [
    pr('huber', 'Praxis Dr. Hans Huber', 'Augsburg'),
    pr('meyer', 'Dr. med. Klaus Meyer', 'Augsburg'),
    pr('maier', 'Orthopädie Dr. Maier', 'Landshut'),
    pr('dom', 'Praxis am Dom', 'Passau', 'Zahnmedizin'),
    pr('rathaus', 'Orthopädie am Rathaus', 'Landshut'),
    pr('muster', 'Hausarztpraxis Muster', 'München', 'Innere Medizin'),
    pr('chir', 'Chirurgie Ingolstadt', 'Ingolstadt', 'Chirurgie'),
    pr('allgaeu', 'Praxis Allgäu', 'Kempten (Allgäu)'),
    pr('lang', 'Dr. Peter Lang', 'Friedberg'),
    pr('klinik', 'Klinikum Augsburg Süd', 'Augsburg', 'Chirurgie', 'klinik'),
  ],
};
const run = (text: string) => interpretCommand(text, ctx);

describe('Sprachsteuerung – Teilsätze', () => {
  it('trennt an Satzende und Komma, aber nicht bei „Dr.“, Uhrzeiten oder Datum', () => {
    expect(splitClauses('Dienstag in Augsburg. Dr. Huber um 10.30 Uhr fest, am 3.12. Rest auffüllen')).toEqual([
      'Dienstag in Augsburg',
      'Dr. Huber um 10.30 Uhr fest',
      'am 3.12. Rest auffüllen',
    ]);
  });
});

describe('Sprachsteuerung – Verstehen', () => {
  it('ganzer Auftrag in einem Satz', () => {
    const c = run('Plane mir für Dienstag eine Tour in Augsburg. Dr. Huber um 10 Uhr fest, den Rest mit fälligen Orthopäden auffüllen, Mittagspause halb eins, maximal 6 Besuche.');
    expect(c.date).toBe('2026-11-17');
    expect(c.region).toEqual({ cities: ['Augsburg'], radiusKm: 10 });
    expect(c.fixed).toMatchObject([{ practiceId: 'huber', time: 600 }]);
    expect(c.fill).toBe(true);
    expect(c.onlyDue).toBe(true);
    expect(c.kinds).toEqual({ mode: 'set', kinds: ['ortho'] });
    expect(c.lunch).toEqual({ enabled: true, from: 750, to: 795, minutes: 45 });
    expect(c.maxVisits).toBe(6);
    expect(c.unknown).toEqual([]);
  });

  it('Arbeitszeit und Pause', () => {
    const c = run('Morgen ab 7:30 los, bis 16 Uhr fertig, ohne Mittagspause');
    expect(c).toMatchObject({ date: '2026-11-17', dayStart: 450, dayEnd: 960, lunch: { enabled: false } });
    expect(c.unknown).toEqual([]);
    const d = run('Viertel neun los und um 17 Uhr wieder zuhause');
    expect(d).toMatchObject({ dayStart: 495, dayEnd: 1020, returnHome: true });
    expect(run('Mittagspause 30 Minuten zwischen 12 und 14 Uhr').lunch).toEqual({ enabled: true, from: 720, to: 840, minutes: 30 });
    expect(run('Mittagspause von 12:30 bis 13:15').lunch).toEqual({ enabled: true, from: 750, to: 795, minutes: 45 });
    expect(run('Mittagspause zwischen 12 und 14 Uhr, 30 Minuten').lunch).toEqual({ enabled: true, from: 720, to: 840, minutes: 30 });
    expect(run('Mittagspause um 12, eine Stunde').lunch).toEqual({ enabled: true, from: 720, to: 780, minutes: 60 });
  });

  it('Region mit Umkreis, Gruppen und Kundenstatus', () => {
    const c = run('Mittwoch rund um Landshut, auch Hausärzte, nur Kunden in den Startlöchern');
    expect(c.date).toBe('2026-11-18');
    expect(c.region).toEqual({ cities: ['Landshut'], radiusKm: 15 });
    expect(c.kinds).toEqual({ mode: 'add', kinds: ['hausarzt'] });
    expect(c.states).toEqual(['prozess']);
    expect(c.fill).toBe(true);
    expect(run('Tour in Augsburg im Umkreis von 20 km').region).toEqual({ cities: ['Augsburg'], radiusKm: 20 });
    expect(run('Nur in Augsburg').region).toEqual({ cities: ['Augsburg'], radiusKm: 0 });
    expect(run('Tour in Augsburg ohne Kliniken').kinds).toEqual({ mode: 'remove', kinds: ['klinik'] });
    expect(run('Freitag nur Praxen, die nicht in Kontakt sind').states).toEqual(['kein']);
  });

  it('Datum: Wochentag, nächste Woche, Datum, Monatsname', () => {
    expect(run('Nächste Woche Freitag nur Hausärzte in München, 4 Besuche')).toMatchObject({
      date: '2026-11-27',
      kinds: { mode: 'set', kinds: ['hausarzt'] },
      region: { cities: ['München'] },
      maxVisits: 4,
    });
    expect(run('Tour am 3.12. in Kempten').date).toBe('2026-12-03');
    expect(run('am 5. Januar').date).toBe('2027-01-05');
    expect(run('übermorgen').date).toBe('2026-11-18');
    expect(run('heute').date).toBe('2026-11-16');
  });

  it('Praxen unscharf erkennen (Doktor Maier ≈ Dr. Meyer), Ort hilft bei mehreren Treffern', () => {
    const c = run('Doktor Maier um 14 Uhr');
    expect(c.fixed[0].candidates.sort()).toEqual(['maier', 'meyer']);
    expect(c.fixed[0].time).toBe(840);
    const d = run('Tour in Landshut, Doktor Maier um 2');
    expect(d.fixed[0].practiceId).toBe('maier');
    expect(d.fixed[0].time).toBe(840); // „um 2“ = 14 Uhr
    expect(run('Orthopädie am Rathaus fest').fixed).toMatchObject([{ practiceId: 'rathaus' }]);
    expect(run('Termin bei Praxis am Dom um 9:15').fixed).toMatchObject([{ practiceId: 'dom', time: 555 }]);
    // Ortsname im Praxisnamen: „Tour in Ingolstadt“ ist keine Praxis
    const e = run('Tour in Ingolstadt');
    expect(e.fixed).toEqual([]);
    expect(e.region?.cities).toEqual(['Ingolstadt']);
  });

  it('mehrere Praxen mit eigenen Uhrzeiten, optional', () => {
    const c = run('Dr. Huber um 9 und Dr. Lang um 11:30, Praxis Allgäu wenn es passt');
    expect(c.fixed).toMatchObject([
      { practiceId: 'huber', time: 540 },
      { practiceId: 'lang', time: 690 },
      { practiceId: 'allgaeu', optional: true },
    ]);
  });

  it('längere Zeit vor Ort für einen Besuch', () => {
    expect(run('Dr. Huber um 10 Uhr fest, dauert eine Stunde').fixed).toMatchObject([{ practiceId: 'huber', time: 600, minutes: 60 }]);
    expect(run('bei Dr. Lang 90 Minuten einplanen').fixed).toMatchObject([{ practiceId: 'lang', minutes: 90 }]);
    expect(run('Dr. Huber anderthalb Stunden').fixed).toMatchObject([{ practiceId: 'huber', minutes: 90 }]);
    const c = run('Dr. Huber um 9 und Dr. Lang um 11 für 2 Stunden');
    expect(c.fixed).toMatchObject([{ practiceId: 'huber', time: 540 }, { practiceId: 'lang', time: 660, minutes: 120 }]);
    expect(c.fixed[0].minutes).toBeUndefined();
    expect(c.unknown).toEqual([]);
    // Minuten nach der Mittagspause gehören weiter zur Pause
    expect(run('Dr. Huber fest, Mittagspause halb eins, 30 Minuten').fixed[0].minutes).toBeUndefined();
  });

  it('Praxen weglassen', () => {
    expect(run('Tour in Kempten ohne Praxis Allgäu').exclude).toMatchObject([{ practiceId: 'allgaeu' }]);
    expect(run('Lass Dr. Lang weg').exclude).toMatchObject([{ practiceId: 'lang' }]);
    expect(run('Wie lange dauert die Tour').fixed).toEqual([]); // „lange“ ist nicht Dr. Lang
  });

  it('Mitbringen und Notizen', () => {
    const c = run('Muster A und Katalog für Dr. Huber mitnehmen, Visitenkarten einpacken');
    expect(c.bring).toEqual([
      { target: expect.objectContaining({ practiceId: 'huber' }), items: 'Muster A und Katalog' },
      { target: undefined, items: 'Visitenkarten' },
    ]);
    // „Muster“ ist hier keine Praxis
    expect(run('Muster A mitnehmen').bring).toEqual([{ target: undefined, items: 'Muster A' }]);
    // Aufzählung vor dem Komma gehört dazu
    expect(run('Muster A, Katalog für Praxis am Dom mitnehmen').bring).toEqual([
      { target: expect.objectContaining({ practiceId: 'dom' }), items: 'Muster A, Katalog' },
    ]);
    expect(run('Notiz: Parkhaus am Dom nehmen').note).toBe('Parkhaus am Dom nehmen');
  });

  it('Start, Rückkehr, neu anfangen, unbekannte Orte', () => {
    expect(run('von hier aus starten').startMode).toBe('here');
    expect(run('nicht mehr nach Hause zurück').returnHome).toBe(false);
    expect(run('Neu anfangen: Freitag in Augsburg')).toMatchObject({ clear: true, date: '2026-11-20' });
    const c = run('Tour in Regensburg');
    expect(c.unknownPlaces).toEqual(['Regensburg']);
    expect(c.region).toBeUndefined();
  });

  it('meldet Unverstandenes, ohne zu raten', () => {
    const c = run('Dienstag Blumen gießen');
    expect(c.date).toBe('2026-11-17');
    expect(c.unknown).toEqual(['blumen', 'giesen']);
  });
});

describe('Sprachsteuerung – Platzhalter und weitere Pausen', () => {
  it('Online-Schulung, Telefonkonferenz, Kaffeepause', () => {
    expect(run('Online-Schulung von 14 bis 15:30').blocks).toEqual([{ kind: 'termin', title: 'Online-Schulung', minutes: 90, from: 840, to: 930 }]);
    expect(run('Telefonkonferenz um 9, 30 Minuten').blocks).toEqual([{ kind: 'termin', title: 'Telefonkonferenz', minutes: 30, from: 540, to: 570 }]);
    expect(run('Kaffeepause 20 Minuten zwischen 15 und 17 Uhr').blocks).toEqual([{ kind: 'pause', title: 'Kaffeepause', minutes: 20, from: 900, to: 1020 }]);
    expect(run('Nachmittags eine Stunde Büro').blocks).toEqual([{ kind: 'termin', title: 'Büro', minutes: 60, from: 780, to: 1080 }]);
    expect(run('Pause um 16 Uhr').blocks).toEqual([{ kind: 'pause', title: 'Pause', minutes: 15, from: 960, to: 975 }]);
    // Mittagspause bleibt die Mittagspause
    const c = run('Dienstag in Augsburg, Mittagspause halb eins, Online-Schulung von 14 bis 15 Uhr');
    expect(c.lunch).toMatchObject({ enabled: true, from: 750 });
    expect(c.blocks).toMatchObject([{ title: 'Online-Schulung', from: 840, to: 900 }]);
    expect(c.unknown).toEqual([]);
  });
});
