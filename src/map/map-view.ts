/**
 * Die Karte: Gebiet (gelbe PLZ-Flächen), Pins der Praxen und Bedienelemente.
 *
 * Betriebsarten:
 *  - normal     Gebiet + Pins anzeigen
 *  - focus      wie normal, eine Praxis wird angesprungen
 *  - territory  Gebiet bearbeiten: PLZ antippen = hinzufügen/entfernen
 *  - pin        Pin einer Praxis von Hand setzen/verschieben
 */
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

import { REGION_BOUNDS } from '../data/territory';
import { geocodeQueue, type QueueStatus } from '../geo/geocoder';
import { allShapes, labelPoint } from '../geo/plz-data';
import { goBack, navigate } from '../router';
import { activeFilterCount, filterState } from '../state/filters';
import { filteredPractices, statusOptions } from '../state/selectors';
import { store } from '../state/store';
import type { Practice, PlzFeature } from '../types';
import { debounce, h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { colorForStatus } from '../utils/colors';
import { plural } from '../utils/text';
import { buildPopup } from './popup';

export type MapMode =
  | { kind: 'normal' }
  | { kind: 'focus'; practiceId: string }
  | { kind: 'territory' }
  | { kind: 'pin'; practiceId: string };

const TERRITORY_STYLE: L.PathOptions = {
  color: '#c99700',
  weight: 1.5,
  fillColor: '#ffd400',
  fillOpacity: 0.3,
};
const OTHER_PLZ_STYLE: L.PathOptions = {
  color: '#5b6b7f',
  weight: 1,
  fillColor: '#ffffff',
  fillOpacity: 0.08,
};
const LABEL_MIN_ZOOM = 11;

export class MapView {
  readonly map: L.Map;
  private mode: MapMode = { kind: 'normal' };
  private renderer = L.canvas({ padding: 0.5, tolerance: 4 });
  private shapes = new Map<string, PlzFeature>();
  private territoryLayer: L.GeoJSON | null = null;
  private editLayer: L.GeoJSON | null = null;
  private labelLayer = L.layerGroup();
  private cluster: L.MarkerClusterGroup;
  private markers = new Map<string, L.Marker>();
  private tempMarker: L.Marker | null = null;
  private pinMarker: L.Marker | null = null;
  private locationMarker: L.CircleMarker | null = null;
  private overlay: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  private legendOpen = false;
  private queueStatus: QueueStatus | null = null;
  private visible = false;

  constructor(container: HTMLElement) {
    const mapEl = h('div', { class: 'map' });
    this.overlay = h('div', { class: 'map-overlay' });
    container.append(mapEl, this.overlay);

    this.map = L.map(mapEl, {
      zoomControl: false,
      preferCanvas: true,
      tapTolerance: 20,
      attributionControl: true,
    });
    this.map.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: 'anonymous',
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }).addTo(this.map);

    this.cluster = L.markerClusterGroup({
      maxClusterRadius: 45,
      disableClusteringAtZoom: 14,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      chunkedLoading: true,
      iconCreateFunction: (c) =>
        L.divIcon({
          html: `<span>${c.getChildCount()}</span>`,
          className: 'cluster',
          iconSize: [42, 42],
        }),
    });
    this.cluster.addTo(this.map);
    this.labelLayer.addTo(this.map);

    this.initialView();
    this.buildOverlay();

    this.map.on('moveend', () => {
      this.updateLabels();
      this.saveView();
    });
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.mode.kind === 'pin') this.placePin(e.latlng);
    });
    this.map.on('locationfound', (e: L.LocationEvent) => this.showLocation(e));
    this.map.on('locationerror', () =>
      toast('Standort nicht verfügbar. Bitte Ortungsdienste für Safari erlauben.', { kind: 'error' }),
    );

    store.subscribe((kinds) => {
      if (kinds.has('practices') || kinds.has('visits') || kinds.has('settings')) this.refreshPractices();
      if (kinds.has('territory') || kinds.has('shapes')) void this.refreshShapes();
      this.refreshOverlay();
    });
    filterState.subscribe(() => {
      this.refreshPractices();
      this.refreshOverlay();
    });
    geocodeQueue.subscribe((s) => {
      this.queueStatus = s;
      this.refreshProgress();
    });

    void this.refreshShapes();
    this.refreshPractices();
  }

  // ---------- Sichtbarkeit & Modus ----------

  show(): void {
    this.visible = true;
    // Leaflet muss die Größe neu messen, wenn die Karte wieder sichtbar wird
    requestAnimationFrame(() => this.map.invalidateSize());
  }

  hide(): void {
    this.visible = false;
    this.map.closePopup();
  }

  setMode(mode: MapMode): void {
    const prev = this.mode;
    this.mode = mode;
    if (prev.kind === 'pin' && mode.kind !== 'pin') this.removePinMarker();
    if (prev.kind === 'territory' && mode.kind !== 'territory') this.removeEditLayer();

    if (mode.kind === 'territory') {
      this.map.closePopup();
      this.map.removeLayer(this.cluster);
      this.buildEditLayer();
    } else if (mode.kind === 'pin') {
      this.map.closePopup();
      this.map.removeLayer(this.cluster);
      this.startPinMode(mode.practiceId);
    } else {
      if (!this.map.hasLayer(this.cluster)) this.map.addLayer(this.cluster);
      if (mode.kind === 'focus') this.focusPractice(mode.practiceId);
    }
    this.updateLabels();
    this.refreshOverlay();
  }

  // ---------- Startansicht ----------

  private initialView(): void {
    const v = store.settings.mapView;
    if (v) this.map.setView([v.lat, v.lng], v.zoom);
    else this.map.fitBounds(REGION_BOUNDS);
  }

  private saveView = debounce(() => {
    if (!this.visible) return;
    const c = this.map.getCenter();
    void store.updateSettings(
      { mapView: { lat: +c.lat.toFixed(5), lng: +c.lng.toFixed(5), zoom: this.map.getZoom() } },
      { silent: true },
    );
  }, 800);

  /** Ausschnitt auf Gebiet bzw. alle Pins setzen. */
  fitAll(): void {
    const bounds = L.latLngBounds([]);
    if (this.territoryLayer) bounds.extend(this.territoryLayer.getBounds());
    for (const m of this.markers.values()) bounds.extend(m.getLatLng());
    if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30] });
    else this.map.fitBounds(REGION_BOUNDS);
  }

  // ---------- Gebiet ----------

  private async refreshShapes(): Promise<void> {
    try {
      this.shapes = await allShapes();
    } catch (err) {
      console.error(err);
      toast('PLZ-Flächen konnten nicht geladen werden. Bitte einmal mit Internet öffnen.', { kind: 'error' });
      return;
    }
    const territory = store.territorySet();
    const features = [...territory].map((p) => this.shapes.get(p)).filter((f): f is PlzFeature => !!f);

    if (this.territoryLayer) this.map.removeLayer(this.territoryLayer);
    this.territoryLayer = L.geoJSON(
      { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
      { style: () => TERRITORY_STYLE, interactive: false, renderer: this.renderer } as L.GeoJSONOptions,
    );
    this.territoryLayer.addTo(this.map);
    this.territoryLayer.bringToBack();
    if (this.mode.kind === 'territory') this.restyleEditLayer();
    this.updateLabels();
  }

  private buildEditLayer(): void {
    if (this.editLayer) return;
    const territory = store.territorySet();
    this.editLayer = L.geoJSON(
      { type: 'FeatureCollection', features: [...this.shapes.values()] } as GeoJSON.FeatureCollection,
      {
        renderer: this.renderer,
        style: (f) => (territory.has(f?.properties.plz) ? { ...TERRITORY_STYLE, fillOpacity: 0.45 } : OTHER_PLZ_STYLE),
        onEachFeature: (f, layer) => {
          layer.on('click', (e: L.LeafletMouseEvent) => {
            L.DomEvent.stop(e);
            void this.toggleTerritoryPlz(f.properties.plz, f.properties.ort);
          });
        },
      } as L.GeoJSONOptions,
    );
    this.editLayer.addTo(this.map);
    if (this.territoryLayer) this.map.removeLayer(this.territoryLayer);
  }

  private restyleEditLayer(): void {
    const territory = store.territorySet();
    this.editLayer?.eachLayer((l) => {
      const f = (l as L.Polygon).feature as unknown as PlzFeature;
      (l as L.Path).setStyle(
        territory.has(f.properties.plz) ? { ...TERRITORY_STYLE, fillOpacity: 0.45 } : OTHER_PLZ_STYLE,
      );
    });
    if (this.territoryLayer && this.map.hasLayer(this.territoryLayer)) this.map.removeLayer(this.territoryLayer);
  }

  private removeEditLayer(): void {
    if (this.editLayer) this.map.removeLayer(this.editLayer);
    this.editLayer = null;
    if (this.territoryLayer && !this.map.hasLayer(this.territoryLayer)) {
      this.territoryLayer.addTo(this.map);
      this.territoryLayer.bringToBack();
    }
  }

  private async toggleTerritoryPlz(plz: string, ort: string): Promise<void> {
    const before = [...store.settings.territoryPlz];
    const set = new Set(before);
    const adding = !set.has(plz);
    if (adding) set.add(plz);
    else set.delete(plz);
    await store.setTerritory([...set]);
    toast(`${plz} ${ort} ${adding ? 'hinzugefügt' : 'entfernt'}`, {
      action: 'Rückgängig',
      onAction: () => void store.setTerritory(before),
    });
  }

  /** PLZ-Beschriftungen nur für den sichtbaren Ausschnitt und ab Zoomstufe 11. */
  private updateLabels(): void {
    this.labelLayer.clearLayers();
    if (this.map.getZoom() < LABEL_MIN_ZOOM || !this.shapes.size) return;
    const bounds = this.map.getBounds().pad(0.1);
    const plzList = this.mode.kind === 'territory' ? [...this.shapes.keys()] : store.settings.territoryPlz;
    let count = 0;
    for (const plz of plzList) {
      const f = this.shapes.get(plz);
      if (!f) continue;
      const pt = labelPoint(f);
      if (!bounds.contains(pt)) continue;
      if (++count > 250) break;
      L.marker(pt, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: 'plz-label', html: `<span>${plz}</span>`, iconSize: [50, 18] }),
      }).addTo(this.labelLayer);
    }
  }

  // ---------- Pins ----------

  private pinIcon(p: Practice): L.DivIcon {
    const color = colorForStatus(p.status, store.settings.statusColors);
    const cls = ['pin', p.needsReview && 'pin-review', p.geoStatus === 'approx' && 'pin-approx']
      .filter(Boolean)
      .join(' ');
    return L.divIcon({
      className: 'pin-wrap',
      html: `<div class="${cls}" style="--pin:${color}"><span></span></div>${p.needsReview ? '<b class="pin-badge">!</b>' : ''}`,
      iconSize: [36, 40],
      iconAnchor: [18, 38],
      popupAnchor: [0, -34],
    });
  }

  refreshPractices(): void {
    const visible = filteredPractices().filter((p) => p.lat !== undefined && p.lng !== undefined);
    const keep = new Set(visible.map((p) => p.id));

    const toRemove: L.Marker[] = [];
    for (const [id, m] of this.markers) {
      if (!keep.has(id)) {
        toRemove.push(m);
        this.markers.delete(id);
      }
    }
    this.cluster.removeLayers(toRemove);

    const toAdd: L.Marker[] = [];
    for (const p of visible) {
      const existing = this.markers.get(p.id);
      const pos = L.latLng(p.lat!, p.lng!);
      if (existing) {
        // Position oder Aussehen kann sich geändert haben
        if (!existing.getLatLng().equals(pos)) {
          this.cluster.removeLayer(existing);
          existing.setLatLng(pos);
          this.cluster.addLayer(existing);
        }
        existing.setIcon(this.pinIcon(p));
        continue;
      }
      const m = L.marker(pos, { icon: this.pinIcon(p), keyboard: false, title: p.name });
      m.bindPopup(() => buildPopup(store.getPractice(p.id) ?? p), { maxWidth: 320, minWidth: 240, autoPanPadding: [20, 80] });
      this.markers.set(p.id, m);
      toAdd.push(m);
    }
    this.cluster.addLayers(toAdd);
  }

  private focusPractice(id: string): void {
    const p = store.getPractice(id);
    if (!p) return;
    if (p.lat === undefined || p.lng === undefined) {
      toast('Für diese Praxis gibt es noch keinen Pin.', { action: 'Pin setzen', onAction: () => navigate(`/karte/pin/${id}`) });
      return;
    }
    const m = this.markers.get(id);
    if (m) {
      this.cluster.zoomToShowLayer(m, () => {
        this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), 15));
        m.openPopup();
      });
    } else {
      // Praxis ist durch den Filter ausgeblendet → vorübergehend anzeigen
      if (this.tempMarker) this.map.removeLayer(this.tempMarker);
      this.tempMarker = L.marker([p.lat, p.lng], { icon: this.pinIcon(p) })
        .bindPopup(buildPopup(p), { maxWidth: 320, minWidth: 240 })
        .addTo(this.map);
      this.map.setView([p.lat, p.lng], 16);
      this.tempMarker.openPopup();
      this.tempMarker.on('popupclose', () => {
        if (this.tempMarker) this.map.removeLayer(this.tempMarker);
        this.tempMarker = null;
      });
    }
  }

  // ---------- Pin von Hand setzen ----------

  private startPinMode(id: string): void {
    const p = store.getPractice(id);
    if (!p) return;
    let start: L.LatLng | null = null;
    if (p.lat !== undefined && p.lng !== undefined) start = L.latLng(p.lat, p.lng);
    else {
      const shape = this.shapes.get(p.plz);
      if (shape) {
        const [lat, lng] = labelPoint(shape);
        this.map.setView([lat, lng], 14);
      }
    }
    if (start) {
      this.placePin(start);
      this.map.setView(start, 17);
    }
  }

  private placePin(latlng: L.LatLng): void {
    if (this.mode.kind !== 'pin') return;
    const p = store.getPractice(this.mode.practiceId);
    if (!p) return;
    if (!this.pinMarker) {
      this.pinMarker = L.marker(latlng, { icon: this.pinIcon(p), draggable: true, autoPan: true }).addTo(this.map);
    } else {
      this.pinMarker.setLatLng(latlng);
    }
    this.refreshOverlay();
  }

  private removePinMarker(): void {
    if (this.pinMarker) this.map.removeLayer(this.pinMarker);
    this.pinMarker = null;
  }

  private async savePin(): Promise<void> {
    if (this.mode.kind !== 'pin' || !this.pinMarker) return;
    const p = store.getPractice(this.mode.practiceId);
    if (!p) return;
    const { lat, lng } = this.pinMarker.getLatLng();
    await store.savePractice({ ...p, lat: +lat.toFixed(6), lng: +lng.toFixed(6), geoStatus: 'manual' });
    toast('Pin gespeichert');
    goBack(`/praxis/${p.id}`);
  }

  // ---------- Eigener Standort ----------

  locate(): void {
    this.map.locate({ setView: true, maxZoom: 14, enableHighAccuracy: true });
  }

  private showLocation(e: L.LocationEvent): void {
    filterState.position = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (!this.locationMarker) {
      this.locationMarker = L.circleMarker(e.latlng, {
        radius: 9,
        color: '#fff',
        weight: 3,
        fillColor: '#1a73e8',
        fillOpacity: 1,
        interactive: false,
      }).addTo(this.map);
    } else {
      this.locationMarker.setLatLng(e.latlng);
    }
  }

  // ---------- Bedienelemente über der Karte ----------

  private buildOverlay(): void {
    const btn = (icon: string, label: string, onclick: () => void) =>
      h('button', { class: 'map-btn', 'aria-label': label, title: label, onclick }, iconEl(icon));

    this.els.top = h('div', { class: 'map-top' });
    this.els.side = h(
      'div',
      { class: 'map-side' },
      btn('locate', 'Mein Standort', () => this.locate()),
      btn('fit', 'Ganzes Gebiet zeigen', () => this.fitAll()),
      btn('plus', 'Vergrößern', () => this.map.zoomIn()),
      h('button', { class: 'map-btn', 'aria-label': 'Verkleinern', onclick: () => this.map.zoomOut() }, h('span', { class: 'minus' }, '−')),
    );
    this.els.legend = h('div', { class: 'map-legend' });
    this.els.progress = h('div', { class: 'map-progress', hidden: true });
    this.els.banner = h('div', { class: 'map-banner', hidden: true });
    this.els.welcome = h('div', { class: 'map-welcome', hidden: true });
    this.overlay.append(this.els.top, this.els.side, this.els.legend, this.els.progress, this.els.banner, this.els.welcome);
    // Klicks auf Bedienelemente nicht an die Karte durchreichen
    for (const el of Object.values(this.els)) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
    this.refreshOverlay();
  }

  private refreshOverlay(): void {
    if (!this.els.top) return;
    const mode = this.mode.kind;
    const editing = mode === 'territory' || mode === 'pin';
    this.els.top.hidden = editing;
    this.els.legend.hidden = editing;
    this.els.banner.hidden = !editing;

    // Suche + Filter
    const total = store.practices.size;
    const nFilters = activeFilterCount(filterState.filter) + (filterState.filter.search ? 1 : 0);
    const shown = nFilters ? filteredPractices().length : total;
    setChildren(
      this.els.top,
      h(
        'button',
        { class: 'map-search', onclick: () => navigate('/liste?suche') },
        iconEl('search', 20),
        h('span', null, filterState.filter.search ? `„${filterState.filter.search}“` : 'Praxis suchen …'),
      ),
      nFilters
        ? h(
            'button',
            { class: 'map-chip', onclick: () => filterState.reset() },
            `${shown} von ${total} · Filter aus`,
            iconEl('close', 16),
          )
        : null,
    );

    // Legende (Status-Farben; Antippen filtert)
    this.renderLegend();

    // Willkommen: solange weder Gebiet noch Praxen vorhanden sind
    const empty = !total && !store.settings.territoryPlz.length && !editing;
    this.els.welcome.hidden = !empty;
    if (empty) {
      setChildren(
        this.els.welcome,
        h('h2', null, 'Willkommen bei RepMap'),
        h('ol', { class: 'bullets' },
          h('li', null, h('b', null, 'Zum Home-Bildschirm hinzufügen'), ' (Safari: Teilen → „Zum Home-Bildschirm“) und die App von dort öffnen.'),
          h('li', null, h('b', null, 'Gebiet festlegen:'), ' PLZ antippen oder als Liste einfügen.'),
          h('li', null, h('b', null, 'Praxisliste importieren'), ' (Excel).'),
        ),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-primary', onclick: () => navigate('/gebiet') }, iconEl('area', 20), 'Gebiet festlegen'),
          h('button', { class: 'btn', onclick: () => navigate('/import') }, iconEl('upload', 20), 'Excel importieren'),
        ),
      );
    }

    // Banner für Bearbeiten-Modi
    if (mode === 'territory') {
      setChildren(
        this.els.banner,
        h('div', { class: 'map-banner-text' },
          h('strong', null, 'Gebiet bearbeiten'),
          h('span', null, `Tippe PLZ-Flächen an, um sie hinzuzufügen oder zu entfernen. Aktuell ${plural(store.settings.territoryPlz.length, 'PLZ', 'PLZ')}.`),
        ),
        h('button', { class: 'btn btn-primary', onclick: () => goBack('/gebiet') }, 'Fertig'),
      );
    } else if (mode === 'pin' && this.mode.kind === 'pin') {
      const p = store.getPractice(this.mode.practiceId);
      setChildren(
        this.els.banner,
        h('div', { class: 'map-banner-text' },
          h('strong', null, `Pin setzen: ${p?.name ?? ''}`),
          h('span', null, this.pinMarker ? 'Pin verschieben oder an andere Stelle tippen.' : 'Tippe auf die Stelle, an der die Praxis liegt.'),
        ),
        h('div', { class: 'row' },
          h('button', { class: 'btn', onclick: () => goBack(`/praxis/${p?.id ?? ''}`) }, 'Abbrechen'),
          h('button', { class: 'btn btn-primary', disabled: !this.pinMarker, onclick: () => void this.savePin() }, 'Speichern'),
        ),
      );
    }
    this.refreshProgress();
  }

  private renderLegend(): void {
    const options = statusOptions();
    if (!options.length) {
      this.els.legend.hidden = true;
      return;
    }
    const active = new Set(filterState.filter.statuses);
    const toggle = (key: string) => {
      const next = new Set(active);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      filterState.update({ statuses: [...next] });
    };
    setChildren(
      this.els.legend,
      h(
        'button',
        { class: 'legend-toggle', onclick: () => ((this.legendOpen = !this.legendOpen), this.renderLegend()) },
        iconEl('layers', 18),
        this.legendOpen ? 'Legende' : '',
      ),
      this.legendOpen &&
        h(
          'ul',
          null,
          options.map((o) =>
            h(
              'li',
              null,
              h(
                'button',
                { class: ['legend-item', active.size > 0 && !active.has(o.key) && 'off'], onclick: () => toggle(o.key) },
                h('span', { class: 'dot', style: { background: colorForStatus(o.key, store.settings.statusColors) } }),
                h('span', { class: 'legend-label' }, o.label),
                h('span', { class: 'legend-count' }, String(o.count)),
              ),
            ),
          ),
          h('li', { class: 'legend-hint' }, h('span', { class: 'pin-mini pin-review' }), 'gelber Rand = prüfen'),
        ),
    );
  }

  private refreshProgress(): void {
    const s = this.queueStatus;
    const el = this.els.progress;
    if (!el) return;
    const pending = geocodeQueue.pendingCount();
    if (!s || (s.state === 'idle' && !pending)) {
      el.hidden = true;
      return;
    }
    el.hidden = this.mode.kind === 'territory' || this.mode.kind === 'pin';
    const text: Record<string, string> = {
      running: `Adressen werden gesucht … ${s.done} / ${s.total}`,
      waiting: 'Adresssuche macht kurz Pause …',
      paused: `Adresssuche pausiert – ${pending} offen`,
      offline: `Offline – ${pending} Adressen warten`,
      idle: `${pending} Adressen noch nicht gesucht`,
    };
    const running = s.state === 'running' || s.state === 'waiting';
    setChildren(
      el,
      running && h('span', { class: 'spinner' }),
      h('span', null, text[s.state]),
      h(
        'button',
        { class: 'btn btn-sm', onclick: () => (running ? geocodeQueue.pause() : geocodeQueue.start()) },
        running ? 'Pause' : 'Starten',
      ),
    );
  }
}
