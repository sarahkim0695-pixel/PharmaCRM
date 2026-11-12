/** Zeitaufwand pro Praxis: eigener Wert oder Standard aus den Einstellungen. */
import { store } from '../state/store';
import type { Practice } from '../types';

export function practiceDurations(p: Practice): { park: number; visit: number; custom: boolean } {
  const d = store.settings.tourDefaults;
  return {
    park: p.parkMinutes ?? d.parkMinutes,
    visit: p.visitMinutes ?? d.visitMinutes,
    custom: p.parkMinutes !== undefined || p.visitMinutes !== undefined,
  };
}
