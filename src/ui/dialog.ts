/**
 * Dialoge: Bestätigung, Auswahl und „Bottom Sheets“ (Fenster, das von unten kommt).
 * Nutzt das native <dialog>-Element (Safari ab iOS 15.4).
 */
import { h, type Child } from './dom';
import { iconEl } from './icons';

export interface SheetHandle {
  close: () => void;
  dialog: HTMLDialogElement;
  body: HTMLElement;
}

/** Öffnet ein Fenster mit Titel, Inhalt und optionalen Buttons unten. */
export function openSheet(opts: {
  title: string;
  content: Child;
  footer?: Child;
  onClose?: () => void;
  wide?: boolean;
}): SheetHandle {
  const body = h('div', { class: 'sheet-body' }, opts.content);
  const dialog = h(
    'dialog',
    { class: ['sheet', opts.wide && 'sheet-wide'] },
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', null, opts.title),
      h('button', { class: 'icon-btn', 'aria-label': 'Schließen', onclick: () => close() }, iconEl('close')),
    ),
    body,
    opts.footer ? h('div', { class: 'sheet-foot' }, opts.footer) : null,
  );
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    opts.onClose?.();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  // Tippen außerhalb schließt
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog, body };
}

/** Ja/Nein-Abfrage. */
export function confirmDialog(opts: {
  title: string;
  message: Child;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const sheet = openSheet({
      title: opts.title,
      content: typeof opts.message === 'string' ? h('p', null, opts.message) : opts.message,
      footer: [
        h('button', { class: 'btn', onclick: () => sheet.close() }, opts.cancelLabel ?? 'Abbrechen'),
        h(
          'button',
          {
            class: ['btn', opts.danger ? 'btn-danger' : 'btn-primary'],
            onclick: () => {
              result = true;
              sheet.close();
            },
          },
          opts.confirmLabel ?? 'OK',
        ),
      ],
      onClose: () => resolve(result),
    });
  });
}

/** Datei auswählen (öffnet die Dateiauswahl von iOS). */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    // iOS: „cancel“-Event wird nicht immer gefeuert – dann bleibt das Promise offen (unkritisch)
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
