import { beforeEach, describe, expect, it } from 'vitest';
import { allPairs, coreName, findDuplicates, mergeRecords } from '../../src/state/duplicates';
import { store } from '../../src/state/store';
import { newTour } from '../../src/tour/planner';
import type { Practice } from '../../src/types';
import { detectKind } from '../../src/utils/kind';

const p = (id: string, o: Partial<Practice> = {}): Practice => ({
  id, name: `Praxis ${id}`, specialty: '', street: `Weg ${id}`, plz: '80331', city: 'München', status: 'Kunde', hint: '', phone: '',
  needsReview: false, geoStatus: 'pending', products: {}, source: 'import', createdAt: '', updatedAt: '', ...o,
});
const ids = (groups: ReturnType<typeof findDuplicates>) => groups.map((g) => g.practices.map((x) => x.id).sort());

describe('Kliniken erkennen', () => {
  it('über Spalte, Tabellenblatt oder Name', () => {
    expect(detectKind('Dr. Muster', 'Klinik').kind).toBe('klinik');
    expect(detectKind('Klinikum Nord', 'Praxis').kind).toBe('praxis'); // Spalte gewinnt
    expect(detectKind('Dr. Muster', '', 'Kliniken')).toEqual({ kind: 'klinik', source: 'sheet' });
    expect(detectKind('Kreisklinik Ebersberg')).toEqual({ kind: 'klinik', source: 'name' });
    expect(detectKind('Krankenhaus Agatharied').kind).toBe('klinik');
    expect(detectKind('Praxis Dr. Muster')).toEqual({ kind: 'praxis', source: 'default' });
  });
});

describe('Doppelte Standorte', () => {
  it('Namenskern ohne Titel', () => {
    expect(coreName('Praxis Dr. med. Anna Muster')).toBe('anna muster');
    expect(coreName('Gemeinschaftspraxis Dr. Müller & Partner')).toBe('muller partner');
  });

  it('findet gleiche Adresse, gleichen Namen und gleiche Position', () => {
    const list = [
      p('a', { street: 'Hauptstraße 5' }),
      p('b', { street: 'Hauptstr. 5', name: 'Orthopädie im Ärztehaus' }), // gleiche Adresse, andere Schreibweise
      p('c', { name: 'Dr. med. Anna Muster' }),
      p('d', { name: 'Praxis Dr. Anna Muster', street: 'Ringstraße 1' }), // gleicher Name, gleiche PLZ
      p('e', { lat: 48.1, lng: 11.5, geoStatus: 'ok' }),
      p('f', { lat: 48.10005, lng: 11.50005, geoStatus: 'manual' }), // ~7 m entfernt
      p('g', { lat: 48.10005, lng: 11.50005, geoStatus: 'approx' }), // ungenau → zählt nicht
      p('h', { street: 'Hauptstraße', plz: '80333' }), // ohne Hausnummer → zu ungenau
      p('i', { street: 'Hauptstraße', plz: '80333' }),
    ];
    const groups = findDuplicates(list);
    expect(ids(groups)).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']]);
    expect(groups[0].reasons).toEqual(['address']);
    expect(groups[1].reasons).toEqual(['name']);
    expect(groups[2].reasons).toEqual(['position']);
  });

  it('übergeht als „verschieden“ markierte Paare (Ärztehaus)', () => {
    const list = [p('a', { street: 'Hauptstraße 5' }), p('b', { street: 'Hauptstraße 5' }), p('c', { street: 'Hauptstraße 5' })];
    expect(ids(findDuplicates(list))).toEqual([['a', 'b', 'c']]);
    expect(findDuplicates(list, new Set(allPairs(['a', 'b', 'c'])))).toEqual([]);
  });

  it('führt Angaben zusammen', () => {
    const keep = p('a', { products: { x: 'angeboten' }, hint: 'Hinweis A' });
    const other = p('b', { products: { x: 'kauft', y: 'angeboten' }, hint: 'Hinweis B', phone: '089 1', lat: 48, lng: 11, geoStatus: 'ok', nextAppointment: '2026-11-20', needsReview: true });
    const m = mergeRecords(keep, [other]);
    expect(m).toMatchObject({ id: 'a', products: { x: 'kauft', y: 'angeboten' }, hint: 'Hinweis A · Hinweis B', phone: '089 1', lat: 48, geoStatus: 'ok', nextAppointment: '2026-11-20', needsReview: true });
  });
  it('führt Veranstaltungs-Antworten zusammen („Interesse“ gewinnt)', () => {
    const keep = p('a', { events: { e1: 'kein', e2: 'kein' } });
    const other = p('b', { events: { e1: 'interesse', e3: 'kein' } });
    expect(mergeRecords(keep, [other]).events).toEqual({ e1: 'interesse', e2: 'kein', e3: 'kein' });
    expect(mergeRecords(p('a'), [p('b')]).events).toBeUndefined();
  });
});

describe('Zusammenführen im Datenspeicher', () => {
  beforeEach(async () => {
    await store.load();
    await store.clearAll();
  });

  it('verschiebt Besuche und Tour-Stopps auf den behaltenen Eintrag', async () => {
    await store.savePractices([p('a', { street: 'Hauptstraße 5' }), p('b', { street: 'Hauptstraße 5' })]);
    await store.saveVisit({ id: 'v', practiceId: 'b', date: '2026-11-01', contact: '', note: 'Notiz', createdAt: '', updatedAt: '' });
    const tour = newTour('2026-11-20');
    tour.stops = [{ practiceId: 'a', must: false }, { practiceId: 'b', must: true }];
    await store.saveTour(tour);

    await store.mergePractices('a', ['b']);
    expect(store.getPractice('b')).toBeUndefined();
    expect(store.visits.get('v')?.practiceId).toBe('a');
    expect(store.tours.get('2026-11-20')?.stops).toEqual([{ practiceId: 'a', must: false }]);
    await store.load(); // auch dauerhaft gespeichert?
    expect(store.practices.size).toBe(1);
    expect(store.visits.get('v')?.practiceId).toBe('a');
  });

  it('merkt sich „verschieden“', async () => {
    await store.dismissDuplicates(allPairs(['a', 'b']));
    await store.load();
    expect(store.settings.dismissedDuplicates).toEqual(['a|b']);
  });
});
