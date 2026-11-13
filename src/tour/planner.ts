/**
 * Tourplanung: verbindet Praxen, Öffnungszeiten, Fahrzeiten und den Optimierer
 * zu einem Tagesplan mit Uhrzeiten.
 */
import { distanceKm } from '../state/filters';
import { store } from '../state/store';
import type { FacilityKind, PlanEntry, Practice, TimeRange, Tour, TourBlock, TourPlan } from '../types';
import { kindOf } from '../utils/kind';
import { dueInfo, dueText, STATE_LABEL, stateKeyOf, type StateKey } from '../utils/customer';
import { parseDate } from '../utils/dates';
import { normalize } from '../utils/text';
import { nowIso } from '../utils/id';
import { stopDurations } from './durations';
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

/**
 * Tour berechnen und automatisch vorgeschlagene Praxen, die nicht mehr hineinpassen,
 * wieder herausnehmen. Ändert `tour` (Stopps + Plan).
 */
export async function planTour(tour: Tour, opts: PlanOptions = {}): Promise<{ removed: string[] }> {
  const plan = await computePlan(tour, opts);
  const notFitting = new Set(plan.dropped.map((d) => d.practiceId));
  const removed = tour.stops.filter((s) => s.suggested && notFitting.has(s.practiceId)).map((s) => s.practiceId);
  tour.stops = tour.stops.filter((s) => !removed.includes(s.practiceId)).map(({ suggested: _s, ...rest }) => rest);
  plan.dropped = plan.dropped.filter((d) => !removed.includes(d.practiceId));
  tour.plan = plan;
  return { removed };
}

/** Ziel der Tour: zuhause, beim letzten Termin oder an einem anderen Ort */
export function endModeOf(t: Pick<Tour, 'endMode' | 'returnHome'>): 'home' | 'last' | 'place' {
  return t.endMode ?? (t.returnHome ? 'home' : 'last');
}

/** Start- und Zielpunkt einer Tour (ohne Standortabfrage: „aktueller Standort“ → zuhause als Näherung) */
export function tourEndpoints(tour: Tour, position?: LatLng | null): { start?: LatLng & { label: string }; end?: LatLng & { label: string } } {
  const home = store.settings.home;
  const homePt = home ? { lat: home.lat, lng: home.lng, label: 'Zuhause' } : undefined;
  const start =
    tour.startMode === 'place' && tour.startPlace
      ? { lat: tour.startPlace.lat, lng: tour.startPlace.lng, label: tour.startPlace.label }
      : tour.startMode === 'here' && position
        ? { ...position, label: 'Aktueller Standort' }
        : homePt;
  const mode = endModeOf(tour);
  const end = mode === 'place' && tour.endPlace ? { lat: tour.endPlace.lat, lng: tour.endPlace.lng, label: tour.endPlace.label } : mode === 'home' ? (homePt ?? start) : undefined;
  return { start, end };
}

/** Berechnet den Tagesplan einer Tour (fragt dazu die Fahrzeiten ab). */
export async function computePlan(tour: Tour, opts: PlanOptions = {}): Promise<TourPlan> {
  const settings = store.settings;
  const replan = opts.fromMinutes !== undefined;
  const useHere = tour.startMode === 'here' || replan;

  // Startpunkt
  let start: { lat: number; lng: number; label: string };
  if (useHere && opts.position) start = { ...opts.position, label: 'Aktueller Standort' };
  else if (tour.startMode === 'place' && tour.startPlace) start = { lat: tour.startPlace.lat, lng: tour.startPlace.lng, label: tour.startPlace.label };
  else if (tour.startMode === 'place') throw new PlanError('Bitte einen Startpunkt wählen (Zeiten & Start → Start → Andere Adresse).');
  else if (settings.home) start = { lat: settings.home.lat, lng: settings.home.lng, label: 'Zuhause' };
  else if (useHere) throw new PlanError('Dein Standort ist nicht verfügbar. Bitte Ortung erlauben oder eine Startadresse festlegen.');
  else throw new PlanError('Bitte zuerst deine Startadresse festlegen (Mehr → Einstellungen → Tourplanung).');

  // Ziel: zuhause, ein anderer Ort oder Ende beim letzten Termin
  const endMode = endModeOf(tour);
  let endPoint: { lat: number; lng: number; label: string } | undefined;
  if (endMode === 'place') {
    if (!tour.endPlace) throw new PlanError('Bitte ein Ziel wählen (Zeiten & Start → Ziel → Andere Adresse).');
    endPoint = { lat: tour.endPlace.lat, lng: tour.endPlace.lng, label: tour.endPlace.label };
  } else if (endMode === 'home') {
    endPoint = settings.home ? { lat: settings.home.lat, lng: settings.home.lng, label: 'Zuhause' } : { ...start };
  }
  // Ziel ≠ Start → eigener Punkt für die Fahrzeiten
  const separateEnd = !!endPoint && distanceKm(endPoint, start) > 0.05;

  const date = parseDate(tour.date);
  const dayStart = Math.max(tour.dayStart, opts.fromMinutes ?? 0);
  const dropped: TourPlan['dropped'] = [];
  const droppedBlocks: NonNullable<TourPlan['droppedBlocks']> = [];
  const candidates: { practice?: Practice; block?: TourBlock; point: LatLng; stop: OptStop }[] = [];

  for (const s of tour.stops) {
    const p = store.getPractice(s.practiceId);
    if (!p) continue;
    if (replan && visitedOn(p.id, tour.date)) continue; // schon erledigt
    if (p.lat === undefined || p.lng === undefined) {
      dropped.push({ practiceId: p.id, reason: 'Kein Standort – bitte Pin setzen' });
      continue;
    }
    const dur = stopDurations(p, s);
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
      point: { lat: p.lat, lng: p.lng },
      stop: {
        windows,
        park: dur.park,
        visit: dur.visit,
        must: s.must || appt !== undefined,
        // wichtigere (fällige, bestellende, Startlöcher) bleiben drin, wenn nicht alles passt
        weight: 1 + Math.min(visitPriority(p, date), 4) / 4,
      },
    });
  }

  // Pausen und Platzhalter: mit Ort wie ein Stopp, ohne Ort als Zeitblock am jeweiligen Standort
  const blocks = (tour.blocks ?? []).filter((b) => b.minutes > 0 && b.to - b.from >= b.minutes && b.to > dayStart);
  const looseBlocks: TourBlock[] = [];
  for (const b of blocks) {
    if (b.place) {
      candidates.push({
        block: b,
        point: { lat: b.place.lat, lng: b.place.lng },
        stop: { windows: [{ from: b.from, to: b.to - b.minutes }], park: 0, visit: b.minutes, must: b.kind === 'termin', weight: 4, countsAsVisit: false },
      });
    } else {
      looseBlocks.push(b);
    }
  }

  // Fahrzeiten: Index 0 = Start, i + 1 = candidates[i]; Rückfahrt zum Ziel
  const points: LatLng[] = [start, ...candidates.map((c) => c.point)];
  const endIdx = points.length;
  const matrixPoints = separateEnd ? [...points, endPoint!] : points;
  const matrix = await travelMatrix(matrixPoints);
  const factor = 1 + settings.tourDefaults.trafficPercent / 100;
  const minutes = (a: number, b: number) => Math.ceil(matrix.minutes[a][b] * factor);
  // Rückweg-Spalte (0) auf das Ziel umbiegen, wenn es nicht der Start ist
  const travel = points.map((_, a) => points.map((__, b) => (b === 0 && separateEnd ? minutes(a, endIdx) : minutes(a, b))));
  const km = (a: number, b: number) => (b === 0 && separateEnd ? matrix.km[a][endIdx] : matrix.km[a][b]);

  const lunch = tour.lunch.enabled && dayStart < tour.lunch.to ? { from: tour.lunch.from, to: tour.lunch.to, minutes: tour.lunch.minutes } : undefined;
  const result = optimizeTour({
    dayStart,
    dayEnd: tour.dayEnd,
    returnToStart: !!endPoint,
    lunch,
    breaks: looseBlocks.map((b) => ({ from: b.from, to: b.to, minutes: b.minutes, must: b.kind === 'termin' })),
    stops: candidates.map((c) => c.stop),
    travel,
    maxVisits: tour.maxVisits ?? settings.tourDefaults.maxVisits,
  });
  /** Pause/Platzhalter zu OptItem.block (0 = Mittagspause, falls gesetzt) */
  const looseOf = (block: number): TourBlock | undefined => looseBlocks[lunch ? block - 1 : block];

  // Tagesplan zusammenbauen
  const entries: PlanEntry[] = [{ kind: 'start', time: result.departure, label: start.label }];
  let loc = 0;
  let totalKm = 0;
  for (const item of result.items) {
    if (item.kind === 'break') {
      const b = looseOf(item.block);
      entries.push(b ? { kind: 'break', start: item.start, end: item.end, title: b.title, blockId: b.id, blockKind: b.kind } : { kind: 'break', start: item.start, end: item.end, title: 'Mittagspause' });
      continue;
    }
    const c = candidates[item.stop];
    const k = km(loc, item.stop + 1);
    totalKm += k;
    entries.push({ kind: 'drive', from: item.driveStart, to: item.arrive, minutes: item.driveMinutes, km: Math.round(k * 10) / 10 });
    if (c.block) {
      entries.push({ kind: 'break', start: item.start, end: item.end, title: c.block.title, blockId: c.block.id, blockKind: c.block.kind, place: c.block.place?.label });
    } else {
      entries.push({
        kind: 'visit',
        practiceId: c.practice!.id,
        arrive: item.arrive,
        start: item.start,
        end: item.end,
        wait: item.wait,
        park: c.stop.park,
        fixed: c.stop.windows.length === 1 && c.stop.windows[0].from === c.stop.windows[0].to,
      });
    }
    loc = item.stop + 1;
  }
  if (endPoint) {
    const k = km(loc, 0);
    totalKm += k;
    entries.push({ kind: 'drive', from: result.end - result.returnDrive, to: result.end, minutes: result.returnDrive, km: Math.round(k * 10) / 10 });
    entries.push({ kind: 'end', time: result.end, label: endPoint.label });
  } else {
    entries.push({ kind: 'end', time: result.end, label: 'Feierabend' });
  }
  for (const i of result.dropped) {
    const c = candidates[i];
    if (c.block) {
      droppedBlocks.push({ blockId: c.block.id, title: c.block.title, reason: 'Passt zeitlich nicht in den Tag – bitte Uhrzeit prüfen' });
      continue;
    }
    dropped.push({
      practiceId: c.practice!.id,
      reason: c.stop.must ? 'Termin passt nicht in den Tag – bitte prüfen' : 'Passt zeitlich nicht mehr in die Tour',
    });
  }
  for (const j of result.droppedBreaks) {
    const b = looseOf(j);
    if (b) droppedBlocks.push({ blockId: b.id, title: b.title, reason: 'Passt zeitlich nicht in den Tag – bitte Uhrzeit prüfen' });
  }

  // Streckenverlauf für die Karte
  const ordered = result.order.map((i) => points[i + 1]);
  const geometry = await routeGeometry([start, ...ordered, ...(endPoint ? [endPoint] : [])]);

  return {
    computedAt: nowIso(),
    source: matrix.source,
    startPoint: start,
    endPoint,
    entries,
    dropped,
    droppedBlocks: droppedBlocks.length ? droppedBlocks : undefined,
    totals: {
      departure: result.departure,
      end: result.end,
      visits: result.order.filter((i) => !candidates[i].block).length,
      driveMinutes: Math.round(result.driveMinutes),
      waitMinutes: Math.round(result.waitMinutes),
      km: Math.round(totalKm),
    },
    geometry,
  };
}

/**
 * Wie dringend ist ein Besuch? (höher = wichtiger)
 * Fälligkeit laut Besuchsintervall (Tage seit Besuch ÷ Intervall, max. 3) plus Bonus je Kundenstatus:
 * in den Startlöchern > bestellender Kunde > nicht in Kontakt.
 */
export function visitPriority(p: Practice, onDate: Date = new Date()): number {
  const due = dueInfo(p, store.lastVisit(p.id)?.date, store.settings, onDate);
  const bonus: Record<StateKey, number> = { prozess: 1.3, aktiv: 1, kein: 0.2 };
  return (due.never ? 1.2 : Math.min(due.ratio, 3)) + bonus[stateKeyOf(p)];
}

/** Mittelpunkt eines Ortes (Durchschnitt der Pins dort) */
export function cityCenters(cities: string[]): LatLng[] {
  const wanted = new Set(cities.map(normalize));
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const p of store.practices.values()) {
    const key = normalize(p.city);
    if (!wanted.has(key) || p.lat === undefined || p.lng === undefined) continue;
    const s = sums.get(key) ?? { lat: 0, lng: 0, n: 0 };
    sums.set(key, { lat: s.lat + p.lat, lng: s.lng + p.lng, n: s.n + 1 });
  }
  return [...sums.values()].map((s) => ({ lat: s.lat / s.n, lng: s.lng / s.n }));
}

export interface Suggestion {
  practice: Practice;
  /** kurze Begründung, z. B. „überfällig seit 10 Tagen · +4 km Umweg“ */
  why: string;
  score: number;
}

/**
 * Passende Besuche für eine Tour vorschlagen:
 *  - Region gewählt (Orte + Umkreis) → Praxen dort
 *  - sonst Praxen auf der Strecke zu den gewählten Praxen (wenig Umweg) bzw. in ihrer Nähe
 *  - sonst rund um die Startadresse
 * Nur an dem Tag geöffnete und nicht gerade erst besuchte Praxen; sortiert nach
 * Dringlichkeit (Fälligkeit, Kundenstatus) und Umweg.
 */
/** Gruppen, aus denen Vorschläge kommen (Standard: nur Orthopäden) */
export function tourKinds(tour: Pick<Tour, 'kinds'>): FacilityKind[] {
  return tour.kinds?.length ? tour.kinds : ['ortho'];
}

export function suggestPractices(tour: Tour, opts: { limit?: number; maxDetourKm?: number } = {}): Suggestion[] {
  const limit = opts.limit ?? 12;
  const maxDetour = opts.maxDetourKm ?? 20;
  const date = parseDate(tour.date);
  const settings = store.settings;
  const inTour = new Set(tour.stops.map((s) => s.practiceId));
  const coords = (p: Practice): LatLng => ({ lat: p.lat!, lng: p.lng! });

  // Feste Stopps in Fahrtreihenfolge (falls schon berechnet), sonst wie eingetragen
  const order = new Map<string, number>();
  tour.plan?.entries.forEach((e, i) => e.kind === 'visit' && order.set(e.practiceId, i));
  const anchors = tour.stops
    .map((s) => store.getPractice(s.practiceId))
    .filter((p): p is Practice => !!p && p.lat !== undefined && p.lng !== undefined)
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map(coords);
  // Strecke: Start → feste Praxen → Ziel (Start/Ziel wie in der Tour gewählt)
  const ends = tourEndpoints(tour);
  const home = ends.start ? { lat: ends.start.lat, lng: ends.start.lng } : undefined;
  const route = [...(home ? [home] : []), ...anchors, ...(ends.end ? [{ lat: ends.end.lat, lng: ends.end.lng }] : [])];

  const region = tour.region?.cities.length ? tour.region : undefined;
  const regionCities = new Set((region?.cities ?? []).map(normalize));
  const centers = region ? cityCenters(region.cities) : [];

  const kinds = new Set(tourKinds(tour));
  const out: Suggestion[] = [];
  for (const p of store.practices.values()) {
    if (inTour.has(p.id) || p.lat === undefined || p.lng === undefined) continue;
    if (!kinds.has(kindOf(p))) continue;
    const open = hoursOn(p.openingHours, date);
    if (open && !open.length) continue; // an dem Tag geschlossen
    const due = dueInfo(p, store.lastVisit(p.id)?.date, settings, date);
    if (!due.never && due.daysSince! < Math.min(7, due.interval / 2)) continue; // gerade erst besucht
    const here = coords(p);

    let geo: number;
    let geoWhy = '';
    if (region) {
      const dCenter = centers.length ? Math.min(...centers.map((c) => distanceKm(c, here))) : 0;
      if (!regionCities.has(normalize(p.city)) && !(dCenter <= region.radiusKm)) continue;
      geo = dCenter * 0.3;
      geoWhy = regionCities.has(normalize(p.city)) ? p.city : `${dCenter.toFixed(0)} km vom Ort`;
    } else if (anchors.length) {
      let detour = Math.min(...anchors.map((a) => 2 * distanceKm(a, here))); // hin und zurück von einer Praxis
      for (let i = 0; i + 1 < route.length; i++) {
        const a = route[i];
        const b = route[i + 1];
        detour = Math.min(detour, distanceKm(a, here) + distanceKm(here, b) - distanceKm(a, b));
      }
      if (detour > maxDetour) continue;
      geo = detour;
      geoWhy = detour < 1.5 ? 'direkt auf dem Weg' : `+${detour.toFixed(0)} km Umweg`;
    } else if (home) {
      const d = distanceKm(home, here);
      if (d > 25) continue;
      geo = d * 0.5;
      geoWhy = ends.start?.label === 'Zuhause' ? `${d.toFixed(0)} km von zuhause` : `${d.toFixed(0)} km vom Start`;
    } else {
      continue;
    }
    const prio = visitPriority(p, date);
    out.push({
      practice: p,
      score: prio * 10 - geo,
      why: [STATE_LABEL[stateKeyOf(p)], dueText(due), geoWhy].filter(Boolean).join(' · '),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
