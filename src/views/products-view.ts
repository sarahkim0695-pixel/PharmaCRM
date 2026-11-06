/** Produktliste pflegen und Produkte pro Praxis festhalten (angeboten / kauft). */
import { navigate } from '../router';
import { filterState } from '../state/filters';
import { store } from '../state/store';
import type { Practice, Product, ProductState } from '../types';
import { confirmDialog, openSheet } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { newId, nowIso } from '../utils/id';
import { normalize } from '../utils/text';
import { emptyState, field, pageHeader, type View } from './common';

/** Wie viele Praxen haben das Produkt angeboten bekommen / kaufen es? */
export function productUsage(productId: string): { angeboten: number; kauft: number } {
  let angeboten = 0;
  let kauft = 0;
  for (const p of store.practices.values()) {
    const st = p.products?.[productId];
    if (st === 'angeboten') angeboten++;
    if (st === 'kauft') kauft++;
  }
  return { angeboten, kauft };
}

// ---------- Seite „Produkte“ ----------

export function productsView(): View {
  const el = h('div', { class: 'page' });
  const input = h('input', { placeholder: 'Neues Produkt, z. B. „Wundauflage XY“', enterkeyhint: 'done', autocomplete: 'off' });

  async function add() {
    const name = input.value.trim();
    if (!name) return;
    if (store.productList(true).some((p) => normalize(p.name) === normalize(name))) {
      toast('Dieses Produkt gibt es schon.', { kind: 'error' });
      return;
    }
    const ts = nowIso();
    await store.saveProduct({ id: newId(), name, note: '', archived: false, createdAt: ts, updatedAt: ts });
    input.value = '';
    toast(`„${name}“ hinzugefügt`);
  }

  function render() {
    const active = store.productList();
    const archived = store.productList(true).filter((p) => p.archived);
    setChildren(
      el,
      pageHeader({ title: 'Produkte', back: '/mehr' }),
      h(
        'form',
        { class: 'card add-row', onsubmit: (e: Event) => { e.preventDefault(); void add(); } },
        input,
        h('button', { type: 'submit', class: 'btn btn-primary' }, iconEl('plus', 20), 'Hinzufügen'),
      ),
      active.length
        ? h('ul', { class: 'plist' }, active.map(productRow))
        : emptyState({ icon: 'box', title: 'Noch keine Produkte', text: 'Lege deine Produkte an. Bei jeder Praxis kannst du dann festhalten, was angeboten wurde und was sie kauft.' }),
      archived.length
        ? h('details', { class: 'details card' }, h('summary', null, `Archiviert (${archived.length})`), h('ul', { class: 'plist' }, archived.map(productRow)))
        : null,
    );
  }

  const unsub = store.subscribe((k) => {
    if (k.has('products') || k.has('practices')) render();
  });
  render();
  return { el, destroy: unsub };
}

function productRow(p: Product): HTMLElement {
  const u = productUsage(p.id);
  return h(
    'li',
    null,
    h(
      'button',
      { class: 'prow prow-btn', onclick: () => editProduct(p) },
      iconEl('box', 22),
      h(
        'span',
        { class: 'prow-main' },
        h('span', { class: 'prow-title' }, p.name),
        p.note && h('span', { class: 'prow-sub' }, p.note),
        h('span', { class: 'badges' },
          h('span', { class: 'badge badge-soft', style: { '--badge': '#1f9d55' } }, `kauft: ${u.kauft}`),
          h('span', { class: 'badge badge-soft', style: { '--badge': '#2f6fdb' } }, `angeboten: ${u.angeboten}`),
        ),
      ),
      iconEl('edit', 20),
    ),
  );
}

function editProduct(p: Product): void {
  const name = h('input', { value: p.name });
  const note = h('input', { value: p.note, placeholder: 'optional, z. B. Artikelnummer' });
  const archived = h('input', { type: 'checkbox', class: 'switch', checked: p.archived });
  const u = productUsage(p.id);

  const sheet = openSheet({
    title: 'Produkt bearbeiten',
    content: [
      field('Name', name),
      field('Notiz', note),
      h('label', { class: 'switch-row' }, h('span', null, 'Archiviert (wird bei Praxen ausgeblendet)'), archived),
      h(
        'div',
        { class: 'row', style: 'margin-top:12px' },
        h('button', { class: 'btn btn-sm', disabled: !(u.kauft + u.angeboten), onclick: () => showPractices(p.id, sheet.close) }, iconEl('list', 18), `Praxen anzeigen (${u.kauft + u.angeboten})`),
        h('button', { class: 'btn btn-sm btn-danger-outline', onclick: () => void remove() }, iconEl('trash', 18), 'Löschen'),
      ),
    ],
    footer: [
      h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'),
      h('button', { class: 'btn btn-primary', onclick: () => void save() }, 'Speichern'),
    ],
  });

  async function save() {
    if (!name.value.trim()) {
      toast('Bitte einen Namen eingeben.', { kind: 'error' });
      return;
    }
    await store.saveProduct({ ...p, name: name.value.trim(), note: note.value.trim(), archived: archived.checked });
    sheet.close();
    toast('Gespeichert');
  }

  async function remove() {
    const used = u.kauft + u.angeboten;
    const ok = await confirmDialog({
      title: 'Produkt löschen?',
      message: used
        ? `„${p.name}“ ist bei ${used} Praxen eingetragen. Diese Angaben werden ebenfalls gelöscht. Tipp: „Archivieren“ blendet es nur aus.`
        : `„${p.name}“ wird gelöscht.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await store.deleteProduct(p.id);
    sheet.close();
    toast('Produkt gelöscht');
  }
}

function showPractices(productId: string, close: () => void) {
  close();
  filterState.reset();
  filterState.update({ productId, productState: 'any' });
  navigate('/liste');
}

// ---------- Abschnitt in der Praxis-Detailansicht ----------

const STATES: { value: ProductState | ''; label: string }[] = [
  { value: '', label: '–' },
  { value: 'angeboten', label: 'angeboten' },
  { value: 'kauft', label: 'kauft' },
];

export function productsSection(p: Practice): HTMLElement {
  const products = store.productList(true).filter((prod) => !prod.archived || p.products?.[prod.id]);
  const kauft = Object.values(p.products ?? {}).filter((s) => s === 'kauft').length;
  const angeboten = Object.values(p.products ?? {}).filter((s) => s === 'angeboten').length;

  const set = async (productId: string, state: ProductState | '') => {
    const current = store.getPractice(p.id) ?? p;
    const next = { ...(current.products ?? {}) };
    if (state) next[productId] = state;
    else delete next[productId];
    await store.savePractice({ ...current, products: next });
  };

  return h(
    'section',
    { class: 'card' },
    h('h2', { class: 'card-title' }, 'Produkte', products.length ? h('span', { class: 'muted small' }, ` · kauft ${kauft} · angeboten ${angeboten}`) : null),
    products.length
      ? h(
          'ul',
          { class: 'product-states' },
          products.map((prod) =>
            h(
              'li',
              null,
              h('span', { class: 'grow' }, prod.name, prod.archived ? h('span', { class: 'muted small' }, ' (archiviert)') : null),
              h(
                'div',
                { class: 'segmented segmented-sm', role: 'radiogroup', 'aria-label': prod.name },
                STATES.map((s) =>
                  h(
                    'button',
                    {
                      class: ['seg', (p.products?.[prod.id] ?? '') === s.value && 'on', s.value && `seg-${s.value}`],
                      role: 'radio',
                      'aria-checked': String((p.products?.[prod.id] ?? '') === s.value),
                      onclick: () => void set(prod.id, s.value),
                    },
                    s.label,
                  ),
                ),
              ),
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'Noch keine Produkte angelegt. ', h('a', { href: '#/produkte' }, 'Produktliste öffnen')),
  );
}
