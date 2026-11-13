/**
 * Ort wählen – für Start/Ziel einer Tour oder einen Platzhalter mit Ort:
 * Adresse suchen, aktuellen Standort nehmen oder einen zuletzt benutzten Ort antippen.
 */
import { geocodeText } from '../geo/geocoder';
import { distanceKm } from '../state/filters';
import { store } from '../state/store';
import type { Place } from '../types';
import { openSheet } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { field } from './common';

const MAX_RECENT = 8;

/** Ort in „zuletzt verwendet“ merken (gleiche Stelle wird ersetzt) */
export async function rememberPlace(p: Place): Promise<void> {
  const rest = (store.settings.recentPlaces ?? []).filter((x) => distanceKm(x, p) > 0.05 && x.label !== p.label);
  await store.updateSettings({ recentPlaces: [p, ...rest].slice(0, MAX_RECENT) }, { silent: true });
}

export function homePlace(): Place | undefined {
  const home = store.settings.home;
  return home ? { label: 'Zuhause', address: home.address, lat: home.lat, lng: home.lng } : undefined;
}

export function openPlacePicker(opts: { title: string; current?: Place; onPick: (p: Place) => void }): void {
  let found: { lat: number; lng: number; address: string } | null = opts.current ? { lat: opts.current.lat, lng: opts.current.lng, address: opts.current.address } : null;
  const label = h('input', { value: opts.current?.label ?? '', placeholder: 'z. B. Hotel, Büro, Kunde XY', autocomplete: 'off' }) as HTMLInputElement;
  const address = h('input', {
    value: opts.current?.address ?? '',
    placeholder: 'Straße Hausnummer, PLZ Ort',
    autocomplete: 'street-address',
    onkeydown: (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void search();
      }
    },
  }) as HTMLInputElement;
  const status = h('div', { class: 'muted small place-status' });
  const apply = h('button', { class: 'btn btn-primary', disabled: !found, onclick: () => pick() }, 'Übernehmen');

  const showFound = () => {
    apply.disabled = !found;
    setChildren(status, found ? [iconEl('check', 16), ` Gefunden: ${found.address}`] : '');
  };

  async function search() {
    const q = address.value.trim();
    if (!q) return;
    status.textContent = 'Suche …';
    try {
      const hit = await geocodeText(q).catch(() => new Promise((r) => setTimeout(r, 2000)).then(() => geocodeText(q)));
      if (!hit) {
        found = null;
        status.textContent = 'Adresse nicht gefunden – bitte genauer schreiben (mit PLZ und Ort).';
        apply.disabled = true;
        return;
      }
      found = { lat: hit.lat, lng: hit.lng, address: q };
      showFound();
    } catch {
      status.textContent = 'Suche nicht möglich – bitte mit Internet erneut versuchen.';
    }
  }

  function useHere() {
    if (!navigator.geolocation) return;
    status.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        found = { lat: pos.coords.latitude, lng: pos.coords.longitude, address: address.value.trim() || 'Mein Standort' };
        if (!label.value.trim()) label.value = 'Mein Standort';
        showFound();
      },
      () => (status.textContent = 'Standort nicht verfügbar – bitte Ortung erlauben.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function finish(p: Place) {
    void rememberPlace(p);
    sheet.close();
    opts.onPick(p);
  }

  function pick() {
    if (!found) return;
    const name = label.value.trim() || found.address.split(',')[0].trim() || 'Ort';
    finish({ label: name, address: found.address, lat: found.lat, lng: found.lng });
  }

  const recent = [homePlace(), ...(store.settings.recentPlaces ?? [])].filter((p): p is Place => !!p);
  const sheet = openSheet({
    title: opts.title,
    content: [
      recent.length
        ? [
            h('h3', { class: 'sheet-section' }, 'Schnell wählen'),
            h('div', { class: 'place-recent' },
              recent.map((p) => h('button', { class: 'chip-toggle', onclick: () => finish(p) }, p.label === 'Zuhause' ? '🏠 ' : '📍 ', p.label, h('small', null, ` · ${p.address}`))),
            ),
            h('h3', { class: 'sheet-section' }, 'Oder neue Adresse'),
          ]
        : null,
      field('Bezeichnung', label),
      field('Adresse', h('div', { class: 'add-row' }, address, h('button', { class: 'btn', onclick: () => void search() }, iconEl('search', 18), 'Suchen'))),
      status,
      h('button', { class: 'btn btn-sm', onclick: () => useHere() }, iconEl('locate', 18), 'Aktuellen Standort verwenden'),
    ],
    footer: [h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'), apply],
  });
  showFound();
}
