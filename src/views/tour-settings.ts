/** Einstellungen für die Tourplanung: Startadresse, Arbeitszeit, Pause, Zeitaufwand. */
import { geocodeText } from '../geo/geocoder';
import { store } from '../state/store';
import { formatTime, parseTime } from '../tour/opening-hours';
import type { TourDefaults } from '../types';
import { h } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { field, section } from './common';

function update(patch: Partial<TourDefaults>) {
  void store.updateSettings({ tourDefaults: { ...store.settings.tourDefaults, ...patch } });
  toast('Gespeichert');
}

export function tourSettingsSection(): HTMLElement {
  const d = store.settings.tourDefaults;
  const home = store.settings.home;
  const address = h('input', { value: home?.address ?? '', placeholder: 'Straße Hausnummer, PLZ Ort', autocomplete: 'street-address' });
  const result = h('div', { class: 'muted small' }, home ? `Gespeichert: ${home.lat.toFixed(5)}, ${home.lng.toFixed(5)}` : 'Noch keine Startadresse.');

  async function searchHome() {
    const q = address.value.trim();
    if (!q) return;
    result.textContent = 'Suche …';
    try {
      // bei einem kurzen Netzaussetzer einmal neu versuchen
      const hit = await geocodeText(q).catch(() => new Promise((r) => setTimeout(r, 2000)).then(() => geocodeText(q)));
      if (!hit) {
        result.textContent = 'Adresse nicht gefunden – bitte genauer schreiben (mit PLZ und Ort).';
        return;
      }
      await store.updateSettings({ home: { address: q, lat: hit.lat, lng: hit.lng } });
      toast('Startadresse gespeichert');
    } catch {
      result.textContent = 'Suche nicht möglich – bitte mit Internet erneut versuchen.';
    }
  }

  function useHere() {
    if (!navigator.geolocation) return;
    result.textContent = 'Standort wird ermittelt …';
    navigator.geolocation.getCurrentPosition(
      (pos) => void store.updateSettings({ home: { address: address.value.trim() || 'Mein Standort', lat: pos.coords.latitude, lng: pos.coords.longitude } }).then(() => toast('Startadresse gespeichert')),
      () => (result.textContent = 'Standort nicht verfügbar – bitte Ortung erlauben.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  const time = (value: number, onChange: (v: number) => void) =>
    h('input', {
      type: 'time',
      step: 300,
      value: formatTime(value),
      onchange: (e: Event) => {
        const v = parseTime((e.target as HTMLInputElement).value);
        if (v !== null) onChange(v);
      },
    });
  const num = (value: number, min: number, max: number, onChange: (v: number) => void) =>
    h('input', {
      type: 'number',
      inputmode: 'numeric',
      min,
      max,
      value: String(value),
      onchange: (e: Event) => onChange(Math.min(max, Math.max(min, Math.round(Number((e.target as HTMLInputElement).value) || 0)))),
    });

  return section(
    'Tourplanung',
    field('Startadresse (Zuhause)', address),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', onclick: () => void searchHome() }, iconEl('search', 18), 'Suchen & speichern'),
      h('button', { class: 'btn', onclick: useHere }, iconEl('locate', 18), 'Aktuellen Standort nehmen'),
    ),
    result,
    h('h3', { class: 'sheet-section' }, 'Arbeitstag'),
    h('div', { class: 'grid-2 grid-2-even' },
      field('Abfahrt frühestens', time(d.dayStart, (v) => update({ dayStart: v }))),
      field('Feierabend spätestens', time(d.dayEnd, (v) => update({ dayEnd: v }))),
    ),
    h('label', { class: 'switch-row' }, h('span', null, 'Am Ende zurück nach Hause'), h('input', { type: 'checkbox', class: 'switch', checked: d.returnHome, onchange: (e: Event) => update({ returnHome: (e.target as HTMLInputElement).checked }) })),
    h('h3', { class: 'sheet-section' }, 'Mittagspause'),
    h('label', { class: 'switch-row' }, h('span', null, 'Mittagspause einplanen'), h('input', { type: 'checkbox', class: 'switch', checked: d.lunchEnabled, onchange: (e: Event) => update({ lunchEnabled: (e.target as HTMLInputElement).checked }) })),
    h('div', { class: 'grid-3' },
      field('frühestens ab', time(d.lunchFrom, (v) => update({ lunchFrom: v }))),
      field('beendet bis', time(d.lunchTo, (v) => update({ lunchTo: v }))),
      field('Dauer (Min)', num(d.lunchMinutes, 5, 180, (v) => update({ lunchMinutes: v }))),
    ),
    h('p', { class: 'muted small' }, 'Die Pause wird möglichst dorthin gelegt, wo die Praxen ohnehin Mittag machen.'),
    h('h3', { class: 'sheet-section' }, 'Zeitaufwand pro Praxis (Standard)'),
    h('div', { class: 'grid-2 grid-2-even' },
      field('Parken & Fußweg (Min)', num(d.parkMinutes, 0, 120, (v) => update({ parkMinutes: v }))),
      field('Vor Ort (Min)', num(d.visitMinutes, 1, 240, (v) => update({ visitMinutes: v }))),
    ),
    h('p', { class: 'muted small' }, 'Gilt für Praxen ohne eigene Angabe (Excel-Spalten „Parken (Min)“ / „Vor Ort (Min)“ oder in der Praxis unter „Öffnungszeiten & Zeitaufwand“).'),
    field('Zuschlag auf Fahrzeiten (Verkehr, %)', num(d.trafficPercent, 0, 100, (v) => update({ trafficPercent: v }))),
  );
}
