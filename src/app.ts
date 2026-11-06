/**
 * Das Grundgerüst der App: Karte, wechselnde Seiten und die Tab-Leiste unten.
 * Hier wird festgelegt, welche Seite zu welcher Adresse (#/…) gehört.
 */
import { MapView } from './map/map-view';
import { currentRoute, navigate, onRouteChange, type Route, type RouteName } from './router';
import { h, setChildren } from './ui/dom';
import { iconEl } from './ui/icons';
import type { View } from './views/common';
import { importView } from './views/import-view';
import { listView } from './views/list-view';
import { helpView, moreView, settingsView } from './views/more-view';
import { practiceView, registerDetailSection } from './views/practice-detail';
import { practiceFormView } from './views/practice-form';
import { territoryView } from './views/territory-view';
import { visitFormView } from './views/visit-form';
import { appointmentSection, visitsSection } from './views/visits-section';
import { visitsView } from './views/visits-view';
import { productsSection, productsView } from './views/products-view';
import { backupView, startBackupReminder } from './views/backup-view';

/** Seiten-Fabriken je Route. Neue Seiten hier eintragen. */
const PAGES: Partial<Record<RouteName, (r: Route) => View>> = {
  list: listView,
  practice: practiceView,
  'practice-new': practiceFormView,
  'practice-edit': practiceFormView,
  more: moreView,
  territory: territoryView,
  import: importView,
  settings: settingsView,
  help: helpView,
  visits: visitsView,
  'visit-new': visitFormView,
  'visit-edit': visitFormView,
  products: productsView,
  backup: backupView,
};

/** Abschnitte der Praxis-Detailansicht (Reihenfolge = Anzeige). */
registerDetailSection(appointmentSection);
registerDetailSection(visitsSection);
registerDetailSection(productsSection);

/** Weitere Seiten (Besuche, Produkte, Backup) melden sich hier an. */
export function registerPage(name: RouteName, factory: (r: Route) => View): void {
  PAGES[name] = factory;
}

type Tab = 'map' | 'list' | 'visits' | 'more';

const TAB_OF: Record<RouteName, Tab> = {
  map: 'map',
  'map-practice': 'map',
  'map-pin': 'map',
  'map-territory': 'map',
  list: 'list',
  practice: 'list',
  'practice-edit': 'list',
  'practice-new': 'list',
  'visit-new': 'visits',
  'visit-edit': 'visits',
  visits: 'visits',
  more: 'more',
  territory: 'more',
  import: 'more',
  products: 'more',
  backup: 'more',
  settings: 'more',
  help: 'more',
};

/** Banner-Bereich oben (z. B. Backup-Erinnerung) */
export const bannerSlot = h('div', { class: 'app-banner' });

export function startApp(root: HTMLElement): void {
  const mapSection = h('section', { class: 'view-map' });
  const pageScroll = h('section', { class: 'page-scroll' });
  const tabs: Record<Tab, HTMLAnchorElement> = {
    map: tabLink('#/karte', 'map', 'Karte'),
    list: tabLink('#/liste', 'list', 'Praxen'),
    visits: tabLink('#/besuche', 'calendar', 'Besuche'),
    more: tabLink('#/mehr', 'more', 'Mehr'),
  };
  const tabbar = h('nav', { class: 'tabbar' }, Object.values(tabs));
  setChildren(root, h('div', { class: 'app' }, bannerSlot, h('main', { class: 'app-main' }, mapSection, pageScroll), tabbar));

  const mapView = new MapView(mapSection);
  startBackupReminder(bannerSlot);
  let current: View | null = null;

  function show(route: Route) {
    current?.destroy?.();
    current = null;
    const tab = TAB_OF[route.name];
    Object.entries(tabs).forEach(([t, a]) => a.classList.toggle('active', t === tab));
    const isMap = route.name.startsWith('map');
    document.body.classList.toggle('editing', route.name === 'map-territory' || route.name === 'map-pin');

    if (isMap) {
      pageScroll.hidden = true;
      mapSection.hidden = false;
      setChildren(pageScroll);
      mapView.show();
      if (route.name === 'map-practice') mapView.setMode({ kind: 'focus', practiceId: route.params.id });
      else if (route.name === 'map-pin') mapView.setMode({ kind: 'pin', practiceId: route.params.id });
      else if (route.name === 'map-territory') mapView.setMode({ kind: 'territory' });
      else mapView.setMode({ kind: 'normal' });
      if (route.query.has('fit')) setTimeout(() => mapView.fitAll(), 300);
      return;
    }

    mapView.hide();
    mapSection.hidden = true;
    pageScroll.hidden = false;
    const factory = PAGES[route.name];
    if (!factory) {
      navigate('/karte', { replace: true });
      return;
    }
    current = factory(route);
    setChildren(pageScroll, current.el);
    if (!['list'].includes(route.name)) pageScroll.scrollTop = 0;
  }

  onRouteChange(show);
  show(currentRoute());
}

function tabLink(href: string, icon: string, label: string): HTMLAnchorElement {
  return h('a', { class: 'tab', href }, iconEl(icon, 26), h('span', null, label));
}
