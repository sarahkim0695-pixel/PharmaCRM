/**
 * Tourplanung: Tag wählen, Praxen auswählen, optimierte Reihenfolge mit
 * Uhrzeiten berechnen, unterwegs neu planen.
 */
import { navigate, type Route } from '../router';
import { distanceKm, filterState, isStale } from '../state/filters';
import { filterContext } from '../state/selectors';
import { store } from '../state/store';
import { practiceDurations } from '../tour/durations';
import { formatRanges, formatTime, hoursOn, parseTime } from '../tour/opening-hours';
import { addAppointments, appointmentOn, computePlan, newTour, suggestPractices, visitedOn, type PlanOptions } from '../tour/planner';
import { ROUTING_ATTRIBUTION, type LatLng } from '../tour/travel';
import type { PlanEntry, Practice, Tour } from '../types';
import { confirmDialog, openSheet } from '../ui/dialog';
import { h, setChildren, type Child } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { colorForStatus } from '../utils/colors';
import { formatDateShort, parseDate, todayStr } from '../utils/dates';
import { appleMapsUrl } from '../utils/maps';
import { collator, normalize, plural } from '../utils/text';
import { emptyState, field, pageHeader, section, type View } from './common';

// ---------- Hilfen (auch für Karte/Detailansicht) ----------

/** Nächster sinnvoller Tourtag: heute (wenn noch Zeit ist), sonst der nächste Werktag. */
export function defaultTourDate(now = new Date()): string {
  const d = new Date(now);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const weekend = (x: Date) => x.getDay() === 0 || x.getDay() === 6;
  if (minutes > store.settings.tourDefaults.dayEnd - 60 || weekend(d)) {
    do d.setDate(d.getDate() + 1);
    while (weekend(d));
  }
  return todayStr(d);
}

/** Tag der Tour, die gerade geplant wird. */
export function activeTourDate(): string {
  const a = store.settings.activeTourDate;
  return a && a >= todayStr() ? a : defaultTourDate();
}

export function longDate(date: string): string {
  return parseDate(date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** „Zur Tour hinzufügen“ (aus Karte, Liste, Detailansicht) */
export async function addPracticeToTour(practiceId: string): Promise<void> {
  const date = activeTourDate();
  const tour = structuredClone(store.tours.get(date) ?? newTour(date));
  const open = () => navigate(`/tour/${date}`);
  if (tour.stops.some((s) => s.practiceId === practiceId)) {
    toast('Ist schon in der Tour', { action: 'Tour öffnen', onAction: open });
    return;
  }
  tour.stops.push({ practiceId, must: false });
  addAppointments(tour);
  delete tour.plan;
  await store.saveTour(tour);
  await store.updateSettings({ activeTourDate: date }, { silent: true });
  toast(`Zur Tour am ${formatDateShort(date)} hinzugefügt`, { action: 'Tour öffnen', onAction: open });
}

function getPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(filterState.position);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        filterState.position = p;
        resolve(p);
      },
      () => resolve(filterState.position),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 },
    );
  });
}

const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`;

function hoursText(p: Practice, date: string): { text: string; kind: 'ok' | 'closed' | 'unknown' | 'appt' } {
  const appt = appointmentOn(p, date);
  if (typeof appt === 'number') return { text: `Termin ${formatTime(appt)}`, kind: 'appt' };
  const open = hoursOn(p.openingHours, parseDate(date));
  if (!open) return { text: 'Öffnungszeiten unbekannt', kind: 'unknown' };
  if (!open.length) return { text: 'an diesem Tag geschlossen', kind: 'closed' };
  return { text: `geöffnet ${formatRanges(open)}`, kind: 'ok' };
}

// ---------- Seite ----------

export function tourView(route: Route): View {
  const date = route.params.date ?? activeTourDate();
  void store.updateSettings({ activeTourDate: date }, { silent: true });
  let tour: Tour = structuredClone(store.tours.get(date) ?? newTour(date));
  let busy = false;
  let error = '';
  let frameOpen = !store.settings.home;
  const el = h('div', { class: 'page page-tour' });

  async function persist() {
    tour = structuredClone(await store.saveTour(tour));
  }
  function change(mutator: (t: Tour) => void) {
    mutator(tour);
    delete tour.plan;
    void persist();
    render();
  }
  if (addAppointments(tour)) {
    delete tour.plan;
    void persist();
  }

  async function calculate(opts: PlanOptions = {}) {
    if (!tour.stops.length || busy) return;
    busy = true;
    error = '';
    render();
    try {
      const position = tour.startMode === 'here' || opts.fromMinutes !== undefined ? await getPosition() : null;
      const plan = await computePlan(tour, { ...opts, position });
      // Automatisch vorgeschlagene Praxen, die nicht passen, wieder herausnehmen
      const notFitting = new Set(plan.dropped.map((d) => d.practiceId));
      const removed = tour.stops.filter((s) => s.suggested && notFitting.has(s.practiceId)).map((s) => s.practiceId);
      tour.stops = tour.stops.filter((s) => !removed.includes(s.practiceId)).map(({ practiceId, must }) => ({ practiceId, must }));
      plan.dropped = plan.dropped.filter((d) => !removed.includes(d.practiceId));
      tour.plan = plan;
      await persist();
      if (removed.length) toast(`${plural(removed.length, 'Vorschlag passte', 'Vorschläge passten')} nicht mehr hinein`);
    } catch (err) {
      error = (err as Error).message;
    }
    busy = false;
    render();
  }

  async function addSuggestions() {
    const sugg = suggestPractices(tour);
    if (!sugg.length) {
      toast('Keine passenden Praxen in der Nähe gefunden.');
      return;
    }
    tour.stops.push(...sugg.map((p) => ({ practiceId: p.id, must: false, suggested: true })));
    delete tour.plan;
    await persist();
    await calculate();
  }

  function render() {
    const plan = tour.plan;
    const upcoming = [...store.tours.values()].filter((t) => t.date >= todayStr() && t.date !== date).sort((a, b) => a.date.localeCompare(b.date));
    setChildren(
      el,
      pageHeader({
        title: 'Tour',
        sub: longDate(date),
        actions: plan ? h('button', { class: 'btn btn-sm', onclick: () => navigate(`/karte/tour/${date}`) }, iconEl('map', 18), 'Karte') : null,
      }),
      dayCard(upcoming),
      frameCard(),
      stopsCard(),
      h(
        'div',
        { class: 'tour-calc' },
        h(
          'button',
          { class: 'btn btn-primary btn-block btn-big', disabled: busy || !tour.stops.length, onclick: () => void calculate() },
          busy ? [h('span', { class: 'spinner spinner-light' }), 'Fahrzeiten werden abgefragt …'] : [iconEl('route', 22), plan ? 'Neu berechnen' : 'Tour berechnen'],
        ),
        error ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), error) : null,
        !plan && tour.stops.length && !busy ? h('p', { class: 'muted small center' }, 'Berechnet die beste Reihenfolge mit Uhrzeiten – passend zu Öffnungszeiten, Terminen und deiner Mittagspause.') : null,
      ),
      plan ? planCard() : null,
      store.tours.has(date)
        ? h('div', { class: 'danger-zone' }, h('button', { class: 'btn btn-danger-outline', onclick: () => void removeTour() }, iconEl('trash', 18), 'Tour löschen'))
        : null,
    );
  }

  function dayCard(upcoming: Tour[]) {
    const input = h('input', {
      type: 'date',
      value: date,
      onchange: () => input.value && navigate(`/tour/${input.value}`, { replace: true }),
    });
    return section(
      'Tag',
      input,
      upcoming.length
        ? h(
            'div',
            { class: 'chips' },
            h('span', { class: 'muted small' }, 'Weitere geplante Touren:'),
            upcoming.map((t) => h('a', { class: 'chip', href: `#/tour/${t.date}` }, `${formatDateShort(t.date)} (${t.stops.length})`)),
          )
        : null,
    );
  }

  function frameCard() {
    const home = store.settings.home;
    const timeInput = (value: number, onChange: (v: number) => void) =>
      h('input', {
        type: 'time',
        step: 300,
        value: formatTime(value),
        onchange: (e: Event) => {
          const v = parseTime((e.target as HTMLInputElement).value);
          if (v !== null) onChange(v);
        },
      });
    const switchRow = (label: string, checked: boolean, onChange: (v: boolean) => void) =>
      h('label', { class: 'switch-row' }, h('span', null, label), h('input', { type: 'checkbox', class: 'switch', checked, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }));
    const L = tour.lunch;
    const summary = [
      tour.startMode === 'home' ? 'Start zuhause' : 'Start am Standort',
      `${formatTime(tour.dayStart)}–${formatTime(tour.dayEnd)}`,
      L.enabled ? `Pause ${L.minutes} min (${formatTime(L.from)}–${formatTime(L.to)})` : 'ohne Pause',
    ].join(' · ');

    const details = h(
      'details',
      { class: 'card details-card', open: frameOpen },
      h('summary', null, h('span', { class: 'card-title' }, 'Zeiten & Start'), h('span', { class: 'muted small' }, summary)),
      h(
        'div',
        { class: 'segmented' },
        h('button', { class: ['seg', tour.startMode === 'home' && 'on'], onclick: () => change((t) => (t.startMode = 'home')) }, 'Start zuhause'),
        h('button', { class: ['seg', tour.startMode === 'here' && 'on'], onclick: () => change((t) => (t.startMode = 'here')) }, 'Aktueller Standort'),
      ),
      home
        ? h('p', { class: 'muted small' }, `Zuhause: ${home.address} (`, h('a', { href: '#/einstellungen' }, 'ändern'), ')')
        : h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), h('span', null, 'Noch keine Startadresse. ', h('a', { href: '#/einstellungen' }, 'Jetzt festlegen'))),
      h('div', { class: 'grid-2 grid-2-even' },
        field('Abfahrt frühestens', timeInput(tour.dayStart, (v) => change((t) => (t.dayStart = v)))),
        field('Feierabend spätestens', timeInput(tour.dayEnd, (v) => change((t) => (t.dayEnd = v)))),
      ),
      switchRow('Am Ende zurück nach Hause', tour.returnHome, (v) => change((t) => (t.returnHome = v))),
      switchRow('Mittagspause einplanen', L.enabled, (v) => change((t) => (t.lunch.enabled = v))),
      L.enabled
        ? h('div', { class: 'grid-3' },
            field('frühestens ab', timeInput(L.from, (v) => change((t) => (t.lunch.from = v)))),
            field('beendet bis', timeInput(L.to, (v) => change((t) => (t.lunch.to = v)))),
            field('Dauer (Min)', h('input', { type: 'number', inputmode: 'numeric', min: 5, max: 180, value: String(L.minutes), onchange: (e: Event) => change((t) => (t.lunch.minutes = Math.max(5, Number((e.target as HTMLInputElement).value) || 30))) })),
          )
        : null,
    );
    details.addEventListener('toggle', () => (frameOpen = details.open));
    return details;
  }

  function stopsCard() {
    const order = new Map<string, number>();
    tour.plan?.entries.filter((e) => e.kind === 'visit').forEach((e, i) => e.kind === 'visit' && order.set(e.practiceId, i + 1));
    const stops = [...tour.stops].sort((a, b) => (order.get(a.practiceId) ?? 999) - (order.get(b.practiceId) ?? 999));
    return section(
      h('span', null, 'Praxen', h('span', { class: 'muted small' }, ` (${tour.stops.length})`)),
      stops.length
        ? h(
            'ul',
            { class: 'stop-list' },
            stops.map((s) => {
              const p = store.getPractice(s.practiceId);
              if (!p) return null;
              const ht = hoursText(p, date);
              const dur = practiceDurations(p);
              const num = order.get(p.id);
              return h(
                'li',
                { class: ['stop', visitedOn(p.id, date) && 'done'] },
                h('span', { class: ['stop-num', !num && 'none'] }, num ? String(num) : '–'),
                h(
                  'a',
                  { class: 'stop-main', href: `#/praxis/${p.id}` },
                  h('span', { class: 'prow-title' }, p.name),
                  h('span', { class: 'prow-sub' }, `${p.city} · ${dur.park}+${dur.visit} min`),
                  h('span', { class: ['stop-hours', `hours-${ht.kind}`] }, ht.text),
                ),
                h(
                  'button',
                  {
                    class: ['icon-btn', 'must-btn', s.must && 'on'],
                    'aria-label': s.must ? 'Fester Stopp' : 'Optionaler Stopp',
                    title: s.must ? 'Muss besucht werden' : 'Optional – darf entfallen, wenn es zeitlich nicht passt',
                    onclick: () => change((t) => {
                      const x = t.stops.find((y) => y.practiceId === p.id);
                      if (x) x.must = !x.must;
                    }),
                  },
                  iconEl('pin', 20),
                  h('span', null, s.must ? 'fest' : 'optional'),
                ),
                h('button', { class: 'icon-btn', 'aria-label': 'Aus der Tour entfernen', onclick: () => change((t) => (t.stops = t.stops.filter((y) => y.practiceId !== p.id))) }, iconEl('close', 20)),
              );
            }),
          )
        : emptyState({ icon: 'route', title: 'Noch keine Praxen', text: 'Wähle Praxen aus – oder lass dir Praxen in der Nähe vorschlagen.' }),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => openPicker(tour, (ids) => change((t) => t.stops.push(...ids.map((practiceId) => ({ practiceId, must: false }))))) }, iconEl('plus', 20), 'Praxen auswählen'),
        h('button', { class: 'btn', disabled: busy, onclick: () => void addSuggestions() }, iconEl('search', 20), 'Vorschläge in der Nähe'),
      ),
    );
  }

  function planCard() {
    const plan = tour.plan!;
    const t = plan.totals;
    const visits = plan.entries.filter((e) => e.kind === 'visit');
    let num = 0;
    const isToday = date === todayStr();
    return h(
      'section',
      { class: 'card plan' },
      h('h2', { class: 'card-title' }, 'Tagesplan'),
      h(
        'div',
        { class: 'stats' },
        statBox(formatTime(t.departure), 'Abfahrt'),
        statBox(formatTime(t.end), tour.returnHome ? 'zurück zuhause' : 'Feierabend'),
        statBox(String(t.visits), t.visits === 1 ? 'Besuch' : 'Besuche'),
        statBox(hm(t.driveMinutes), `Fahrzeit · ${t.km} km`),
        statBox(hm(t.waitMinutes), 'Wartezeit', t.waitMinutes >= 30 ? 'warn' : undefined),
      ),
      plan.source === 'estimate'
        ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), 'Fahrzeiten nur geschätzt (keine Verbindung zum Routing-Server). Mit Internet neu berechnen.')
        : null,
      h(
        'ol',
        { class: 'timeline' },
        plan.entries.map((e) => {
          if (e.kind === 'visit') num++;
          return entryItem(e, num);
        }),
      ),
      plan.dropped.length
        ? h(
            'div',
            { class: 'dropped' },
            h('h3', { class: 'sheet-section' }, 'Nicht eingeplant'),
            h('ul', { class: 'bullets' }, plan.dropped.map((d) => h('li', null, h('a', { href: `#/praxis/${d.practiceId}` }, store.getPractice(d.practiceId)?.name ?? 'Praxis'), ` – ${d.reason}`))),
          )
        : null,
      h(
        'div',
        { class: 'row plan-actions' },
        h('button', { class: 'btn', onclick: () => navigate(`/karte/tour/${date}`) }, iconEl('map', 18), 'Auf Karte zeigen'),
        isToday
          ? h('button', { class: 'btn', disabled: busy, onclick: () => { const n = new Date(); void calculate({ fromMinutes: Math.ceil((n.getHours() * 60 + n.getMinutes()) / 5) * 5 }); } }, iconEl('clock', 18), 'Ab jetzt neu planen')
          : null,
        visits.length ? h('a', { class: 'btn', href: googleMapsUrl(plan, tour.returnHome), target: '_blank', rel: 'noopener' }, iconEl('route', 18), 'Ganze Route (Google Maps)') : null,
      ),
      h('p', { class: 'muted small' }, `Berechnet ${new Date(plan.computedAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })} · inkl. ${store.settings.tourDefaults.trafficPercent} % Verkehrszuschlag. ${ROUTING_ATTRIBUTION} · `, h('a', { href: 'https://www.openstreetmap.org/fixthemap', target: '_blank', rel: 'noopener' }, 'Karte verbessern')),
    );
  }

  function entryItem(e: PlanEntry, num: number): Child {
    switch (e.kind) {
      case 'start':
        return h('li', { class: 'tl tl-point' }, h('span', { class: 'tl-time' }, formatTime(e.time)), h('span', { class: 'tl-body' }, iconEl('route', 18), h('b', null, `Abfahrt ${e.label}`)));
      case 'end':
        return h('li', { class: 'tl tl-point' }, h('span', { class: 'tl-time' }, formatTime(e.time)), h('span', { class: 'tl-body' }, iconEl('check', 18), h('b', null, e.label === 'Zuhause' ? 'Ankunft zuhause' : 'Feierabend')));
      case 'drive':
        return h(
          'li',
          { class: 'tl tl-drive' },
          h('span', { class: 'tl-time' }),
          h('span', { class: 'tl-body' }, e.km < 0.1 ? '🚶 gleich nebenan' : `🚗 ${Math.round(e.minutes)} min · ${String(e.km).replace('.', ',')} km`),
        );
      case 'break':
        return h('li', { class: 'tl tl-break' }, h('span', { class: 'tl-time' }, formatTime(e.start)), h('span', { class: 'tl-body' }, `☕ Mittagspause bis ${formatTime(e.end)}`));
      case 'visit': {
        const p = store.getPractice(e.practiceId);
        if (!p) return null;
        const done = visitedOn(p.id, date);
        const ht = hoursText(p, date);
        return h(
          'li',
          { class: ['tl', 'tl-visit', done && 'done'] },
          h('span', { class: 'tl-time' }, h('b', null, formatTime(e.start)), h('span', null, formatTime(e.end))),
          h(
            'div',
            { class: 'tl-body' },
            h('div', { class: 'tl-title' }, h('span', { class: 'stop-num', style: { background: colorForStatus(p.status, store.settings.statusColors) } }, String(num)), h('a', { href: `#/praxis/${p.id}` }, p.name)),
            h('div', { class: 'prow-sub' }, [p.specialty, p.city].filter(Boolean).join(' · ')),
            h('div', { class: ['stop-hours', `hours-${ht.kind}`] }, ht.text),
            h('div', { class: 'tl-meta' }, `Ankunft ${formatTime(e.arrive)} · ${e.park} min Parken & Weg`),
            e.wait > 0
              ? h('div', { class: ['tl-wait', e.wait >= 30 && 'big'] }, `⏳ ${e.wait} min warten`, e.wait >= 30 ? h('button', { class: 'btn btn-sm', disabled: busy, onclick: () => void addSuggestions() }, 'Lücke füllen') : null)
              : null,
            h(
              'div',
              { class: 'row tl-actions' },
              h('a', { class: 'btn btn-sm', href: appleMapsUrl(p), target: '_blank', rel: 'noopener' }, iconEl('route', 16), 'Navigation'),
              done
                ? h('span', { class: 'badge badge-soft', style: { '--badge': '#1f9d55' } }, '✓ besucht')
                : h('a', { class: 'btn btn-sm', href: `#/praxis/${p.id}/besuch/neu?datum=${date}` }, iconEl('note', 16), 'Besuch erfassen'),
            ),
          ),
        );
      }
    }
  }

  async function removeTour() {
    const ok = await confirmDialog({ title: 'Tour löschen?', message: `Die Tour für ${longDate(date)} wird gelöscht. Praxen und Besuche bleiben erhalten.`, confirmLabel: 'Löschen', danger: true });
    if (!ok) return;
    await store.deleteTour(date);
    tour = newTour(date);
    render();
  }

  // Nicht bei jeder Praxis-Änderung neu zeichnen (Adresssuche läuft evtl. im Hintergrund)
  const unsub = store.subscribe((k) => {
    if (busy) return;
    if (k.has('visits') || k.has('settings')) render();
  });
  render();
  return { el, destroy: unsub };
}

function statBox(value: string, label: string, kind?: string) {
  return h('div', { class: ['stat', kind && `stat-${kind}`] }, h('b', null, value), h('span', null, label));
}

/** Ganze Route für Google Maps (max. 9 Zwischenstopps). */
function googleMapsUrl(plan: NonNullable<Tour['plan']>, returnHome: boolean): string {
  const pts = plan.entries
    .filter((e) => e.kind === 'visit')
    .map((e) => store.getPractice((e as { practiceId: string }).practiceId))
    .filter((p): p is Practice => !!p && p.lat !== undefined)
    .map((p) => `${p.lat},${p.lng}`);
  const origin = `${plan.startPoint.lat},${plan.startPoint.lng}`;
  const home = store.settings.home ? `${store.settings.home.lat},${store.settings.home.lng}` : origin;
  const destination = returnHome ? home : pts[pts.length - 1];
  const waypoints = (returnHome ? pts : pts.slice(0, -1)).slice(0, 9);
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

// ---------- Auswahl von Praxen ----------

function openPicker(tour: Tour, onApply: (ids: string[]) => void): void {
  const date = parseDate(tour.date);
  const inTour = new Set(tour.stops.map((s) => s.practiceId));
  const selected = new Set<string>();
  const anchors: LatLng[] = tour.stops
    .map((s) => store.getPractice(s.practiceId))
    .filter((p): p is Practice => !!p && p.lat !== undefined)
    .map((p) => ({ lat: p.lat!, lng: p.lng! }));
  if (!anchors.length && store.settings.home) anchors.push(store.settings.home);
  const ctx = filterContext();
  const territory = store.territorySet();
  let onlyOpen = true;
  let onlyStale = false;
  let onlyTerritory = false;

  const search = h('input', { type: 'search', placeholder: 'Suchen: Name, Ort, PLZ …', autocomplete: 'off', oninput: () => render() });
  const chips = h('div', { class: 'chip-select' });
  const list = h('ul', { class: 'pick-list' });
  const count = h('div', { class: 'muted small' });
  const applyBtn = h('button', { class: 'btn btn-primary', onclick: () => { onApply([...selected]); sheet.close(); } }, 'Übernehmen');

  function toggleChip(label: string, on: boolean, set: (v: boolean) => void) {
    return h('button', { class: ['chip-toggle', on && 'on'], onclick: () => { set(!on); render(); } }, label);
  }

  function render() {
    setChildren(
      chips,
      toggleChip('an dem Tag geöffnet', onlyOpen, (v) => (onlyOpen = v)),
      toggleChip(`> ${store.settings.staleDays} Tage nicht besucht`, onlyStale, (v) => (onlyStale = v)),
      toggleChip('im Gebiet', onlyTerritory, (v) => (onlyTerritory = v)),
    );
    const words = normalize(search.value).split(' ').filter(Boolean);
    const rows = store
      .practiceList()
      .filter((p) => {
        if (words.length && !words.every((w) => normalize(`${p.name} ${p.city} ${p.plz} ${p.specialty}`).includes(w))) return false;
        const open = hoursOn(p.openingHours, date);
        if (onlyOpen && open && !open.length) return false;
        if (onlyStale && !isStale(p, ctx)) return false;
        if (onlyTerritory && !territory.has(p.plz)) return false;
        return true;
      })
      .map((p) => ({
        p,
        km: anchors.length && p.lat !== undefined ? Math.min(...anchors.map((a) => distanceKm(a, { lat: p.lat!, lng: p.lng! }))) : undefined,
      }))
      .sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || collator.compare(a.p.name, b.p.name));
    count.textContent = `${plural(rows.length, 'Praxis', 'Praxen')}${anchors.length ? ', sortiert nach Entfernung zur Tour' : ''}`;
    setChildren(
      list,
      rows.slice(0, 150).map(({ p, km }) => {
        const ht = hoursText(p, tour.date);
        const already = inTour.has(p.id);
        const cb = h('input', { type: 'checkbox', checked: already || selected.has(p.id), disabled: already });
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(p.id);
          else selected.delete(p.id);
          applyBtn.textContent = selected.size ? `Übernehmen (${selected.size})` : 'Übernehmen';
        });
        return h(
          'li',
          null,
          h(
            'label',
            { class: ['pick', already && 'already'] },
            cb,
            h(
              'span',
              { class: 'prow-main' },
              h('span', { class: 'prow-title' }, p.name),
              h('span', { class: 'prow-sub' }, `${p.plz} ${p.city}${km !== undefined ? ` · ${km.toFixed(1).replace('.', ',')} km` : ''}${p.lat === undefined ? ' · kein Pin' : ''}`),
              h('span', { class: ['stop-hours', `hours-${ht.kind}`] }, already ? 'bereits in der Tour' : ht.text),
            ),
          ),
        );
      }),
    );
  }

  const sheet = openSheet({
    title: 'Praxen auswählen',
    wide: true,
    content: [search, chips, count, list],
    footer: [h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'), applyBtn],
  });
  render();
}
