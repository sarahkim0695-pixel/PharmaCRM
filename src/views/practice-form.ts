/** Praxis anlegen oder bearbeiten. */
import { geocodeQueue } from '../geo/geocoder';
import { allShapes } from '../geo/plz-data';
import { goBack, navigate, type Route } from '../router';
import { distinctValues } from '../state/selectors';
import { store } from '../state/store';
import type { FacilityKind, Practice } from '../types';
import { h, setChildren } from '../ui/dom';
import { KIND_LABEL } from '../utils/kind';
import { formatInterval, INTERVAL_CHOICES, STATE_KEYS, STATE_LABEL, stateKeyOf, type StateKey } from '../utils/customer';
import { toast } from '../ui/toast';
import { newId, nowIso } from '../utils/id';
import { normalize, normalizePlz, normalizeStreet } from '../utils/text';
import { emptyState, field, pageHeader, type View } from './common';

export function practiceFormView(route: Route): View {
  const isNew = route.name === 'practice-new';
  const existing = isNew ? undefined : store.getPractice(route.params.id);
  if (!isNew && !existing) {
    return { el: h('div', { class: 'page' }, pageHeader({ title: 'Praxis', back: '/liste' }), emptyState({ icon: 'warning', title: 'Praxis nicht gefunden' })) };
  }
  const p: Partial<Practice> = existing ?? {};

  const datalist = (id: string, values: string[]) => h('datalist', { id }, values.map((v) => h('option', { value: v })));

  const input = (name: string, value = '', extra: Record<string, unknown> = {}) =>
    h('input', { name, value, autocomplete: 'off', ...extra });

  const name = input('name', p.name, { required: true, placeholder: 'z. B. Praxis Dr. Muster' });
  // Art: Praxis oder Klinik
  let kind: FacilityKind = p.kind ?? (route.query.get('art') === 'klinik' ? 'klinik' : 'praxis');
  const kindSeg = h('div', { class: 'segmented' });
  const renderKind = () =>
    setChildren(
      kindSeg,
      (['praxis', 'klinik'] as FacilityKind[]).map((k) =>
        h('button', { type: 'button', class: ['seg', kind === k && 'on'], onclick: () => { kind = k; renderKind(); } }, KIND_LABEL[k]),
      ),
    );
  renderKind();
  const specialty = input('specialty', p.specialty, { list: 'dl-specialty', placeholder: 'z. B. Allgemeinmedizin' });
  const street = input('street', p.street, { placeholder: 'Straße und Hausnummer' });
  const plz = input('plz', p.plz, { inputmode: 'numeric', maxlength: 5, pattern: '\\d{5}', placeholder: '80331' });
  const city = input('city', p.city, { placeholder: 'Ort' });
  // Kundenstatus (Ampel): bestellend / Startlöcher / nicht in Kontakt
  let state: StateKey = isNew ? 'kein' : stateKeyOf(p as Practice);
  const stateSeg = h('div', { class: 'segmented' });
  const renderState = () =>
    setChildren(
      stateSeg,
      STATE_KEYS.map((k) =>
        h('button', { type: 'button', class: ['seg', state === k && 'on'], onclick: () => { state = k; renderState(); } }, STATE_LABEL[k]),
      ),
    );
  renderState();
  // Besuchsintervall: Standard oder eigener Wert
  const intervalChoices = [...new Set([...INTERVAL_CHOICES, ...(p.visitIntervalDays ? [p.visitIntervalDays] : [])])].sort((a, b) => a - b);
  const intervalSel = h(
    'select',
    { name: 'interval' },
    h('option', { value: '' }, 'Standard (je Kundenstatus)'),
    intervalChoices.map((d) => h('option', { value: String(d), selected: p.visitIntervalDays === d }, formatInterval(d))),
  );
  const phone = input('phone', p.phone, { type: 'tel', placeholder: 'optional' });
  const hint = h('textarea', { name: 'hint', rows: 3, placeholder: 'optional' }, p.hint ?? '');
  const review = h('input', { type: 'checkbox', class: 'switch', checked: !!p.needsReview });

  // Ort automatisch aus der PLZ ergänzen
  plz.addEventListener('input', async () => {
    const v = normalizePlz(plz.value);
    if (v.length === 5 && !city.value.trim()) {
      const shape = (await allShapes().catch(() => new Map())).get(v);
      if (shape?.properties.ort) city.value = shape.properties.ort;
    }
  });

  const form = h(
    'form',
    { class: 'form card', onsubmit: (e: Event) => { e.preventDefault(); void save(); } },
    kindSeg,
    field('Name *', name),
    field('Fachrichtung', specialty),
    field('Straße', street),
    h('div', { class: 'grid-2' }, field('PLZ', plz), field('Ort', city)),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Kundenstatus'), stateSeg),
    field('Besuchen alle …', intervalSel, 'Standard je Kundenstatus unter Mehr → Einstellungen'),
    field('Telefon', phone),
    field('Hinweis', hint),
    h('label', { class: 'switch-row' }, h('span', null, 'Als „prüfen“ markieren'), review),
    datalist('dl-specialty', distinctValues('specialty')),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => goBack(isNew ? '/liste' : `/praxis/${route.params.id}`) }, 'Abbrechen'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, 'Speichern'),
    ),
  );

  async function save() {
    if (!name.value.trim()) {
      toast('Bitte einen Praxisnamen eingeben.', { kind: 'error' });
      name.focus();
      return;
    }
    const plzVal = normalizePlz(plz.value);
    if (plz.value.trim() && plzVal.length !== 5) {
      toast('Die PLZ muss 5 Ziffern haben.', { kind: 'error' });
      plz.focus();
      return;
    }
    const ts = nowIso();
    const next: Practice = {
      id: existing?.id ?? newId(),
      products: {},
      source: 'manual',
      createdAt: ts,
      updatedAt: ts,
      geoStatus: 'pending',
      ...existing,
      kind,
      name: name.value.trim(),
      specialty: specialty.value.trim(),
      street: street.value.trim(),
      plz: plzVal,
      city: city.value.trim(),
      status: p.status ?? '',
      customerState: state,
      visitIntervalDays: intervalSel.value ? Number(intervalSel.value) : undefined,
      phone: phone.value.trim(),
      hint: hint.value.trim(),
      needsReview: review.checked,
    };
    const addressChanged =
      !existing ||
      normalizeStreet(existing.street) !== normalizeStreet(next.street) ||
      existing.plz !== next.plz ||
      normalize(existing.city) !== normalize(next.city);
    if (addressChanged) {
      next.geoStatus = next.street || next.plz || next.city ? 'pending' : 'not_found';
      delete next.lat;
      delete next.lng;
      delete next.geoLabel;
    }
    await store.savePractice(next);
    if (addressChanged) geocodeQueue.start();
    toast(isNew ? 'Praxis angelegt' : 'Gespeichert');
    if (isNew) navigate(`/praxis/${next.id}`, { replace: true });
    else goBack(`/praxis/${next.id}`);
  }

  const el = h('div', { class: 'page page-form' }, pageHeader({ title: isNew ? 'Neuer Eintrag' : `${KIND_LABEL[p.kind ?? 'praxis']} bearbeiten`, back: isNew ? '/liste' : `/praxis/${route.params.id}` }), form);
  if (isNew) requestAnimationFrame(() => name.focus());
  return { el };
}
