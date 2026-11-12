/** Detailansicht einer Praxis. */
import { geocodeQueue, retryGeocode } from '../geo/geocoder';
import { statusBadge, reviewBadge } from '../map/popup';
import { navigate, type Route } from '../router';
import { store } from '../state/store';
import type { Practice } from '../types';
import { confirmDialog } from '../ui/dialog';
import { h, setChildren, type Child } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { appleMapsUrl, fullAddress, telUrl } from '../utils/maps';
import { emptyState, pageHeader, section, type View } from './common';
import { addPracticeToTour } from './tour-view';

/**
 * Weitere Abschnitte (Termine, Besuche, Produkte) melden sich hier an,
 * damit diese Datei übersichtlich bleibt. Siehe visits-section.ts / products-section.ts.
 */
export type DetailSection = (p: Practice) => Child;
const extraSections: DetailSection[] = [];
export function registerDetailSection(fn: DetailSection): void {
  extraSections.push(fn);
}

export function practiceView(route: Route): View {
  const id = route.params.id;
  const el = h('div', { class: 'page page-detail' });

  function render() {
    const p = store.getPractice(id);
    if (!p) {
      setChildren(el, pageHeader({ title: 'Praxis', back: '/liste' }), emptyState({ icon: 'warning', title: 'Praxis nicht gefunden', text: 'Sie wurde vielleicht gelöscht.' }));
      return;
    }
    setChildren(
      el,
      pageHeader({
        title: 'Praxis',
        back: '/liste',
        actions: h('button', { class: 'btn btn-sm', onclick: () => navigate(`/praxis/${p.id}/bearbeiten`) }, iconEl('edit', 18), 'Bearbeiten'),
      }),
      headCard(p),
      locationCard(p),
      extraSections.map((fn) => fn(p)),
      h(
        'div',
        { class: 'danger-zone' },
        h('button', { class: 'btn btn-danger-outline', onclick: () => void deletePractice(p) }, iconEl('trash', 18), 'Praxis löschen'),
      ),
    );
  }

  const unsub = store.subscribe(render);
  render();
  return { el, destroy: unsub };
}

function headCard(p: Practice): HTMLElement {
  return h(
    'section',
    { class: 'card detail-head' },
    h('h2', { class: 'detail-name' }, p.name),
    p.specialty && h('div', { class: 'detail-specialty' }, p.specialty),
    h('div', { class: 'badges' }, statusBadge(p), p.needsReview && reviewBadge()),
    p.needsReview &&
      h(
        'div',
        { class: 'notice notice-review' },
        h('span', null, 'Diese Praxis ist als „prüfen“ markiert (in der Excel gelb).'),
        h('button', { class: 'btn btn-sm', onclick: () => void store.savePractice({ ...p, needsReview: false }).then(() => toast('Als geprüft markiert')) }, iconEl('check', 18), 'Geprüft'),
      ),
    h(
      'div',
      { class: 'detail-address' },
      h('div', null, h('div', null, p.street || h('span', { class: 'muted' }, 'keine Straße')), h('div', null, `${p.plz} ${p.city}`.trim())),
      h(
        'div',
        { class: 'detail-buttons' },
        h('a', { class: 'btn btn-primary', href: appleMapsUrl(p), target: '_blank', rel: 'noopener' }, iconEl('route', 20), 'Route'),
        h('button', { class: 'btn', onclick: () => void addPracticeToTour(p.id) }, iconEl('plus', 20), 'Zur Tour'),
      ),
    ),
    p.phone && h('a', { class: 'detail-phone', href: telUrl(p.phone) }, iconEl('phone', 18), p.phone),
    p.hint && h('div', { class: 'detail-hint' }, h('span', { class: 'field-label' }, 'Hinweis'), h('p', null, p.hint)),
  );
}

function locationCard(p: Practice): HTMLElement {
  const showOnMap = h('button', { class: 'btn', onclick: () => navigate(`/karte/praxis/${p.id}`) }, iconEl('map', 18), 'Auf Karte');
  const setPin = (label: string, primary = false) =>
    h('button', { class: ['btn', primary && 'btn-primary'], onclick: () => navigate(`/karte/pin/${p.id}`) }, iconEl('pin', 18), label);
  const retry = h('button', { class: 'btn', onclick: () => void retryGeocode(p).then(() => toast('Adresse wird erneut gesucht …')) }, 'Erneut suchen');

  let body: Child;
  switch (p.geoStatus) {
    case 'pending':
      body = [
        h('p', null, 'Die Adresse wird gesucht, sobald Internet verfügbar ist.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => geocodeQueue.start() }, 'Jetzt suchen'), setPin('Pin von Hand setzen')),
      ];
      break;
    case 'not_found':
      body = [
        h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), h('span', null, 'Adresse wurde nicht gefunden. Bitte setze den Pin von Hand auf der Karte.')),
        h('div', { class: 'row' }, setPin('Pin setzen', true), retry),
      ];
      break;
    case 'approx':
      body = [
        h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), h('span', null, `Nur ungefähr gefunden: ${p.geoLabel ?? ''}. Bitte prüfen und den Pin ggf. verschieben.`)),
        h('div', { class: 'row' }, showOnMap, setPin('Pin korrigieren', true), retry),
      ];
      break;
    default:
      body = [
        h('p', { class: 'muted small' }, p.geoStatus === 'manual' ? 'Pin wurde von Hand gesetzt.' : `Gefunden: ${p.geoLabel ?? fullAddress(p)}`),
        h('div', { class: 'row' }, showOnMap, setPin('Pin verschieben')),
      ];
  }
  return section('Standort', body);
}

async function deletePractice(p: Practice): Promise<void> {
  const visits = store.visitsFor(p.id).length;
  const ok = await confirmDialog({
    title: 'Praxis löschen?',
    message: `„${p.name}“${visits ? ` und ${visits} erfasste Besuche` : ''} werden endgültig gelöscht.`,
    confirmLabel: 'Löschen',
    danger: true,
  });
  if (!ok) return;
  await store.deletePractices([p.id]);
  toast('Praxis gelöscht');
  navigate('/liste', { replace: true });
}
