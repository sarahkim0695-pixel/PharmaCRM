/** Abschnitte „Nächster Termin“ und „Besuche“ in der Detailansicht einer Praxis. */
import { navigate } from '../router';
import { store } from '../state/store';
import type { Practice, Visit } from '../types';
import { openSheet } from '../ui/dialog';
import { h } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { daysBetween, formatDate, parseDate, relativeDays, todayStr } from '../utils/dates';
import { field, section } from './common';

/** Termin-Text aus Datum + optionaler Uhrzeit zusammensetzen. */
export function joinDateTime(date: string, time: string): string | undefined {
  if (!date) return undefined;
  return time ? `${date}T${time}` : date;
}

export function appointmentSection(p: Practice): HTMLElement {
  const appt = p.nextAppointment;
  const overdue = appt ? daysBetween(new Date(), parseDate(appt)) < 0 : false;
  return section(
    'Nächster Termin',
    appt
      ? h(
          'div',
          { class: ['appt', overdue && 'appt-overdue'] },
          iconEl('calendar', 22),
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'appt-date' }, formatDate(appt), h('span', { class: 'muted' }, ` · ${relativeDays(appt.slice(0, 10))}`)),
            overdue && h('div', { class: 'appt-warn' }, 'Termin liegt in der Vergangenheit – Besuch erfassen oder Termin ändern.'),
            p.nextAppointmentNote && h('div', { class: 'appt-note' }, p.nextAppointmentNote),
          ),
        )
      : h('p', { class: 'muted' }, 'Kein Termin geplant.'),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', onclick: () => editAppointment(p) }, iconEl('calendar', 18), appt ? 'Termin ändern' : 'Termin planen'),
      appt &&
        h('button', { class: 'btn', onclick: () => navigate(`/praxis/${p.id}/besuch/neu`) }, iconEl('check', 18), 'Erledigt → Besuch erfassen'),
    ),
  );
}

export function editAppointment(p: Practice): void {
  const [d, t] = (p.nextAppointment ?? '').split('T');
  const date = h('input', { type: 'date', value: d ?? '', min: todayStr() });
  const time = h('input', { type: 'time', value: t ?? '', step: 300 });
  const note = h('input', { type: 'text', value: p.nextAppointmentNote ?? '', placeholder: 'z. B. Produktvorstellung' });
  const save = async (clear = false) => {
    const current = store.getPractice(p.id) ?? p;
    const nextAppointment = clear ? undefined : joinDateTime(date.value, time.value);
    if (!clear && !nextAppointment) {
      toast('Bitte ein Datum wählen.', { kind: 'error' });
      return;
    }
    await store.savePractice({ ...current, nextAppointment, nextAppointmentNote: clear ? '' : note.value.trim() });
    sheet.close();
    toast(clear ? 'Termin entfernt' : 'Termin gespeichert');
  };
  const sheet = openSheet({
    title: 'Nächster Termin',
    content: [h('div', { class: 'grid-2 grid-2-even' }, field('Datum', date), field('Uhrzeit (optional)', time)), field('Notiz', note)],
    footer: [
      p.nextAppointment ? h('button', { class: 'btn btn-danger-outline', onclick: () => void save(true) }, 'Entfernen') : null,
      h('button', { class: 'btn btn-primary', onclick: () => void save() }, 'Speichern'),
    ],
  });
}

export function visitsSection(p: Practice): HTMLElement {
  const visits = store.visitsFor(p.id);
  return section(
    h('span', { class: 'card-title-row' }, 'Besuche', visits.length ? h('span', { class: 'muted small' }, ` (${visits.length})`) : null),
    h('button', { class: 'btn btn-primary btn-block', onclick: () => navigate(`/praxis/${p.id}/besuch/neu`) }, iconEl('plus', 20), 'Besuch erfassen'),
    visits.length
      ? h('ul', { class: 'visit-list' }, visits.map((v) => visitItem(v)))
      : h('p', { class: 'muted' }, 'Noch kein Besuch erfasst.'),
  );
}

export function visitItem(v: Visit, opts: { showPractice?: boolean } = {}): HTMLElement {
  const practice = opts.showPractice ? store.getPractice(v.practiceId) : undefined;
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'visit', href: `#/besuch/${v.id}` },
      h(
        'div',
        { class: 'visit-head' },
        h('b', null, formatDate(v.date)),
        h('span', { class: 'muted small' }, relativeDays(v.date)),
      ),
      practice && h('div', { class: 'visit-practice' }, `${practice.name} · ${practice.city}`),
      v.contact && h('div', { class: 'visit-contact' }, iconEl('user', 16), v.contact),
      v.note && h('div', { class: 'visit-note' }, v.note),
    ),
  );
}
