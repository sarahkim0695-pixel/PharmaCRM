# RepMap

**Gebietskarte, Praxen, Besuche und Produkte für den Außendienst** – als Web-App (PWA) für iPad und iPhone.
Alle Daten bleiben auf dem Gerät. Es gibt keinen Server und keine Datenbank im Internet.

| Funktion | Was sie kann |
| --- | --- |
| 🗺️ **Gebietskarte** | Dein Gebiet als gelbe PLZ-Flächen (Ober-/Niederbayern, Schwaben). PLZ per Antippen oder als Liste hinzufügen/entfernen. |
| 📋 **Praxen** | Excel-Import (`.xlsx`), automatische Adresssuche, gelb markierte Zeilen erscheinen als **„prüfen“**. Pin von Hand setzen, wenn eine Adresse nicht gefunden wird. |
| 📍 **Pins** | Farbe nach Status (Kunde = grün, kein Kunde = rot, weitere Status mit eigener Farbe). Antippen: Kurzinfo, Route in Apple Karten, Details. |
| 🔎 **Liste** | Suchen, filtern (Status, Ort, Fachrichtung, PLZ, „prüfen“, Produkt …), sortieren (auch „in der Nähe“). Praxen anlegen, bearbeiten, löschen. |
| 📝 **Besuche** | Besuche mit Datum, Ansprechpartner und Notiz. Nächster Termin. Übersicht „Termine“, „lange nicht besucht“, „Verlauf“. |
| 📦 **Produkte** | Eigene Produktliste. Pro Praxis: „angeboten“ oder „kauft“. |
| 🛡️ **Backup** | Alle Daten als Datei sichern und wiederherstellen. Erinnerung, wenn ein Backup fällig ist. |

---

## Teil 1: Für dich – App einrichten und benutzen

### Schritt 1: Die App im Internet veröffentlichen (einmalig, ca. 5 Minuten)

Die App wird kostenlos über **GitHub Pages** bereitgestellt. Das musst du nur ein einziges Mal einschalten:

1. Öffne auf GitHub dein Repository **PharmaCRM**.
2. Tippe oben auf **Settings** (Zahnrad). Am iPhone ggf. erst auf „…“ tippen.
3. Links im Menü: **Pages**.
4. Unter **Build and deployment** → **Source** wählst du **GitHub Actions**.
5. Oben auf **Actions** wechseln. Dort steht der Eintrag **„Veröffentlichen (GitHub Pages)“**.
   - Ist er rot (fehlgeschlagen, weil Pages vorher noch aus war): anklicken → **Re-run all jobs**.
   - Nach 1–2 Minuten wird er grün ✅.
6. Deine App ist jetzt erreichbar unter:
   **https://sarahkim0695-pixel.github.io/PharmaCRM/**

> Ab jetzt wird die App bei jeder Änderung auf dem Branch `main` automatisch neu veröffentlicht.
> In der App erscheint dann „Neue Version verfügbar – Aktualisieren“.

### Schritt 2: Auf dem iPad installieren

1. Die Adresse oben in **Safari** öffnen (nicht Chrome).
2. Auf **Teilen** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm“** → **Hinzufügen**.
4. RepMap ab jetzt **immer über das neue Symbol** öffnen – sie startet dann im Vollbild wie eine normale App.

> ⚠️ **Wichtig:** Die App vom Home-Bildschirm hat einen **eigenen Speicher**, getrennt von Safari.
> Daten, die du in Safari importierst, siehst du nicht in der Home-Bildschirm-App (und umgekehrt).
> Also: erst installieren, dann in der installierten App importieren.

Auf dem iPhone geht es genauso. iPad und iPhone haben aber **jeweils eigene Daten** – um den Stand zu übertragen, auf dem einen Gerät ein Backup erstellen und auf dem anderen wiederherstellen.

### Schritt 3: Gebiet festlegen

**Mehr → Mein Gebiet**
- **Auf der Karte bearbeiten:** PLZ-Flächen antippen = hinzufügen/entfernen (gelb = dein Gebiet). Mit „Fertig“ beenden.
- **PLZ-Liste einfügen:** z. B. aus Excel kopierte PLZ einfügen → „Hinzufügen“. Trennzeichen sind egal.

Enthalten sind alle PLZ von Oberbayern, Niederbayern und Schwaben (inkl. Kleinwalsertal und Jungholz mit deutscher PLZ).
Fehlt eine PLZ, lädt die App die Fläche bei Internetverbindung automatisch nach – ausschließlich aus Deutschland.

### Schritt 4: Praxisliste importieren

**Mehr → Excel importieren → Excel-Datei auswählen** (z. B. aus „Dateien“ / iCloud Drive).

So muss die Tabelle aussehen (Reihenfolge egal, Überschriften dürfen auch etwas tiefer stehen):

| Praxis | Fachrichtung | Straße | PLZ | Ort | Status | Hinweis |
| --- | --- | --- | --- | --- | --- | --- |
| Praxis Dr. Muster | Allgemeinmedizin | Hauptstr. 5 | 80331 | München | Kunde | … |

- Eine Spalte **Telefon** wird zusätzlich übernommen, wenn vorhanden.
- **Gelb hinterlegte Zeilen** (auch hellgelb oder goldgelb, ganze Zeile oder einzelne Zelle) werden als **„prüfen“** markiert.
  In der Praxis-Ansicht kannst du sie später mit **„Geprüft“** bestätigen.
- Die Datei muss im Format **.xlsx** sein (in Excel: *Speichern unter → Excel-Arbeitsmappe*).
- **Erneuter Import** (z. B. aktualisierte Liste): vorhandene Praxen werden aktualisiert, neue kommen dazu.
  Besuche, Produkte und Pins bleiben erhalten. Praxen, die nicht mehr in der Liste stehen, werden nur gelöscht, wenn du das ausdrücklich ankreuzt.

Nach dem Import sucht die App die Adressen auf der Karte (über OpenStreetMap, **höchstens 1 Adresse pro Sekunde** – bei 300 Praxen also ca. 5–10 Minuten). Lass die App dabei geöffnet; sonst macht sie beim nächsten Öffnen weiter.
Nicht gefundene Adressen findest du unter **Mehr → Adresssuche** oder in der Liste mit dem Filter „Standort fehlt oder ungenau“. Dort tippst du auf **„Pin setzen“** und dann auf die richtige Stelle in der Karte.

### Schritt 5: Backup – regelmäßig!

Weil alle Daten nur auf deinem iPad liegen, ist ein Backup sehr wichtig:

**Mehr → Backup → Backup jetzt erstellen → „In Dateien sichern“ → iCloud Drive → Sichern**

Die App erinnert dich mit einem gelben Hinweis oben, wenn das letzte Backup älter als 7 Tage ist (einstellbar unter *Mehr → Einstellungen*).
Wiederherstellen: **Mehr → Backup → Backup-Datei wählen**.

### Gut zu wissen

- **Offline:** Karte (bereits angesehene Ausschnitte), Gebiet, Pins, Liste, Besuche und Produkte funktionieren ohne Internet. Adresssuche und neue Kartenausschnitte brauchen Internet.
- **Datenschutz:** Für die Adresssuche werden nur Straße, PLZ und Ort an OpenStreetMap geschickt – keine Praxisnamen, keine Notizen.
- **Dein Repository ist öffentlich.** Der Programmcode ist für alle sichtbar – deine Daten aber nicht, die liegen nur auf deinem Gerät.
  **Lade deine Excel-Datei und Backup-Dateien deshalb nie ins Repository hoch.**
- Die Datei `tests/fixtures/Beispiel-Praxisliste.xlsx` enthält **erfundene** Praxen zum Ausprobieren.

---

## Teil 2: Für Entwickler

### Technik

- **Vite + TypeScript** (ohne UI-Framework, kleiner Helfer `h()` in `src/ui/dom.ts`)
- **Leaflet** + **leaflet.markercluster**, Karten von **OpenStreetMap**
- **IndexedDB** über `idb` (alle Daten lokal), Excel-Leser mit `fflate` + DOMParser (liest auch Füllfarben)
- **PWA** über `vite-plugin-pwa` (Workbox): App-Dateien und PLZ-Flächen werden vorab gespeichert, Kartenkacheln beim Ansehen
- Tests: **Vitest** (Unit-Tests mit jsdom + fake-indexeddb) und ein **Playwright**-Durchlauf im Browser

### Befehle

```bash
npm install          # Abhängigkeiten installieren (Node 20+)
npm run dev          # Entwicklungsserver (auch im WLAN erreichbar, z. B. fürs iPad)
npm test             # Unit-Tests
npm run build        # Prüft Typen und baut nach dist/
npm run preview      # Gebaute Version lokal ansehen
npm run test:e2e     # Browser-Test (vorher npm run build; braucht Playwright + Chromium)
npm run plz:fetch    # PLZ-Flächen neu von Overpass laden (siehe unten)
npm run icons        # App-Symbole aus public/favicon.svg erzeugen (braucht Playwright)
```

Hinweis zum iPad-Test im WLAN: `npm run dev` zeigt eine Netzwerk-Adresse (`http://192.168…`). Service Worker und Standort funktionieren auf dem iPad aber nur über HTTPS, also auf GitHub Pages.

### Projektstruktur

```
src/
  main.ts                 Einstieg: Daten laden, App starten, Service Worker
  app.ts                  Grundgerüst, Tab-Leiste, Zuordnung Route → Seite
  router.ts               Navigation über #/… (funktioniert ohne Server-Konfiguration)
  types.ts                Datenmodell (Practice, Visit, Product, Settings, Backup)
  db/database.ts          IndexedDB-Schema (bei Änderungen DB_VERSION erhöhen + upgrade ergänzen)
  state/store.ts          Zentraler Datenspeicher (lädt alles in den Speicher, schreibt nach IndexedDB)
  state/filters.ts        Filter & Sortierung (gemeinsam für Liste und Karte)
  state/selectors.ts      Abgeleitete Daten (gefilterte Liste, Status-Übersicht)
  import/xlsx-reader.ts   Excel-Leser inkl. Farberkennung (gelb = „prüfen“)
  import/practice-import.ts  Spalten erkennen, Zeilen lesen, mit vorhandenen Praxen zusammenführen
  geo/geocoder.ts         Adresssuche (Nominatim) mit Warteschlange, 1 Anfrage/s, Zwischenspeicher
  geo/plz-data.ts         PLZ-Flächen laden, fehlende über Overpass nachladen
  geo/osm.ts              Overpass-Antwort → GeoJSON (Ringe zusammensetzen, nur Deutschland)
  map/map-view.ts         Karte: Gebiet, Pins, Bedienelemente, Gebiet bearbeiten, Pin setzen
  map/popup.ts            Kurzinfo beim Antippen eines Pins
  views/                  Seiten (Liste, Detail, Formulare, Besuche, Produkte, Backup, Mehr …)
  backup/backup.ts        Export/Import der Backup-Datei, Erinnerungslogik
  ui/                     Kleine UI-Bausteine (h(), Dialoge, Meldungen, Symbole)
  utils/                  Text-, Datums-, Farb- und Link-Hilfen
  data/territory.ts       Start-Gebiet (PLZ-Liste) und Startausschnitt der Karte
  styles/main.css         Gestaltung (Farben als CSS-Variablen oben)
public/data/plz.geojson   PLZ-Flächen (vereinfacht), Quelle: OpenStreetMap
scripts/fetch-plz.ts      Lädt die PLZ-Flächen von Overpass und vereinfacht sie mit mapshaper
tests/unit/               Unit-Tests
tests/e2e/smoke.mjs       Browser-Durchlauf (Gebiet, Import, Pins, Liste, Besuche, Produkte, Backup)
tests/fixtures/           Erfundene Beispiel-Excel (+ Python-Skript, das sie erzeugt)
```

### Erweitern – typische Aufgaben

- **Neue Seite:** Route in `src/router.ts` eintragen, View-Funktion in `src/views/` schreiben (liefert `{ el, destroy }`), in `PAGES` in `src/app.ts` registrieren.
- **Neuer Abschnitt in der Praxis-Detailansicht:** Funktion `(p: Practice) => HTMLElement` schreiben und mit `registerDetailSection()` in `src/app.ts` anmelden (siehe `visits-section.ts`, `products-view.ts`).
- **Neues Feld an der Praxis:** in `src/types.ts` ergänzen (optional machen, damit alte Daten/Backups gültig bleiben), Formular in `practice-form.ts`, ggf. Import in `practice-import.ts`.
- **Neuer Filter:** `PracticeFilter`, `matchesFilter()` und `activeFilterCount()` in `src/state/filters.ts`, Bedienelement in `openFilterSheet()` (`list-view.ts`).
- **Start-Gebiet vorbelegen:** PLZ in `src/data/territory.ts` eintragen (gilt nur für den allerersten Start).

### PLZ-Flächen aktualisieren

```bash
NODE_USE_ENV_PROXY=1 npm run plz:fetch   # NODE_USE_ENV_PROXY nur nötig hinter einem Proxy
```

Das Skript fragt pro Regierungsbezirk alle `boundary=postal_code`-Relationen **innerhalb Deutschlands** ab
(`area["ISO3166-1"="DE"]` – verhindert Treffer mit gleicher Nummer z. B. in Spanien), dazu die deutschen PLZ
auf österreichischem Gebiet (`postal_code:DE`). Flächen außerhalb Deutschlands werden zusätzlich verworfen.
Rohdaten landen in `scripts/.cache/` (nicht im Repository), das Ergebnis in `public/data/plz.geojson`.
Weitere Regierungsbezirke: Liste `REGIONS` in `scripts/fetch-plz.ts` erweitern.

### Externe Dienste und Regeln

| Dienst | Zweck | Regel |
| --- | --- | --- |
| tile.openstreetmap.org | Kartenkacheln | [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/) – kein massenhaftes Vorladen |
| nominatim.openstreetmap.org | Adresssuche | [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) – max. 1 Anfrage/s, Ergebnisse speichern |
| overpass-api.de | PLZ-Flächen | nur einmalig/bei Bedarf, kleine Abfragen |

Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, ODbL.

### Veröffentlichung

`.github/workflows/deploy.yml` baut bei jedem Push auf `main` (Tests → Build → GitHub Pages).
Der Unterordner der Seite wird über `BASE_PATH` gesetzt (automatisch der Repository-Name).
