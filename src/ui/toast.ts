/** Kurze Hinweise am unteren Bildschirmrand, optional mit Aktion („Rückgängig“). */
import { h } from './dom';

interface ToastOptions {
  action?: string;
  onAction?: () => void;
  duration?: number;
  kind?: 'info' | 'error' | 'success';
}

let container: HTMLElement | null = null;

export function toast(message: string, opts: ToastOptions = {}): void {
  if (!container) {
    container = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(container);
  }
  const el = h(
    'div',
    { class: ['toast', opts.kind && `toast-${opts.kind}`] },
    h('span', null, message),
    opts.action &&
      h(
        'button',
        {
          class: 'toast-action',
          onclick: () => {
            opts.onAction?.();
            el.remove();
          },
        },
        opts.action,
      ),
  );
  container.append(el);
  // höchstens zwei Meldungen gleichzeitig
  while (container.children.length > 2) container.firstElementChild?.remove();
  setTimeout(() => el.classList.add('leaving'), (opts.duration ?? (opts.action ? 6000 : 3000)) - 300);
  setTimeout(() => el.remove(), opts.duration ?? (opts.action ? 6000 : 3000));
}
