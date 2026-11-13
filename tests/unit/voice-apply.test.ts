import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '../../src/state/store';
import { clearTravelCache, estimateTravel } from '../../src/tour/travel';
import { interpretCommand } from '../../src/tour/voice';
import { applyVoiceCommand } from '../../src/tour/voice-apply';
import type { Practice } from '../../src/types';

const practice = (id: string, name: string, city: string, lat: number, lng: number, extra: Partial<Practice> = {}): Practice => ({
  id, name, specialty: 'Orthopädie', street: 'Str. 1', plz: '86150', city, status: 'Kunde', hint: '', phone: '',
  needsReview: false, geoStatus: 'ok', lat, lng, products: {}, source: 'import', createdAt: '', updatedAt: '', ...extra,
});

/** Falscher Routing-Server: Fahrzeit aus der Luftlinie */
const fakeOsrm = vi.fn(async (url: string) => {
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

beforeEach(async () => {
  await store.load();
  await store.clearAll();
  clearTravelCache();
  vi.stubGlobal('fetch', fakeOsrm);
  await store.updateSettings({ home: { address: 'Zuhause', lat: 48.14, lng: 11.56 } }); // München
  await store.savePractices([
    practice('huber', 'Praxis Dr. Hans Huber', 'Augsburg', 48.366, 10.894),
    practice('a2', 'Orthopädie Zentrum', 'Augsburg', 48.37, 10.9),
    practice('a3', 'Praxis Dr. Klein', 'Augsburg', 48.36, 10.88, { status: 'Interessent' }),
    practice('a4', 'Hausarztpraxis Mitte', 'Augsburg', 48.368, 10.897, { specialty: 'Allgemeinmedizin' }),
    practice('lang', 'Dr. Peter Lang', 'Augsburg', 48.365, 10.89),
    practice('muc', 'Praxis München', 'München', 48.14, 11.57),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

const today = new Date(2026, 10, 16); // Montag
const cmd = (text: string) => interpretCommand(text, { today, practices: store.practiceList() });

describe('Sprach-Auftrag ausführen', () => {
  it('plant Dienstag in Augsburg mit festem Termin, auffüllen, Pause, Mitbringen', async () => {
    const r = await applyVoiceCommand(
      cmd('Dienstag Tour in Augsburg, Dr. Huber um 10 Uhr fest, Rest auffüllen, ohne Dr. Lang, Mittagspause halb eins, Muster A für Dr. Huber mitnehmen, Visitenkarten einpacken'),
      { currentDate: '2026-11-20', getPosition: async () => null },
    );
    expect(r.date).toBe('2026-11-17');
    expect(r.error).toBeUndefined();
    expect(r.summary).toMatch(/^Tour für Dienstag, 17\.11\.: \d Besuche, Abfahrt \d+ Uhr/);
    const tour = store.tours.get('2026-11-17')!;
    expect(tour.region).toEqual({ cities: ['Augsburg'], radiusKm: 10 });
    expect(tour.lunch).toMatchObject({ enabled: true, from: 750, to: 795, minutes: 45 });
    const ids = tour.stops.map((s) => s.practiceId);
    expect(ids).toContain('huber');
    expect(ids).not.toContain('lang'); // ausgeschlossen
    expect(ids).not.toContain('a4'); // Hausarzt – Standard nur Orthopäden
    expect(ids).not.toContain('muc'); // nicht in der Region
    expect(tour.stops.find((s) => s.practiceId === 'huber')).toMatchObject({ must: true, bring: 'Muster A' });
    expect(tour.dayNote).toBe('Visitenkarten');
    expect(store.getPractice('huber')!.nextAppointment).toBe('2026-11-17T10:00');
    expect(tour.plan!.entries.some((e) => e.kind === 'visit' && e.practiceId === 'huber')).toBe(true);
    expect(store.settings.activeTourDate).toBe('2026-11-17');
  });

  it('„dauert eine Stunde“ verlängert nur diesen Besuch', async () => {
    await applyVoiceCommand(cmd('Donnerstag Dr. Huber um 10 Uhr fest, dauert eine Stunde'), { currentDate: '2026-11-20', getPosition: async () => null });
    const tour = store.tours.get('2026-11-19')!;
    expect(tour.stops.find((s) => s.practiceId === 'huber')).toMatchObject({ must: true, visitMinutes: 60 });
    const visit = tour.plan!.entries.find((e) => e.kind === 'visit' && e.practiceId === 'huber');
    expect(visit && visit.kind === 'visit' && visit.end - visit.start).toBe(60);
    expect(store.getPractice('huber')!.visitMinutes).toBeUndefined();
  });

  it('auch Hausärzte, nur Startlöcher', async () => {
    await applyVoiceCommand(cmd('Mittwoch in Augsburg auch Hausärzte, nur Kunden in den Startlöchern'), { currentDate: '2026-11-20', getPosition: async () => null });
    const tour = store.tours.get('2026-11-18')!;
    expect(tour.kinds).toEqual(['ortho', 'hausarzt']);
    expect(tour.stops.map((s) => s.practiceId)).toEqual(['a3']); // nur „Interessent“
  });

  it('ohne Startadresse: Tour vorbereitet, Hinweis statt Absturz', async () => {
    await store.updateSettings({ home: undefined });
    const r = await applyVoiceCommand(cmd('Dr. Huber fest'), { currentDate: '2026-11-20', getPosition: async () => null });
    expect(r.date).toBe('2026-11-20');
    expect(r.error).toMatch(/Startadresse/);
    expect(store.tours.get('2026-11-20')!.stops).toMatchObject([{ practiceId: 'huber', must: true }]);
  });
});
