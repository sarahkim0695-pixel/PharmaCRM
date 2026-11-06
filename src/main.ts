/** Einstiegspunkt: Daten laden, App starten, Offline-Funktion (Service Worker) registrieren. */
import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { startApp } from './app';
import { requestPersistentStorage } from './db/database';
import { geocodeQueue } from './geo/geocoder';
import { store } from './state/store';
import { toast } from './ui/toast';

async function main() {
  const root = document.getElementById('app')!;
  try {
    await store.load();
  } catch (err) {
    console.error(err);
    root.innerHTML =
      '<div class="fatal"><h1>RepMap konnte nicht starten</h1><p>Der lokale Speicher ist nicht verfügbar. Bitte Safari nicht im privaten Modus verwenden.</p></div>';
    return;
  }
  startApp(root);
  void requestPersistentStorage();

  // Offene Adresssuchen fortsetzen
  if (geocodeQueue.pendingCount()) setTimeout(() => geocodeQueue.start(), 1500);

  // Offline-Fähigkeit + Hinweis bei neuer Version
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('Neue Version von RepMap verfügbar', {
        action: 'Aktualisieren',
        onAction: () => void updateSW(true),
        duration: 20000,
      });
    },
    onOfflineReady() {
      toast('RepMap funktioniert jetzt auch offline', { kind: 'success' });
    },
  });
}

void main();
