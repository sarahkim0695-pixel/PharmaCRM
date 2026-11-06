/** Besuch erfassen oder bearbeiten (Datum, Ansprechpartner, Notiz, nächster Termin). */
import { goBack, type Route } from '../router';
import { store } from '../state/store';
import type { Visit } from '../types';
import { confirmDialog } from '../ui/dialog';
import { h } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { todayStr } from '../utils/dates';
import { newId, nowIso } from '../utils/id';
import { collator } from '../utils/text';
import { emptyState, field, pageHeader, type View } from './common';
import { joinDateTime } from './visits-section';

export function visitFormView(route: Route): View {
  const existing = route.name === 'visit-edit' ? store.visits.get(route.params.visitId) : undefined;
  const practiceId = existing?.practiceId ?? route.params.id;
  const practice = store.getPractice(practiceId);
  if (!practice || (route.name === 'visit-edit' && !existing)) {
    return { el: h('div', { class: 'page' }, pageHeader({ title: 'Besuch', back: '/besuche' }), emptyState({ icon: 'warning', title: 'Nicht gefunden' })) };
  }

  // Frühere Ansprechpartner dieser Praxis als Vorschläge
  const contacts = [...new Set(store.visitsFor(practiceId).map((v) => v.contact).filter(Boolean))].sort(collator.compare);

  const date = h('input', { type: 'date', value: existing?.date ?? todayStr(), max: todayStr(new Date(Date.now() + 86_400_000 * 365)) });
  const contact = h('input', { value: existing?.contact ?? contacts[0] ?? '', list: 'dl-contacts', placeholder: 'z. B. Dr. Muster, Fr. Beispiel (MFA)', autocomplete: 'off' });
  const note = h('textarea', { rows: 7, placeholder: 'Was wurde besprochen? Muster, Bestellung, nächste Schritte …' }, existing?.note ?? '');
  const [apDate, apTime] = (practice.nextAppointment ?? '').split('T');
  const nextDate = h('input', { type: 'date', value: existing ? (apDate ?? '') : '' });
  const nextTime = h('input', { type: 'time', value: existing ? (apTime ?? '') : '', step: 300 });
  const nextNote = h('input', { value: existing ? (practice.nextAppointmentNote ?? '') : '', placeholder: 'optional' });

  async function save() {
    if (!date.value) {
      toast('Bitte ein Datum wählen.', { kind: 'error' });
      return;
    }
    const ts = nowIso();
    const visit: Visit = {
      id: existing?.id ?? newId(),
      practiceId,
      date: date.value,
      contact: contact.value.trim(),
      note: note.value.trim(),
      createdAt: existing?.createdAt ?? ts,
      updatedAt: ts,
    };
    await store.saveVisit(visit);

    // Nächsten Termin übernehmen – oder erledigten Termin entfernen
    const current = store.getPractice(practiceId)!;
    const newAppt = joinDateTime(nextDate.value, nextTime.value);
    let message = 'Besuch gespeichert';
    if (newAppt) {
      await store.savePractice({ ...current, nextAppointment: newAppt, nextAppointmentNote: nextNote.value.trim() });
    } else if (!existing && current.nextAppointment && current.nextAppointment.slice(0, 10) <= visit.date) {
      await store.savePractice({ ...current, nextAppointment: undefined, nextAppointmentNote: '' });
      message = 'Besuch gespeichert – geplanter Termin ist erledigt';
    }
    toast(message);
    goBack(`/praxis/${practiceId}`);
  }

  async function remove() {
    if (!existing) return;
    const ok = await confirmDialog({ title: 'Besuch löschen?', message: 'Der Besuch und die Notiz werden gelöscht.', confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await store.deleteVisit(existing.id);
    toast('Besuch gelöscht');
    goBack(`/praxis/${practiceId}`);
  }

  const el = h(
    'div',
    { class: 'page page-form' },
    pageHeader({ title: existing ? 'Besuch bearbeiten' : 'Besuch erfassen', back: `/praxis/${practiceId}`, sub: h('a', { href: `#/praxis/${practiceId}` }, practice.name) }),
    h(
      'form',
      { class: 'form card', onsubmit: (e: Event) => { e.preventDefault(); void save(); } },
      field('Datum', date),
      field('Ansprechpartner', contact),
      h('datalist', { id: 'dl-contacts' }, contacts.map((c) => h('option', { value: c }))),
      field('Notiz', note),
      h('h3', { class: 'sheet-section' }, 'Nächster Termin (optional)'),
      h('div', { class: 'grid-2 grid-2-even' }, field('Datum', nextDate), field('Uhrzeit', nextTime)),
      field('Notiz zum Termin', nextNote),
      h(
        'div',
        { class: 'form-actions' },
        existing ? h('button', { type: 'button', class: 'btn btn-danger-outline', onclick: () => void remove() }, iconEl('trash', 18), 'Löschen') : null,
        h('button', { type: 'button', class: 'btn', onclick: () => goBack(`/praxis/${practiceId}`) }, 'Abbrechen'),
        h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern'),
      ),
    ),
  );
  if (!existing) requestAnimationFrame(() => note.focus({ preventScroll: true }));
  return { el };
}
