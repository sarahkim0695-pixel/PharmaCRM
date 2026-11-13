/** Abschnitt „Kundenstatus & Besuchsintervall“ in der Detailansicht einer Praxis/Klinik. */
import { store } from '../state/store';
import type { CustomerState, Practice } from '../types';
import { h } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import {
  dueInfo,
  dueText,
  formatInterval,
  INTERVAL_CHOICES,
  STATE_HINT,
  STATE_LABEL,
  stateColor,
  stateFromText,
  stateKeyOf,
} from '../utils/customer';
import { formatDate } from '../utils/dates';
import { section } from './common';

const STATES: CustomerState[] = ['aktiv', 'prozess', 'kein'];

export function customerSection(p: Practice): HTMLElement {
  const key = stateKeyOf(p);
  const last = store.lastVisit(p.id);
  const due = dueInfo(p, last?.date, store.settings);
  const defaultInterval = store.settings.intervalDefaults[key];
  const fromExcel = !p.customerState && stateFromText(p.status);

  const save = async (patch: Partial<Practice>, msg: string) => {
    const current = store.getPractice(p.id) ?? p;
    const next = { ...current, ...patch };
    if (patch.customerState === undefined && 'customerState' in patch) delete next.customerState;
    if (patch.visitIntervalDays === undefined && 'visitIntervalDays' in patch) delete next.visitIntervalDays;
    await store.savePractice(next);
    toast(msg);
  };

  const dueClass = due.never ? 'due-never' : due.dueInDays < 0 ? 'due-over' : due.dueInDays <= 7 ? 'due-soon' : 'due-ok';

  return section(
    'Kundenstatus & Besuchsintervall',
    h(
      'div',
      { class: 'state-choice' },
      STATES.map((s) =>
        h(
          'button',
          {
            class: ['state-btn', key === s && 'on'],
            style: { '--state': stateColor(s, store.settings) },
            'aria-pressed': String(key === s),
            onclick: () => void save({ customerState: s }, `Status: ${STATE_LABEL[s]}`),
          },
          h('span', { class: 'dot' }),
          h('span', { class: 'state-text' }, h('b', null, STATE_LABEL[s]), STATE_HINT[s] ? h('small', null, STATE_HINT[s]) : null),
        ),
      ),
    ),
    p.customerState
      ? p.status
        ? h('p', { class: 'muted small' }, `Laut Excel: „${p.status}“ – in der App geändert`)
        : null
      : fromExcel
        ? h('p', { class: 'muted small' }, `Aus der Excel: „${p.status}“`)
        : h('p', { class: 'muted small' }, p.status ? `Excel-Status „${p.status}“ unbekannt – als „Nicht in Kontakt“ eingestuft. Bitte prüfen.` : 'Noch kein Status – als „Nicht in Kontakt“ eingestuft.'),
    h('h3', { class: 'sheet-section' }, 'Besuchen alle …'),
    h(
      'div',
      { class: 'chip-select' },
      h(
        'button',
        { class: ['chip-toggle', p.visitIntervalDays === undefined && 'on'], onclick: () => void save({ visitIntervalDays: undefined }, 'Standard-Intervall') },
        `Standard (${formatInterval(defaultInterval)})`,
      ),
      INTERVAL_CHOICES.map((d) =>
        h('button', { class: ['chip-toggle', p.visitIntervalDays === d && 'on'], onclick: () => void save({ visitIntervalDays: d }, `Intervall: alle ${formatInterval(d)}`) }, formatInterval(d)),
      ),
    ),
    h(
      'div',
      { class: ['due-line', dueClass] },
      iconEl('clock', 18),
      h('span', null, h('b', null, dueText(due)), last ? ` · letzter Besuch ${formatDate(last.date)}` : ''),
    ),
  );
}
