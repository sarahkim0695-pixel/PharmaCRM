/**
 * Veranstaltungen: Liste pflegen (wie Produkte) und je Praxis festhalten,
 * ob schon angefragt wurde und wie das Interesse ist.
 */
import { navigate } from '../router';
import { filterState } from '../state/filters';
import { store } from '../state/store';
import type { EventInterest, EventItem, Practice } from '../types';
import { confirmDialog, openSheet } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { todayStr } from '../utils/dates';
import { newId, nowIso } from '../utils/id';
import { normalize } from '../utils/text';
import { emptyState, field, pageHeader, type View } from './common';

export const INTEREST_LABEL: Record<EventInterest | 'offen', string> = {
  offen: 'noch nicht angefragt',
  kein: 'kein Interesse',
  interesse: 'Interesse',
};

/** Stand je Veranstaltung über alle Praxen */
export function eventUsage(eventId: string): { interesse: number; kein: number; offen: number } {
  let interesse = 0;
  let kein = 0;
  for (const p of store.practices.values()) {
    const st = p.events?.[eventId];
    if (st === 'interesse') interesse++;
    if (st === 'kein') kein++;
  }
  return { interesse, kein, offen: store.practices.size - interesse - kein };
}

export const isPast = (e: EventItem) => !!e.date && e.date < todayStr();

/** „Mi, 03.12.2026 · Augsburg“ */
export function eventWhen(e: EventItem): string {
  const d = e.date ? new Date(`${e.date}T12:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
  return [d, e.place].filter(Boolean).join(' · ');
}

/** Veranstaltungen, nach denen bei einer Praxis noch gefragt werden sollte (an einem Tag) */
export function eventsToAsk(p: Practice, onDate = todayStr()): EventItem[] {
  return store.eventList().filter((e) => (!e.date || e.date >= onDate) && !p.events?.[e.id]);
}

// ---------- Seite „Veranstaltungen“ ----------

export function eventsView(): View {
  const el = h('div', { class: 'page' });
  const name = h('input', { placeholder: 'z. B. Wundforum Augsburg', autocomplete: 'off' });
  const date = h('input', { type: 'date' });
  const place = h('input', { placeholder: 'optional', autocomplete: 'off' });

  async function add() {
    const n = name.value.trim();
    if (!n) {
      toast('Bitte einen Namen eingeben.', { kind: 'error' });
      return;
    }
    if (store.eventList(true).some((e) => normalize(e.name) === normalize(n) && (e.date ?? '') === date.value)) {
      toast('Diese Veranstaltung gibt es schon.', { kind: 'error' });
      return;
    }
    const ts = nowIso();
    await store.saveEvent({ id: newId(), name: n, date: date.value || undefined, place: place.value.trim(), note: '', archived: false, createdAt: ts, updatedAt: ts });
    name.value = '';
    date.value = '';
    place.value = '';
    toast(`„${n}“ angelegt – bei allen Praxen „noch nicht angefragt“`);
  }

  function render() {
    const all = store.eventList(true);
    const upcoming = all.filter((e) => !e.archived && !isPast(e));
    const past = all.filter((e) => !e.archived && isPast(e));
    const archived = all.filter((e) => e.archived);
    setChildren(
      el,
      pageHeader({ title: 'Veranstaltungen', back: '/mehr' }),
      h(
        'form',
        { class: 'card', onsubmit: (ev: Event) => { ev.preventDefault(); void add(); } },
        field('Name', name),
        h('div', { class: 'grid-2 grid-2-even' }, field('Datum', date), field('Ort', place)),
        h('button', { type: 'submit', class: 'btn btn-primary' }, iconEl('plus', 20), 'Veranstaltung anlegen'),
        h('p', { class: 'muted small' }, 'Eine Veranstaltung gilt für alle Praxen. Bei jeder Praxis stellst du dann ein: noch nicht angefragt · kein Interesse · Interesse.'),
      ),
      upcoming.length || past.length || archived.length
        ? [
            upcoming.length ? h('ul', { class: 'plist' }, upcoming.map(eventRow)) : null,
            past.length ? [h('h3', { class: 'sheet-section' }, 'Vorbei'), h('ul', { class: 'plist' }, past.map(eventRow))] : null,
            archived.length
              ? h('details', { class: 'details card' }, h('summary', null, `Archiviert (${archived.length})`), h('ul', { class: 'plist' }, archived.map(eventRow)))
              : null,
          ]
        : emptyState({ icon: 'calendar', title: 'Noch keine Veranstaltungen', text: 'Lege oben eine Veranstaltung an – sie erscheint dann bei allen Praxen.' }),
    );
  }

  const unsub = store.subscribe((k) => {
    if (k.has('events') || k.has('practices')) render();
  });
  render();
  return { el, destroy: unsub };
}

function eventRow(e: EventItem): HTMLElement {
  const u = eventUsage(e.id);
  return h(
    'li',
    null,
    h(
      'button',
      { class: 'prow prow-btn', onclick: () => editEvent(e) },
      iconEl('calendar', 22),
      h(
        'span',
        { class: 'prow-main' },
        h('span', { class: 'prow-title' }, e.name),
        eventWhen(e) && h('span', { class: 'prow-sub' }, eventWhen(e)),
        h(
          'span',
          { class: 'badges' },
          h('span', { class: 'badge badge-soft', style: { '--badge': '#1f9d55' } }, `Interesse: ${u.interesse}`),
          h('span', { class: 'badge badge-soft', style: { '--badge': '#d64545' } }, `kein Interesse: ${u.kein}`),
          h('span', { class: 'badge badge-soft', style: { '--badge': '#8a94a6' } }, `noch nicht angefragt: ${u.offen}`),
        ),
      ),
      iconEl('edit', 20),
    ),
  );
}

function showPractices(eventId: string, state: EventInterest | 'offen', close: () => void) {
  close();
  filterState.reset();
  filterState.update({ eventId, eventState: state });
  navigate('/liste');
}

function editEvent(e: EventItem): void {
  const name = h('input', { value: e.name });
  const date = h('input', { type: 'date', value: e.date ?? '' });
  const place = h('input', { value: e.place });
  const note = h('textarea', { rows: 3, placeholder: 'optional' }, e.note);
  const archived = h('input', { type: 'checkbox', class: 'switch', checked: e.archived });
  const u = eventUsage(e.id);
  const sheet = openSheet({
    title: 'Veranstaltung',
    content: [
      field('Name', name),
      h('div', { class: 'grid-2 grid-2-even' }, field('Datum', date), field('Ort', place)),
      field('Notiz', note),
      h('label', { class: 'switch-row' }, h('span', null, 'Archiviert (bei Praxen ausblenden)'), archived),
      h('h3', { class: 'sheet-section' }, 'Praxen anzeigen'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-sm', onclick: () => showPractices(e.id, 'offen', sheet.close) }, `noch nicht angefragt (${u.offen})`),
        h('button', { class: 'btn btn-sm', disabled: !u.interesse, onclick: () => showPractices(e.id, 'interesse', sheet.close) }, `Interesse (${u.interesse})`),
        h('button', { class: 'btn btn-sm', disabled: !u.kein, onclick: () => showPractices(e.id, 'kein', sheet.close) }, `kein Interesse (${u.kein})`),
      ),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn btn-sm btn-danger-outline', onclick: () => void remove() }, iconEl('trash', 18), 'Löschen')),
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'),
      h('button', { class: 'btn btn-primary', onclick: () => void save() }, 'Speichern'),
    ],
  });

  async function save() {
    if (!name.value.trim()) {
      toast('Bitte einen Namen eingeben.', { kind: 'error' });
      return;
    }
    await store.saveEvent({ ...e, name: name.value.trim(), date: date.value || undefined, place: place.value.trim(), note: note.value.trim(), archived: archived.checked });
    sheet.close();
    toast('Gespeichert');
  }

  async function remove() {
    const used = u.interesse + u.kein;
    const ok = await confirmDialog({
      title: 'Veranstaltung löschen?',
      message: used ? `Bei ${used} Praxen ist schon eine Antwort eingetragen – diese Angaben werden ebenfalls gelöscht. Tipp: „Archiviert“ blendet sie nur aus.` : `„${e.name}“ wird gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await store.deleteEvent(e.id);
    sheet.close();
    toast('Veranstaltung gelöscht');
  }
}

// ---------- Abschnitt in der Praxis-Detailansicht ----------

const CHOICES: (EventInterest | 'offen')[] = ['offen', 'kein', 'interesse'];

export function eventsSection(p: Practice): HTMLElement | null {
  // aktuelle Veranstaltungen + vergangene, zu denen schon etwas eingetragen ist
  const events = store.eventList().filter((e) => !isPast(e) || p.events?.[e.id]);
  if (!events.length) return null;

  const set = async (eventId: string, state: EventInterest | 'offen') => {
    const current = store.getPractice(p.id) ?? p;
    const next = { ...(current.events ?? {}) };
    if (state === 'offen') delete next[eventId];
    else next[eventId] = state;
    await store.savePractice({ ...current, events: next });
  };

  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Veranstaltungen'),
    h(
      'ul',
      { class: 'product-states event-states' },
      events.map((e) => {
        const cur = p.events?.[e.id] ?? 'offen';
        return h(
          'li',
          null,
          h('span', { class: 'grow' }, h('b', null, e.name), eventWhen(e) ? h('small', { class: 'muted' }, ` ${eventWhen(e)}`) : null, isPast(e) ? h('small', { class: 'muted' }, ' (vorbei)') : null),
          h(
            'div',
            { class: 'segmented segmented-sm segmented-event', role: 'radiogroup', 'aria-label': e.name },
            CHOICES.map((c) =>
              h(
                'button',
                {
                  class: ['seg', cur === c && 'on', `seg-ev-${c}`],
                  role: 'radio',
                  'aria-checked': String(cur === c),
                  onclick: () => void set(e.id, c),
                },
                INTEREST_LABEL[c],
              ),
            ),
          ),
        );
      }),
    ),
  );
}
