/** Mein Gebiet: PLZ-Liste ansehen, einfügen, entfernen. */
import { allShapes, fetchMissingShapes } from '../geo/plz-data';
import { navigate } from '../router';
import { store } from '../state/store';
import { confirmDialog } from '../ui/dialog';
import { h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { toast } from '../ui/toast';
import { parsePlzList, plural } from '../utils/text';
import { pageHeader, section, type View } from './common';

export function territoryView(): View {
  const summary = h('div');
  const listEl = h('div', { class: 'plz-chips' });
  const message = h('div');
  const textarea = h('textarea', { rows: 4, placeholder: 'PLZ einfügen, z. B. 80331, 80333 81245 …\n(beliebig getrennt: Komma, Leerzeichen, neue Zeile)' });

  async function apply(mode: 'add' | 'replace') {
    const plz = parsePlzList(textarea.value);
    if (!plz.length) {
      toast('Keine 5-stelligen PLZ gefunden.', { kind: 'error' });
      return;
    }
    if (mode === 'replace') {
      const ok = await confirmDialog({
        title: 'Gebiet ersetzen?',
        message: `Dein Gebiet besteht danach genau aus diesen ${plz.length} PLZ.`,
        confirmLabel: 'Ersetzen',
      });
      if (!ok) return;
    }
    const next = mode === 'add' ? [...store.settings.territoryPlz, ...plz] : plz;
    await store.setTerritory(next);
    textarea.value = '';
    // Flächen für PLZ nachladen, die nicht in der mitgelieferten Datei sind
    const shapes = await allShapes().catch(() => new Map());
    const unknown = plz.filter((p) => !shapes.has(p));
    if (!unknown.length) {
      setChildren(message, h('div', { class: 'notice notice-ok' }, iconEl('check', 20), `${plz.length} PLZ übernommen.`));
      return;
    }
    setChildren(message, h('div', { class: 'notice' }, h('span', { class: 'spinner' }), `Lade ${unknown.length} fehlende PLZ-Flächen aus OpenStreetMap …`));
    try {
      const { missing } = await fetchMissingShapes(unknown);
      setChildren(
        message,
        missing.length
          ? h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), `Für diese PLZ wurde keine Fläche gefunden: ${missing.join(', ')}. Sie stehen im Gebiet, werden aber nicht auf der Karte gezeigt.`)
          : h('div', { class: 'notice notice-ok' }, iconEl('check', 20), `${plz.length} PLZ übernommen, ${unknown.length} Flächen nachgeladen.`),
      );
    } catch (err) {
      setChildren(message, h('div', { class: 'notice notice-warn' }, iconEl('warning', 20), `PLZ übernommen, aber Flächen konnten nicht geladen werden: ${(err as Error).message}`));
    }
  }

  async function render() {
    const plzList = store.settings.territoryPlz;
    setChildren(
      summary,
      h('p', { class: 'big-number' }, plural(plzList.length, 'PLZ', 'PLZ'), h('span', { class: 'muted' }, ' in deinem Gebiet')),
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', onclick: () => navigate('/karte/gebiet') }, iconEl('area', 20), 'Auf der Karte bearbeiten'),
        plzList.length ? h('button', { class: 'btn', onclick: () => void copyList(plzList) }, 'Liste kopieren') : null,
      ),
    );
    const shapes = await allShapes().catch(() => new Map());
    setChildren(
      listEl,
      plzList.length
        ? plzList.map((plz) =>
            h(
              'span',
              { class: ['plz-chip', !shapes.has(plz) && 'missing'] },
              h('b', null, plz),
              ' ',
              shapes.get(plz)?.properties.ort ?? '(keine Fläche)',
              h('button', {
                class: 'plz-remove',
                'aria-label': `${plz} entfernen`,
                onclick: () => {
                  const before = [...store.settings.territoryPlz];
                  void store.setTerritory(before.filter((x) => x !== plz));
                  toast(`${plz} entfernt`, { action: 'Rückgängig', onAction: () => void store.setTerritory(before) });
                },
              }, iconEl('close', 16)),
            ),
          )
        : h('p', { class: 'muted' }, 'Noch keine PLZ. Tippe sie auf der Karte an oder füge oben eine Liste ein.'),
    );
  }

  const unsub = store.subscribe((k) => {
    if (k.has('territory') || k.has('shapes')) void render();
  });
  void render();

  const el = h(
    'div',
    { class: 'page' },
    pageHeader({ title: 'Mein Gebiet', back: '/mehr' }),
    section('Überblick', summary),
    section(
      'PLZ-Liste einfügen',
      h('p', { class: 'muted small' }, 'Praktisch, wenn du die PLZ schon als Liste hast (z. B. aus Excel kopiert).'),
      textarea,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-primary', onclick: () => void apply('add') }, 'Hinzufügen'),
        h('button', { class: 'btn', onclick: () => void apply('replace') }, 'Gebiet ersetzen'),
      ),
      message,
    ),
    section('Alle PLZ im Gebiet', listEl),
  );
  return { el, destroy: unsub };
}

async function copyList(list: string[]) {
  try {
    await navigator.clipboard.writeText(list.join(', '));
    toast('PLZ-Liste kopiert');
  } catch {
    toast('Kopieren nicht möglich', { kind: 'error' });
  }
}
