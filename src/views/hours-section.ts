/** Abschnitt „Öffnungszeiten & Zeitaufwand“ in der Praxis-Detailansicht + Bearbeiten. */
import { store } from '../state/store';
import { practiceDurations } from '../tour/durations';
import {
  DAY_SHORT,
  formatRanges,
  formatTime,
  formatWeekHours,
  normalizeRanges,
  openNow,
  parseOpeningHours,
  parseTime,
  TYPICAL_HOURS_TEXT,
  weekdayIndex,
} from '../tour/opening-hours';
import type { Practice, TimeRange, WeekHours } from '../types';
import { openSheet } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { field } from './common';

/** Kurzer Status für heute, z. B. „geöffnet bis 12:00“ */
export function todayStatus(p: Practice, now = new Date()): { text: string; kind: 'open' | 'closed' | 'unknown' } {
  const st = openNow(p.openingHours, now);
  if (!st) return { text: 'Öffnungszeiten unbekannt', kind: 'unknown' };
  if (st.open) return { text: `Jetzt geöffnet bis ${formatTime(st.until!)}`, kind: 'open' };
  if (st.next !== undefined) return { text: `Jetzt geschlossen – öffnet um ${formatTime(st.next)}`, kind: 'closed' };
  const today = p.openingHours?.[weekdayIndex(now)] ?? [];
  return { text: today.length ? 'Heute nicht mehr geöffnet' : 'Heute geschlossen', kind: 'closed' };
}

export function hoursSection(p: Practice): HTMLElement {
  const today = weekdayIndex(new Date());
  const status = todayStatus(p);
  const dur = practiceDurations(p);
  const showWeekend = !!p.openingHours?.slice(5).some((d) => d.length);
  const days = showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];

  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Öffnungszeiten & Zeitaufwand'),
    h('div', { class: ['hours-status', `hours-${status.kind}`] }, iconEl('clock', 18), status.text),
    p.openingHours
      ? h(
          'table',
          { class: 'hours-table' },
          h(
            'tbody',
            null,
            days.map((d) =>
              h(
                'tr',
                { class: d === today ? 'today' : '' },
                h('th', null, DAY_SHORT[d]),
                h('td', null, p.openingHours![d].length ? formatRanges(p.openingHours![d]) : h('span', { class: 'muted' }, 'geschlossen')),
              ),
            ),
          ),
        )
      : null,
    p.openingText && !p.openingHours
      ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 18), `Aus der Excel: „${p.openingText}“ – konnte nicht gelesen werden. Bitte über „Bearbeiten“ eintragen.`)
      : null,
    h(
      'div',
      { class: 'duration-row' },
      h('span', null, h('b', null, `${dur.park} min`), ' Parken & Weg'),
      h('span', null, h('b', null, `${dur.visit} min`), ' vor Ort'),
      !dur.custom && h('span', { class: 'muted small' }, '(Standard)'),
    ),
    h('button', { class: 'btn', onclick: () => editHours(p) }, iconEl('edit', 18), 'Bearbeiten'),
  );
}

/** Fenster zum Bearbeiten der Öffnungszeiten und des Zeitaufwands. */
export function editHours(p: Practice): void {
  const d = store.settings.tourDefaults;
  type Row = { a1: HTMLInputElement; b1: HTMLInputElement; a2: HTMLInputElement; b2: HTMLInputElement };
  const rows: Row[] = DAY_SHORT.map(() => ({
    a1: h('input', { type: 'time', step: 300 }),
    b1: h('input', { type: 'time', step: 300 }),
    a2: h('input', { type: 'time', step: 300 }),
    b2: h('input', { type: 'time', step: 300 }),
  }));

  const fill = (week: WeekHours | undefined) => {
    rows.forEach((r, i) => {
      const ranges = week?.[i] ?? [];
      r.a1.value = ranges[0] ? formatTime(ranges[0].from) : '';
      r.b1.value = ranges[0] ? formatTime(ranges[0].to) : '';
      r.a2.value = ranges[1] ? formatTime(ranges[1].from) : '';
      r.b2.value = ranges[1] ? formatTime(ranges[1].to) : '';
    });
  };
  const read = (): WeekHours | undefined => {
    const week = rows.map((r) => {
      const ranges: TimeRange[] = [];
      const add = (a: string, b: string) => {
        const from = parseTime(a);
        const to = parseTime(b);
        if (from !== null && to !== null && to > from) ranges.push({ from, to });
      };
      add(r.a1.value, r.b1.value);
      add(r.a2.value, r.b2.value);
      return normalizeRanges(ranges);
    });
    return week.some((x) => x.length) ? week : undefined;
  };
  fill(p.openingHours);

  // Schnelleingabe als Text
  const quick = h('input', {
    value: p.openingText ?? '',
    placeholder: `z. B. ${TYPICAL_HOURS_TEXT}`,
    autocomplete: 'off',
  });
  const preview = h('div', { class: 'quick-preview' });
  const showPreview = () => {
    if (!quick.value.trim()) {
      setChildren(preview);
      return;
    }
    const r = parseOpeningHours(quick.value);
    setChildren(
      preview,
      r.hours
        ? h('span', { class: 'ok' }, iconEl('check', 16), `Erkannt: ${formatWeekHours(r.hours)}`)
        : h('span', { class: 'bad' }, iconEl('warning', 16), 'Keine Uhrzeiten erkannt'),
      r.hours && r.problems.length ? h('span', { class: 'muted small' }, ` Nicht verstanden: ${r.problems.join(', ')}`) : null,
    );
  };
  quick.addEventListener('input', showPreview);
  showPreview();
  const applyQuick = () => {
    const r = parseOpeningHours(quick.value);
    if (!r.hours) {
      toast('Keine Uhrzeiten erkannt.', { kind: 'error' });
      return;
    }
    fill(r.hours);
    toast('In die Tabelle übernommen');
  };

  const park = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 240, value: p.parkMinutes ?? '', placeholder: `Standard: ${d.parkMinutes}` });
  const visit = h('input', { type: 'number', inputmode: 'numeric', min: 0, max: 480, value: p.visitMinutes ?? '', placeholder: `Standard: ${d.visitMinutes}` });

  const sheet = openSheet({
    title: 'Öffnungszeiten & Zeitaufwand',
    wide: true,
    content: [
      h('h3', { class: 'sheet-section' }, 'Schnelleingabe'),
      h('div', { class: 'add-row' }, quick, h('button', { class: 'btn', onclick: applyQuick }, 'Übernehmen')),
      preview,
      h('h3', { class: 'sheet-section' }, 'Öffnungszeiten je Tag'),
      h(
        'table',
        { class: 'hours-edit' },
        h('thead', null, h('tr', null, h('th'), h('th', null, 'Vormittag'), h('th', null, 'Nachmittag'))),
        h(
          'tbody',
          null,
          rows.map((r, i) =>
            h(
              'tr',
              null,
              h('th', null, DAY_SHORT[i]),
              h('td', null, h('div', { class: 'time-pair' }, r.a1, '–', r.b1)),
              h('td', null, h('div', { class: 'time-pair' }, r.a2, '–', r.b2)),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: () => { quick.value = TYPICAL_HOURS_TEXT; showPreview(); applyQuick(); } }, 'Vorlage: typische Praxis'),
        h('button', { class: 'btn btn-sm', onclick: () => fill(undefined) }, 'Alle leeren (= unbekannt)'),
      ),
      h('h3', { class: 'sheet-section' }, 'Zeitaufwand pro Besuch'),
      h('div', { class: 'grid-2 grid-2-even' }, field('Parken & Fußweg (Min)', park), field('Vor Ort (Min)', visit)),
      h('p', { class: 'muted small' }, 'Leer lassen = Standardwert aus Mehr → Einstellungen.'),
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'),
      h('button', { class: 'btn btn-primary', onclick: () => void save() }, 'Speichern'),
    ],
  });

  async function save() {
    const current = store.getPractice(p.id) ?? p;
    const hours = read();
    const num = (el: HTMLInputElement) => (el.value.trim() === '' ? undefined : Math.max(0, Math.round(Number(el.value))));
    const next: Practice = { ...current, openingHours: hours, parkMinutes: num(park), visitMinutes: num(visit) };
    // Text nur behalten, wenn er zu den gespeicherten Zeiten passt
    const quickHours = quick.value.trim() ? parseOpeningHours(quick.value).hours : null;
    next.openingText = quickHours && JSON.stringify(quickHours) === JSON.stringify(hours) ? quick.value.trim() : hours ? formatWeekHours(hours) : undefined;
    await store.savePractice(next);
    sheet.close();
    toast('Gespeichert');
  }
}
