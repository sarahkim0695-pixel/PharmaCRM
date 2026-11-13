/** Zeitaufwand pro Praxis: eigener Wert oder Standard aus den Einstellungen. */
import { store } from '../state/store';
import type { Practice, TourStop } from '../types';

export function practiceDurations(p: Practice): { park: number; visit: number; custom: boolean } {
  const d = store.settings.tourDefaults;
  return {
    park: p.parkMinutes ?? d.parkMinutes,
    visit: p.visitMinutes ?? d.visitMinutes,
    custom: p.parkMinutes !== undefined || p.visitMinutes !== undefined,
  };
}

/** Zeitaufwand für einen Besuch auf einer Tour: eigene Dauer für diesen Tag hat Vorrang */
export function stopDurations(p: Practice, stop?: Pick<TourStop, 'visitMinutes'>): { park: number; visit: number; standardVisit: number; longer: boolean } {
  const d = practiceDurations(p);
  const visit = stop?.visitMinutes ?? d.visit;
  return { park: d.park, visit, standardVisit: d.visit, longer: stop?.visitMinutes !== undefined && visit !== d.visit };
}

/** Auswahl für die Dauer vor Ort (Minuten) – Plus/Minus springt zum nächsten Wert */
export const VISIT_STEPS = [5, 10, 15, 20, 25, 30, 45, 60, 75, 90, 120, 150, 180, 240];

export function stepVisit(current: number, dir: 1 | -1): number {
  if (dir > 0) return VISIT_STEPS.find((v) => v > current) ?? current;
  return [...VISIT_STEPS].reverse().find((v) => v < current) ?? current;
}

/** 90 → „1 Std. 30 min“ */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} min` : `${h} Std.`;
}
