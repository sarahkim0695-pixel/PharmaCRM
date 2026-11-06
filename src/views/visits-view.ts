/** Übersicht „Besuche“: Termine, lange nicht besucht, Verlauf. */
import { navigate } from '../router';
import { filterState, isStale } from '../state/filters';
import { filterContext, statusOptions } from '../state/selectors';
import { store } from '../state/store';
import type { Practice } from '../types';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { colorForStatus, statusKey } from '../utils/colors';
import { daysBetween, daysSince, formatDate, formatDateShort, parseDate, relativeDays, todayStr } from '../utils/dates';
import { collator, plural } from '../utils/text';
import { emptyState, pageHeader, type View } from './common';
import { visitItem } from './visits-section';

type Tab = 'termine' | 'lange' | 'verlauf';
let tab: Tab = 'termine';
const staleStatuses = new Set<string>();
let includeNever = true;

export function visitsView(): View {
  const el = h('div', { class: 'page' });

  function render() {
    const tabs: [Tab, string][] = [
      ['termine', 'Termine'],
      ['lange', 'Lange nicht besucht'],
      ['verlauf', 'Verlauf'],
    ];
    setChildren(
      el,
      pageHeader({ title: 'Besuche' }),
      summary(),
      h(
        'div',
        { class: 'segmented', role: 'tablist' },
        tabs.map(([key, label]) =>
          h('button', { class: ['seg', tab === key && 'on'], role: 'tab', onclick: () => { tab = key; render(); } }, label),
        ),
      ),
      tab === 'termine' ? appointments() : tab === 'lange' ? stale(render) : history(),
    );
  }

  const unsub = store.subscribe(render);
  render();
  return { el, destroy: unsub };
}

function summary(): HTMLElement {
  const today = new Date();
  const visits = [...store.visits.values()];
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Montag
  const thisWeek = visits.filter((v) => v.date >= todayStr(weekStart) && v.date <= todayStr(today)).length;
  const thisMonth = visits.filter((v) => v.date.slice(0, 7) === todayStr(today).slice(0, 7)).length;
  const next7 = store.practiceList().filter((p) => {
    if (!p.nextAppointment) return false;
    const d = daysBetween(today, parseDate(p.nextAppointment));
    return d >= 0 && d <= 7;
  }).length;
  return h(
    'div',
    { class: 'stats' },
    h('div', { class: 'stat' }, h('b', null, String(thisWeek)), h('span', null, 'Besuche diese Woche')),
    h('div', { class: 'stat' }, h('b', null, String(thisMonth)), h('span', null, 'Besuche diesen Monat')),
    h('div', { class: 'stat' }, h('b', null, String(next7)), h('span', null, 'Termine in 7 Tagen')),
  );
}

function practiceRow(p: Practice, side: HTMLElement | string, extra?: HTMLElement | string | false) {
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'prow', href: `#/praxis/${p.id}` },
      h('span', { class: 'dot', style: { background: colorForStatus(p.status, store.settings.statusColors) } }),
      h(
        'span',
        { class: 'prow-main' },
        h('span', { class: 'prow-title' }, p.name),
        h('span', { class: 'prow-sub' }, [p.specialty, `${p.plz} ${p.city}`.trim()].filter(Boolean).join(' · ')),
        extra ? h('span', { class: 'prow-extra' }, extra) : null,
      ),
      h('span', { class: 'prow-side' }, side),
    ),
  );
}

function appointments(): HTMLElement {
  const list = store
    .practiceList()
    .filter((p) => p.nextAppointment)
    .sort((a, b) => a.nextAppointment!.localeCompare(b.nextAppointment!));
  if (!list.length) {
    return emptyState({
      icon: 'calendar',
      title: 'Keine Termine geplant',
      text: 'Termine planst du in der Detailansicht einer Praxis oder beim Erfassen eines Besuchs.',
    });
  }
  const today = new Date();
  return h(
    'ul',
    { class: 'plist' },
    list.map((p) => {
      const overdue = daysBetween(today, parseDate(p.nextAppointment!)) < 0;
      const time = p.nextAppointment!.includes('T') ? p.nextAppointment!.slice(11, 16) : '';
      return practiceRow(
        p,
        h('span', { class: ['appt-side', overdue && 'overdue'] }, h('b', null, formatDateShort(p.nextAppointment!)), time ? h('span', null, `${time} Uhr`) : null, overdue ? h('span', null, 'überfällig') : null),
        p.nextAppointmentNote || false,
      );
    }),
  );
}

function stale(rerender: () => void): HTMLElement {
  const ctx = filterContext();
  const days = store.settings.staleDays;
  const list = store
    .practiceList()
    .filter((p) => isStale(p, ctx))
    .filter((p) => includeNever || store.lastVisit(p.id))
    .filter((p) => !staleStatuses.size || staleStatuses.has(statusKey(p.status)))
    .map((p) => ({ p, last: store.lastVisit(p.id)?.date }))
    // nie besucht zuerst, dann der älteste Besuch
    .sort((a, b) => (a.last ?? '').localeCompare(b.last ?? '') || collator.compare(a.p.name, b.p.name));

  const chips = statusOptions().map((o) =>
    h(
      'button',
      {
        class: ['chip-toggle', staleStatuses.has(o.key) && 'on'],
        style: { '--chip': colorForStatus(o.key, store.settings.statusColors) },
        onclick: () => {
          if (staleStatuses.has(o.key)) staleStatuses.delete(o.key);
          else staleStatuses.add(o.key);
          rerender();
        },
      },
      h('span', { class: 'dot' }),
      o.label,
    ),
  );

  return h(
    'div',
    null,
    h('p', { class: 'muted small' }, `Praxen ohne Besuch seit mindestens ${days} Tagen (änderbar unter Mehr → Einstellungen).`),
    h('div', { class: 'chip-select' }, chips),
    h(
      'label',
      { class: 'switch-row' },
      h('span', null, 'Auch nie besuchte Praxen zeigen'),
      h('input', { type: 'checkbox', class: 'switch', checked: includeNever, onchange: (e: Event) => { includeNever = (e.target as HTMLInputElement).checked; rerender(); } }),
    ),
    h(
      'div',
      { class: 'row list-actions' },
      h('span', { class: 'list-count grow' }, plural(list.length, 'Praxis', 'Praxen')),
      h(
        'button',
        {
          class: 'btn btn-sm',
          onclick: () => {
            filterState.reset();
            filterState.update({ stale: true, statuses: [...staleStatuses] });
            navigate('/karte?fit');
          },
        },
        iconEl('map', 18),
        'Auf Karte zeigen',
      ),
    ),
    list.length
      ? h(
          'ul',
          { class: 'plist' },
          list.map(({ p, last }) =>
            practiceRow(p, last ? h('span', { class: 'stale-days' }, h('b', null, `${daysSince(last)} Tage`), h('span', null, formatDate(last))) : h('span', { class: 'muted' }, 'nie besucht')),
          ),
        )
      : emptyState({ icon: 'check', title: 'Alles besucht', text: 'Keine Praxis ist länger als eingestellt ohne Besuch.' }),
  );
}

function history(): HTMLElement {
  const visits = [...store.visits.values()].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  if (!visits.length) {
    return emptyState({ icon: 'note', title: 'Noch keine Besuche', text: 'Öffne eine Praxis und tippe auf „Besuch erfassen“.' });
  }
  const groups = new Map<string, typeof visits>();
  for (const v of visits) {
    const key = parseDate(v.date).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return h(
    'div',
    null,
    [...groups].map(([month, vs]) =>
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, month, h('span', { class: 'muted small' }, ` · ${vs.length}`)), h('ul', { class: 'visit-list' }, vs.map((v) => visitItem(v, { showPractice: true })))),
    ),
    h('p', { class: 'muted small center' }, `Zuletzt: ${relativeDays(visits[0].date)}`),
  );
}
