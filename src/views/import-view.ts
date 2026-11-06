/** Excel-Import der Praxisliste mit Vorschau. */
import { geocodeQueue, MIN_INTERVAL_MS } from '../geo/geocoder';
import { FIELD_LABELS, mergeImport, parsePracticeSheets, type Field, type ImportPreview, type MergeResult } from '../import/practice-import';
import { readXlsx } from '../import/xlsx-reader';
import { navigate } from '../router';
import { store } from '../state/store';
import { pickFile } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { colorForStatus } from '../utils/colors';
import { plural } from '../utils/text';
import { pageHeader, section, type View } from './common';

export function importView(): View {
  const body = h('div');
  const el = h('div', { class: 'page' }, pageHeader({ title: 'Excel importieren', back: '/mehr' }), body);

  function showStart(error?: string) {
    setChildren(
      body,
      section(
        'Praxisliste (.xlsx)',
        h('p', null, 'Wähle deine Excel-Datei, z. B. ', h('b', null, 'Praxisliste_Gebiet.xlsx'), '. Erwartete Spalten:'),
        h('p', { class: 'columns-hint' }, 'Praxis · Fachrichtung · Straße · PLZ · Ort · Status · Hinweis'),
        h('ul', { class: 'bullets' },
          h('li', null, 'Gelb markierte Zeilen werden als ', h('span', { class: 'badge badge-review' }, 'prüfen'), ' angezeigt.'),
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
      showPreview(file.name, preview, mergeImport(store.practiceList(), preview.rows));
    } catch (err) {
      showStart((err as Error).message);
    }
  }

  function showPreview(fileName: string, preview: ImportPreview, merge: MergeResult) {
    const deleteMissing = h('input', { type: 'checkbox', class: 'switch' });
    const colRow = (f: Field) =>
      h('li', { class: preview.columns[f] !== undefined ? 'ok' : 'missing' }, iconEl(preview.columns[f] !== undefined ? 'check' : 'close', 16), FIELD_LABELS[f]);

    setChildren(
      body,
      section(
        'Vorschau',
        h('p', { class: 'muted small' }, `${fileName} · Blatt „${preview.sheetName}“ · Überschriften in Zeile ${preview.headerRowNumber}`),
        h('ul', { class: 'col-check' }, (['name', 'specialty', 'street', 'plz', 'city', 'status', 'hint', 'phone'] as Field[]).map(colRow)),
        preview.missingColumns.length
          ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), `Nicht gefunden: ${preview.missingColumns.map((f) => FIELD_LABELS[f]).join(', ')}. Diese Angaben bleiben leer.`)
          : null,
        h(
          'div',
          { class: 'stats' },
          stat(preview.rows.length, 'Praxen in der Datei'),
          stat(preview.reviewCount, 'gelb = „prüfen“', 'review'),
          stat(merge.added, 'neu'),
          stat(merge.updated, 'aktualisiert'),
          merge.unchanged ? stat(merge.unchanged, 'unverändert') : null,
        ),
        h('h3', { class: 'sheet-section' }, 'Status-Werte'),
        h(
          'div',
          { class: 'badges' },
          [...preview.statusCounts].map(([s, n]) =>
            h('span', { class: 'badge', style: { '--badge': colorForStatus(s, store.settings.statusColors) } }, `${s || 'ohne Status'}: ${n}`),
          ),
        ),
        preview.reviewCount
          ? h('details', { class: 'details' },
              h('summary', null, `Gelb markierte Zeilen anzeigen (${preview.reviewCount})`),
              h('ul', { class: 'bullets' }, preview.rows.filter((r) => r.needsReview).map((r) => h('li', null, `Zeile ${r.rowNumber}: ${r.name}, ${r.city}`))),
            )
          : null,
        preview.skippedRows ? h('p', { class: 'muted small' }, `${preview.skippedRows} Zeilen ohne Praxisname wurden übersprungen.`) : null,
        merge.notInFile.length
          ? h('label', { class: 'switch-row' }, h('span', null, `${plural(merge.notInFile.length, 'Praxis steht', 'Praxen stehen')} nicht mehr in der Datei – löschen? (inkl. Besuche)`), deleteMissing)
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

function stat(n: number, label: string, kind?: string) {
  return h('div', { class: ['stat', kind && `stat-${kind}`] }, h('b', null, String(n)), h('span', null, label));
}
