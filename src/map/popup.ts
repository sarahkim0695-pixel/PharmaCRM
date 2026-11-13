/** Kurzinfo, die beim Antippen eines Pins erscheint. */
import { navigate } from '../router';
import { store } from '../state/store';
import type { Practice } from '../types';
import { h } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { practiceColor, STATE_LABEL, stateKeyOf } from '../utils/customer';
import { formatDateShort, relativeDays } from '../utils/dates';
import { appleMapsUrl, fullAddress } from '../utils/maps';
import { KIND_LABEL, kindOf } from '../utils/kind';
import { addPracticeToTour } from '../views/tour-view';

export function statusBadge(p: Practice) {
  return h('span', { class: 'badge', style: { '--badge': practiceColor(p, store.settings) } }, STATE_LABEL[stateKeyOf(p)]);
}

export function reviewBadge() {
  return h('span', { class: 'badge badge-review' }, 'prüfen');
}

export function buildPopup(p: Practice): HTMLElement {
  const last = store.lastVisit(p.id);
  return h(
    'div',
    { class: 'popup' },
    h('div', { class: 'popup-title' }, p.name),
    h('div', { class: 'popup-sub' }, [KIND_LABEL[kindOf(p)], p.specialty].filter(Boolean).join(' · ')),
    h('div', { class: 'popup-addr' }, fullAddress(p)),
    h(
      'div',
      { class: 'badges' },
      statusBadge(p),
      p.needsReview && reviewBadge(),
      p.geoStatus === 'approx' && h('span', { class: 'badge badge-warn' }, 'Standort ungefähr'),
    ),
    h(
      'div',
      { class: 'popup-meta' },
      h('span', null, last ? `Letzter Besuch: ${relativeDays(last.date)}` : 'Noch kein Besuch erfasst'),
      p.nextAppointment && h('span', null, `Termin: ${formatDateShort(p.nextAppointment)}`),
    ),
    h(
      'div',
      { class: 'popup-actions' },
      h('a', { class: 'btn btn-sm', href: appleMapsUrl(p), target: '_blank', rel: 'noopener' }, iconEl('route', 18), 'Route'),
      h(
        'button',
        { class: 'btn btn-sm', onclick: () => navigate(`/praxis/${p.id}/besuch/neu`) },
        iconEl('note', 18),
        'Besuch',
      ),
      h('button', { class: 'btn btn-sm', onclick: () => void addPracticeToTour(p.id) }, iconEl('plus', 18), 'Tour'),
      h(
        'button',
        { class: 'btn btn-sm btn-primary', onclick: () => navigate(`/praxis/${p.id}`) },
        'Details',
      ),
    ),
  );
}
