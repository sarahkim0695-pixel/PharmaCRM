/** Seite „Backup & Wiederherstellen“ und das Erinnerungs-Banner. */
import { backupReminder, exportBackup, parseBackup, snoozeBackupReminder } from '../backup/backup';
import { navigate } from '../router';
import { store } from '../state/store';
import { confirmDialog, pickFile } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { formatDate, relativeDays } from '../utils/dates';
import { plural } from '../utils/text';
import { pageHeader, section, type View } from './common';

export function backupView(): View {
  const el = h('div', { class: 'page' });
  const persistInfo = h('p', { class: 'muted small' });

  void navigator.storage?.persisted?.().then((ok) => {
    persistInfo.textContent = ok
      ? '✓ Der Browser hat zugesagt, die Daten dauerhaft zu speichern.'
      : 'Hinweis: Am sichersten sind die Daten, wenn RepMap vom Home-Bildschirm aus genutzt wird.';
  });

  async function doExport() {
    const ok = await exportBackup();
    if (ok) toast('Backup erstellt', { kind: 'success' });
  }

  async function doImport() {
    const file = await pickFile('.json,application/json');
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const ok = await confirmDialog({
        title: 'Backup wiederherstellen?',
        message: h(
          'div',
          null,
          h('p', null, `Backup vom ${backup.exportedAt ? formatDate(backup.exportedAt.slice(0, 10)) : 'unbekannten Datum'}:`),
          h('ul', { class: 'bullets' },
            h('li', null, plural(backup.practices.length, 'Praxis', 'Praxen')),
            h('li', null, plural(backup.visits.length, 'Besuch', 'Besuche')),
            h('li', null, plural(backup.products.length, 'Produkt', 'Produkte')),
            h('li', null, `${backup.settings.territoryPlz?.length ?? 0} PLZ im Gebiet`),
          ),
          h('p', { class: 'notice notice-warn' }, 'Alle aktuellen Daten auf diesem Gerät werden dabei ersetzt. Tipp: Vorher ein Backup des aktuellen Stands erstellen.'),
        ),
        confirmLabel: 'Wiederherstellen',
        danger: true,
      });
      if (!ok) return;
      await store.restoreBackup(backup);
      toast('Backup wiederhergestellt', { kind: 'success' });
      navigate('/karte?fit');
    } catch (err) {
      toast((err as Error).message, { kind: 'error', duration: 6000 });
    }
  }

  function render() {
    const s = store.settings;
    const last = s.lastBackupAt;
    const changed = !last || (s.lastChangeAt && s.lastChangeAt > last);
    setChildren(
      el,
      pageHeader({ title: 'Backup', back: '/mehr' }),
      section(
        'Sichern',
        h(
          'div',
          { class: ['notice', last && !changed ? 'notice-ok' : 'notice-warn'] },
          iconEl(last && !changed ? 'check' : 'warning', 20),
          h(
            'span',
            null,
            last
              ? `Letztes Backup: ${formatDate(last.slice(0, 10))} (${relativeDays(last.slice(0, 10))}). ${changed ? 'Seitdem gab es Änderungen.' : 'Seitdem keine Änderungen.'}`
              : 'Es wurde noch kein Backup erstellt.',
          ),
        ),
        h('p', null, 'Das Backup enthält alle Praxen, Besuche, Notizen, Produkte, dein Gebiet und die Einstellungen.'),
        h('ol', { class: 'bullets' },
          h('li', null, 'Auf „Backup jetzt erstellen“ tippen.'),
          h('li', null, 'Im Teilen-Menü ', h('b', null, '„In Dateien sichern“'), ' wählen.'),
          h('li', null, 'Ordner in ', h('b', null, 'iCloud Drive'), ' wählen (z. B. „RepMap“) und „Sichern“ tippen.'),
        ),
        h('button', { class: 'btn btn-primary btn-block', onclick: () => void doExport() }, iconEl('download', 20), 'Backup jetzt erstellen'),
        h('p', { class: 'muted small' },
          `Inhalt: ${plural(store.practices.size, 'Praxis', 'Praxen')}, ${plural(store.visits.size, 'Besuch', 'Besuche')}, ${plural(store.products.size, 'Produkt', 'Produkte')}, ${s.territoryPlz.length} PLZ. `,
          `Erinnerung alle ${s.backupReminderDays} Tage (`, h('a', { href: '#/einstellungen' }, 'ändern'), ').'),
      ),
      section(
        'Wiederherstellen',
        h('p', null, 'Zum Beispiel nach einem Gerätewechsel: Backup-Datei auswählen – der Stand aus der Datei ersetzt alle Daten auf diesem Gerät.'),
        h('button', { class: 'btn btn-block', onclick: () => void doImport() }, iconEl('upload', 20), 'Backup-Datei wählen …'),
        persistInfo,
      ),
    );
  }

  const unsub = store.subscribe(render);
  render();
  return { el, destroy: unsub };
}

/** Banner oben in der App, wenn ein Backup fällig ist. */
export function startBackupReminder(slot: HTMLElement): void {
  const update = () => {
    const r = backupReminder(store.settings, store.practices.size > 0);
    if (!r.due) {
      setChildren(slot);
      return;
    }
    setChildren(
      slot,
      h(
        'div',
        { class: 'banner' },
        iconEl('shield', 22),
        h('span', { class: 'grow' }, r.daysSince === undefined ? 'Noch kein Backup.' : `Letztes Backup vor ${r.daysSince} Tagen.`),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => void exportBackup().then((ok) => ok && toast('Backup erstellt', { kind: 'success' })) }, 'Jetzt sichern'),
        h('button', { class: 'btn btn-sm', onclick: () => void snoozeBackupReminder() }, 'Später'),
      ),
    );
  };
  store.subscribe(update);
  setInterval(update, 60 * 60 * 1000);
  update();
}
