/**
 * Tourplanung: verbindet Praxen, Öffnungszeiten, Fahrzeiten und den Optimierer
 * zu einem Tagesplan mit Uhrzeiten.
 */
import { distanceKm, isStale } from '../state/filters';
import { filterContext } from '../state/selectors';
import { store } from '../state/store';
import type { PlanEntry, Practice, TimeRange, Tour, TourPlan } from '../types';
import { parseDate } from '../utils/dates';
import { nowIso } from '../utils/id';
import { practiceDurations } from './durations';
import { hoursOn } from './opening-hours';
import { optimizeTour, type OptStop } from './optimizer';
import { routeGeometry, travelMatrix, type LatLng } from './travel';

/** Neue Tour für ein Datum mit den Vorgaben aus den Einstellungen. */
export function newTour(date: string): Tour {
  const d = store.settings.tourDefaults;
  const ts = nowIso();
  return {
    id: date,
    date,
    startMode: 'home',
    dayStart: d.dayStart,
    dayEnd: d.dayEnd,
    returnHome: d.returnHome,
    lunch: { enabled: d.lunchEnabled, from: d.lunchFrom, to: d.lunchTo, minutes: d.lunchMinutes },
    stops: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

/** Termin dieser Praxis an diesem Tag (Minuten, oder true = ganztägig ohne Uhrzeit) */
export function appointmentOn(p: Practice, date: string): number | true | undefined {
  if (!p.nextAppointment || p.nextAppointment.slice(0, 10) !== date) return undefined;
  const time = p.nextAppointment.slice(11, 16);
  if (!time) return true;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** Praxen mit Termin an diesem Tag als Pflicht-Stopps ergänzen. Liefert true, wenn etwas dazukam. */
export function addAppointments(tour: Tour): boolean {
  let added = false;
  for (const p of store.practices.values()) {
    if (appointmentOn(p, tour.date) === undefined) continue;
    const existing = tour.stops.find((s) => s.practiceId === p.id);
    if (existing) {
      if (!existing.must) {
        existing.must = true;
        added = true;
      }
    } else {
      tour.stops.push({ practiceId: p.id, must: true });
      added = true;
    }
  }
  return added;
}

/** Wurde die Praxis am Tourtag schon besucht (Besuch erfasst)? */
export function visitedOn(practiceId: string, date: string): boolean {
  return store.visitsFor(practiceId).some((v) => v.date === date);
}

export interface PlanOptions {
  /** Startpunkt bei „aktueller Standort“ bzw. beim Neuplanen unterwegs */
  position?: LatLng | null;
  /** Neu planen ab jetzt: frühestens um diese Uhrzeit (Minuten) losfahren, erledigte Stopps weglassen */
  fromMinutes?: number;
}

export class PlanError extends Error {}

/** Berechnet den Tagesplan einer Tour (fragt dazu die Fahrzeiten ab). */
export async function computePlan(tour: Tour, opts: PlanOptions = {}): Promise<TourPlan> {
  const settings = store.settings;
  const useHere = tour.startMode === 'here' || opts.fromMinutes !== undefined;
  let start: { lat: number; lng: number; label: string };
  if (useHere && opts.position) start = { ...opts.position, label: 'Aktueller Standort' };
  else if (settings.home) start = { lat: settings.home.lat, lng: settings.home.lng, label: 'Zuhause' };
  else if (useHere) throw new PlanError('Dein Standort ist nicht verfügbar. Bitte Ortung erlauben oder eine Startadresse festlegen.');
  else throw new PlanError('Bitte zuerst deine Startadresse festlegen (Mehr → Einstellungen → Tourplanung).');
  const home = settings.home ? { lat: settings.home.lat, lng: settings.home.lng } : start;

  const date = parseDate(tour.date);
  const dayStart = Math.max(tour.dayStart, opts.fromMinutes ?? 0);
  const ctx = filterContext();
  const dropped: TourPlan['dropped'] = [];
  const candidates: { practice: Practice; stop: OptStop }[] = [];

  for (const s of tour.stops) {
    const p = store.getPractice(s.practiceId);
    if (!p) continue;
    if (opts.fromMinutes !== undefined && visitedOn(p.id, tour.date)) continue; // schon erledigt
    if (p.lat === undefined || p.lng === undefined) {
      dropped.push({ practiceId: p.id, reason: 'Kein Standort – bitte Pin setzen' });
      continue;
    }
    const dur = practiceDurations(p);
    const appt = appointmentOn(p, tour.date);
    let windows: TimeRange[];
    if (typeof appt === 'number') {
      windows = [{ from: appt, to: appt }];
    } else {
      const open = hoursOn(p.openingHours, date);
      if (open && !open.length) {
        dropped.push({ practiceId: p.id, reason: 'An diesem Tag geschlossen' });
        continue;
      }
      const ranges = open ?? [{ from: 0, to: 24 * 60 }]; // unbekannt → ganztägig
      windows = ranges.map((r) => ({ from: r.from, to: r.to - dur.visit })).filter((w) => w.to >= w.from);
      if (!windows.length) {
        dropped.push({ practiceId: p.id, reason: 'Öffnungszeit zu kurz für den Besuch' });
        continue;
      }
    }
    candidates.push({
      practice: p,
      stop: {
        windows,
        park: dur.park,
        visit: dur.visit,
        must: s.must || appt !== undefined,
        weight: 1 + (isStale(p, ctx) ? 0.3 : 0),
      },
    });
  }

  // Fahrzeiten: Index 0 = Start, i + 1 = Praxis i; Rückfahrt immer nach Hause
  const points: LatLng[] = [start, ...candidates.map((c) => ({ lat: c.practice.lat!, lng: c.practice.lng! }))];
  const returnIdx = points.length;
  const matrixPoints = useHere && tour.returnHome ? [...points, home] : points;
  const matrix = await travelMatrix(matrixPoints);
  const factor = 1 + settings.tourDefaults.trafficPercent / 100;
  const minutes = (a: number, b: number) => Math.ceil(matrix.minutes[a][b] * factor);
  // Bei Start „unterwegs“ endet die Tour trotzdem zuhause: Rückweg-Spalte entsprechend umbiegen
  const travel = points.map((_, a) =>
    points.map((__, b) => (b === 0 && useHere && tour.returnHome ? minutes(a, returnIdx) : minutes(a, b))),
  );
  const km = (a: number, b: number) => (b === 0 && useHere && tour.returnHome ? matrix.km[a][returnIdx] : matrix.km[a][b]);

  const result = optimizeTour({
    dayStart,
    dayEnd: tour.dayEnd,
    returnToStart: tour.returnHome,
    lunch: tour.lunch.enabled && dayStart < tour.lunch.to ? { from: tour.lunch.from, to: tour.lunch.to, minutes: tour.lunch.minutes } : undefined,
    stops: candidates.map((c) => c.stop),
    travel,
  });

  // Tagesplan zusammenbauen
  const entries: PlanEntry[] = [{ kind: 'start', time: result.departure, label: start.label }];
  let loc = 0;
  let totalKm = 0;
  for (const item of result.items) {
    if (item.kind === 'break') {
      entries.push({ kind: 'break', start: item.start, end: item.end });
      continue;
    }
    const c = candidates[item.stop];
    const k = km(loc, item.stop + 1);
    totalKm += k;
    entries.push({ kind: 'drive', from: item.driveStart, to: item.arrive, minutes: item.driveMinutes, km: Math.round(k * 10) / 10 });
    entries.push({
      kind: 'visit',
      practiceId: c.practice.id,
      arrive: item.arrive,
      start: item.start,
      end: item.end,
      wait: item.wait,
      park: c.stop.park,
      fixed: c.stop.windows.length === 1 && c.stop.windows[0].from === c.stop.windows[0].to,
    });
    loc = item.stop + 1;
  }
  if (tour.returnHome) {
    const k = km(loc, 0);
    totalKm += k;
    entries.push({ kind: 'drive', from: result.end - result.returnDrive, to: result.end, minutes: result.returnDrive, km: Math.round(k * 10) / 10 });
    entries.push({ kind: 'end', time: result.end, label: 'Zuhause' });
  } else {
    entries.push({ kind: 'end', time: result.end, label: 'Feierabend' });
  }
  for (const i of result.dropped) {
    const c = candidates[i];
    dropped.push({
      practiceId: c.practice.id,
      reason: c.stop.must ? 'Termin passt nicht in den Tag – bitte prüfen' : 'Passt zeitlich nicht mehr in die Tour',
    });
  }

  // Streckenverlauf für die Karte
  const ordered = result.order.map((i) => points[i + 1]);
  const geometry = await routeGeometry([start, ...ordered, ...(tour.returnHome ? [home] : [])]);

  return {
    computedAt: nowIso(),
    source: matrix.source,
    startPoint: start,
    entries,
    dropped,
    totals: {
      departure: result.departure,
      end: result.end,
      visits: result.order.length,
      driveMinutes: Math.round(result.driveMinutes),
      waitMinutes: Math.round(result.waitMinutes),
      km: Math.round(totalKm),
    },
    geometry,
  };
}

/**
 * Vorschläge für weitere Praxen in der Nähe der Tour:
 * an dem Tag geöffnet, nicht in den letzten 14 Tagen besucht,
 * bevorzugt „lange nicht besucht“ und im eigenen Gebiet.
 */
export function suggestPractices(tour: Tour, limit = 6, maxKm = 25): Practice[] {
  const date = parseDate(tour.date);
  const inTour = new Set(tour.stops.map((s) => s.practiceId));
  const anchors: LatLng[] = tour.stops
    .map((s) => store.getPractice(s.practiceId))
    .filter((p): p is Practice => !!p && p.lat !== undefined && p.lng !== undefined)
    .map((p) => ({ lat: p.lat!, lng: p.lng! }));
  if (!anchors.length && store.settings.home) anchors.push(store.settings.home);
  if (!anchors.length) return [];
  const ctx = filterContext();
  const territory = store.territorySet();
  const recent = new Date(date);
  recent.setDate(recent.getDate() - 14);
  const recentStr = recent.toISOString().slice(0, 10);

  const scored: { p: Practice; score: number }[] = [];
  for (const p of store.practices.values()) {
    if (inTour.has(p.id) || p.lat === undefined || p.lng === undefined) continue;
    const open = hoursOn(p.openingHours, date);
    if (open && !open.length) continue; // an dem Tag geschlossen
    const last = store.lastVisit(p.id);
    if (last && last.date >= recentStr) continue; // gerade erst besucht
    const d = Math.min(...anchors.map((a) => distanceKm(a, { lat: p.lat!, lng: p.lng! })));
    if (d > maxKm) continue;
    const score = d - (isStale(p, ctx) ? 4 : 0) - (territory.has(p.plz) ? 2 : 0) - (open ? 1 : 0);
    scored.push({ p, score });
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, limit).map((x) => x.p);
}
