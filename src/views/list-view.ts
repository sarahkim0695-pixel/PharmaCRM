/** Tabelle/Liste aller Praxen mit Suche, Filter und Sortierung. */
import { navigate, type Route } from '../router';
import { activeFilterCount, filterState, SORT_LABELS, type SortKey } from '../state/filters';
import { distinctValues, kindCounts, listPractices, statusOptions } from '../state/selectors';
import { store } from '../state/store';
import type { Practice } from '../types';
import { confirmDialog, openSheet } from '../ui/dialog';
import { INTEREST_LABEL } from './events-view';
import { debounce, h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { dueInfo, formatInterval, INTERVAL_CHOICES, practiceColor, STATE_KEYS, STATE_LABEL, stateColor, stateKeyOf, type StateKey } from '../utils/customer';
import { formatDateShort, relativeDays } from '../utils/dates';
import { KIND_KEYS, KIND_PLURAL, kindCountText, kindOf } from '../utils/kind';
import type { FacilityKind } from '../types';
import { emptyState, field, pageHeader, type View } from './common';

const PAGE_SIZE = 150;
let savedScroll = 0;

export function listView(route: Route): View {
  let limit = PAGE_SIZE;
  const search = h('input', {
    type: 'search',
    class: 'search-input',
    placeholder: 'Suchen: Name, Ort, Fachrichtung …',
    value: filterState.filter.search,
    enterkeyhint: 'search',
    autocomplete: 'off',
    oninput: debounce(() => filterState.update({ search: search.value }), 200),
  });
  const filterBtn = h('button', { class: 'btn filter-btn', onclick: () => openFilterSheet() });
  const bulkBtn = h('button', { class: 'btn filter-btn', 'aria-label': 'Mehrere bearbeiten', title: 'Status oder Intervall für alle angezeigten setzen', onclick: () => openBulkEdit(listPractices()) }, iconEl('edit', 20), h('span', { class: 'hide-narrow' }, 'Mehrere'));
  const sortSelect = h(
    'select',
    {
      class: 'sort-select',
      'aria-label': 'Sortieren',
      onchange: () => {
        const key = sortSelect.value as SortKey;
        if (key === 'distance' && !filterState.position) requestPosition();
        filterState.setSort(key);
      },
    },
    (Object.keys(SORT_LABELS) as SortKey[]).map((k) =>
      h('option', { value: k, selected: filterState.sort === k }, `↕ ${SORT_LABELS[k]}`),
    ),
  );
  const tabs = h('div', { class: 'kind-tabs', role: 'tablist', 'aria-label': 'Gruppe' });
  const chips = h('div', { class: 'chips' });
  const count = h('div', { class: 'list-count' });
  const list = h('ul', { class: 'plist' });
  const more = h('div');

  const el = h(
    'div',
    { class: 'page page-list' },
    pageHeader({
      title: 'Praxen & Kliniken',
      actions: h('button', { class: 'icon-btn', 'aria-label': 'Praxis anlegen', onclick: () => navigate(`/praxis/neu?art=${filterState.listKind}`) }, iconEl('plus', 26)),
    }),
    tabs,
    h('div', { class: 'list-tools' }, h('div', { class: 'searchbox' }, iconEl('search', 20), search), h('div', { class: 'row' }, filterBtn, sortSelect, bulkBtn)),
    chips,
    count,
    list,
    more,
    h('button', { class: 'fab', 'aria-label': 'Praxis anlegen', onclick: () => navigate(`/praxis/neu?art=${filterState.listKind}`) }, iconEl('plus', 30)),
  );

  function render() {
    const nActive = activeFilterCount(filterState.filter);
    setChildren(filterBtn, iconEl('filter', 20), 'Filter', nActive ? h('span', { class: 'count-badge' }, String(nActive)) : null);
    renderChips();

    const kind = filterState.listKind;
    const counts = kindCounts();
    const filtering = activeFilterCount(filterState.filter) > 0 || !!filterState.filter.search;
    setChildren(tabs, kindTabs(kind, counts, filtering, (k) => { limit = PAGE_SIZE; filterState.setListKind(k); }));

    const items = listPractices();
    const total = store.practices.size;
    const kindTotal = counts[kind].total;
    count.textContent = items.length === kindTotal ? kindCountText(kindTotal, kind) : `${items.length} von ${kindCountText(kindTotal, kind)}`;

    if (!total) {
      setChildren(
        list,
        emptyState({
          icon: 'list',
          title: 'Noch keine Praxen',
          text: 'Importiere deine Excel-Liste oder lege eine Praxis von Hand an.',
          action: h('div', { class: 'row center' },
            h('a', { class: 'btn btn-primary', href: '#/import' }, iconEl('upload', 20), 'Excel importieren'),
            h('a', { class: 'btn', href: '#/praxis/neu' }, 'Praxis anlegen'),
          ),
        }),
      );
      setChildren(more);
      return;
    }
    if (!kindTotal) {
      setChildren(
        list,
        emptyState({
          icon: 'list',
          title: `Noch keine ${KIND_PLURAL[kind]}`,
          text: 'Importiere eine Excel-Liste (die App erkennt die Gruppe an der Fachrichtung, z. B. „Allgemeinmedizin“ oder „Kieferorthopädie“) oder lege einen Eintrag von Hand an.',
          action: h('div', { class: 'row center' },
            h('a', { class: 'btn btn-primary', href: '#/import' }, iconEl('upload', 20), 'Excel importieren'),
            h('a', { class: 'btn', href: `#/praxis/neu?art=${kind}` }, 'Eintrag anlegen'),
          ),
        }),
      );
      setChildren(more);
      return;
    }
    if (!items.length) {
      // Treffer in anderen Reitern anbieten
      const elsewhere = KIND_KEYS.filter((k) => k !== kind && counts[k].filtered);
      setChildren(
        list,
        emptyState({
          icon: 'search',
          title: `Keine Treffer bei ${KIND_PLURAL[kind]}`,
          text: elsewhere.length ? 'Aber in einer anderen Gruppe:' : 'Suche oder Filter anpassen.',
          action: h('div', { class: 'row center' },
            elsewhere.map((k) => h('button', { class: 'btn btn-primary', onclick: () => filterState.setListKind(k) }, `${KIND_PLURAL[k]}: ${counts[k].filtered}`)),
            h('button', { class: 'btn', onclick: () => { search.value = ''; filterState.reset(); } }, 'Filter zurücksetzen'),
          ),
        }),
      );
      setChildren(more);
      return;
    }
    setChildren(list, items.slice(0, limit).map(row));
    setChildren(
      more,
      items.length > limit
        ? h('button', { class: 'btn btn-block', onclick: () => { limit += PAGE_SIZE; render(); } }, `Weitere ${Math.min(PAGE_SIZE, items.length - limit)} anzeigen`)
        : null,
    );
  }

  function renderChips() {
    const f = filterState.filter;
    const chip = (label: string, onRemove: () => void) =>
      h('button', { class: 'chip', onclick: onRemove }, label, iconEl('close', 14));
    const statusLabels = new Map(statusOptions().map((o) => [o.key, o.label]));
    setChildren(
      chips,
      f.statuses.map((s) => chip(statusLabels.get(s) ?? s, () => filterState.update({ statuses: f.statuses.filter((x) => x !== s) }))),
      f.cities.map((c) => chip(c, () => filterState.update({ cities: f.cities.filter((x) => x !== c) }))),
      f.specialties.map((c) => chip(c, () => filterState.update({ specialties: f.specialties.filter((x) => x !== c) }))),
      f.plz.map((c) => chip(`PLZ ${c}`, () => filterState.update({ plz: f.plz.filter((x) => x !== c) }))),
      f.onlyReview && chip('prüfen', () => filterState.update({ onlyReview: false })),
      f.locationProblem && chip('Standort fehlt/ungenau', () => filterState.update({ locationProblem: false })),
      f.stale && chip('Besuch fällig', () => filterState.update({ stale: false })),
      f.hasAppointment && chip('mit Termin', () => filterState.update({ hasAppointment: false })),
      f.territory !== 'all' && chip(f.territory === 'inside' ? 'im Gebiet' : 'außerhalb Gebiet', () => filterState.update({ territory: 'all' })),
      f.eventId && f.eventState && chip(
        `${store.events.get(f.eventId)?.name ?? 'Veranstaltung'}: ${INTEREST_LABEL[f.eventState]}`,
        () => filterState.update({ eventId: '', eventState: '' }),
      ),
      f.productId && f.productState && chip(
        `${store.products.get(f.productId)?.name ?? 'Produkt'}: ${f.productState === 'any' ? 'alle' : f.productState}`,
        () => filterState.update({ productId: '', productState: '' }),
      ),
    );
  }

  const unsubs = [store.subscribe(render), filterState.subscribe(render)];
  render();

  // Scroll-Position merken (z. B. nach Rückkehr aus der Detailansicht)
  requestAnimationFrame(() => {
    const scroller = el.closest('.page-scroll');
    if (scroller) scroller.scrollTop = savedScroll;
    if (route.query.has('suche')) search.focus();
  });

  return {
    el,
    destroy: () => {
      savedScroll = el.closest('.page-scroll')?.scrollTop ?? 0;
      unsubs.forEach((u) => u());
    },
  };
}

/**
 * Reiter Orthopäden / Hausärzte / Zahnärzte & KFO / Kliniken mit Anzahl
 * (bei aktiver Suche oder Filter: Anzahl der Treffer).
 */
export function kindTabs(
  current: FacilityKind,
  counts: Record<FacilityKind, { total: number; filtered: number }>,
  filtering: boolean,
  onSelect: (k: FacilityKind) => void,
): HTMLElement[] {
  return KIND_KEYS.map((k) =>
    h(
      'button',
      {
        class: ['kind-tab', k === current && 'on', !counts[k].total && 'empty'],
        role: 'tab',
        'aria-selected': String(k === current),
        onclick: () => k !== current && onSelect(k),
      },
      h('span', { class: 'kind-tab-label' }, KIND_PLURAL[k]),
      h('span', { class: 'kind-tab-count' }, String(filtering ? counts[k].filtered : counts[k].total)),
    ),
  );
}

function row(p: Practice): HTMLElement {
  const last = store.lastVisit(p.id);
  const color = practiceColor(p, store.settings);
  const due = dueInfo(p, last?.date, store.settings);
  const isDue = !due.never && due.dueInDays <= 0;
  const noPin = p.geoStatus === 'not_found';
  return h(
    'li',
    null,
    h(
      'a',
      { class: 'prow', href: `#/praxis/${p.id}` },
      h('span', { class: ['dot', kindOf(p) === 'klinik' && 'dot-klinik'], style: { background: color }, title: STATE_LABEL[stateKeyOf(p)] }),
      h(
        'span',
        { class: 'prow-main' },
        h('span', { class: 'prow-title' }, p.name),
        h('span', { class: 'prow-sub' }, [p.specialty, `${p.plz} ${p.city}`.trim()].filter(Boolean).join(' · ')),
        h(
            'span',
            { class: 'badges' },
            h('span', { class: 'badge badge-soft', style: { '--badge': color } }, STATE_LABEL[stateKeyOf(p)]),
            isDue && h('span', { class: 'badge badge-due' }, 'Besuch fällig'),
            p.needsReview && h('span', { class: 'badge badge-review' }, 'prüfen'),
            noPin && h('span', { class: 'badge badge-warn' }, 'kein Pin'),
            p.geoStatus === 'approx' && h('span', { class: 'badge badge-warn' }, 'Pin ungenau'),
            p.nextAppointment && h('span', { class: 'badge badge-info' }, `Termin ${formatDateShort(p.nextAppointment)}`),
          ),
      ),
      h('span', { class: 'prow-side' }, last ? relativeDays(last.date) : h('span', { class: 'muted' }, 'kein Besuch')),
    ),
  );
}

function requestPosition() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      filterState.position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      filterState.setSort('distance');
    },
    () => toast('Standort nicht verfügbar – bitte Ortung erlauben.', { kind: 'error' }),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

/** Fenster mit allen Filtern. Änderungen wirken sofort. */
export function openFilterSheet(): void {
  const f = filterState.filter;
  const multiSelect = (values: string[], selected: string[], onChange: (v: string[]) => void, labelFn = (v: string) => v) => {
    const sel = h(
      'select',
      { multiple: true, size: Math.min(6, Math.max(3, values.length)), onchange: () => onChange(Array.from(sel.selectedOptions).map((o) => o.value)) },
      values.map((v) => h('option', { value: v, selected: selected.includes(v) }, labelFn(v))),
    );
    return sel;
  };
  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void) =>
    h('label', { class: 'switch-row' }, h('span', null, label), h('input', { type: 'checkbox', class: 'switch', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }));

  const statusChips = h('div', { class: 'chip-select' });
  const renderStatus = () => {
    const active = new Set(filterState.filter.statuses);
    setChildren(
      statusChips,
      statusOptions().map((o) =>
        h(
          'button',
          {
            class: ['chip-toggle', active.has(o.key) && 'on'],
            style: { '--chip': stateColor(o.key, store.settings) },
            onclick: () => {
              if (active.has(o.key)) active.delete(o.key);
              else active.add(o.key);
              filterState.update({ statuses: [...active] });
              renderStatus();
            },
          },
          h('span', { class: 'dot' }),
          `${o.label} (${o.count})`,
        ),
      ),
    );
  };
  renderStatus();

  const products = store.productList();
  const productSel = h(
    'select',
    { onchange: () => filterState.update({ productId: productSel.value, productState: productSel.value ? (stateSel.value as typeof f.productState) || 'any' : '' }) },
    h('option', { value: '' }, '– kein Produktfilter –'),
    products.map((p) => h('option', { value: p.id, selected: f.productId === p.id }, p.name)),
  );
  const stateSel = h(
    'select',
    { onchange: () => filterState.update({ productState: filterState.filter.productId ? (stateSel.value as typeof f.productState) : '' }) },
    h('option', { value: 'any', selected: f.productState === 'any' }, 'angeboten oder kauft'),
    h('option', { value: 'angeboten', selected: f.productState === 'angeboten' }, 'angeboten'),
    h('option', { value: 'kauft', selected: f.productState === 'kauft' }, 'kauft'),
  );

  const events = store.eventList(true);
  const eventStateSel = h(
    'select',
    { onchange: () => filterState.update({ eventState: filterState.filter.eventId ? (eventStateSel.value as typeof f.eventState) : '' }) },
    (['offen', 'interesse', 'kein'] as const).map((k) => h('option', { value: k, selected: f.eventState === k }, INTEREST_LABEL[k])),
  );
  const eventSel = h(
    'select',
    { onchange: () => filterState.update({ eventId: eventSel.value, eventState: eventSel.value ? (eventStateSel.value as typeof f.eventState) || 'offen' : '' }) },
    h('option', { value: '' }, '– kein Veranstaltungsfilter –'),
    events.map((e) => h('option', { value: e.id, selected: f.eventId === e.id }, e.name)),
  );

  const sheet = openSheet({
    title: 'Filter',
    content: [
      h('h3', { class: 'sheet-section' }, 'Status'),
      statusChips,
      h('h3', { class: 'sheet-section' }, 'Besonderes'),
      toggle('Nur „prüfen“ (gelb markiert)', f.onlyReview, (v) => filterState.update({ onlyReview: v })),
      toggle('Standort fehlt oder ungenau', f.locationProblem, (v) => filterState.update({ locationProblem: v })),
      toggle('Besuch fällig (laut Besuchsintervall)', f.stale, (v) => filterState.update({ stale: v })),
      toggle('Mit geplantem Termin', f.hasAppointment, (v) => filterState.update({ hasAppointment: v })),
      field(
        'Gebiet',
        h(
          'select',
          { onchange: (e: Event) => filterState.update({ territory: (e.target as HTMLSelectElement).value as typeof f.territory }) },
          h('option', { value: 'all', selected: f.territory === 'all' }, 'alle Praxen'),
          h('option', { value: 'inside', selected: f.territory === 'inside' }, 'nur in meinem Gebiet'),
          h('option', { value: 'outside', selected: f.territory === 'outside' }, 'nur außerhalb meines Gebiets'),
        ),
      ),
      h('h3', { class: 'sheet-section' }, 'Ort, Fachrichtung, PLZ'),
      h('p', { class: 'muted small' }, 'Mehrfachauswahl möglich.'),
      field('Ort', multiSelect(distinctValues('city'), f.cities, (v) => filterState.update({ cities: v }))),
      field('Fachrichtung', multiSelect(distinctValues('specialty'), f.specialties, (v) => filterState.update({ specialties: v }))),
      field('PLZ', multiSelect(distinctValues('plz'), f.plz, (v) => filterState.update({ plz: v }))),
      products.length ? [h('h3', { class: 'sheet-section' }, 'Produkt'), field('Produkt', productSel), field('Zustand', stateSel)] : null,
      events.length ? [h('h3', { class: 'sheet-section' }, 'Veranstaltung'), field('Veranstaltung', eventSel), field('Stand', eventStateSel)] : null,
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => { filterState.reset(); sheet.close(); } }, 'Zurücksetzen'),
      h('button', { class: 'btn btn-primary', onclick: () => sheet.close() }, 'Fertig'),
    ],
  });
}

/**
 * „Mehrere bearbeiten“: Kundenstatus und/oder Besuchsintervall für alle gerade
 * angezeigten Einträge setzen (vorher mit Suche/Filter eingrenzen).
 */
function openBulkEdit(items: Practice[]): void {
  if (!items.length) {
    toast('Keine Einträge angezeigt.');
    return;
  }
  let state: StateKey | '' = '';
  const stateBox = h('div', { class: 'chip-select' });
  const renderState = () =>
    setChildren(
      stateBox,
      h('button', { class: ['chip-toggle', state === '' && 'on'], onclick: () => { state = ''; renderState(); } }, 'nicht ändern'),
      STATE_KEYS.map((k) =>
        h(
          'button',
          { class: ['chip-toggle', state === k && 'on'], style: { '--chip': stateColor(k, store.settings) }, onclick: () => { state = k; renderState(); } },
          h('span', { class: 'dot' }),
          STATE_LABEL[k],
        ),
      ),
    );
  renderState();
  const interval = h(
    'select',
    null,
    h('option', { value: 'keep' }, 'nicht ändern'),
    h('option', { value: 'default' }, 'Standard (je Kundenstatus)'),
    INTERVAL_CHOICES.map((d) => h('option', { value: String(d) }, `alle ${formatInterval(d)}`)),
  );
  const sheet = openSheet({
    title: 'Mehrere bearbeiten',
    content: [
      h('p', null, `Gilt für die ${items.length} gerade angezeigten Einträge. Tipp: vorher mit Suche oder Filter eingrenzen (z. B. Ort, Kundenstatus).`),
      h('h3', { class: 'sheet-section' }, 'Kundenstatus'),
      stateBox,
      h('h3', { class: 'sheet-section' }, 'Besuchen alle …'),
      interval,
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'),
      h('button', { class: 'btn btn-primary', onclick: () => void apply() }, 'Übernehmen'),
    ],
  });
  async function apply() {
    if (state === '' && interval.value === 'keep') {
      sheet.close();
      return;
    }
    const ok = await confirmDialog({
      title: 'Übernehmen?',
      message: `${items.length} Einträge werden geändert${state ? ` – Status: ${STATE_LABEL[state]}` : ''}${interval.value !== 'keep' ? ` – Intervall: ${interval.value === 'default' ? 'Standard' : `alle ${formatInterval(Number(interval.value))}`}` : ''}.`,
      confirmLabel: 'Übernehmen',
    });
    if (!ok) return;
    const changed = items.map((p) => {
      const next: Practice = { ...(store.getPractice(p.id) ?? p) };
      if (state) next.customerState = state;
      if (interval.value === 'default') delete next.visitIntervalDays;
      else if (interval.value !== 'keep') next.visitIntervalDays = Number(interval.value);
      return next;
    });
    await store.savePractices(changed);
    sheet.close();
    toast(`${items.length} Einträge geändert`, { kind: 'success' });
  }
}
