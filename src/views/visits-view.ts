/** Übersicht „Besuche“: Termine, lange nicht besucht, Verlauf. */
import { navigate } from '../router';
import { filterState, isStale } from '../state/filters';
import { filterContext, statusOptions } from '../state/selectors';
import { store } from '../state/store';
import type { Practice } from '../types';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { dueInfo, formatInterval, practiceColor, STATE_LABEL, stateColor, stateKeyOf, type StateKey } from '../utils/customer';
import { daysBetween, formatDate, formatDateShort, parseDate, relativeDays, todayStr } from '../utils/dates';
import { collator } from '../utils/text';
import { KIND_KEYS, kindCountText, kindOf } from '../utils/kind';
import type { FacilityKind } from '../types';
import { kindTabs } from './list-view';
import { emptyState, pageHeader, type View } from './common';
import { visitItem } from './visits-section';

type Tab = 'termine' | 'lange' | 'verlauf';
let tab: Tab = 'termine';
const staleStatuses = new Set<StateKey>();
let includeNever = true;

export function visitsView(): View {
  const el = h('div', { class: 'page' });

  function render() {
    const tabs: [Tab, string][] = [
      ['termine', 'Termine'],
      ['lange', 'Fällig'],
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

  const unsubs = [store.subscribe(render), filterState.subscribe(() => tab === 'lange' && render())];
  render();
  return { el, destroy: () => unsubs.forEach((u) => u()) };
}

function summary(): HTMLElement {
  const today = new Date();
  const visits = [...store.visits.values()];
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7)); // Montag
  const thisWeek = visits.filter((v) => v.date >= todayStr(weekStart) && v.date <= todayStr(today)).length;
  const thisMonth = visits.filter((v) => v.date.slice(0, 7) === todayStr(today).slice(0, 7)).length;
  const ctx = filterContext();
  const dueCount = store.practiceList().filter((p) => store.lastVisit(p.id) && isStale(p, ctx)).length;
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
    h('div', { class: 'stat stat-warn' }, h('b', null, String(dueCount)), h('span', null, 'Besuche fällig')),
  );
}

function practiceRow(p: Practice, side: HTMLElement | string, extra?: HTMLElement | string | false) {
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'prow', href: `#/praxis/${p.id}` },
      h('span', { class: 'dot', style: { background: practiceColor(p, store.settings) } }),
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
  // Reiter wie in der Liste (gleiche Auswahl)
  const kind = filterState.listKind;
  const dueAll = store
    .practiceList()
    .filter((p) => isStale(p, ctx))
    .filter((p) => includeNever || store.lastVisit(p.id))
    .filter((p) => !staleStatuses.size || staleStatuses.has(stateKeyOf(p)));
  const counts = Object.fromEntries(KIND_KEYS.map((k) => [k, { total: 0, filtered: 0 }])) as Record<FacilityKind, { total: number; filtered: number }>;
  for (const p of dueAll) counts[kindOf(p)].total++;
  const list = dueAll
    .filter((p) => kindOf(p) === kind)
    .map((p) => {
      const last = store.lastVisit(p.id)?.date;
      return { p, last, due: dueInfo(p, last, store.settings) };
    })
    // am stärksten überfällig zuerst (gemessen am eigenen Intervall), nie besuchte danach
    .sort((a, b) => Number(a.due.never) - Number(b.due.never) || b.due.ratio - a.due.ratio || collator.compare(a.p.name, b.p.name));

  const chips = statusOptions().map((o) =>
    h(
      'button',
      {
        class: ['chip-toggle', staleStatuses.has(o.key) && 'on'],
        style: { '--chip': stateColor(o.key, store.settings) },
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
    h('div', { class: 'kind-tabs', role: 'tablist', 'aria-label': 'Gruppe' }, kindTabs(kind, counts, false, (k) => filterState.setListKind(k))),
    h('p', { class: 'muted small' }, 'Besuch fällig laut Besuchsintervall der Praxis (sonst Standard je Kundenstatus, änderbar unter Mehr → Einstellungen).'),
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
      h('span', { class: 'list-count grow' }, kindCountText(list.length, kind)),
      h(
        'button',
        {
          class: 'btn btn-sm',
          onclick: () => {
            filterState.reset();
            filterState.update({ stale: true, statuses: [...staleStatuses] });
            filterState.setMapKinds([kind]);
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
          list.map(({ p, last, due }) =>
            practiceRow(
              p,
              last
                ? h('span', { class: 'stale-days' }, h('b', null, due.dueInDays === 0 ? 'heute fällig' : `+${-due.dueInDays} Tage`), h('span', null, `alle ${formatInterval(due.interval)}`))
                : h('span', { class: 'muted' }, 'nie besucht'),
              last ? `Letzter Besuch ${formatDate(last)} · ${STATE_LABEL[stateKeyOf(p)]}` : STATE_LABEL[stateKeyOf(p)],
            ),
          ),
        )
      : emptyState({ icon: 'check', title: 'Nichts fällig', text: 'Alle Praxen sind im Rahmen ihres Besuchsintervalls besucht.' }),
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
