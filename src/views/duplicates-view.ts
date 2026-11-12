/** Prüfseite „Doppelte Standorte“: zusammenführen oder als verschieden markieren. */
import { navigate } from '../router';
import { allPairs, REASON_LABEL, type DuplicateGroup } from '../state/duplicates';
import { duplicateGroups } from '../state/selectors';
import { store } from '../state/store';
import type { Practice } from '../types';
import { confirmDialog } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { colorForStatus } from '../utils/colors';
import { formatDate } from '../utils/dates';
import { KIND_LABEL, kindOf } from '../utils/kind';
import { fullAddress } from '../utils/maps';
import { plural } from '../utils/text';
import { emptyState, pageHeader, type View } from './common';

/** Welcher Eintrag soll bleiben? Der mit den meisten Besuchen/Angaben. */
function bestKeeper(ps: Practice[]): string {
  const score = (p: Practice) =>
    store.visitsFor(p.id).length * 10 +
    Object.keys(p.products ?? {}).length * 3 +
    (p.openingHours ? 2 : 0) +
    (p.geoStatus === 'ok' || p.geoStatus === 'manual' ? 2 : 0) +
    (p.phone ? 1 : 0);
  return [...ps].sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt))[0].id;
}

export function duplicatesView(): View {
  const el = h('div', { class: 'page' });
  const keepChoice = new Map<string, string>(); // Gruppe → behaltene ID

  function render() {
    const groups = duplicateGroups();
    setChildren(
      el,
      pageHeader({ title: 'Doppelte Standorte', back: '/mehr', sub: groups.length ? plural(groups.length, 'Fall', 'Fälle') + ' zu prüfen' : undefined }),
      h(
        'p',
        { class: 'muted small' },
        'Einträge mit gleicher Adresse, gleichem Namen im selben PLZ-Gebiet oder gleicher Position. ',
        'Ist es wirklich derselbe Standort, tippe auf „Zusammenführen“ – Besuche, Produkte und Notizen bleiben erhalten. ',
        'Sind es verschiedene Einrichtungen (z. B. mehrere Praxen in einem Ärztehaus), tippe auf „Sind verschieden“.',
      ),
      groups.length
        ? groups.map(groupCard)
        : emptyState({ icon: 'check', title: 'Keine doppelten Standorte', text: 'Alles sauber – es gibt keine Einträge, die doppelt aussehen.' }),
    );
  }

  function groupCard(g: DuplicateGroup): HTMLElement {
    if (!keepChoice.has(g.id) || !g.practices.some((p) => p.id === keepChoice.get(g.id))) keepChoice.set(g.id, bestKeeper(g.practices));
    const keep = keepChoice.get(g.id)!;
    return h(
      'section',
      { class: 'card dup-card' },
      h('div', { class: 'dup-reason' }, iconEl('warning', 18), g.reasons.map((r) => REASON_LABEL[r]).join(' · ')),
      h(
        'ul',
        { class: 'dup-list' },
        g.practices.map((p) => {
          const visits = store.visitsFor(p.id).length;
          const products = Object.keys(p.products ?? {}).length;
          return h(
            'li',
            null,
            h(
              'label',
              { class: ['dup-item', p.id === keep && 'keep'] },
              h('input', {
                type: 'radio',
                name: `keep-${g.id}`,
                checked: p.id === keep,
                onchange: () => {
                  keepChoice.set(g.id, p.id);
                  render();
                },
              }),
              h(
                'span',
                { class: 'prow-main' },
                h('span', { class: 'prow-title' }, p.name),
                h('span', { class: 'prow-sub' }, `${fullAddress(p)}${p.specialty ? ` · ${p.specialty}` : ''}`),
                h(
                  'span',
                  { class: 'badges' },
                  kindOf(p) === 'klinik' && h('span', { class: 'badge badge-kind' }, KIND_LABEL.klinik),
                  p.status && h('span', { class: 'badge badge-soft', style: { '--badge': colorForStatus(p.status, store.settings.statusColors) } }, p.status),
                  h('span', { class: 'badge badge-info' }, plural(visits, 'Besuch', 'Besuche')),
                  products ? h('span', { class: 'badge badge-info' }, plural(products, 'Produkt', 'Produkte')) : null,
                  h('span', { class: 'muted small' }, `angelegt ${formatDate(p.createdAt.slice(0, 10))}`),
                ),
              ),
              p.id === keep ? h('span', { class: 'keep-label' }, 'bleibt') : h('a', { class: 'small', href: `#/praxis/${p.id}`, onclick: (e: Event) => e.stopPropagation() }, 'ansehen'),
            ),
          );
        }),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn btn-primary', onclick: () => void merge(g, keep) }, 'Zusammenführen'),
        h('button', { class: 'btn', onclick: () => void dismiss(g) }, 'Sind verschieden'),
      ),
    );
  }

  async function merge(g: DuplicateGroup, keepId: string) {
    const keep = g.practices.find((p) => p.id === keepId)!;
    const others = g.practices.filter((p) => p.id !== keepId);
    const ok = await confirmDialog({
      title: 'Zusammenführen?',
      message: `„${keep.name}“ bleibt. ${plural(others.length, 'Eintrag wird', 'Einträge werden')} gelöscht – ihre Besuche, Produkte, Hinweise und Termine werden übernommen.`,
      confirmLabel: 'Zusammenführen',
    });
    if (!ok) return;
    await store.mergePractices(keepId, others.map((p) => p.id));
    toast('Zusammengeführt', { action: 'Ansehen', onAction: () => navigate(`/praxis/${keepId}`) });
  }

  async function dismiss(g: DuplicateGroup) {
    await store.dismissDuplicates(allPairs(g.practices.map((p) => p.id)));
    toast('Als verschieden markiert');
  }

  const unsub = store.subscribe((k) => {
    if (k.has('practices') || k.has('settings') || k.has('visits')) render();
  });
  render();
  return { el, destroy: unsub };
}
