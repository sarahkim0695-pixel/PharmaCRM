import { beforeEach, describe, expect, it } from 'vitest';
import { store } from '../../src/state/store';
import { optimizeTour, type OptStop } from '../../src/tour/optimizer';
import { packingList, splitItems } from '../../src/tour/packing';
import { newTour, suggestPractices, tourKinds, visitPriority } from '../../src/tour/planner';
import { filterState } from '../../src/state/filters';
import { kindCounts, listPractices, mapPractices } from '../../src/state/selectors';
import { parseOpeningHours } from '../../src/tour/opening-hours';
import type { Practice } from '../../src/types';

const p = (id: string, lat: number, lng: number, o: Partial<Practice> = {}): Practice => ({
  id, name: `Praxis ${id}`, specialty: '', street: `Weg ${id}`, plz: '80331', city: 'München', status: 'Kunde', hint: '', phone: '',
  needsReview: false, geoStatus: 'ok', lat, lng, products: {}, source: 'import', createdAt: '', updatedAt: '', ...o,
});
const visit = (practiceId: string, date: string) => ({ id: `v-${practiceId}-${date}`, practiceId, date, contact: '', note: '', createdAt: '', updatedAt: '' });
const DATE = '2026-11-17'; // Dienstag

beforeEach(async () => {
  await store.load();
  await store.clearAll();
  await store.updateSettings({ home: { address: 'Zuhause', lat: 48.14, lng: 11.56 } }); // München
});

describe('Dringlichkeit', () => {
  it('fällige Besuche und laufende Gespräche zuerst', async () => {
    await store.savePractices([
      p('aktiv-faellig', 48.1, 11.5, { status: 'Kunde' }),
      p('aktiv-frisch', 48.1, 11.5, { status: 'Kunde' }),
      p('gespraech', 48.1, 11.5, { status: 'Interessent' }),
      p('kein', 48.1, 11.5, { status: 'kein Kunde' }),
    ]);
    await store.saveVisit(visit('aktiv-faellig', '2026-09-01')); // lange her
    await store.saveVisit(visit('aktiv-frisch', '2026-11-10')); // gerade erst
    await store.saveVisit(visit('gespraech', '2026-10-20'));
    await store.saveVisit(visit('kein', '2026-09-01'));
    const d = new Date(2026, 10, 17);
    const prio = (id: string) => visitPriority(store.getPractice(id)!, d);
    expect(prio('aktiv-faellig')).toBeGreaterThan(prio('aktiv-frisch'));
    expect(prio('gespraech')).toBeGreaterThan(prio('kein'));
  });
});

describe('Gruppen: Reiter, Karte und Tour-Vorschläge', () => {
  const mixed = () => [
    p('ortho', 48.537, 12.152, { city: 'Landshut', specialty: 'Orthopädie' }),
    p('haus', 48.538, 12.153, { city: 'Landshut', specialty: 'Allgemeinmedizin' }),
    p('zahn', 48.539, 12.154, { city: 'Landshut', specialty: 'Kieferorthopädie' }),
    p('klinik', 48.540, 12.155, { city: 'Landshut', kind: 'klinik' }),
  ];

  it('beim Start: Liste und Karte zeigen nur Orthopäden', async () => {
    await store.savePractices(mixed());
    filterState.reset();
    expect(filterState.listKind).toBe('ortho');
    expect(filterState.mapKinds).toEqual(['ortho']);
    expect(listPractices().map((x) => x.id)).toEqual(['ortho']);
    expect(mapPractices().map((x) => x.id)).toEqual(['ortho']);
    expect(Object.fromEntries(Object.entries(kindCounts()).map(([k, v]) => [k, v.total]))).toEqual({ ortho: 1, hausarzt: 1, zahn: 1, klinik: 1 });
  });

  it('Reiter wechseln und auf der Karte mehrere Gruppen zeigen', async () => {
    await store.savePractices(mixed());
    filterState.setListKind('hausarzt');
    expect(listPractices().map((x) => x.id)).toEqual(['haus']);
    filterState.setMapKinds(['hausarzt', 'ortho']);
    expect(mapPractices().map((x) => x.id).sort()).toEqual(['haus', 'ortho']);
    filterState.showOnMap('klinik'); // z. B. „Auf Karte zeigen“ bei einer Klinik
    expect(filterState.mapKinds).toContain('klinik');
    // Suche zählt je Gruppe
    filterState.update({ search: 'Praxis zahn' });
    expect(kindCounts().zahn.filtered).toBe(1);
    expect(kindCounts().ortho.filtered).toBe(0);
    filterState.reset();
    filterState.setListKind('ortho');
    filterState.setMapKinds(['ortho']);
  });

  it('Tour-Vorschläge nur aus den gewählten Gruppen (Standard: Orthopäden)', async () => {
    await store.savePractices(mixed());
    const tour = { ...newTour(DATE), region: { cities: ['Landshut'], radiusKm: 0 } };
    expect(tourKinds(tour)).toEqual(['ortho']);
    expect(suggestPractices(tour).map((s) => s.practice.id)).toEqual(['ortho']);
    const both = { ...tour, kinds: ['ortho', 'hausarzt'] as const };
    expect(suggestPractices({ ...both, kinds: [...both.kinds] }).map((s) => s.practice.id).sort()).toEqual(['haus', 'ortho']);
  });
});

describe('Vorschläge', () => {
  it('Region: nur Praxen im gewählten Ort bzw. Umkreis, keine gerade besuchten oder geschlossenen', async () => {
    await store.savePractices([
      p('la1', 48.537, 12.152, { city: 'Landshut' }),
      p('la2', 48.540, 12.160, { city: 'Landshut' }),
      p('ergolding', 48.575, 12.205, { city: 'Ergolding' }), // ~6 km
      p('la-zu', 48.54, 12.15, { city: 'Landshut', openingHours: parseOpeningHours('Mo 8-12').hours! }), // dienstags zu
      p('la-frisch', 48.54, 12.15, { city: 'Landshut' }),
      p('muc', 48.14, 11.56, { city: 'München' }),
    ]);
    await store.saveVisit(visit('la-frisch', '2026-11-15'));
    const tour = { ...newTour(DATE), region: { cities: ['Landshut'], radiusKm: 0 } };
    expect(suggestPractices(tour).map((s) => s.practice.id).sort()).toEqual(['la1', 'la2']);
    tour.region.radiusKm = 10;
    const ids = suggestPractices(tour).map((s) => s.practice.id);
    expect(ids).toContain('ergolding');
    expect(ids).not.toContain('muc');
    expect(suggestPractices(tour)[0].why).toMatch(/Bestellender Kunde · noch nie besucht/);
  });

  it('feste Praxis: ergänzt Besuche auf der Strecke und in der Nähe, nicht weit ab', async () => {
    await store.savePractices([
      p('ziel', 48.537, 12.152, { city: 'Landshut' }), // feste Praxis in Landshut
      p('freising', 48.40, 11.74, { city: 'Freising' }), // fast auf dem Weg München → Landshut
      p('nah', 48.55, 12.17, { city: 'Landshut' }), // nahe am Ziel
      p('augsburg', 48.37, 10.89, { city: 'Augsburg' }), // ganz andere Richtung
    ]);
    const tour = newTour(DATE);
    tour.stops = [{ practiceId: 'ziel', must: true }];
    const sugg = suggestPractices(tour);
    const ids = sugg.map((s) => s.practice.id);
    expect(ids).toContain('freising');
    expect(ids).toContain('nah');
    expect(ids).not.toContain('augsburg');
    expect(sugg.find((s) => s.practice.id === 'freising')!.why).toMatch(/Umweg|auf dem Weg/);
  });
});

describe('Höchstzahl an Besuchen', () => {
  it('plant nicht mehr Besuche als erlaubt (feste Stopps zählen mit)', () => {
    const stop = (must = false): OptStop => ({ windows: [{ from: 0, to: 1440 }], park: 0, visit: 10, must, weight: 1 });
    const travel = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => 5));
    const r = optimizeTour({ dayStart: 480, dayEnd: 1080, returnToStart: true, stops: [stop(true), stop(), stop(), stop(), stop(), stop()], travel, maxVisits: 3 });
    expect(r.order).toHaveLength(3);
    expect(r.order).toContain(0); // der feste Stopp ist dabei
  });
});

describe('Packliste', () => {
  it('zerlegt Notizen in einzelne Dinge', () => {
    expect(splitItems('Musterkoffer, Kataloge\n- Visitenkarten; 2) Flyer')).toEqual(['Musterkoffer', 'Kataloge', 'Visitenkarten', 'Flyer']);
  });

  it('fasst Tagesnotizen und Mitbringen je Praxis zusammen (gleiche Dinge nur einmal)', () => {
    const tour = {
      dayNote: 'Visitenkarten\nMusterkoffer',
      stops: [
        { practiceId: 'a', must: false, bring: 'Katalog, Muster Wundauflage A' },
        { practiceId: 'b', must: false, bring: 'katalog' },
        { practiceId: 'c', must: false },
      ],
    };
    const names: Record<string, string> = { a: 'Praxis A', b: 'Praxis B' };
    const list = packingList(tour, (id) => names[id]);
    expect(list.map((i) => [i.text, i.sources])).toEqual([
      ['Visitenkarten', []],
      ['Musterkoffer', []],
      ['Katalog', ['Praxis A', 'Praxis B']],
      ['Muster Wundauflage A', ['Praxis A']],
    ]);
  });
});
