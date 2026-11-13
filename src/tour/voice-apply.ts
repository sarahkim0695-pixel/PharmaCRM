/**
 * Führt einen verstandenen Sprach-Auftrag aus: Tour des Tages öffnen, Einstellungen
 * übernehmen, feste Praxen und Termine eintragen, passende Besuche ergänzen,
 * Mitbringen/Notizen speichern und die Tour berechnen.
 */
import { store } from '../state/store';
import type { FacilityKind, Tour } from '../types';
import { dueInfo, stateKeyOf } from '../utils/customer';
import { parseDate } from '../utils/dates';
import { KIND_KEYS } from '../utils/kind';
import { plural } from '../utils/text';
import { formatTime } from './opening-hours';
import { addAppointments, newTour, planTour, PlanError, suggestPractices, tourKinds } from './planner';
import type { LatLng } from './travel';
import type { VoiceCommand } from './voice';

export interface VoiceResult {
  date: string;
  /** Kurzfassung für Meldung und Sprachausgabe */
  summary: string;
  /** Tour konnte nicht berechnet werden (z. B. keine Startadresse) */
  error?: string;
}

const append = (a: string | undefined, b: string) => [a, b].filter(Boolean).join(', ');

/** Uhrzeit zum Vorlesen: 8:15 → „8 Uhr 15“ */
export const spokenTime = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} Uhr ${m}` : `${h} Uhr`;
};

export async function applyVoiceCommand(
  cmd: VoiceCommand,
  opts: { currentDate: string; getPosition: () => Promise<LatLng | null> },
): Promise<VoiceResult> {
  const date = cmd.date ?? opts.currentDate;
  const tour: Tour = structuredClone(store.tours.get(date) ?? newTour(date));
  if (cmd.clear) {
    tour.stops = [];
    delete tour.region;
  }

  // Rahmen
  if (cmd.dayStart !== undefined) tour.dayStart = cmd.dayStart;
  if (cmd.dayEnd !== undefined) tour.dayEnd = cmd.dayEnd;
  if (cmd.maxVisits !== undefined) tour.maxVisits = cmd.maxVisits;
  if (cmd.startMode) tour.startMode = cmd.startMode;
  if (cmd.returnHome !== undefined) tour.returnHome = cmd.returnHome;
  if (cmd.lunch) {
    const l = cmd.lunch;
    tour.lunch = {
      enabled: l.enabled,
      from: l.from ?? tour.lunch.from,
      to: l.to ?? tour.lunch.to,
      minutes: l.minutes ?? tour.lunch.minutes,
    };
  }

  // Gruppen
  if (cmd.kinds) {
    const current = new Set<FacilityKind>(tourKinds(tour));
    const next = cmd.kinds.mode === 'set' ? new Set(cmd.kinds.kinds) : current;
    if (cmd.kinds.mode === 'add') cmd.kinds.kinds.forEach((k) => next.add(k));
    if (cmd.kinds.mode === 'remove') cmd.kinds.kinds.forEach((k) => next.delete(k));
    if (next.size) tour.kinds = KIND_KEYS.filter((k) => next.has(k));
  }

  // Region
  if (cmd.region) tour.region = { cities: cmd.region.cities, radiusKm: cmd.region.radiusKm ?? tour.region?.radiusKm ?? 10 };
  else if (cmd.radiusKm !== undefined && tour.region) tour.region.radiusKm = cmd.radiusKm;

  // Feste Praxen und Termine
  for (const f of cmd.fixed) {
    if (!f.practiceId) continue;
    const p = store.getPractice(f.practiceId);
    if (!p) continue;
    if (f.time !== undefined) await store.savePractice({ ...p, nextAppointment: `${date}T${formatTime(f.time)}` });
    const stop = tour.stops.find((s) => s.practiceId === p.id);
    if (stop) {
      stop.must = !f.optional;
      delete stop.suggested;
    } else {
      tour.stops.push({ practiceId: p.id, must: !f.optional });
    }
  }
  addAppointments(tour);

  // Mitbringen und Notizen
  for (const b of cmd.bring) {
    const id = b.target?.practiceId;
    if (id && store.getPractice(id)) {
      let stop = tour.stops.find((s) => s.practiceId === id);
      if (!stop) {
        stop = { practiceId: id, must: true };
        tour.stops.push(stop);
      }
      stop.bring = append(stop.bring, b.items);
    } else {
      tour.dayNote = append(tour.dayNote, b.items);
    }
  }
  if (cmd.note) tour.dayNote = tour.dayNote ? `${tour.dayNote}\n${cmd.note}` : cmd.note;

  // Weglassen
  const excluded = new Set(cmd.exclude.map((e) => e.practiceId).filter((x): x is string => !!x));
  tour.stops = tour.stops.filter((s) => !excluded.has(s.practiceId));

  // Passende Besuche ergänzen
  if (cmd.fill) {
    const onDate = parseDate(date);
    const limit = tour.region?.cities.length ? 15 : 12;
    const sugg = suggestPractices(tour, { limit: 60 })
      .filter((s) => !excluded.has(s.practice.id))
      .filter((s) => !cmd.states?.length || cmd.states.includes(stateKeyOf(s.practice)))
      .filter((s) => {
        if (!cmd.onlyDue) return true;
        const d = dueInfo(s.practice, store.lastVisit(s.practice.id)?.date, store.settings, onDate);
        return d.never || d.dueInDays <= 0;
      })
      .slice(0, limit);
    tour.stops.push(...sugg.map((s) => ({ practiceId: s.practice.id, must: false, suggested: true })));
  }

  delete tour.plan;
  await store.saveTour(tour);
  await store.updateSettings({ activeTourDate: date }, { silent: true });

  const day = parseDate(date).toLocaleDateString('de-DE', { weekday: 'long' });
  if (!tour.stops.length) {
    return {
      date,
      summary: cmd.fill
        ? `Für ${day} habe ich keine passenden Praxen gefunden${tour.region ? ' – vielleicht den Umkreis vergrößern' : ''}.`
        : `Tour für ${day} angepasst.`,
    };
  }

  // Berechnen
  try {
    const position = tour.startMode === 'here' ? await opts.getPosition() : null;
    await planTour(tour, { position });
    await store.saveTour(tour);
    const t = tour.plan!.totals;
    const notFitting = tour.plan!.dropped.length;
    return {
      date,
      summary:
        `Tour für ${day}, ${parseDate(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}: ${plural(t.visits, 'Besuch', 'Besuche')}, ` +
        `Abfahrt ${spokenTime(t.departure)}, Ende ${spokenTime(t.end)}` +
        (notFitting ? `. ${plural(notFitting, 'Praxis passt', 'Praxen passen')} nicht mehr hinein.` : '.'),
    };
  } catch (err) {
    return {
      date,
      summary: `Tour für ${day} vorbereitet: ${plural(tour.stops.length, 'Praxis', 'Praxen')}.`,
      error: err instanceof PlanError ? err.message : `Berechnen gerade nicht möglich: ${(err as Error).message}`,
    };
  }
}
