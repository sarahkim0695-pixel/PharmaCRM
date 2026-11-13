/** Excel-Import der Praxisliste mit Vorschau. */
import { geocodeQueue, MIN_INTERVAL_MS } from '../geo/geocoder';
import { countKinds, FIELD_LABELS, mergeImport, parsePracticeSheets, withKind, type Field, type ImportPreview, type MergeResult } from '../import/practice-import';
import { readXlsx } from '../import/xlsx-reader';
import { navigate } from '../router';
import { store } from '../state/store';
import { pickFile } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { STATE_LABEL, stateColor, stateFromText } from '../utils/customer';
import { plural } from '../utils/text';
import { formatWeekHours } from '../tour/opening-hours';
import { findDuplicates } from '../state/duplicates';
import { duplicateGroups } from '../state/selectors';
import type { FacilityKind, Practice } from '../types';
import { KIND_KEYS, KIND_PLURAL } from '../utils/kind';
import { pageHeader, section, type View } from './common';

export function importView(): View {
  const body = h('div');
  const el = h('div', { class: 'page' }, pageHeader({ title: 'Excel importieren', back: '/mehr' }), body);

  function showStart(error?: string) {
    setChildren(
      body,
      section(
        'Liste importieren (.xlsx)',
        h('p', null, 'Wähle deine Excel-Datei, z. B. ', h('b', null, 'Praxisliste_Gebiet.xlsx'), '. Erwartete Spalten:'),
        h('p', { class: 'columns-hint' }, 'Praxis · Fachrichtung · Straße · PLZ · Ort · Status · Hinweis'),
        h('p', { class: 'muted small' }, 'Optional: Typ (z. B. Orthopädie, Hausarzt, Zahnarzt, Klinik), Intervall (z. B. „4 Wochen“), Öffnungszeiten (z. B. „Mo-Fr 8-12, Mo Di Do 14-18“ – oder je eine Spalte Mo, Di, Mi …), Parken (Min), Vor Ort (Min).'),
        h('ul', { class: 'bullets' },
          h('li', null, 'Gelb markierte Zeilen werden als ', h('span', { class: 'badge badge-review' }, 'prüfen'), ' angezeigt.'),
          h('li', null, 'Orthopäden, Hausärzte, Zahnärzte & KFO und Kliniken erkennt die App an der Fachrichtung, der Spalte „Typ“ oder am Namen des Tabellenblatts – oder du wählst es in der Vorschau für die ganze Datei.'),
          h('li', null, 'Erneuter Import aktualisiert vorhandene Praxen – Besuche, Produkte und Pins bleiben erhalten.'),
          h('li', null, 'Die Datei bleibt auf deinem Gerät, sie wird nirgends hochgeladen.'),
        ),
        error ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), error) : null,
        h('button', { class: 'btn btn-primary btn-block', onclick: () => void choose() }, iconEl('upload', 20), 'Excel-Datei auswählen'),
      ),
    );
  }

  async function choose() {
    const file = await pickFile('.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (!file) return;
    setChildren(body, section('Datei wird gelesen …', h('div', { class: 'notice' }, h('span', { class: 'spinner' }), file.name)));
    try {
      const sheets = readXlsx(await file.arrayBuffer());
      const preview = parsePracticeSheets(sheets);
      showPreview(file.name, preview);
    } catch (err) {
      showStart((err as Error).message);
    }
  }

  function showPreview(fileName: string, base: ImportPreview, kindForAll: FacilityKind | '' = '') {
    // „Alle Einträge dieser Datei sind …“ – sonst automatisch erkannt
    const rows = kindForAll ? withKind(base.rows, kindForAll) : base.rows;
    const preview: ImportPreview = { ...base, rows, kindCounts: countKinds(rows) };
    const merge = mergeImport(store.practiceList(), rows);
    const deleteMissing = h('input', { type: 'checkbox', class: 'switch' });
    const kindSelect = h(
      'select',
      { 'aria-label': 'Gruppe', onchange: () => showPreview(fileName, base, kindSelect.value as FacilityKind | '') },
      h('option', { value: '' }, 'automatisch erkennen (Fachrichtung, Typ, Blatt)'),
      KIND_KEYS.map((k) => h('option', { value: k, selected: kindForAll === k }, `alle sind ${KIND_PLURAL[k]}`)),
    );
    const found = (f: Field) => preview.columns[f] !== undefined || (f === 'hours' && preview.hoursSources.length > 0);
    const colRow = (f: Field) => h('li', { class: found(f) ? 'ok' : 'missing' }, iconEl(found(f) ? 'check' : 'close', 16), FIELD_LABELS[f]);

    setChildren(
      body,
      section(
        'Vorschau',
        h('p', { class: 'muted small' }, `${fileName} · ${preview.sheets.map((sh) => `Blatt „${sh.name}“ (${sh.rowCount} Zeilen, Überschriften in Zeile ${sh.headerRowNumber})`).join(' · ')}`),
        h('ul', { class: 'col-check' }, (['name', 'specialty', 'street', 'plz', 'city', 'status', 'hint', 'phone', 'hours', 'park', 'visit', 'interval'] as Field[]).map(colRow)),
        preview.missingColumns.length
          ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), `Nicht gefunden: ${preview.missingColumns.map((f) => FIELD_LABELS[f]).join(', ')}. Diese Angaben bleiben leer.`)
          : null,
        h(
          'div',
          { class: 'stats' },
          KIND_KEYS.filter((k) => preview.kindCounts[k]).map((k) => stat(preview.kindCounts[k], KIND_PLURAL[k])),
          preview.duplicateRows.length ? stat(preview.duplicateRows.length, 'doppelte Zeilen aussortiert') : null,
          stat(preview.reviewCount, 'gelb = „prüfen“', 'review'),
          stat(merge.added, 'neu'),
          stat(merge.updated, 'aktualisiert'),
          merge.unchanged ? stat(merge.unchanged, 'unverändert') : null,
        ),
        h('h3', { class: 'sheet-section' }, 'Gruppe'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Einträge dieser Datei'), kindSelect),
        h('h3', { class: 'sheet-section' }, 'Status aus der Excel → Kundenstatus'),
        h(
          'div',
          { class: 'badges' },
          [...preview.statusCounts].map(([s, n]) =>
            h('span', { class: 'badge', style: { '--badge': stateColor(stateFromText(s) ?? 'kein', store.settings) } }, `${s || 'ohne Status'} → ${STATE_LABEL[stateFromText(s) ?? 'kein']}: ${n}`),
          ),
        ),
        preview.reviewCount
          ? h('details', { class: 'details' },
              h('summary', null, `Gelb markierte Zeilen anzeigen (${preview.reviewCount})`),
              h('ul', { class: 'bullets' }, preview.rows.filter((r) => r.needsReview).map((r) => h('li', null, `Zeile ${r.rowNumber}: ${r.name}, ${r.city}`))),
            )
          : null,
        hoursPreview(preview),
        preview.duplicateRows.length
          ? h('details', { class: 'details' },
              h('summary', null, `Doppelte Zeilen (gleicher Name + gleiche Adresse): ${preview.duplicateRows.length} – nur einmal übernommen`),
              h('ul', { class: 'bullets' }, preview.duplicateRows.map((d) => h('li', null, `${d.sheetName} Zeile ${d.rowNumber}: ${d.name} (wie Zeile ${d.sameAsRow})`))),
            )
          : null,
        possibleDuplicates(merge) ? h('div', { class: 'notice' }, iconEl('info', 20), `${plural(possibleDuplicates(merge), 'Standort wirkt', 'Standorte wirken')} doppelt (z. B. gleiche Adresse, anderer Name). Das kannst du nach dem Import unter „Doppelte Standorte“ prüfen – es wird nichts automatisch gelöscht.`) : null,
        preview.skippedRows ? h('p', { class: 'muted small' }, `${preview.skippedRows} Zeilen ohne Praxisname wurden übersprungen.`) : null,
        merge.notInFile.length
          ? h('label', { class: 'switch-row' }, h('span', null, `${plural(merge.notInFile.length, 'Eintrag steht', 'Einträge stehen')} nicht mehr in der Datei – löschen? (inkl. Besuche)`), deleteMissing)
          : null,
        h(
          'div',
          { class: 'form-actions' },
          h('button', { class: 'btn', onclick: () => showStart() }, 'Abbrechen'),
          h('button', { class: 'btn btn-primary', disabled: !merge.toSave.length && !merge.notInFile.length, onclick: () => void runImport(merge, deleteMissing.checked) }, 'Importieren'),
        ),
      ),
    );
  }

  async function runImport(merge: MergeResult, deleteMissing: boolean) {
    await store.savePractices(merge.toSave);
    if (deleteMissing && merge.notInFile.length) await store.deletePractices(merge.notInFile.map((p) => p.id));
    geocodeQueue.start();
    const pending = geocodeQueue.pendingCount();
    const minutes = Math.max(1, Math.ceil((pending * 2 * MIN_INTERVAL_MS) / 60000));
    toast('Import abgeschlossen', { kind: 'success' });
    setChildren(
      body,
      section(
        'Import abgeschlossen',
        h('div', { class: 'notice notice-ok' }, iconEl('check', 20), `${merge.added} neu, ${merge.updated} aktualisiert.`),
        duplicateGroups().length
          ? h('div', { class: 'notice' }, iconEl('info', 20), h('span', null, `${plural(duplicateGroups().length, 'möglicher doppelter Standort', 'mögliche doppelte Standorte')} gefunden. `, h('a', { href: '#/doppelte' }, 'Jetzt prüfen')))
          : null,
        pending
          ? h('p', null, `Jetzt werden ${plural(pending, 'Adresse', 'Adressen')} in Kartenpositionen umgewandelt (höchstens 1 pro Sekunde, ca. ${minutes} Min.). Lass die App dabei geöffnet – sie macht sonst beim nächsten Öffnen weiter.`)
          : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: () => navigate('/karte?fit') }, iconEl('map', 20), 'Zur Karte'),
          h('button', { class: 'btn', onclick: () => navigate('/liste') }, iconEl('list', 20), 'Zur Liste'),
        ),
      ),
    );
  }

  showStart();
  return { el };
}

/** Abschnitt „Öffnungszeiten“ der Vorschau: woher, wie viele, Beispiele, Probleme – oder eine Anleitung */
function hoursPreview(preview: ImportPreview): HTMLElement {
  const withHours = preview.rows.filter((r) => r.openingHours);
  const examples = withHours.slice(0, 3);
  const missing = preview.rows.length - withHours.length - preview.hoursProblems.length;
  return h(
    'div',
    { class: 'hours-preview' },
    h('h3', { class: 'sheet-section' }, '🕘 Öffnungszeiten'),
    withHours.length
      ? [
          h('div', { class: 'notice notice-ok' }, iconEl('check', 20), h('span', null,
            h('b', null, `Bei ${withHours.length} von ${preview.rows.length} Einträgen übernommen`),
            preview.hoursSources.length ? ` – aus ${preview.hoursSources.join(', ')}.` : preview.hoursFromHint ? ' – aus der Spalte „Hinweis“.' : '.',
          )),
          h('p', { class: 'muted small' }, 'Zum Prüfen, so hat die App es verstanden:'),
          h('ul', { class: 'hours-examples' }, examples.map((r) => h('li', null, h('b', null, r.name), h('span', null, formatWeekHours(r.openingHours))))),
          missing > 0 ? h('p', { class: 'muted small' }, `${plural(missing, 'Eintrag hat', 'Einträge haben')} keine Öffnungszeiten in der Datei – die kannst du später in der App ergänzen.`) : null,
        ]
      : preview.hoursProblems.length
        ? null
        : h('div', { class: 'notice notice-warn' }, iconEl('info', 20), h('span', null,
            h('b', null, 'Keine Öffnungszeiten in der Datei gefunden. '),
            'Damit sie automatisch übernommen werden, füge eine Spalte ', h('b', null, '„Öffnungszeiten“'), ' hinzu, z. B. ',
            h('code', null, 'Mo-Fr 8-12, Mo Di Do 14-18'), ' – oder je Wochentag eine Spalte ', h('b', null, 'Mo, Di, Mi …'), ' mit z. B. ', h('code', null, '8-12, 14-18'), '. Danach die Datei einfach noch einmal importieren.',
          )),
    preview.hoursProblems.length
      ? h('details', { class: 'details', open: !withHours.length },
          h('summary', null, `Nicht lesbar: ${preview.hoursProblems.length} – bitte später in der App eintragen`),
          h('ul', { class: 'bullets' }, preview.hoursProblems.map((x) => h('li', null, `Zeile ${x.rowNumber}: ${x.name} – „${x.text}“`))),
        )
      : null,
  );
}

function stat(n: number, label: string, kind?: string) {
  return h('div', { class: ['stat', kind && `stat-${kind}`] }, h('b', null, String(n)), h('span', null, label));
}

/** Wie viele Gruppen möglicher Doppelungen entstehen durch diesen Import (mit neuen/geänderten Einträgen)? */
function possibleDuplicates(merge: MergeResult): number {
  const byId = new Map<string, Practice>(store.practiceList().map((p) => [p.id, p]));
  merge.toSave.forEach((p) => byId.set(p.id, p));
  const touched = new Set(merge.toSave.map((p) => p.id));
  return findDuplicates([...byId.values()], new Set(store.settings.dismissedDuplicates ?? [])).filter((g) =>
    g.practices.some((p) => touched.has(p.id)),
  ).length;
}
