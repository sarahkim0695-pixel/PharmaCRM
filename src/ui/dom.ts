/**
 * Kleiner Helfer zum Erzeugen von HTML-Elementen ohne Framework.
 *
 *   h('button', { class: 'btn', onclick: () => … }, 'Speichern')
 *
 * Eigenschaften, die mit „on“ beginnen, werden als Event-Listener gesetzt,
 * `class`, `style` und `dataset` werden gesondert behandelt, alles andere
 * wird als Attribut bzw. Property gesetzt.
 */
export type Child = Node | string | number | null | undefined | false | Child[];

type Props = {
  class?: string | (string | false | null | undefined)[];
  style?: string | Partial<Record<string, string>>;
  dataset?: Record<string, string>;
  [key: string]: unknown;
};

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') {
        el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
      } else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else for (const [sk, sv] of Object.entries(v as Record<string, string>)) el.style.setProperty(sk, sv);
      } else if (k === 'dataset') {
        Object.assign(el.dataset, v);
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k === 'html') {
        el.innerHTML = String(v); // nur für vertrauenswürdige Inhalte (z. B. Icons)
      } else if (k in el && k !== 'list' && k !== 'form') {
        (el as unknown as Record<string, unknown>)[k] = v === true ? true : v;
      } else {
        el.setAttribute(k, v === true ? '' : String(v));
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(parent, c);
    else parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** Ersetzt den Inhalt eines Elements. */
export function setChildren(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** Verzögert eine Funktion (z. B. bei Eingaben in ein Suchfeld). */
export function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
