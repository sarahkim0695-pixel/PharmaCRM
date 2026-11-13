import { beforeEach, describe, expect, it } from 'vitest';
import { backupReminder, parseBackup } from '../../src/backup/backup';
import { resetDbConnection } from '../../src/db/database';
import { DEFAULT_SETTINGS, store } from '../../src/state/store';
import type { Practice, Settings } from '../../src/types';

const practice = (id: string, extra: Partial<Practice> = {}): Practice => ({
  id, name: `Praxis ${id}`, specialty: '', street: 'Hauptstr. 1', plz: '80331', city: 'München', status: 'Kunde',
  hint: '', phone: '', needsReview: false, geoStatus: 'ok', lat: 48.1, lng: 11.5, products: {}, source: 'import',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...extra,
});

beforeEach(async () => {
  await store.load();
  await store.clearAll();
});

describe('Datenspeicher (IndexedDB)', () => {
  it('speichert und lädt Praxen, Besuche, Produkte und Gebiet', async () => {
    await store.savePractices([practice('a'), practice('b')]);
    await store.saveVisit({ id: 'v1', practiceId: 'a', date: '2026-10-01', contact: 'Dr. X', note: 'Hallo', createdAt: '', updatedAt: '' });
    await store.saveVisit({ id: 'v2', practiceId: 'a', date: '2026-11-01', contact: '', note: '', createdAt: '', updatedAt: '' });
    await store.saveProduct({ id: 'p1', name: 'Produkt 1', note: '', archived: false, createdAt: '', updatedAt: '' });
    await store.setTerritory(['80333', '80331', '80331']);

    await resetDbConnection();
    await store.load(); // frisch aus der Datenbank
    expect(store.practices.size).toBe(2);
    expect(store.lastVisit('a')?.id).toBe('v2');
    expect(store.visitsFor('a').map((v) => v.id)).toEqual(['v2', 'v1']);
    expect(store.productList().map((p) => p.name)).toEqual(['Produkt 1']);
    expect(store.settings.territoryPlz).toEqual(['80331', '80333']);
    expect(store.settings.lastChangeAt).toBeTruthy();
  });

  it('löscht Besuche mit der Praxis und Produkte bei allen Praxen', async () => {
    await store.saveProduct({ id: 'p1', name: 'P', note: '', archived: false, createdAt: '', updatedAt: '' });
    await store.savePractices([practice('a', { products: { p1: 'kauft' } })]);
    await store.saveVisit({ id: 'v1', practiceId: 'a', date: '2026-10-01', contact: '', note: '', createdAt: '', updatedAt: '' });
    await store.deleteProduct('p1');
    expect(store.getPractice('a')?.products).toEqual({});
    await store.deletePractices(['a']);
    expect(store.visits.size).toBe(0);
  });

  it('Backup: Export → alles löschen → Wiederherstellen ergibt denselben Stand', async () => {
    await store.savePractices([practice('a', { products: { p1: 'angeboten' }, nextAppointment: '2026-11-10T09:00' })]);
    await store.saveVisit({ id: 'v1', practiceId: 'a', date: '2026-10-01', contact: 'Dr. X', note: 'Notiz', createdAt: '', updatedAt: '' });
    await store.saveProduct({ id: 'p1', name: 'P', note: '', archived: false, createdAt: '', updatedAt: '' });
    await store.setTerritory(['80331']);

    const json = JSON.stringify(store.toBackup());
    await store.clearAll();
    expect(store.practices.size).toBe(0);

    await store.restoreBackup(parseBackup(json));
    expect(store.getPractice('a')).toMatchObject({ nextAppointment: '2026-11-10T09:00', products: { p1: 'angeboten' } });
    expect(store.visits.get('v1')?.note).toBe('Notiz');
    expect(store.products.get('p1')?.name).toBe('P');
    expect(store.settings.territoryPlz).toEqual(['80331']);
    expect(store.settings.lastBackupAt).toBeTruthy();
  });

  it('Veranstaltungen: gelten für alle Praxen, Löschen entfernt die Angaben, Backup enthält sie', async () => {
    const ev = { id: 'e1', name: 'Wundforum', date: '2026-12-03', place: 'Augsburg', note: '', archived: false, createdAt: '', updatedAt: '' };
    await store.saveEvent(ev);
    await store.saveEvent({ ...ev, id: 'e2', name: 'Alt', archived: true });
    await store.savePractices([practice('a', { events: { e1: 'interesse' } }), practice('b', { events: { e1: 'kein', e2: 'interesse' } })]);
    expect(store.eventList().map((e) => e.id)).toEqual(['e1']);
    expect(store.eventList(true).map((e) => e.name)).toEqual(['Alt', 'Wundforum']); // Datum, dann Name

    const json = JSON.stringify(store.toBackup());
    await store.clearAll();
    expect(store.events.size).toBe(0);
    await store.restoreBackup(parseBackup(json));
    expect(store.events.get('e1')?.place).toBe('Augsburg');
    expect(store.getPractice('b')?.events).toEqual({ e1: 'kein', e2: 'interesse' });

    await resetDbConnection();
    await store.load();
    expect(store.events.size).toBe(2);

    await store.deleteEvent('e1');
    expect(store.events.has('e1')).toBe(false);
    expect(store.getPractice('a')?.events).toEqual({});
    expect(store.getPractice('b')?.events).toEqual({ e2: 'interesse' });
  });

  it('ältere Backups ohne Veranstaltungen lassen sich weiter einlesen', () => {
    const b = parseBackup(JSON.stringify({ app: 'RepMap', formatVersion: 1, practices: [], visits: [], products: [] }));
    expect(b.events).toEqual([]);
  });

  it('lehnt fremde oder kaputte Dateien verständlich ab', () => {
    expect(() => parseBackup('kein json')).toThrow(/kein JSON/);
    expect(() => parseBackup('{"app":"Excel"}')).toThrow(/keine RepMap-Backup-Datei/);
    expect(() => parseBackup('{"app":"RepMap","formatVersion":2}')).toThrow(/neueren RepMap-Version/);
    expect(() => parseBackup('{"app":"RepMap","formatVersion":1,"practices":[]}')).toThrow(/unvollständig/);
  });
});

describe('Backup-Erinnerung', () => {
  const s = (o: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...o });
  const now = new Date('2026-11-06T12:00:00Z');
  it('erinnert nur, wenn Daten vorhanden sind', () => {
    expect(backupReminder(s({}), false, now).due).toBe(false);
    expect(backupReminder(s({}), true, now)).toEqual({ due: true });
  });
  it('erinnert nach X Tagen, aber nur bei Änderungen', () => {
    const last = '2026-10-28T12:00:00Z'; // vor 9 Tagen
    expect(backupReminder(s({ lastBackupAt: last, lastChangeAt: '2026-11-01T00:00:00Z' }), true, now)).toEqual({ due: true, daysSince: 9 });
    expect(backupReminder(s({ lastBackupAt: last, lastChangeAt: '2026-10-27T00:00:00Z' }), true, now).due).toBe(false);
    expect(backupReminder(s({ lastBackupAt: '2026-11-03T12:00:00Z', lastChangeAt: '2026-11-05T00:00:00Z' }), true, now).due).toBe(false);
  });
  it('„Später“ verschiebt die Erinnerung', () => {
    expect(backupReminder(s({ backupSnoozeUntil: '2026-11-07T00:00:00Z' }), true, now).due).toBe(false);
  });
});
