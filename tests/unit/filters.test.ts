import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, matchesFilter, sortPractices, distanceKm, activeFilterCount, type FilterContext } from '../../src/state/filters';
import type { Practice, Visit } from '../../src/types';
import { colorForStatus, statusKey } from '../../src/utils/colors';
import { daysSince, formatDate, relativeDays } from '../../src/utils/dates';
import { normalizePlz, parsePlzList } from '../../src/utils/text';

const base: Practice = {
  id: '1', name: 'Praxis A', specialty: 'Allgemeinmedizin', street: 'Hauptstr. 1', plz: '80331', city: 'München',
  status: 'Kunde', hint: '', phone: '', needsReview: false, geoStatus: 'ok', lat: 48.1, lng: 11.5, products: {},
  source: 'import', createdAt: '', updatedAt: '',
};
const p = (o: Partial<Practice>): Practice => ({ ...base, ...o });
const visits: Record<string, Visit> = {
  '1': { id: 'v1', practiceId: '1', date: '2026-10-30', contact: '', note: '', createdAt: '', updatedAt: '' },
  '2': { id: 'v2', practiceId: '2', date: '2026-01-10', contact: '', note: '', createdAt: '', updatedAt: '' },
};
const ctx: FilterContext = { lastVisit: (id) => visits[id], intervalOf: () => 90, territory: new Set(['80331']), today: new Date(2026, 10, 6) };

describe('Filter', () => {
  const list = [
    p({ id: '1' }),
    p({ id: '2', name: 'Orthopädie Süd', specialty: 'Orthopädie', status: 'kein Kunde', plz: '86150', city: 'Augsburg', needsReview: true }),
    p({ id: '3', name: 'Praxis Ö', status: 'Interessent', geoStatus: 'not_found', lat: undefined, lng: undefined, nextAppointment: '2026-11-10', products: { prod1: 'angeboten' } }),
  ];
  const ids = (f: Partial<typeof EMPTY_FILTER>) => list.filter((x) => matchesFilter(x, { ...EMPTY_FILTER, ...f }, ctx)).map((x) => x.id);

  it('sucht ohne Rücksicht auf Umlaute/Groß-Kleinschreibung in mehreren Feldern', () => {
    expect(ids({ search: 'orthopadie augsburg' })).toEqual(['2']);
    expect(ids({ search: 'MÜNCHEN' })).toEqual(['1', '3']);
  });
  it('filtert nach Status, Ort, prüfen, Standort, Termin, Gebiet, Produkt', () => {
    expect(ids({ statuses: ['kein'] })).toEqual(['2']);
    expect(ids({ statuses: ['prozess'] })).toEqual(['3']); // „Interessent“ → im Gespräch
    expect(ids({ cities: ['Augsburg'] })).toEqual(['2']);
    expect(ids({ onlyReview: true })).toEqual(['2']);
    expect(ids({ locationProblem: true })).toEqual(['3']);
    expect(ids({ hasAppointment: true })).toEqual(['3']);
    expect(ids({ territory: 'outside' })).toEqual(['2']);
    expect(ids({ productId: 'prod1', productState: 'angeboten' })).toEqual(['3']);
    expect(ids({ productId: 'prod1', productState: 'kauft' })).toEqual([]);
  });
  it('erkennt „lange nicht besucht“ (inkl. nie besucht)', () => {
    expect(ids({ stale: true })).toEqual(['2', '3']);
  });
  it('zählt aktive Filter', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTER, statuses: ['aktiv'], stale: true })).toBe(2);
  });
  it('sortiert nach Name, letztem Besuch, Termin und Entfernung', () => {
    expect(sortPractices(list, 'name', ctx).map((x) => x.id)).toEqual(['2', '1', '3']);
    expect(sortPractices(list, 'lastVisit', ctx).map((x) => x.id)).toEqual(['3', '2', '1']);
    expect(sortPractices(list, 'nextAppointment', ctx)[0].id).toBe('3');
    const near = sortPractices([p({ id: 'far', lat: 48.4 }), p({ id: 'near', lat: 48.11 })], 'distance', { ...ctx, position: { lat: 48.1, lng: 11.5 } });
    expect(near.map((x) => x.id)).toEqual(['near', 'far']);
  });
  it('berechnet Entfernungen', () => {
    expect(Math.round(distanceKm({ lat: 48.137, lng: 11.575 }, { lat: 48.366, lng: 10.894 }))).toBe(56); // München–Augsburg Luftlinie
  });
});

describe('Hilfsfunktionen', () => {
  it('PLZ', () => {
    expect(normalizePlz(1067)).toBe('01067');
    expect(normalizePlz('80331 ')).toBe('80331');
    expect(parsePlzList('80331, 80333;81245\n80331 und 1234')).toEqual(['80331', '80333', '81245']);
  });
  it('Status-Farben', () => {
    expect(statusKey(' Kein-Kunde ')).toBe('kein kunde');
    expect(colorForStatus('Kunde')).toBe('#1f9d55');
    expect(colorForStatus('kein Kunde')).toBe('#d64545');
    expect(colorForStatus('Interessent')).toBe(colorForStatus('interessent'));
    expect(colorForStatus('Kunde', { kunde: '#000000' })).toBe('#000000');
  });
  it('Datum', () => {
    const today = new Date(2026, 10, 6);
    expect(daysSince('2026-11-01', today)).toBe(5);
    expect(relativeDays('2026-11-06', today)).toBe('heute');
    expect(relativeDays('2026-11-03', today)).toBe('vor 3 Tagen');
    expect(relativeDays('2026-11-09', today)).toBe('in 3 Tagen');
    expect(formatDate('2026-11-06')).toBe('06.11.2026');
    expect(formatDate('2026-11-06T14:30')).toBe('06.11.2026, 14:30 Uhr');
  });
});
