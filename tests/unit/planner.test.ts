import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../src/state/store';
import { parseOpeningHours } from '../../src/tour/opening-hours';
import { addAppointments, computePlan, newTour } from '../../src/tour/planner';
import { clearTravelCache, estimateTravel, travelMatrix } from '../../src/tour/travel';
import type { Practice } from '../../src/types';

const practice = (id: string, lat: number, lng: number, extra: Partial<Practice> = {}): Practice => ({
  id, name: `Praxis ${id}`, specialty: '', street: 'Str. 1', plz: '80331', city: 'München', status: 'Kunde', hint: '', phone: '',
  needsReview: false, geoStatus: 'ok', lat, lng, products: {}, source: 'import', createdAt: '', updatedAt: '', ...extra,
});

/** Falscher Routing-Server: Fahrzeit aus der Luftlinie, Strecke = gerade Linie */
function fakeOsrm(calls: string[]) {
  return vi.fn(async (url: string) => {
    calls.push(url);
    const coords = decodeURIComponent(url.split('/driving/')[1].split('?')[0]).split(';').map((c) => {
      const [lng, lat] = c.split(',').map(Number);
      return { lat, lng };
    });
    if (url.includes('/table/')) {
      return new Response(JSON.stringify({
        code: 'Ok',
        durations: coords.map((a) => coords.map((b) => estimateTravel(a, b).minutes * 60)),
        distances: coords.map((a) => coords.map((b) => estimateTravel(a, b).km * 1000)),
      }));
    }
    return new Response(JSON.stringify({ code: 'Ok', routes: [{ geometry: { coordinates: coords.map((c) => [c.lng, c.lat]) } }] }));
  });
}

beforeEach(async () => {
  await store.load();
  await store.clearAll();
  clearTravelCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('Fahrzeiten', () => {
  it('nutzt den Routing-Server und schätzt, wenn er nicht erreichbar ist', async () => {
    const calls: string[] = [];
    const pts = [{ lat: 48.137, lng: 11.575 }, { lat: 48.366, lng: 10.894 }];
    const online = await travelMatrix(pts, fakeOsrm(calls));
    expect(online.source).toBe('osrm');
    expect(calls[0]).toContain('routing.openstreetmap.de/routed-car/table/v1/driving/11.57500,48.13700;10.89400,48.36600');
    clearTravelCache();
    const offline = await travelMatrix(pts, async () => { throw new Error('offline'); });
    expect(offline.source).toBe('estimate');
    expect(offline.minutes[0][1]).toBeGreaterThan(50); // München–Augsburg: deutlich über 50 min geschätzt
  });
});

describe('Tagesplan', () => {
  it('plant eine Tour mit Öffnungszeiten, Termin und Mittagspause', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', fakeOsrm(calls));
    await store.updateSettings({ home: { address: 'Zuhause', lat: 48.10, lng: 11.50 } });
    const vormittags = parseOpeningHours('Mo-Fr 8-12').hours!;
    const nachmittags = parseOpeningHours('Mo-Fr 14-18').hours!;
    await store.savePractices([
      practice('a', 48.14, 11.56, { openingHours: nachmittags }),
      practice('b', 48.15, 11.58, { openingHours: vormittags }),
      practice('c', 48.13, 11.60, { nextAppointment: '2026-11-11T11:00' }), // Mittwoch, Termin 11:00
      practice('d', 48.16, 11.55, { openingHours: parseOpeningHours('Mo Di 8-12').hours! }), // mittwochs zu
      practice('e', 48.16, 11.55, { lat: undefined, lng: undefined, geoStatus: 'not_found' }),
    ]);
    const tour = newTour('2026-11-11');
    tour.stops = ['a', 'b', 'd', 'e'].map((practiceId) => ({ practiceId, must: false }));
    expect(addAppointments(tour)).toBe(true);
    expect(tour.stops.find((s) => s.practiceId === 'c')?.must).toBe(true);

    const plan = await computePlan(tour);
    expect(plan.source).toBe('osrm');
    const visits = plan.entries.filter((e) => e.kind === 'visit');
    const order = visits.map((v) => (v.kind === 'visit' ? v.practiceId : ''));
    expect(order.sort()).toEqual(['a', 'b', 'c']);
    const at = (id: string) => visits.find((v) => v.kind === 'visit' && v.practiceId === id)!;
    expect(at('c').kind === 'visit' && at('c').start).toBe(11 * 60); // Termin pünktlich
    const b = at('b');
    expect(b.kind === 'visit' && b.end).toBeLessThanOrEqual(12 * 60); // vormittags
    const a = at('a');
    expect(a.kind === 'visit' && a.start).toBeGreaterThanOrEqual(14 * 60); // nachmittags
    expect(visits[0].kind === 'visit' && visits[0].wait).toBe(0); // morgens kein Warten (spätere Abfahrt)
    const brk = plan.entries.find((e) => e.kind === 'break');
    expect(brk).toBeTruthy();
    expect(plan.dropped).toEqual([
      { practiceId: 'd', reason: 'An diesem Tag geschlossen' },
      { practiceId: 'e', reason: 'Kein Standort – bitte Pin setzen' },
    ]);
    expect(plan.entries[0]).toMatchObject({ kind: 'start', label: 'Zuhause' });
    expect(plan.entries.at(-1)).toMatchObject({ kind: 'end', label: 'Zuhause' });
    expect(plan.geometry?.length).toBeGreaterThan(2);
    expect(plan.totals.visits).toBe(3);
  });

  it('verlangt eine Startadresse', async () => {
    await expect(computePlan(newTour('2026-11-11'))).rejects.toThrow(/Startadresse/);
  });

  it('plant „ab jetzt“ ohne bereits besuchte Praxen', async () => {
    vi.stubGlobal('fetch', fakeOsrm([]));
    await store.updateSettings({ home: { address: 'Zuhause', lat: 48.10, lng: 11.50 } });
    await store.savePractices([practice('a', 48.14, 11.56), practice('b', 48.15, 11.58)]);
    await store.saveVisit({ id: 'v', practiceId: 'a', date: '2026-11-11', contact: '', note: '', createdAt: '', updatedAt: '' });
    const tour = newTour('2026-11-11');
    tour.stops = [{ practiceId: 'a', must: false }, { practiceId: 'b', must: false }];
    const plan = await computePlan(tour, { fromMinutes: 13 * 60, position: { lat: 48.14, lng: 11.56 } });
    const visits = plan.entries.filter((e) => e.kind === 'visit');
    expect(visits.map((v) => v.kind === 'visit' && v.practiceId)).toEqual(['b']);
    expect(plan.totals.departure).toBeGreaterThanOrEqual(13 * 60);
    expect(plan.startPoint.label).toBe('Aktueller Standort');
  });

  it('nimmt die längere Dauer eines einzelnen Besuchs (nur für diesen Tag)', async () => {
    vi.stubGlobal('fetch', fakeOsrm([]));
    await store.updateSettings({ home: { address: 'Zuhause', lat: 48.10, lng: 11.50 } });
    await store.savePractices([practice('a', 48.14, 11.56, { visitMinutes: 20 }), practice('b', 48.15, 11.58)]);
    const tour = newTour('2026-11-11');
    tour.stops = [{ practiceId: 'a', must: true, visitMinutes: 75 }, { practiceId: 'b', must: true }];
    const plan = await computePlan(tour);
    const dur = Object.fromEntries(plan.entries.flatMap((e) => (e.kind === 'visit' ? [[e.practiceId, e.end - e.start]] : [])));
    expect(dur).toEqual({ a: 75, b: store.settings.tourDefaults.visitMinutes });
    expect(store.getPractice('a')!.visitMinutes).toBe(20); // Standard der Praxis bleibt
  });
});

describe('Dauer vor Ort einstellen', () => {
  it('Plus/Minus springt in sinnvollen Schritten', async () => {
    const { stepVisit, formatMinutes } = await import('../../src/tour/durations');
    expect(stepVisit(20, 1)).toBe(25);
    expect(stepVisit(30, 1)).toBe(45);
    expect(stepVisit(45, 1)).toBe(60);
    expect(stepVisit(60, -1)).toBe(45);
    expect(stepVisit(22, 1)).toBe(25); // krumme Werte aus der Excel
    expect(stepVisit(240, 1)).toBe(240);
    expect(stepVisit(5, -1)).toBe(5);
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 Std. 30 min');
    expect(formatMinutes(120)).toBe('2 Std.');
  });
});
