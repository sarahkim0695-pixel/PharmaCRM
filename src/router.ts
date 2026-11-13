/**
 * Einfache Navigation über den Teil der Adresse nach „#“ (z. B. #/liste).
 * Funktioniert ohne Server-Konfiguration – ideal für GitHub Pages.
 */
export interface Route {
  name: RouteName;
  params: Record<string, string>;
  /** Zusatzangaben nach „?“, z. B. #/liste?suche */
  query: URLSearchParams;
  path: string;
}

export type RouteName =
  | 'map'
  | 'map-practice'
  | 'map-pin'
  | 'map-territory'
  | 'map-tour'
  | 'list'
  | 'practice'
  | 'practice-edit'
  | 'practice-new'
  | 'visit-new'
  | 'visit-edit'
  | 'visits'
  | 'more'
  | 'territory'
  | 'import'
  | 'products'
  | 'backup'
  | 'settings'
  | 'help'
  | 'tour'
  | 'duplicates'
  | 'events';

const ROUTES: [RegExp, RouteName, string[]][] = [
  [/^\/karte\/?$/, 'map', []],
  [/^\/karte\/praxis\/([^/]+)$/, 'map-practice', ['id']],
  [/^\/karte\/pin\/([^/]+)$/, 'map-pin', ['id']],
  [/^\/karte\/gebiet$/, 'map-territory', []],
  [/^\/karte\/tour\/(\d{4}-\d{2}-\d{2})$/, 'map-tour', ['date']],
  [/^\/liste$/, 'list', []],
  [/^\/praxis\/neu$/, 'practice-new', []],
  [/^\/praxis\/([^/]+)\/bearbeiten$/, 'practice-edit', ['id']],
  [/^\/praxis\/([^/]+)\/besuch\/neu$/, 'visit-new', ['id']],
  [/^\/praxis\/([^/]+)$/, 'practice', ['id']],
  [/^\/besuch\/([^/]+)$/, 'visit-edit', ['visitId']],
  [/^\/besuche$/, 'visits', []],
  [/^\/mehr$/, 'more', []],
  [/^\/gebiet$/, 'territory', []],
  [/^\/import$/, 'import', []],
  [/^\/produkte$/, 'products', []],
  [/^\/backup$/, 'backup', []],
  [/^\/einstellungen$/, 'settings', []],
  [/^\/hilfe$/, 'help', []],
  [/^\/doppelte$/, 'duplicates', []],
  [/^\/veranstaltungen$/, 'events', []],
  [/^\/tour$/, 'tour', []],
  [/^\/tour\/(\d{4}-\d{2}-\d{2})$/, 'tour', ['date']],
];

export function parseHash(hash: string): Route {
  const full = decodeURI(hash.replace(/^#/, '')) || '/karte';
  const [path, qs] = full.split('?');
  const query = new URLSearchParams(qs ?? '');
  for (const [re, name, keys] of ROUTES) {
    const m = path.match(re);
    if (m) {
      const params: Record<string, string> = {};
      keys.forEach((k, i) => (params[k] = m[i + 1]));
      return { name, params, query, path };
    }
  }
  return { name: 'map', params: {}, query, path: '/karte' };
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const hash = `#${path}`;
  if (opts.replace) {
    history.replaceState(history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash !== hash) {
    location.hash = hash;
  }
}

/** Zurück – oder zur angegebenen Seite, falls es kein „Zurück“ gibt. */
export function goBack(fallback: string): void {
  if (history.length > 1 && sessionStorage.getItem('repmap.navigated') === '1') history.back();
  else navigate(fallback, { replace: true });
}

export function onRouteChange(fn: (r: Route) => void): void {
  window.addEventListener('hashchange', () => {
    try {
      sessionStorage.setItem('repmap.navigated', '1');
    } catch {
      /* egal */
    }
    fn(currentRoute());
  });
}
