/** Seite „Mehr“: Import, Gebiet, Produkte, Backup, Einstellungen, Hilfe. */
import { geocodeQueue } from '../geo/geocoder';
import { navigate } from '../router';
import { filterState } from '../state/filters';
import { store } from '../state/store';
import { confirmDialog } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { formatInterval, INTERVAL_CHOICES, STATE_KEYS, STATE_LABEL, stateColor } from '../utils/customer';
import { relativeDays } from '../utils/dates';
import { plural } from '../utils/text';
import { toast } from '../ui/toast';
import { menuItem, pageHeader, section, field, type View } from './common';
import { duplicateGroups, statusOptions } from '../state/selectors';
import { APP_VERSION } from '../version';
import { tourSettingsSection } from './tour-settings';

export function moreView(): View {
  const el = h('div', { class: 'page' });

  function render() {
    const practices = store.practiceList();
    const pending = practices.filter((p) => p.geoStatus === 'pending').length;
    const notFound = practices.filter((p) => p.geoStatus === 'not_found').length;
    const approx = practices.filter((p) => p.geoStatus === 'approx').length;
    const lastBackup = store.settings.lastBackupAt;

    setChildren(
      el,
      pageHeader({ title: 'Mehr' }),
      h(
        'nav',
        { class: 'menu card' },
        menuItem({ icon: 'upload', label: 'Excel importieren', sub: 'Praxisliste_Gebiet.xlsx einlesen', href: '#/import' }),
        (() => {
          const dups = duplicateGroups().length;
          return menuItem({ icon: 'layers', label: 'Doppelte Standorte', sub: dups ? `${plural(dups, 'Fall', 'Fälle')} zu prüfen` : 'keine gefunden', href: '#/doppelte' });
        })(),
        menuItem({ icon: 'area', label: 'Mein Gebiet', sub: plural(store.settings.territoryPlz.length, 'PLZ', 'PLZ'), href: '#/gebiet' }),
        menuItem({ icon: 'box', label: 'Produkte', sub: plural(store.productList().length, 'Produkt', 'Produkte'), href: '#/produkte' }),
        menuItem({
          icon: 'shield',
          label: 'Backup & Wiederherstellen',
          sub: lastBackup ? `Letztes Backup ${relativeDays(lastBackup.slice(0, 10))}` : 'Noch kein Backup erstellt',
          href: '#/backup',
        }),
      ),
      section(
        'Adresssuche',
        h('p', { class: 'muted small' }, `${plural(practices.length, 'Praxis', 'Praxen')} gesamt`),
        h(
          'div',
          { class: 'stats' },
          statBtn(pending, 'noch offen', () => geocodeQueue.start()),
          statBtn(notFound, 'nicht gefunden', () => showProblems()),
          statBtn(approx, 'ungenau', () => showProblems()),
        ),
        pending ? h('button', { class: 'btn', onclick: () => { geocodeQueue.start(); toast('Adresssuche gestartet'); } }, 'Adresssuche starten') : null,
        notFound + approx ? h('button', { class: 'btn', onclick: () => showProblems() }, 'Praxen ohne genauen Pin anzeigen') : null,
      ),
      h(
        'nav',
        { class: 'menu card' },
        menuItem({ icon: 'settings', label: 'Einstellungen', sub: 'Startadresse, Arbeitszeit, Farben, Erinnerungen', href: '#/einstellungen' }),
        menuItem({ icon: 'info', label: 'Hilfe & Installation', sub: 'Auf dem iPad einrichten', href: '#/hilfe' }),
        menuItem({ icon: 'trash', label: 'Alle Daten löschen', danger: true, onclick: () => void clearAll() }),
      ),
      h('p', { class: 'muted small center' }, `RepMap ${APP_VERSION} · Kartendaten © OpenStreetMap-Mitwirkende`),
    );
  }

  const unsub = store.subscribe(render);
  render();
  return { el, destroy: unsub };
}

function statBtn(n: number, label: string, onclick: () => void) {
  return h('button', { class: 'stat', onclick, disabled: !n }, h('b', null, String(n)), h('span', null, label));
}

function showProblems() {
  filterState.reset();
  filterState.update({ locationProblem: true });
  navigate('/liste');
}

async function clearAll() {
  const ok = await confirmDialog({
    title: 'Wirklich alle Daten löschen?',
    message: 'Alle Praxen, Besuche, Produkte und Einstellungen werden von diesem Gerät gelöscht. Das lässt sich nur mit einer Backup-Datei rückgängig machen.',
    confirmLabel: 'Alles löschen',
    danger: true,
  });
  if (!ok) return;
  const sure = await confirmDialog({ title: 'Letzte Sicherheitsabfrage', message: 'Hast du ein aktuelles Backup? Danach ist alles weg.', confirmLabel: 'Ja, löschen', danger: true });
  if (!sure) return;
  await store.clearAll();
  filterState.reset();
  toast('Alle Daten gelöscht');
  navigate('/karte');
}

/** Einstellungen: Status-Farben, „lange nicht besucht“, Backup-Erinnerung. */
export function settingsView(): View {
  const el = h('div', { class: 'page' });

  function render() {
    const s = store.settings;
    const numberInput = (value: number, min: number, onChange: (v: number) => void) =>
      h('input', {
        type: 'number',
        inputmode: 'numeric',
        min,
        value: String(value),
        onchange: (e: Event) => {
          const v = Math.max(min, Math.round(Number((e.target as HTMLInputElement).value) || min));
          onChange(v);
          toast('Gespeichert');
        },
      });
    const counts = new Map(statusOptions().map((o) => [o.key, o.count]));
    setChildren(
      el,
      pageHeader({ title: 'Einstellungen', back: '/mehr' }),
      tourSettingsSection(),
      section(
        'Kundenstatus: Farben & Besuchsintervall',
        h('p', { class: 'muted small' }, 'Farbe antippen zum Ändern. Das Intervall gilt für alle Einträge ohne eigenes Intervall.'),
        h(
          'ul',
          { class: 'color-list' },
          STATE_KEYS.map((key) =>
            h(
              'li',
              null,
              h('input', {
                type: 'color',
                value: stateColor(key, s),
                'aria-label': `Farbe für ${STATE_LABEL[key]}`,
                onchange: (e: Event) =>
                  void store.updateSettings({ statusColors: { ...store.settings.statusColors, [key]: (e.target as HTMLInputElement).value } }),
              }),
              h('span', { class: 'grow' }, STATE_LABEL[key], h('span', { class: 'muted small' }, ` (${counts.get(key) ?? 0})`)),
              h(
                'select',
                {
                  class: 'interval-select',
                  'aria-label': `Besuchsintervall ${STATE_LABEL[key]}`,
                  onchange: (e: Event) => {
                    void store.updateSettings({ intervalDefaults: { ...store.settings.intervalDefaults, [key]: Number((e.target as HTMLSelectElement).value) } });
                    toast('Gespeichert');
                  },
                },
                [...new Set([...INTERVAL_CHOICES, s.intervalDefaults[key]])].sort((a, b) => a - b).map((d) =>
                  h('option', { value: String(d), selected: s.intervalDefaults[key] === d }, `alle ${formatInterval(d)}`),
                ),
              ),
            ),
          ),
        ),
        Object.keys(s.statusColors).length
          ? h('button', { class: 'btn btn-sm', onclick: () => void store.updateSettings({ statusColors: {} }) }, 'Standardfarben')
          : null,
      ),
      section(
        'Backup',
        field('Erinnerung an Backup nach … Tagen', numberInput(s.backupReminderDays, 1, (v) => void store.updateSettings({ backupReminderDays: v }))),
      ),
    );
  }
  // Nur bei geänderten Einstellungen neu zeichnen – sonst gingen Eingaben verloren,
  // während z. B. die Adresssuche im Hintergrund Praxen speichert.
  const unsub = store.subscribe((k) => {
    if (k.has('settings')) render();
  });
  render();
  return { el, destroy: unsub };
}

/** Hilfe: Installation auf dem iPad, Offline-Nutzung, Datenschutz. */
export function helpView(): View {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    el: h(
      'div',
      { class: 'page prose' },
      pageHeader({ title: 'Hilfe', back: '/mehr' }),
      section(
        'Auf dem iPad / iPhone installieren',
        standalone
          ? h('div', { class: 'notice notice-ok' }, 'RepMap läuft bereits als App vom Home-Bildschirm.')
          : null,
        h('ol', { class: 'bullets' },
          h('li', null, 'Diese Seite in ', h('b', null, 'Safari'), ' öffnen.'),
          h('li', null, 'Auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben).'),
          h('li', null, h('b', null, '„Zum Home-Bildschirm“'), ' wählen und „Hinzufügen“ tippen.'),
          h('li', null, 'Ab jetzt RepMap immer über das neue Symbol auf dem Home-Bildschirm öffnen.'),
        ),
        h('div', { class: 'notice notice-warn' },
          'Wichtig: Die App vom Home-Bildschirm hat einen eigenen Datenspeicher – getrennt von Safari. Importiere deine Daten deshalb in der installierten App.'),
      ),
      section(
        'Offline',
        h('p', null, 'Gebiet, Pins, Liste, Besuche und Produkte funktionieren ohne Internet. Kartenausschnitte, die du schon einmal angesehen hast, werden gespeichert. Die Adresssuche und neue Kartenausschnitte brauchen Internet – die App macht automatisch weiter, sobald du wieder online bist.'),
      ),
      section(
        'Deine Daten',
        h('p', null, 'Alle Daten bleiben nur auf diesem Gerät. Es gibt keinen Server. Deshalb: regelmäßig ein Backup erstellen (Mehr → Backup) und die Datei in „Dateien“ / iCloud Drive speichern.'),
        h('p', null, 'Für die Adresssuche werden nur Straße, PLZ und Ort an OpenStreetMap (Nominatim) geschickt, für die Fahrzeiten der Tourplanung nur Koordinaten – keine Praxisnamen, keine Notizen.'),
      ),
      section(
        'Quellen',
        h('p', null, 'Karten und PLZ-Grenzen: © OpenStreetMap-Mitwirkende (ODbL). Adresssuche: Nominatim. Fahrzeiten: OSRM-Routing der FOSSGIS (routing.openstreetmap.de).'),
        h('p', { class: 'muted small' }, `Version ${APP_VERSION}`),
      ),
    ),
  };
}
