/** Gemeinsame Bausteine für die Seiten (Kopfzeile, Formularfelder, leere Zustände). */
import { goBack } from '../router';
import { h, type Child } from '../ui/dom';
import { iconEl } from '../ui/icons';

/** Eine Seite liefert ihr Element und räumt beim Verlassen auf. */
export interface View {
  el: HTMLElement;
  destroy?: () => void;
}

export function pageHeader(opts: { title: string; back?: string; actions?: Child; sub?: Child }): HTMLElement {
  return h(
    'header',
    { class: 'page-head' },
    opts.back
      ? h(
          'button',
          { class: 'icon-btn back-btn', 'aria-label': 'Zurück', onclick: () => goBack(opts.back!) },
          iconEl('back', 26),
        )
      : null,
    h('div', { class: 'page-title' }, h('h1', null, opts.title), opts.sub ? h('div', { class: 'page-sub' }, opts.sub) : null),
    opts.actions ? h('div', { class: 'page-actions' }, opts.actions) : null,
  );
}

export function emptyState(opts: { icon: string; title: string; text?: Child; action?: Child }): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    iconEl(opts.icon, 48),
    h('h2', null, opts.title),
    opts.text ? h('p', null, opts.text) : null,
    opts.action ?? null,
  );
}

/** Formularfeld mit Beschriftung */
export function field(label: string, input: HTMLElement, hint?: Child): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** Abschnitt mit Überschrift in einer Detailseite */
export function section(title: Child, ...content: Child[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, title), ...content);
}

/** Zeile in einer Menüliste (z. B. Seite „Mehr“) */
export function menuItem(opts: { icon: string; label: string; sub?: Child; href?: string; onclick?: () => void; danger?: boolean }): HTMLElement {
  const content = [
    h('span', { class: 'menu-icon' }, iconEl(opts.icon)),
    h('span', { class: 'menu-text' }, h('span', { class: 'menu-label' }, opts.label), opts.sub ? h('span', { class: 'menu-sub' }, opts.sub) : null),
    iconEl('chevron', 20),
  ];
  return opts.href
    ? h('a', { class: ['menu-item', opts.danger && 'danger'], href: opts.href }, content)
    : h('button', { class: ['menu-item', opts.danger && 'danger'], onclick: opts.onclick }, content);
}
