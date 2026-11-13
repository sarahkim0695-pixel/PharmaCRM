/**
 * Pause oder Platzhalter (z. B. Online-Schulung) für eine Tour anlegen/bearbeiten:
 * Bezeichnung, Dauer, feste Uhrzeit oder flexibles Zeitfenster, optional ein Ort.
 */
import { formatMinutes, stepVisit } from '../tour/durations';
import { formatTime, parseTime } from '../tour/opening-hours';
import type { Place, TourBlock } from '../types';
import { openSheet } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { newId } from '../utils/id';
import { field } from './common';
import { homePlace, openPlacePicker } from './place-picker';

const TITLES: Record<TourBlock['kind'], string[]> = {
  pause: ['Pause', 'Kaffeepause', 'Kurze Pause'],
  termin: ['Online-Schulung', 'Telefonkonferenz', 'Videokonferenz', 'Büro', 'Meeting'],
};

export function newBlock(kind: TourBlock['kind']): TourBlock {
  return kind === 'pause'
    ? { id: newId(), kind, title: 'Pause', minutes: 15, from: 15 * 60, to: 17 * 60 }
    : { id: newId(), kind, title: 'Online-Schulung', minutes: 60, from: 14 * 60, to: 15 * 60 };
}

/** „14:00–15:30“ (fest) oder „20 min zwischen 15:00 und 17:00“ (flexibel) */
export function blockTimeText(b: TourBlock): string {
  return b.to - b.from === b.minutes
    ? `${formatTime(b.from)}–${formatTime(b.to)}`
    : `${formatMinutes(b.minutes)} zwischen ${formatTime(b.from)} und ${formatTime(b.to)}`;
}

export const blockIcon = (kind: TourBlock['kind'] | undefined) => (kind === 'termin' ? '🎓' : '☕');

export function openBlockEditor(opts: { block: TourBlock; isNew: boolean; onSave: (b: TourBlock) => void; onDelete?: () => void }): void {
  const b: TourBlock = structuredClone(opts.block);
  let flexible = b.to - b.from !== b.minutes;
  const body = h('div');
  const error = h('div', { class: 'notice notice-warn', hidden: true });
  const save = h('button', { class: 'btn btn-primary', onclick: () => trySave() }, 'Speichern');

  const timeInput = (value: number, onChange: (v: number) => void) =>
    h('input', {
      type: 'time',
      step: 300,
      value: formatTime(value),
      onchange: (e: Event) => {
        const v = parseTime((e.target as HTMLInputElement).value);
        if (v !== null) {
          onChange(v);
          render();
        }
      },
    });

  function setMinutes(m: number) {
    b.minutes = m;
    if (!flexible) b.to = b.from + m;
    render();
  }

  function render() {
    const title = h('input', { value: b.title, placeholder: 'Bezeichnung', oninput: (e: Event) => (b.title = (e.target as HTMLInputElement).value) }) as HTMLInputElement;
    const placeMode = !b.place ? 'none' : b.place.label === 'Zuhause' ? 'home' : 'place';
    const home = homePlace();
    setChildren(
      body,
      h(
        'div',
        { class: 'segmented', role: 'radiogroup', 'aria-label': 'Art' },
        (['pause', 'termin'] as const).map((k) =>
          h('button', {
            class: ['seg', b.kind === k && 'on'],
            role: 'radio',
            'aria-checked': String(b.kind === k),
            onclick: () => {
              if (b.kind === k) return;
              // Standardtitel mitwechseln, eigener Titel bleibt
              if (TITLES[b.kind].includes(b.title)) b.title = TITLES[k][0];
              if (k === 'pause') delete b.place;
              b.kind = k;
              render();
            },
          }, k === 'pause' ? '☕ Pause' : '🎓 Platzhalter'),
        ),
      ),
      field('Bezeichnung', title),
      h('div', { class: 'chip-select block-titles' },
        TITLES[b.kind].map((t) => h('button', { class: ['chip-toggle', b.title === t && 'on'], onclick: () => { b.title = t; render(); } }, t)),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Dauer'),
        h('div', { class: 'stepper' },
          h('button', { class: 'step-btn', 'aria-label': 'Kürzer', disabled: b.minutes <= 5, onclick: () => setMinutes(stepVisit(b.minutes, -1)) }, '−'),
          h('span', { class: 'stop-visit-value' }, formatMinutes(b.minutes)),
          h('button', { class: 'step-btn', 'aria-label': 'Länger', disabled: b.minutes >= 240, onclick: () => setMinutes(stepVisit(b.minutes, 1)) }, '+'),
        ),
      ),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Wann?'),
        h(
          'div',
          { class: 'segmented', role: 'radiogroup', 'aria-label': 'Wann' },
          h('button', { class: ['seg', !flexible && 'on'], role: 'radio', 'aria-checked': String(!flexible), onclick: () => { flexible = false; b.to = b.from + b.minutes; render(); } }, 'Feste Uhrzeit'),
          h('button', { class: ['seg', flexible && 'on'], role: 'radio', 'aria-checked': String(flexible), onclick: () => { flexible = true; if (b.to - b.from <= b.minutes) b.to = Math.min(b.from + b.minutes + 120, 22 * 60); render(); } }, 'Flexibel'),
        ),
      ),
      flexible
        ? [
            h('div', { class: 'grid-2 grid-2-even' },
              field('frühestens ab', timeInput(b.from, (v) => (b.from = v))),
              field('spätestens fertig bis', timeInput(b.to, (v) => (b.to = v))),
            ),
            h('p', { class: 'muted small' }, `Die App legt ${b.kind === 'pause' ? 'die Pause' : 'den Platzhalter'} (${formatMinutes(b.minutes)}) dort in dieses Zeitfenster, wo es am besten passt.`),
          ]
        : h('div', { class: 'grid-2 grid-2-even' },
            field('Beginn', timeInput(b.from, (v) => { b.from = v; b.to = v + b.minutes; })),
            h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Ende'), h('div', { class: 'block-end' }, formatTime(b.from + b.minutes))),
          ),
      b.kind === 'termin'
        ? h('div', { class: 'field' },
            h('span', { class: 'field-label' }, 'Wo?'),
            h(
              'div',
              { class: 'segmented', role: 'radiogroup', 'aria-label': 'Ort' },
              h('button', { class: ['seg', placeMode === 'none' && 'on'], role: 'radio', 'aria-checked': String(placeMode === 'none'), onclick: () => { delete b.place; render(); } }, 'Ohne Ort'),
              home ? h('button', { class: ['seg', placeMode === 'home' && 'on'], role: 'radio', 'aria-checked': String(placeMode === 'home'), onclick: () => { b.place = home; render(); } }, 'Zuhause') : null,
              h('button', {
                class: ['seg', placeMode === 'place' && 'on'],
                role: 'radio',
                'aria-checked': String(placeMode === 'place'),
                onclick: () => openPlacePicker({ title: 'Ort für den Platzhalter', current: placeMode === 'place' ? b.place : undefined, onPick: (p: Place) => { b.place = p; render(); } }),
              }, 'Adresse …'),
            ),
            h('p', { class: 'muted small' },
              placeMode === 'none'
                ? 'Ohne Ort (z. B. online): findet dort statt, wo du gerade bist – keine Fahrt.'
                : `📍 ${b.place!.label} – ${b.place!.address}. Die App plant die Fahrt dorthin ein.`),
          )
        : null,
      error,
    );
  }

  function trySave() {
    b.title = b.title.trim() || TITLES[b.kind][0];
    if (!flexible) b.to = b.from + b.minutes;
    if (b.to - b.from < b.minutes) {
      error.hidden = false;
      setChildren(error, iconEl('warning', 18), `Das Zeitfenster ist kürzer als ${formatMinutes(b.minutes)} – bitte „spätestens fertig bis“ später setzen.`);
      return;
    }
    sheet.close();
    opts.onSave(b);
  }

  const sheet = openSheet({
    title: opts.isNew ? (b.kind === 'pause' ? 'Pause hinzufügen' : 'Platzhalter hinzufügen') : b.title,
    content: body,
    footer: [
      !opts.isNew && opts.onDelete
        ? h('button', { class: 'btn btn-danger-outline', onclick: () => { sheet.close(); opts.onDelete!(); } }, iconEl('trash', 18), 'Löschen')
        : null,
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'),
      save,
    ],
  });
  render();
}
