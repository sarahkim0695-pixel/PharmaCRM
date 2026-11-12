/**
 * Backup: alle Daten als JSON-Datei sichern und wiederherstellen,
 * plus Erinnerung, regelmäßig ein Backup zu machen.
 *
 * Auf dem iPad öffnet „Backup erstellen“ das Teilen-Menü → „In Dateien sichern“
 * (z. B. iCloud Drive). Ohne Teilen-Funktion wird die Datei heruntergeladen.
 */
import { store } from '../state/store';
import type { BackupFile, Settings } from '../types';
import { daysBetween, todayStr } from '../utils/dates';
import { nowIso } from '../utils/id';

export function backupFileName(d = new Date()): string {
  return `RepMap-Backup-${todayStr(d)}.json`;
}

/** Erstellt die Backup-Datei und bietet sie zum Speichern an. Liefert false bei Abbruch. */
export async function exportBackup(): Promise<boolean> {
  const data = store.toBackup();
  const json = JSON.stringify(data, null, 1);
  const name = backupFileName();
  const file = new File([json], name, { type: 'application/json' });

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return false; // vom Nutzer abgebrochen
      downloadFile(file);
    }
  } else {
    downloadFile(file);
  }
  await store.updateSettings({ lastBackupAt: nowIso(), backupSnoozeUntil: undefined });
  return true;
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Prüft und liest eine Backup-Datei. Wirft verständliche Fehler. */
export function parseBackup(text: string): BackupFile {
  let data: Partial<BackupFile>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist keine gültige Backup-Datei (kein JSON).');
  }
  if (!data || data.app !== 'RepMap') throw new Error('Das ist keine RepMap-Backup-Datei.');
  if (typeof data.formatVersion !== 'number' || data.formatVersion > 1) {
    throw new Error('Diese Backup-Datei stammt aus einer neueren RepMap-Version. Bitte App aktualisieren.');
  }
  if (!Array.isArray(data.practices) || !Array.isArray(data.visits) || !Array.isArray(data.products)) {
    throw new Error('Die Backup-Datei ist unvollständig.');
  }
  for (const p of data.practices) {
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') throw new Error('Die Backup-Datei enthält fehlerhafte Praxen.');
  }
  return {
    app: 'RepMap',
    formatVersion: 1,
    exportedAt: data.exportedAt ?? '',
    practices: data.practices.map((p) => ({ ...p, products: p.products ?? {} })),
    visits: data.visits,
    products: data.products,
    settings: (data.settings ?? {}) as Settings,
    extraPlzShapes: Array.isArray(data.extraPlzShapes) ? data.extraPlzShapes : [],
    tours: Array.isArray(data.tours) ? data.tours : [],
  };
}

export interface BackupReminder {
  due: boolean;
  /** Tage seit dem letzten Backup (undefined = noch nie) */
  daysSince?: number;
}

/**
 * Ist eine Backup-Erinnerung fällig?
 * - nur wenn es Daten gibt und sich seit dem letzten Backup etwas geändert hat
 * - noch nie gesichert → sofort erinnern
 * - sonst nach `backupReminderDays` Tagen
 * - „Später“ verschiebt die Erinnerung um einen Tag
 */
export function backupReminder(s: Settings, hasData: boolean, now = new Date()): BackupReminder {
  if (!hasData) return { due: false };
  if (s.backupSnoozeUntil && new Date(s.backupSnoozeUntil) > now) return { due: false };
  if (!s.lastBackupAt) return { due: true };
  const last = new Date(s.lastBackupAt);
  const days = daysBetween(last, now);
  const changed = !s.lastChangeAt || new Date(s.lastChangeAt) > last;
  return { due: changed && days >= s.backupReminderDays, daysSince: days };
}

export async function snoozeBackupReminder(): Promise<void> {
  await store.updateSettings({ backupSnoozeUntil: new Date(Date.now() + 86_400_000).toISOString() });
}
