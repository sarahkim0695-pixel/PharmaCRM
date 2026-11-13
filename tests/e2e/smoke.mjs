/**
 * End-to-End-Test im echten Browser (Chromium, iPad-Größe).
 *
 * Aufruf:  npm run build && npm run test:e2e
 * Optional: REAL_GEOCODE=1 → echte Adresssuche bei Nominatim statt Testdaten.
 *           SHOTS=pfad       → Bildschirmfotos in diesen Ordner schreiben.
 *           DEVICE='iPhone 13' → anderes Gerät (Standard: iPad quer).
 *
 * Braucht Playwright (npx playwright install chromium), ist aber nicht Teil von `npm test`.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixture = join(root, 'tests/fixtures/Beispiel-Praxisliste.xlsx');
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
/** Arbeitsdateien des Tests (wird von git ignoriert) */
const outDir = shots ?? join(root, 'test-results');
mkdirSync(outDir, { recursive: true });
const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;

// Testdaten für die Adresssuche (statt echter Nominatim-Anfragen)
const FAKE_COORDS = {
  'marienplatz 8': [48.1374, 11.5755],
  'leopoldstrasse 50': [48.1594, 11.5857],
  'altstadt 315': [48.5372, 12.1522],
  'rathausplatz 2|86150': [48.3689, 10.8986],
  'residenzplatz 8': [48.5745, 13.4641],
  'rathausplatz 2|85049': [48.7651, 11.4237],
  'rathausplatz 22': [47.7286, 10.3158],
  'konigstrasse 24': [47.8561, 12.1289],
  'karlsplatz 1': [48.1390, 11.5655],
  'ismaninger strasse 22': [48.1371, 11.5996],
};

/** Falscher Routing-Server: Fahrzeit aus Luftlinie (wie die Schätzung in der App) */
function fakeOsrm(url) {
  const coords = decodeURIComponent(url.split('/driving/')[1].split('?')[0]).split(';').map((c) => c.split(',').map(Number));
  const est = ([lng1, lat1], [lng2, lat2]) => {
    const R = 6371, rad = Math.PI / 180;
    const s = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
    const km = 2 * R * Math.asin(Math.sqrt(s)) * 1.3;
    const speed = km < 5 ? 25 : km < 20 ? 40 : km < 50 ? 60 : 75;
    return { sec: km < 0.05 ? 0 : ((km / speed) * 60 + 3) * 60, m: km * 1000 };
  };
  if (url.includes('/table/')) {
    return { code: 'Ok', durations: coords.map((a) => coords.map((b) => est(a, b).sec)), distances: coords.map((a) => coords.map((b) => est(a, b).m)) };
  }
  return { code: 'Ok', routes: [{ geometry: { coordinates: coords } }] };
}

function fakeNominatim(url) {
  const u = new URL(url);
  const street = (u.searchParams.get('street') ?? u.searchParams.get('q') ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  const plz = u.searchParams.get('postalcode') ?? (u.searchParams.get('q')?.match(/\d{5}/)?.[0] ?? '');
  for (const [key, [lat, lon]] of Object.entries(FAKE_COORDS)) {
    const [s, p] = key.split('|');
    if (street.includes(s) && (!p || p === plz)) {
      return [{ lat: String(lat), lon: String(lon), display_name: `${key}, Testtreffer`, place_rank: 30, address: { postcode: plz } }];
    }
  }
  return [];
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Vorschau-Server startet nicht');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch();
  const real = process.env.REAL_GEOCODE === '1';
  const context = await browser.newContext({ ...devices[process.env.DEVICE ?? 'iPad (gen 7) landscape'], serviceWorkers: real ? 'allow' : 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (real) {
    // Manche Firmen-/Test-Proxys blockieren „;“ im Pfad (OSRM-Format). Dann die echte Anfrage über curl stellen.
    await page.route('https://routing.openstreetmap.de/**', async (route) => {
      const { execFileSync } = await import('node:child_process');
      let body = '';
      for (let attempt = 1; attempt <= 4 && !body; attempt++) {
        try {
          body = execFileSync('curl', ['-sS', '-m', '30', route.request().url()], { encoding: 'utf8' });
        } catch {
          await new Promise((r) => setTimeout(r, attempt * 2000)); // Netz der Testumgebung wackelt manchmal
        }
      }
      await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });
    });
  }
  if (!real) {
    await page.route('https://routing.openstreetmap.de/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeOsrm(route.request().url())) }),
    );
    await page.route('https://nominatim.openstreetmap.org/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeNominatim(route.request().url())) }),
    );
  }
  const shot = async (name) => shots && page.screenshot({ path: join(shots, `${name}.png`) });

  // 1. Start: leere Karte
  await page.goto(BASE);
  await page.waitForSelector('.leaflet-container');
  await shot('01-start');

  // 2. Gebiet per PLZ-Liste festlegen
  await page.goto(`${BASE}#/gebiet`);
  await page.fill('textarea', '80331, 80333, 80802, 84028, 86150, 94032\n85049');
  await page.getByRole('button', { name: 'Hinzufügen' }).click();
  await page.waitForSelector('text=7 PLZ übernommen');
  assert.equal(await page.locator('.plz-chip').count(), 7);
  assert.match(await page.locator('.plz-chip').first().innerText(), /80331\s+München/);
  await shot('02-gebiet');

  // 3. Excel importieren
  await page.goto(`${BASE}#/import`);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Excel-Datei auswählen' }).click()]);
  await chooser.setFiles(fixture);
  await page.waitForSelector('text=Vorschau');
  const statsText = await page.locator('.stats').innerText();
  assert.match(statsText, /5\s*Orthopäden/);
  assert.match(statsText, /2\s*Hausärzte/);
  assert.match(statsText, /2\s*Zahnärzte & KFO/);
  assert.match(statsText, /2\s*Kliniken/);
  assert.match(statsText, /1\s*doppelte Zeilen aussortiert/);
  assert.match(statsText, /4\s*gelb/);
  // Öffnungszeiten aus der Datei: Quelle, Anzahl und Beispiele zum Prüfen
  const hoursText = await page.locator('.hours-preview').innerText();
  assert.match(hoursText, /Bei 7 von 11 Einträgen übernommen – aus Spalte „Öffnungszeiten“/);
  assert.match(hoursText, /Praxis Dr\. Anna Beispiel\s*Mo, Di, Do 08:00–12:00, 14:00–18:00/);
  assert.match(hoursText, /Nicht lesbar: 1/);
  await shot('03-import-vorschau');
  if (shots) {
    await page.locator('.hours-preview').scrollIntoViewIfNeeded();
    await shot('03b-import-oeffnungszeiten');
  }
  await page.getByRole('button', { name: 'Importieren' }).click();
  await page.waitForSelector('text=Import abgeschlossen');

  // 4. Adresssuche abwarten (max. 1 Anfrage/Sekunde → einige Sekunden)
  await page.getByRole('button', { name: 'Zur Karte' }).click();
  await page.waitForFunction(() => !document.querySelector('.map-progress') || document.querySelector('.map-progress')?.hasAttribute('hidden'), null, { timeout: real ? 240_000 : 90_000 });
  await page.waitForTimeout(800);
  // Beim Start nur Orthopäden (4 mit Adresse – „Praxis Unbekannt“ wurde nicht gefunden)
  const markerCount = () =>
    page.evaluate(() => document.querySelectorAll('.pin-wrap').length + [...document.querySelectorAll('.cluster')].reduce((n, c) => n + Number(c.textContent), 0));
  assert.equal(await page.locator('.map-kind.on').count(), 1);
  assert.match(await page.locator('.map-kind.on').innerText(), /Orthopäden/);
  assert.equal(await markerCount(), 4);
  await shot('04-karte-pins');

  // 5. Pin antippen → Kurzinfo
  await page.locator('.pin-wrap').first().click();
  await page.waitForSelector('.popup');
  assert.ok(await page.locator('.popup a', { hasText: 'Route' }).getAttribute('href').then((h) => h.startsWith('https://maps.apple.com/')));
  await shot('05-popup');
  await page.keyboard.press('Escape');

  // 5b. Karte: Hausärzte dazunehmen, dann nur Hausärzte; nach Neustart wieder nur Orthopäden
  // (herauszoomen, damit alle Pins im Ausschnitt liegen)
  await page.getByRole('button', { name: 'Verkleinern' }).click();
  await page.getByRole('button', { name: 'Verkleinern' }).click();
  await page.waitForTimeout(600);
  assert.equal(await markerCount(), 4);
  await page.locator('.map-kind', { hasText: 'Hausärzte' }).click();
  await page.waitForSelector('.map-kind.on:has-text("Hausärzte")');
  await page.waitForFunction(() => document.querySelectorAll('.map-kind.on').length === 2);
  await page.waitForTimeout(400);
  assert.equal(await markerCount(), 6);
  await shot('05b-karte-orthopaeden-hausaerzte');
  await page.locator('.map-kind', { hasText: 'Orthopäden' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.map-kind.on').length === 1);
  await page.waitForTimeout(400);
  assert.equal(await markerCount(), 2);
  await page.reload();
  await page.waitForSelector('.map-kind.on');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.map-kind.on').count(), 1);
  assert.match(await page.locator('.map-kind.on').innerText(), /Orthopäden/);

  // 6. Liste: Suche, Filter „prüfen“
  await page.goto(`${BASE}#/liste`);
  await page.waitForSelector('.prow');
  // Reiter: beim Start Orthopäden
  assert.match(await page.locator('.kind-tab.on').innerText(), /Orthopäden\s*5/);
  assert.match(await page.locator('.kind-tabs').innerText(), /Hausärzte\s*2[\s\S]*Zahnärzte & KFO\s*2[\s\S]*Kliniken\s*2/);
  assert.equal(await page.locator('.prow').count(), 5);
  assert.equal(await page.locator('.prow .badge-review').count(), 1); // Rosenheim
  await shot('06-liste');
  await page.locator('.kind-tab', { hasText: 'Hausärzte' }).click();
  await page.waitForSelector('.kind-tab.on:has-text("Hausärzte")');
  assert.equal(await page.locator('.prow').count(), 2);
  await shot('06b-liste-hausaerzte');
  // Suche findet „Passau“ (Zahnarzt) → Hinweis auf den anderen Reiter
  await page.fill('.search-input', 'passau');
  await page.getByRole('button', { name: 'Zahnärzte & KFO: 1' }).click();
  await page.waitForSelector('.kind-tab.on:has-text("Zahnärzte")');
  assert.equal(await page.locator('.prow').count(), 1);
  await page.fill('.search-input', '');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.prow').count(), 2); // Praxis am Dom + Praxis Allgäu (Kieferorthopädie)
  await page.locator('.kind-tab', { hasText: 'Orthopäden' }).click();
  await page.waitForSelector('.kind-tab.on:has-text("Orthopäden")');

  // 7. Nicht gefundene Praxis → Pin von Hand setzen
  await page.locator('.prow', { hasText: 'Praxis Unbekannt' }).click();
  await page.waitForSelector('text=Adresse wurde nicht gefunden');
  await shot('07-detail-nicht-gefunden');
  await page.getByRole('button', { name: 'Pin setzen' }).click();
  await page.waitForSelector('.map-banner:not([hidden])');
  const box = await page.locator('.map').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + 40);
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector('text=Pin wurde von Hand gesetzt');
  await shot('08-detail-pin-gesetzt');

  // 8. Gebiet auf der Karte bearbeiten
  await page.goto(`${BASE}#/karte/gebiet`);
  await page.waitForSelector('text=Gebiet bearbeiten');
  await page.waitForTimeout(500);
  await shot('09-gebiet-bearbeiten');

  // 9. Praxis anlegen
  await page.goto(`${BASE}#/praxis/neu`);
  await page.fill('input[name=name]', 'Testpraxis Neu');
  await page.fill('input[name=street]', 'Marienplatz 8');
  await page.fill('input[name=plz]', '80331');
  await page.waitForTimeout(300);
  assert.equal(await page.inputValue('input[name=city]'), 'München'); // Ort aus PLZ ergänzt
  assert.equal(await page.getByRole('radio', { name: 'Orthopädie' }).getAttribute('aria-checked'), 'true'); // vom Reiter
  await shot('09b-neuer-eintrag');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector('.detail-name:has-text("Testpraxis Neu")');

  // 10. Etappe 2: Besuch erfassen mit nächstem Termin
  await page.getByRole('button', { name: 'Besuch erfassen' }).click();
  await page.waitForSelector('text=Besuch erfassen');
  const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  await page.fill('input[list=dl-contacts]', 'Dr. Test');
  await page.fill('textarea', 'Produkt vorgestellt, Muster dagelassen.');
  await page.locator('input[type=date]').nth(1).fill(inThreeDays);
  await page.locator('input[type=time]').fill('14:30');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector('.visit-note:has-text("Muster dagelassen")');
  await page.waitForSelector('.appt-date');
  await shot('10-detail-besuch');

  // 11. Übersicht Besuche
  await page.goto(`${BASE}#/besuche`);
  await page.waitForSelector('.prow:has-text("Testpraxis Neu")'); // Tab „Termine“
  assert.match(await page.locator('.appt-side').first().innerText(), /14:30/);
  await shot('11-besuche-termine');
  await page.getByRole('tab', { name: 'Fällig' }).click();
  assert.equal(await page.locator('.plist .prow').count(), 5); // Orthopäden außer der gerade besuchten
  assert.match(await page.locator('.kind-tab.on').innerText(), /Orthopäden\s*5/);
  await shot('12-besuche-lange');
  await page.getByRole('tab', { name: 'Verlauf' }).click();
  await page.waitForSelector('.visit-practice:has-text("Testpraxis Neu")');

  // 12. Etappe 3: Produkte anlegen und bei einer Praxis eintragen
  await page.goto(`${BASE}#/produkte`);
  for (const name of ['Wundauflage A', 'Kompresse B']) {
    await page.fill('.add-row input', name);
    await page.getByRole('button', { name: 'Hinzufügen' }).click();
    await page.waitForSelector(`.prow-title:has-text("${name}")`);
  }
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', 'Testpraxis');
  await page.waitForTimeout(400);
  await page.locator('.prow', { hasText: 'Testpraxis Neu' }).click();
  await page.locator('[aria-label="Wundauflage A"] .seg-kauft').click();
  await page.locator('[aria-label="Kompresse B"] .seg-angeboten').click();
  await page.waitForSelector('[aria-label="Wundauflage A"] .seg-kauft.on');
  await page.waitForSelector('[aria-label="Kompresse B"] .seg-angeboten.on');
  assert.match(await page.locator('.card-title', { hasText: 'Produkte' }).innerText(), /kauft 1 · angeboten 1/);
  await shot('13-detail-produkte');
  await page.goto(`${BASE}#/produkte`);
  assert.match(await page.locator('.prow', { hasText: 'Wundauflage A' }).innerText(), /kauft: 1/);
  await shot('14-produkte');

  // 13. Etappe 4: Backup-Erinnerung, Export, alles löschen, Wiederherstellen
  assert.ok(await page.locator('.banner', { hasText: 'Noch kein Backup.' }).isVisible(), 'Backup-Erinnerung fehlt');
  await page.goto(`${BASE}#/backup`);
  await shot('15-backup');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup jetzt erstellen' }).click()]);
  const backupPath = join(outDir, 'test-backup.json');
  await download.saveAs(backupPath);
  assert.match(download.suggestedFilename(), /^RepMap-Backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse((await import('node:fs')).readFileSync(backupPath, 'utf8'));
  assert.equal(backup.practices.length, 12);
  assert.equal(backup.products.length, 2);
  await page.waitForSelector('.banner', { state: 'detached' });

  await page.goto(`${BASE}#/mehr`);
  await page.getByRole('button', { name: 'Alle Daten löschen' }).click();
  await page.getByRole('button', { name: 'Alles löschen' }).click();
  await page.getByRole('button', { name: 'Ja, löschen' }).click();
  await page.waitForSelector('text=Willkommen bei RepMap');
  await page.goto(`${BASE}#/liste`);
  await page.waitForSelector('text=Noch keine Praxen');

  await page.goto(`${BASE}#/backup`);
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Backup-Datei wählen' }).click()]);
  await chooser2.setFiles(backupPath);
  await page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await page.waitForSelector('text=Backup wiederhergestellt');
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', '');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.prow').count(), 6); // Orthopäden inkl. Testpraxis
  await page.locator('.prow', { hasText: 'Testpraxis Neu' }).click();
  await page.waitForSelector('[aria-label="Wundauflage A"] .seg-kauft.on');
  await page.waitForSelector('.visit-note:has-text("Muster dagelassen")');
  (await import('node:fs')).rmSync(backupPath);

  // 14. Öffnungszeiten aus der Excel in der Praxis-Ansicht
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', 'Anna');
  await page.waitForTimeout(400);
  await page.locator('.prow', { hasText: 'Anna Beispiel' }).click();
  await page.waitForSelector('.hours-table');
  assert.match(await page.locator('.hours-table').innerText(), /Mo\s+08:00–12:00, 14:00–18:00/);
  assert.match(await page.locator('.duration-row').innerText(), /10 min[\s\S]*Parken[\s\S]*20 min[\s\S]*vor Ort/);
  await shot('16-detail-oeffnungszeiten');

  // 14b. Kundenstatus und Besuchsintervall setzen
  assert.match(await page.locator('.state-btn.on').innerText(), /Bestellender Kunde/); // aus „Kunde“ in der Excel
  await page.locator('.state-btn', { hasText: 'In den Startlöchern' }).click();
  await page.waitForSelector('.state-btn.on:has-text("In den Startlöchern")');
  await page.getByRole('button', { name: '6 Wochen', exact: true }).click();
  await page.waitForSelector('.chip-toggle.on:has-text("6 Wochen")');
  assert.match(await page.locator('.due-line').innerText(), /noch nie besucht/);
  await shot('16b-kundenstatus');
  await page.fill('.search-input', '').catch(() => {});

  // 15. Tourplanung: Startadresse festlegen
  await page.goto(`${BASE}#/einstellungen`);
  await page.fill('input[autocomplete="street-address"]', 'Karlsplatz 1, 80335 München');
  await page.getByRole('button', { name: 'Suchen & speichern' }).click();
  await page.waitForSelector('text=Startadresse gespeichert');

  // 16. Tour für den nächsten Dienstag planen
  const d = new Date();
  do d.setDate(d.getDate() + 1); while (d.getDay() !== 2);
  const tuesday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.goto(`${BASE}#/tour/${tuesday}`);
  await page.waitForSelector('text=Noch keine Praxen');
  await page.getByRole('button', { name: 'Praxen auswählen' }).click();
  await page.waitForSelector('.pick');
  await page.locator('dialog .chip-toggle', { hasText: 'Hausärzte' }).click(); // Hausärzte dazunehmen
  const picks = page.locator('.pick:not(.already)');
  for (let i = 0; i < 6; i++) await picks.nth(i).click();
  await page.getByRole('button', { name: /Übernehmen \(6\)/ }).click();
  assert.equal(await page.locator('.stop').count(), 6);
  await page.getByRole('button', { name: 'Tour berechnen' }).click();
  await page.waitForSelector('.timeline', { timeout: 30_000 });
  const visitsPlanned = await page.locator('.tl-visit').count();
  assert.ok(visitsPlanned >= 4, `nur ${visitsPlanned} Besuche eingeplant`);
  assert.ok(await page.locator('.tl-break').count() === 1, 'Mittagspause fehlt');
  assert.match(await page.locator('.tl-point').first().innerText(), /Abfahrt Zuhause/);
  assert.equal(await page.locator('text=Fahrzeiten nur geschätzt').count(), 0, 'Routing-Server nicht erreicht');
  await shot('17-tour-plan');
  if (shots) await page.locator('.timeline').screenshot({ path: join(shots, '18-tour-zeitplan.png') }).catch(() => {});

  // 17. Tour auf der Karte
  await page.getByRole('button', { name: 'Auf Karte zeigen' }).click();
  await page.waitForSelector('.tour-pin');
  assert.equal(await page.locator('.tour-pin').count(), visitsPlanned);
  await page.waitForTimeout(600);
  await shot('19-tour-karte');

  // 18. „Zur Tour“ aus der Kurzinfo einer Praxis
  await page.goto(`${BASE}#/karte`);
  await page.waitForTimeout(500);

  // 19. Doppelte Standorte prüfen
  await page.goto(`${BASE}#/doppelte`);
  await page.waitForSelector('.dup-card');
  assert.equal(await page.locator('.dup-card').count(), 2); // Landshut (Praxis + Klinik) und Marienplatz 8
  await shot('20-doppelte');
  // Landshut: verschiedene Einrichtungen
  await page.locator('.dup-card', { hasText: 'Klinik am Rathaus' }).getByRole('button', { name: 'Sind verschieden' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.dup-card').length === 1);
  // Marienplatz: zusammenführen (Testpraxis Neu hat Besuch + Produkte → bleibt)
  const card = page.locator('.dup-card', { hasText: 'Testpraxis Neu' });
  assert.match(await card.locator('.dup-item.keep').innerText(), /Testpraxis Neu/);
  await card.getByRole('button', { name: 'Zusammenführen' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Zusammenführen' }).click();
  await page.waitForSelector('text=Keine doppelten Standorte');
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', '');
  await page.waitForTimeout(400);
  assert.equal(await page.locator('.prow').count(), 5);
  assert.equal(await page.locator('.prow', { hasText: 'Anna Beispiel' }).count(), 0);

  // 20. Klinik von Hand anlegen
  await page.goto(`${BASE}#/praxis/neu`);
  await page.getByRole('radio', { name: 'Klinik', exact: true }).click();
  await page.fill('input[name=name]', 'Kreisklinik Test');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.waitForSelector('.page-head h1:has-text("Klinik")');

  // 21. Tour per Region vorschlagen lassen + Packliste
  const d2 = new Date();
  do d2.setDate(d2.getDate() + 1); while (d2.getDay() !== 3); // nächster Mittwoch
  const wednesday = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
  await page.goto(`${BASE}#/tour/${wednesday}`);
  await page.getByRole('button', { name: 'Ort / Region wählen' }).click();
  await page.fill('dialog input[type=search]', 'Landshut');
  await page.locator('dialog .pick', { hasText: 'Landshut' }).click();
  await page.locator('dialog').getByRole('button', { name: /Übernehmen/ }).click();
  await page.selectOption('.radius-select', '30');
  await page.getByRole('button', { name: 'Tour vorschlagen' }).click();
  await page.waitForSelector('.timeline', { timeout: 30_000 });
  assert.ok((await page.locator('.tl-visit').count()) >= 1, 'keine Besuche vorgeschlagen');
  assert.match(await page.locator('.stop-why').first().innerText(), /Kunde|Startlöchern|Kontakt/);
  // Mitbringen + Tagesnotiz → Packliste
  await page.locator('.bring-input').first().fill('Katalog, Muster A');
  await page.locator('.bring-input').first().blur();
  await page.waitForSelector('.pack-item');
  await page.fill('.pack-card textarea', 'Visitenkarten');
  await page.locator('.pack-card textarea').blur();
  await page.waitForFunction(() => document.querySelectorAll('.pack-item').length === 3);
  await page.locator('.pack-item', { hasText: 'Visitenkarten' }).click();
  await page.waitForSelector('.pack-card summary:has-text("1 von 3 eingepackt")');
  assert.match(await page.locator('.tl-bring').first().innerText(), /Katalog, Muster A/);
  await shot('21-tour-region-packliste');

  // 22. Feste Praxis + passende Besuche ergänzen
  await page.goto(`${BASE}#/tour/${tuesday}`);
  await page.getByRole('button', { name: 'Passende Besuche ergänzen' }).click();
  // In den Beispieldaten liegt evtl. nichts Passendes mehr in der Nähe – dann kommt ein Hinweis
  await page.waitForSelector('.timeline, .toast:has-text("Keine passenden")', { timeout: 30_000 });

  // 23. Veranstaltung anlegen → gilt für alle Praxen
  await page.goto(`${BASE}#/mehr`);
  await page.waitForSelector('a[href="#/veranstaltungen"]');
  await page.goto(`${BASE}#/veranstaltungen`);
  await page.waitForSelector('text=Noch keine Veranstaltungen');
  await page.fill('input[placeholder^="z. B. Wundforum"]', 'Wundforum Augsburg');
  await page.fill('form input[type=date]', wednesday);
  await page.fill('form input[placeholder="optional"]', 'Augsburg');
  await page.getByRole('button', { name: 'Veranstaltung anlegen' }).click();
  await page.waitForSelector('.prow-title:has-text("Wundforum Augsburg")');
  assert.match(await page.locator('.prow', { hasText: 'Wundforum' }).innerText(), /noch nicht angefragt: 12/);
  // bei einer Praxis „Interesse“ einstellen
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', 'Testpraxis');
  await page.waitForTimeout(400);
  await page.locator('.prow', { hasText: 'Testpraxis Neu' }).click();
  await page.locator('[aria-label="Wundforum Augsburg"] .seg-ev-interesse').click();
  await page.waitForSelector('[aria-label="Wundforum Augsburg"] .seg-ev-interesse.on');
  await shot('23-detail-veranstaltung');
  await page.goto(`${BASE}#/veranstaltungen`);
  assert.match(await page.locator('.prow', { hasText: 'Wundforum' }).innerText(), /Interesse: 1[\s\S]*noch nicht angefragt: 11/);
  if (shots) await page.waitForSelector('.toast', { state: 'detached', timeout: 8000 }).catch(() => {});
  await shot('23-veranstaltungen');
  // „noch nicht angefragt“ als Liste anzeigen
  await page.locator('.prow', { hasText: 'Wundforum' }).click();
  await page.locator('dialog').getByRole('button', { name: /noch nicht angefragt \(11\)/ }).click();
  await page.waitForSelector('.chip:has-text("Wundforum Augsburg: noch nicht angefragt")');
  assert.equal(await page.locator('.prow').count(), 4); // Orthopäden ohne Testpraxis
  assert.equal(await page.locator('.prow', { hasText: 'Testpraxis Neu' }).count(), 0);

  // 24. Mehrere bearbeiten: Status + Intervall für alle angezeigten
  await page.getByRole('button', { name: 'Mehrere bearbeiten' }).click();
  await page.locator('dialog .chip-toggle', { hasText: 'In den Startlöchern' }).click();
  await page.locator('dialog select').selectOption('21');
  await shot('24-mehrere-bearbeiten');
  await page.locator('dialog').getByRole('button', { name: 'Übernehmen' }).click();
  await page.locator('dialog', { hasText: '4 Einträge werden geändert' }).getByRole('button', { name: 'Übernehmen' }).click();
  await page.waitForSelector('.toast:has-text("4 Einträge geändert")');
  await page.locator('.prow').first().click();
  await page.waitForSelector('.state-btn.on:has-text("In den Startlöchern")');
  await page.waitForSelector('.chip-toggle.on:has-text("3 Wochen")');

  // 25. Tour: Hinweis „Noch anfragen“ bei Besuchen vor der Veranstaltung
  await page.goto(`${BASE}#/tour/${wednesday}`);
  await page.waitForSelector('.tl-ask:has-text("Wundforum Augsburg")', { timeout: 30_000 });
  await page.locator('.tl-ask').first().scrollIntoViewIfNeeded();
  await shot('25-tour-anfragen');

  // 26. Hausarzt „Auf Karte“ → Gruppe wird auf der Karte eingeblendet, Pin mit „H“
  await page.goto(`${BASE}#/liste`);
  await page.fill('.search-input', '');
  await page.locator('.chip', { hasText: 'Wundforum' }).click().catch(() => {});
  await page.locator('.kind-tab', { hasText: 'Hausärzte' }).click();
  await page.locator('.prow', { hasText: 'Hausarztpraxis Muster' }).click();
  await page.waitForSelector('.page-head h1:has-text("Hausarzt")');
  await page.getByRole('button', { name: 'Auf Karte' }).click();
  await page.waitForSelector('.popup-title:has-text("Hausarztpraxis Muster")');
  assert.match(await page.locator('.popup-sub').innerText(), /Hausarzt · Innere Medizin/);
  assert.ok(await page.locator('.map-kind.on', { hasText: 'Hausärzte' }).count(), 'Hausärzte nicht eingeblendet');
  assert.ok(await page.locator('.pin-letter').count() >= 1, 'kein Pin mit Buchstabe');
  await shot('26-karte-hausarzt');

  // 27. Sprachsteuerung (hier getippt – auf dem iPad gesprochen)
  await page.goto(`${BASE}#/tour/${tuesday}`);
  await page.getByRole('button', { name: /Per Sprache planen/ }).click();
  await page.waitForSelector('.voice-examples');
  await shot('27-sprache-start');
  await page.fill(
    '.voice-text',
    'Donnerstag Tour in Landshut, Orthopädie am Rathaus um 10 Uhr fest, auch Kliniken, Rest auffüllen, Mittagspause halb eins, maximal 4 Besuche, Muster A für Orthopädie am Rathaus mitnehmen',
  );
  await page.waitForSelector('.voice-list');
  const understood = await page.locator('.voice-list').innerText();
  for (const re of [/Tour für Donnerstag/, /Landshut \+ 10 km Umkreis/, /Orthopädie am Rathaus – fest, Termin 10:00 Uhr/, /Zusätzlich Kliniken/, /Mittagspause 12:30–13:15/, /max\. 4 Besuche/, /Muster A → Orthopädie am Rathaus/, /Mit passenden Besuchen auffüllen/]) {
    assert.match(understood, re);
  }
  assert.equal(await page.locator('.voice-preview', { hasText: 'Nicht verstanden' }).count(), 0);
  await shot('27b-sprache-vorschau');
  await page.locator('dialog').getByRole('button', { name: 'Ausführen' }).click();
  await page.waitForSelector('.page-head:has-text("Donnerstag")', { timeout: 30_000 });
  await page.waitForSelector('.timeline', { timeout: 30_000 });
  assert.match(await page.locator('.timeline').innerText(), /Orthopädie am Rathaus/);
  await page.waitForSelector('.tl-bring:has-text("Muster A")');
  await page.waitForSelector('.toast:has-text("Tour für Donnerstag")');
  await shot('27c-sprache-ergebnis');

  // 28. Längerer Termin: Dauer vor Ort bei einem Besuch erhöhen (nur für diesen Tag)
  await page.goto(`${BASE}#/tour/${tuesday}`);
  const visitRow = page.locator('.stop-visit').first();
  const before = await visitRow.locator('.stop-visit-value').innerText();
  for (let i = 0; i < 3; i++) await visitRow.locator('.step-btn').last().click();
  await page.waitForFunction((b) => document.querySelector('.stop-visit .stop-visit-value')?.textContent !== b, before);
  await page.waitForSelector('.stop-visit.longer .link-btn:has-text("Standard")');
  const longer = await page.locator('.stop-visit.longer .stop-visit-value').first().innerText();
  await page.getByRole('button', { name: /Tour berechnen|Neu berechnen/ }).click();
  await page.waitForSelector('.timeline', { timeout: 30_000 });
  await page.waitForSelector('.tl-visit .badge:has-text("länger eingeplant")');
  assert.match(await page.locator('.tl-visit', { hasText: 'länger eingeplant' }).first().innerText(), new RegExp(`${longer} vor Ort`));
  await page.locator('.stop-visit.longer').first().scrollIntoViewIfNeeded();
  await shot('28-laengerer-termin');

  assert.deepEqual(errors, [], `JavaScript-Fehler: ${errors.join('; ')}`);
  console.log('✔ E2E-Test erfolgreich');
} catch (err) {
  // Bildschirmfoto vom Fehlerzustand
  const pages = browser?.contexts()[0]?.pages() ?? [];
  if (pages[0]) await pages[0].screenshot({ path: join(outDir, 'e2e-fehler.png') }).catch(() => {});
  throw err;
} finally {
  await browser?.close();
  server.kill();
}
