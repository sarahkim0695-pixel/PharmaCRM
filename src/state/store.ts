/**
 * Zentraler Datenspeicher der App.
 *
 * Beim Start werden alle Daten aus IndexedDB in den Arbeitsspeicher geladen
 * (das sind höchstens ein paar tausend Einträge). Jede Änderung wird sofort
 * in IndexedDB geschrieben und an alle Ansichten gemeldet (`subscribe`).
 */
import { getDb } from '../db/database';
import { DEFAULT_TERRITORY_PLZ } from '../data/territory';
import type { BackupFile, PlzFeature, Practice, Product, Settings, Visit } from '../types';
import { nowIso } from '../utils/id';

export type ChangeKind = 'practices' | 'visits' | 'products' | 'settings' | 'shapes' | 'territory';
type Listener = (kinds: Set<ChangeKind>) => void;

export const DEFAULT_SETTINGS: Settings = {
  territoryPlz: [...DEFAULT_TERRITORY_PLZ],
  statusColors: {},
  staleDays: 90,
  backupReminderDays: 7,
};

class Store {
  practices = new Map<string, Practice>();
  visits = new Map<string, Visit>();
  products = new Map<string, Product>();
  extraShapes = new Map<string, PlzFeature>();
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  loaded = false;

  private listeners = new Set<Listener>();
  private pending = new Set<ChangeKind>();
  private lastVisitCache: Map<string, Visit> | null = null;

  // ---------- Laden & Benachrichtigen ----------

  async load(): Promise<void> {
    const db = await getDb();
    const [practices, visits, products, shapes, settings] = await Promise.all([
      db.getAll('practices'),
      db.getAll('visits'),
      db.getAll('products'),
      db.getAll('plzShapes'),
      db.get('meta', 'settings') as Promise<Partial<Settings> | undefined>,
    ]);
    this.practices = new Map(practices.map((p) => [p.id, p]));
    this.visits = new Map(visits.map((v) => [v.id, v]));
    this.products = new Map(products.map((p) => [p.id, p]));
    this.extraShapes = new Map(shapes.map((s) => [s.properties.plz, s]));
    this.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(settings ?? {}) };
    this.lastVisitCache = null;
    this.loaded = true;
    this.emit('practices', 'visits', 'products', 'settings', 'shapes', 'territory');
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Änderungen sammeln und gebündelt melden (einmal pro „Tick“). */
  private emit(...kinds: ChangeKind[]): void {
    const first = this.pending.size === 0;
    kinds.forEach((k) => this.pending.add(k));
    if (kinds.includes('visits')) this.lastVisitCache = null;
    if (!first) return;
    queueMicrotask(() => {
      const batch = new Set(this.pending);
      this.pending.clear();
      this.listeners.forEach((fn) => fn(batch));
    });
  }

  /** Merkt sich den Zeitpunkt der letzten Datenänderung (für die Backup-Erinnerung). */
  private async touch(): Promise<void> {
    this.settings.lastChangeAt = nowIso();
    await (await getDb()).put('meta', this.settings, 'settings');
  }

  // ---------- Praxen ----------

  practiceList(): Practice[] {
    return [...this.practices.values()];
  }

  getPractice(id: string): Practice | undefined {
    return this.practices.get(id);
  }

  async savePractice(p: Practice): Promise<Practice> {
    return (await this.savePractices([p]))[0];
  }

  async savePractices(list: Practice[], opts: { keepTimestamp?: boolean } = {}): Promise<Practice[]> {
    if (!list.length) return list;
    const ts = nowIso();
    const saved = list.map((p) => ({ ...p, updatedAt: opts.keepTimestamp ? p.updatedAt : ts }));
    // Erst im Arbeitsspeicher ändern (sofort sichtbar, keine verlorenen schnellen Taps) …
    saved.forEach((p) => this.practices.set(p.id, p));
    // … dann dauerhaft speichern
    const db = await getDb();
    const tx = db.transaction('practices', 'readwrite');
    await Promise.all([...saved.map((p) => tx.store.put(p)), tx.done]);
    await this.touch();
    this.emit('practices');
    return saved;
  }

  /** Löscht Praxen inkl. ihrer Besuche. */
  async deletePractices(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const idSet = new Set(ids);
    const visitIds = [...this.visits.values()].filter((v) => idSet.has(v.practiceId)).map((v) => v.id);
    const db = await getDb();
    const tx = db.transaction(['practices', 'visits'], 'readwrite');
    await Promise.all([
      ...ids.map((id) => tx.objectStore('practices').delete(id)),
      ...visitIds.map((id) => tx.objectStore('visits').delete(id)),
      tx.done,
    ]);
    ids.forEach((id) => this.practices.delete(id));
    visitIds.forEach((id) => this.visits.delete(id));
    await this.touch();
    this.emit('practices', 'visits');
  }

  // ---------- Besuche ----------

  visitsFor(practiceId: string): Visit[] {
    return [...this.visits.values()]
      .filter((v) => v.practiceId === practiceId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  /** Letzter Besuch je Praxis (zwischengespeichert, bis sich Besuche ändern). */
  lastVisit(practiceId: string): Visit | undefined {
    if (!this.lastVisitCache) {
      const m = new Map<string, Visit>();
      for (const v of this.visits.values()) {
        const cur = m.get(v.practiceId);
        if (!cur || v.date > cur.date) m.set(v.practiceId, v);
      }
      this.lastVisitCache = m;
    }
    return this.lastVisitCache.get(practiceId);
  }

  async saveVisit(v: Visit): Promise<Visit> {
    const saved = { ...v, updatedAt: nowIso() };
    this.visits.set(saved.id, saved);
    this.lastVisitCache = null;
    await (await getDb()).put('visits', saved);
    await this.touch();
    this.emit('visits');
    return saved;
  }

  async deleteVisit(id: string): Promise<void> {
    await (await getDb()).delete('visits', id);
    this.visits.delete(id);
    await this.touch();
    this.emit('visits');
  }

  // ---------- Produkte ----------

  productList(includeArchived = false): Product[] {
    return [...this.products.values()]
      .filter((p) => includeArchived || !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async saveProduct(p: Product): Promise<Product> {
    const saved = { ...p, updatedAt: nowIso() };
    this.products.set(saved.id, saved);
    await (await getDb()).put('products', saved);
    await this.touch();
    this.emit('products');
    return saved;
  }

  /** Löscht ein Produkt und entfernt es bei allen Praxen. */
  async deleteProduct(id: string): Promise<void> {
    const affected = this.practiceList()
      .filter((p) => p.products?.[id])
      .map((p) => {
        const products = { ...p.products };
        delete products[id];
        return { ...p, products };
      });
    await (await getDb()).delete('products', id);
    this.products.delete(id);
    if (affected.length) await this.savePractices(affected);
    await this.touch();
    this.emit('products');
  }

  // ---------- Einstellungen & Gebiet ----------

  async updateSettings(patch: Partial<Settings>, opts: { silent?: boolean } = {}): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await (await getDb()).put('meta', this.settings, 'settings');
    if (!opts.silent) this.emit('settings');
  }

  territorySet(): Set<string> {
    return new Set(this.settings.territoryPlz);
  }

  async setTerritory(plzList: string[]): Promise<void> {
    const unique = [...new Set(plzList)].sort();
    this.settings = { ...this.settings, territoryPlz: unique, lastChangeAt: nowIso() };
    await (await getDb()).put('meta', this.settings, 'settings');
    this.emit('territory', 'settings');
  }

  async saveExtraShapes(features: PlzFeature[]): Promise<void> {
    if (!features.length) return;
    const db = await getDb();
    const tx = db.transaction('plzShapes', 'readwrite');
    await Promise.all([...features.map((f) => tx.store.put(f)), tx.done]);
    features.forEach((f) => this.extraShapes.set(f.properties.plz, f));
    this.emit('shapes');
  }

  // ---------- Backup ----------

  toBackup(): BackupFile {
    return {
      app: 'RepMap',
      formatVersion: 1,
      exportedAt: nowIso(),
      practices: this.practiceList(),
      visits: [...this.visits.values()],
      products: [...this.products.values()],
      settings: this.settings,
      extraPlzShapes: [...this.extraShapes.values()],
    };
  }

  /** Ersetzt ALLE Daten durch den Inhalt einer Backup-Datei. */
  async restoreBackup(b: BackupFile): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(['practices', 'visits', 'products', 'meta', 'plzShapes'], 'readwrite');
    await Promise.all([
      tx.objectStore('practices').clear(),
      tx.objectStore('visits').clear(),
      tx.objectStore('products').clear(),
      tx.objectStore('plzShapes').clear(),
    ]);
    const settings: Settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...b.settings,
      lastBackupAt: nowIso(), // wiederhergestellter Stand ist ja gesichert
      backupSnoozeUntil: undefined,
    };
    await Promise.all([
      ...b.practices.map((p) => tx.objectStore('practices').put(p)),
      ...b.visits.map((v) => tx.objectStore('visits').put(v)),
      ...b.products.map((p) => tx.objectStore('products').put(p)),
      ...(b.extraPlzShapes ?? []).map((s) => tx.objectStore('plzShapes').put(s)),
      tx.objectStore('meta').put(settings, 'settings'),
      tx.done,
    ]);
    await this.load();
  }

  /** Löscht alle Daten (Praxen, Besuche, Produkte, Einstellungen). */
  async clearAll(): Promise<void> {
    const db = await getDb();
    const tx = db.transaction(
      ['practices', 'visits', 'products', 'meta', 'plzShapes', 'geocodeCache'],
      'readwrite',
    );
    await Promise.all([
      tx.objectStore('practices').clear(),
      tx.objectStore('visits').clear(),
      tx.objectStore('products').clear(),
      tx.objectStore('meta').clear(),
      tx.objectStore('plzShapes').clear(),
      tx.objectStore('geocodeCache').clear(),
      tx.done,
    ]);
    await this.load();
  }
}

export const store = new Store();
