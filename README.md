# RepMap

**Gebietskarte, Praxen, Besuche und Produkte für den Außendienst** – als Web-App (PWA) für iPad und iPhone.
Alle Daten bleiben auf dem Gerät. Es gibt keinen Server und keine Datenbank im Internet.

| Funktion | Was sie kann |
| --- | --- |
| 🗺️ **Gebietskarte** | Dein Gebiet als gelbe PLZ-Flächen (Ober-/Niederbayern, Schwaben). PLZ per Antippen oder als Liste hinzufügen/entfernen. |
| 🏥 **Kliniken** | Neben Praxen auch Kliniken – eigener Pin (Quadrat mit Kreuz), Filter, Import über Spalte „Typ“ oder eigenes Tabellenblatt. |
| 🧹 **Doppelte Standorte** | Doppelte Zeilen werden beim Import aussortiert; unklare Fälle (gleiche Adresse/gleicher Name) zum Prüfen und Zusammenführen. |
| 📋 **Praxen** | Excel-Import (`.xlsx`), automatische Adresssuche, gelb markierte Zeilen erscheinen als **„prüfen“**. Pin von Hand setzen, wenn eine Adresse nicht gefunden wird. |
| 📍 **Pins** | Ampelfarben: grün = bestellender Kunde, orange = in den Startlöchern, rot = nicht in Kontakt. Beim Hineinzoomen einzelne Pins statt Zahlen. Antippen: Kurzinfo, Route in Apple Karten, Details. |
| 🔎 **Liste** | Suchen, filtern (Status, Ort, Fachrichtung, PLZ, „prüfen“, Produkt, Veranstaltung …), sortieren (auch „in der Nähe“). Praxen anlegen, bearbeiten, löschen. **Mehrere bearbeiten**: Status oder Intervall für alle angezeigten auf einmal setzen. |
| 📝 **Besuche** | Besuche mit Datum, Ansprechpartner und Notiz. Nächster Termin. Übersicht „Termine“, „lange nicht besucht“, „Verlauf“. |
| 📦 **Produkte** | Eigene Produktliste. Pro Praxis: „angeboten“ oder „kauft“. |
| 📣 **Veranstaltungen** | Einmal eintragen – gilt für alle Praxen. Pro Praxis: „noch nicht angefragt“, „kein Interesse“ oder „Interesse“. |
| 🚦 **Kundenstatus & Intervall** | Ampel je Praxis: 🟢 bestellender Kunde, 🟠 in den Startlöchern, 🔴 nicht in Kontakt – und wie oft besucht werden soll (für jede Praxis kürzer oder länger einstellbar). Die App zeigt, wann ein Besuch fällig ist. |
| 🕘 **Öffnungszeiten** | Aus der Excel oder in der App: Öffnungszeiten je Wochentag und Zeitaufwand pro Praxis (Parken & Weg, vor Ort). |
| 🚗 **Tourplanung** | Optimierte Tagestour mit Uhrzeiten: beachtet Öffnungszeiten, Termine, Fahrzeiten, deine Mittagspause und den Feierabend. Region wählen → Tour-Vorschlag; feste Praxen → passende Besuche auf der Strecke. Packliste für den Morgen. |
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
- Für die **Tourplanung** (alles optional – siehe nächster Abschnitt): **Öffnungszeiten**, **Parken (Min)**, **Vor Ort (Min)**.
- **Kliniken** (siehe unten): Spalte **Typ** mit „Praxis“ oder „Klinik“ – oder ein eigenes Tabellenblatt „Kliniken“.
- **Doppelte Zeilen** (gleicher Name und gleiche Adresse) werden automatisch nur einmal übernommen.
- **Intervall** (optional): wie oft besucht werden soll, z. B. `4 Wochen`, `14 Tage`, `monatlich`, `Quartal`.

#### Kundenstatus

Aus der Spalte **Status** macht die App eine Ampel – die Vorschau zeigt, wie sie jeden Wert zuordnet:

| In der Excel z. B. | wird zu |
| --- | --- |
| Kunde, Stammkunde, bestellt, aktiv | 🟢 **Bestellender Kunde** |
| Interessent, im Gespräch, Angebot, Muster, Test, in Kontakt | 🟠 **In den Startlöchern** |
| kein Kunde, inaktiv, abgesagt, nicht in Kontakt | 🔴 **Nicht in Kontakt** |
| leer oder unbekannt | 🔴 **Nicht in Kontakt** – in der App mit einem Tipp ändern |

In der Praxis-Ansicht änderst du den Status mit einem Tipp. Dieser bleibt erhalten, auch wenn du die Excel erneut importierst – außer der Status in der Excel hat sich inzwischen geändert. Die Farben kannst du unter *Mehr → Einstellungen* anpassen.

**Besuchsintervall – für jede Praxis kürzer oder länger:**
- In der Praxis-Ansicht unter „Besuchen alle …“ tippen (1 Woche bis 6 Monate) – oder beim **Bearbeiten** im Feld „Besuchen alle …“.
- Ohne eigene Wahl gilt der **Standard je Kundenstatus** – anfangs **alle 3 Monate**. Unter *Mehr → Einstellungen* kannst du den Standard für jeden Kundenstatus getrennt ändern (z. B. bestellende Kunden alle 4 Wochen).
- **Viele auf einmal:** In der Liste suchen/filtern (z. B. Ort „Augsburg“ oder Status „Startlöcher“) → Stift-Knopf **Mehrere bearbeiten** → Status und/oder Intervall wählen → Übernehmen. Gilt für alle gerade angezeigten Einträge.
- Die Übersicht **Besuche → Fällig** zeigt, wo ein Besuch fällig oder überfällig ist.
- **Gelb hinterlegte Zeilen** (auch hellgelb oder goldgelb, ganze Zeile oder einzelne Zelle) werden als **„prüfen“** markiert.
  In der Praxis-Ansicht kannst du sie später mit **„Geprüft“** bestätigen.
- Die Datei muss im Format **.xlsx** sein (in Excel: *Speichern unter → Excel-Arbeitsmappe*).
- **Erneuter Import** (z. B. aktualisierte Liste): vorhandene Praxen werden aktualisiert, neue kommen dazu.
  Besuche, Produkte und Pins bleiben erhalten. Praxen, die nicht mehr in der Liste stehen, werden nur gelöscht, wenn du das ausdrücklich ankreuzt.

Nach dem Import sucht die App die Adressen auf der Karte (über OpenStreetMap, **höchstens 1 Adresse pro Sekunde** – bei 300 Praxen also ca. 5–10 Minuten). Lass die App dabei geöffnet; sonst macht sie beim nächsten Öffnen weiter.
Nicht gefundene Adressen findest du unter **Mehr → Adresssuche** oder in der Liste mit dem Filter „Standort fehlt oder ungenau“. Dort tippst du auf **„Pin setzen“** und dann auf die richtige Stelle in der Karte.

#### Kliniken

Du hast zwei Möglichkeiten – beide in derselben Excel-Datei:

1. **Eigenes Tabellenblatt** mit dem Namen „Kliniken“ (gleiche Spalten wie bei den Praxen; die erste Spalte darf statt „Praxis“ auch „Klinik“ oder „Name“ heißen). Die App liest **alle Blätter** der Datei ein.
2. **Spalte „Typ“** mit „Praxis“ oder „Klinik“ in derselben Liste.

Steht nichts dabei, erkennt die App Kliniken am Namen („Klinik“, „Klinikum“, „Krankenhaus“). Die Art lässt sich in der App jederzeit ändern (Bearbeiten → Praxis/Klinik). Wenn du später nur die Klinikliste neu importierst, schlägt die App keine Praxen zum Löschen vor.

#### Doppelte Standorte

- **Gleicher Name + gleiche Adresse** (auch über mehrere Blätter hinweg): wird beim Import automatisch nur einmal übernommen. Die Vorschau zeigt, welche Zeilen aussortiert wurden.
- **Gleiche Adresse, aber anderer Name**, gleicher Name im selben PLZ-Gebiet oder gleiche Position auf der Karte: Das kann ein echter Doppelter sein – oder mehrere Praxen im selben Ärztehaus. Deshalb löscht die App hier **nichts automatisch**, sondern sammelt die Fälle unter **Mehr → Doppelte Standorte**:
  - **Zusammenführen**: Ein Eintrag bleibt (vorausgewählt ist der mit den meisten Besuchen/Angaben). Besuche, Produkte, Hinweise, Termine und Tour-Stopps der anderen werden übernommen.
  - **Sind verschieden**: Die Einträge werden nicht mehr als doppelt gemeldet.
- Auf der Karte werden Einträge am selben Ort gebündelt – Antippen fächert sie auf.

#### Öffnungszeiten und Zeitaufwand in der Excel

Füge einfach zusätzliche Spalten hinzu (Reihenfolge egal):

| Öffnungszeiten | Parken (Min) | Vor Ort (Min) |
| --- | --- | --- |
| Mo-Fr 8-12, Mo Di Do 14-18 | 10 | 20 |
| Mo-Do 8-17, Fr 8-13 | | 15 |
| Mo-Fr 8-12 und 15-18; Mi nachmittag geschlossen | 5 | |

So darfst du die Öffnungszeiten schreiben – die App versteht viele Varianten:

- Tage: `Mo`, `Di`, `Mi`, `Do`, `Fr`, `Sa`, `So` (auch ausgeschrieben), Bereiche wie `Mo-Fr`, Listen wie `Mo, Di, Do`
- Zeiten: `8-12`, `08:00-12:00`, `8.30 - 12.30 Uhr`, mehrere mit „und“ oder Komma: `8-12 und 14-18`
- Mehrere Angaben hintereinander: `Mo-Fr 8-12, Mo Di Do 14-18` (vormittags täglich, nachmittags Mo/Di/Do)
- Ausnahmen: `Mi nachmittag geschlossen`, `Fr geschlossen`
- Tage ohne Angabe gelten als geschlossen. Ohne Tagesangabe (z. B. nur `8-12`) gilt Mo–Fr.

**Alternativ** eine Spalte je Wochentag mit den Überschriften `Mo`, `Di`, `Mi`, `Do`, `Fr` (ggf. `Sa`) und Inhalten wie `8-12, 14-18` oder `geschlossen`.

Leere Zellen überschreiben nichts, was du in der App eingetragen hast. Nicht lesbare Angaben (z. B. „nach Vereinbarung“) zeigt die Import-Vorschau an – die trägst du dann in der App nach (Praxis öffnen → **Öffnungszeiten & Zeitaufwand → Bearbeiten**).

**Parken (Min)** = Zeit für Parkplatzsuche und Fußweg, **Vor Ort (Min)** = Aufenthalt in der Praxis. Leer = Standardwert (einstellbar unter *Mehr → Einstellungen → Tourplanung*, anfangs 5 und 15 Minuten).

#### Veranstaltungen

**Mehr → Veranstaltungen** → Name (z. B. „Wundforum Augsburg“), Datum und Ort eintragen → **Veranstaltung anlegen**.
Die Veranstaltung erscheint sofort bei **allen** Praxen und Kliniken. In der Praxis-Ansicht stellst du den Regler auf
**noch nicht angefragt** · **kein Interesse** · **Interesse**.

- Auf der Seite „Veranstaltungen“ siehst du je Veranstaltung, wie viele Interesse haben, wie viele nicht und wie viele noch nicht angefragt sind.
  Antippen → **Praxen anzeigen**, z. B. alle „noch nicht angefragt“ als Liste (und auf der Karte).
- In der **Liste → Filter → Veranstaltung** kannst du ebenfalls danach filtern.
- In der **Tour** steht bei jedem Besuch vor dem Termin „📣 Noch anfragen: …“, wenn du dort noch nicht gefragt hast.
- Vorbei? Die Veranstaltung rutscht unter „Vorbei“. Mit **Archiviert** blendest du sie bei den Praxen ganz aus, die Antworten bleiben gespeichert. **Löschen** entfernt sie samt Antworten.

### Schritt 5: Touren planen

1. Einmalig: **Mehr → Einstellungen → Tourplanung** → deine **Startadresse** eintragen und „Suchen & speichern“. Dort stellst du auch Arbeitszeit, Mittagspause (z. B. 45 Minuten irgendwann zwischen 12 und 14 Uhr) und den Standard-Zeitaufwand ein.
2. Tab **Tour** → Tag wählen → **Praxen auswählen** (sortiert nach Entfernung; Filter „an dem Tag geöffnet“, „lange nicht besucht“, „im Gebiet“).
   Praxen kannst du auch direkt auf der Karte (Kurzinfo → **Tour**) oder in der Praxis-Ansicht (**Zur Tour**) hinzufügen. Praxen mit einem Termin an diesem Tag kommen automatisch dazu.
3. **Tour berechnen** – die App sucht die beste Reihenfolge und zeigt den Tagesplan mit Uhrzeiten: Abfahrt, Fahrt, Ankunft, Parken & Weg, Besuch, Mittagspause, Rückkehr.
   - Sie fährt so spät los, dass du morgens nicht vor verschlossener Tür wartest.
   - Die Mittagspause legt sie möglichst in die Zeit, in der die Praxen ohnehin Mittag machen.
   - Was nicht mehr in den Tag passt, steht unter „Nicht eingeplant“ – mit Grund.
4. **fest / optional**: Feste Praxen (Stecknadel-Symbol) müssen in die Tour, optionale dürfen entfallen, wenn es zeitlich nicht passt.
5. **Nur einen Ort / eine Region wählen**: Unter „Wohin?“ einen oder mehrere Orte und einen Umkreis wählen → **Tour vorschlagen**. Die App stellt die Tour aus Praxen dort zusammen – fällige Besuche, Praxen in den Startlöchern und bestellende Kunden zuerst – und rechnet sie gleich durch.
6. **Feste Praxen + passende Besuche**: 1–2 Praxen auswählen (z. B. ein Termin) und **Passende Besuche ergänzen** tippen. Die App sucht fällige Praxen **auf der Strecke** (wenig Umweg) und **in der Nähe** und plant so viele ein, wie in den Tag passen (höchstens die eingestellte Zahl Besuche). Auch bei einer Wartezeit hilft **Lücke füllen**.
7. **Packliste**: Unter „Packliste & Notizen“ trägst du ein, was du an diesem Tag allgemein brauchst, und bei jeder Praxis unter „Mitbringen“ (🎒), was du dort mitbringen willst – z. B. „Muster A, Katalog“. Daraus entsteht automatisch eine Liste zum Abhaken; gleiche Dinge erscheinen nur einmal mit allen Praxen dazu.
8. Unterwegs: bei jedem Stopp **Navigation** (Apple Karten) und **Besuch erfassen**. Verspätet? **Ab jetzt neu planen** rechnet ab deinem aktuellen Standort und der aktuellen Uhrzeit mit den noch offenen Praxen neu.
9. **Auf Karte zeigen**: nummerierte Stopps und Strecke. **Ganze Route (Google Maps)** öffnet alle Stopps auf einmal (bis 9 Zwischenstopps).

Die Fahrzeiten kommen vom kostenlosen OpenStreetMap-Routing (inkl. einstellbarem Verkehrszuschlag, Standard 15 %). Ohne Internet schätzt die App sie grob und weist darauf hin.

### Schritt 6: Backup – regelmäßig!

Weil alle Daten nur auf deinem iPad liegen, ist ein Backup sehr wichtig:

**Mehr → Backup → Backup jetzt erstellen → „In Dateien sichern“ → iCloud Drive → Sichern**

Die App erinnert dich mit einem gelben Hinweis oben, wenn das letzte Backup älter als 7 Tage ist (einstellbar unter *Mehr → Einstellungen*).
Wiederherstellen: **Mehr → Backup → Backup-Datei wählen**.

### Gut zu wissen

- **Offline:** Karte (bereits angesehene Ausschnitte), Gebiet, Pins, Liste, Besuche, Produkte und berechnete Touren funktionieren ohne Internet. Adresssuche, genaue Fahrzeiten und neue Kartenausschnitte brauchen Internet.
- **Datenschutz:** Für die Adresssuche werden nur Straße, PLZ und Ort an OpenStreetMap geschickt, für die Fahrzeiten nur Koordinaten – keine Praxisnamen, keine Notizen.
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
  state/selectors.ts      Abgeleitete Daten (gefilterte Liste, Status-Übersicht, doppelte Standorte)
  state/duplicates.ts     Doppelte Standorte finden (Adresse, Name, Position) und zusammenführen
  utils/kind.ts           Praxis/Klinik: Bezeichnungen und automatische Erkennung
  utils/customer.ts       Kundenstatus (aktiv/im Gespräch/kein), Besuchsintervall, Fälligkeit
  tour/packing.ts         Packliste aus Tagesnotizen und „Mitbringen“ je Besuch
  import/xlsx-reader.ts   Excel-Leser inkl. Farberkennung (gelb = „prüfen“)
  import/practice-import.ts  Spalten erkennen, Zeilen lesen, mit vorhandenen Praxen zusammenführen
  geo/geocoder.ts         Adresssuche (Nominatim) mit Warteschlange, 1 Anfrage/s, Zwischenspeicher
  geo/plz-data.ts         PLZ-Flächen laden, fehlende über Overpass nachladen
  tour/opening-hours.ts   Öffnungszeiten lesen („Mo-Fr 8-12, Mo Di Do 14-18“), anzeigen, abfragen
  tour/optimizer.ts       Tour-Optimierung (Zeitfenster, Pause, Feierabend) – reine Rechenlogik
  tour/planner.ts         Tagesplan: Praxen + Öffnungszeiten + Fahrzeiten → Optimierer → Uhrzeiten
  tour/travel.ts          Fahrzeiten/Strecke (OSRM-Routing der FOSSGIS, sonst Schätzung)
  geo/osm.ts              Overpass-Antwort → GeoJSON (Ringe zusammensetzen, nur Deutschland)
  map/map-view.ts         Karte: Gebiet, Pins, Bedienelemente, Gebiet bearbeiten, Pin setzen
  map/popup.ts            Kurzinfo beim Antippen eines Pins
  views/                  Seiten (Liste, Detail, Formulare, Besuche, Produkte, Veranstaltungen, Backup, Mehr …)
  utils/customer.ts       Ampel-Kundenstatus, Farben, Besuchsintervall, Fälligkeit
  backup/backup.ts        Export/Import der Backup-Datei, Erinnerungslogik
  ui/                     Kleine UI-Bausteine (h(), Dialoge, Meldungen, Symbole)
  utils/                  Text-, Datums-, Farb- und Link-Hilfen
  data/territory.ts       Start-Gebiet (PLZ-Liste) und Startausschnitt der Karte
  styles/main.css         Gestaltung (Farben als CSS-Variablen oben)
public/data/plz.geojson   PLZ-Flächen (vereinfacht), Quelle: OpenStreetMap
scripts/fetch-plz.ts      Lädt die PLZ-Flächen von Overpass und vereinfacht sie mit mapshaper
tests/unit/               Unit-Tests
tests/e2e/smoke.mjs       Browser-Durchlauf (Gebiet, Import, Pins, Liste, Besuche, Produkte, Backup, Tour, Doppelte, Klinik, Veranstaltungen)
tests/fixtures/           Erfundene Beispiel-Excel (+ Python-Skript, das sie erzeugt)
```

### Erweitern – typische Aufgaben

- **Neue Seite:** Route in `src/router.ts` eintragen, View-Funktion in `src/views/` schreiben (liefert `{ el, destroy }`), in `PAGES` in `src/app.ts` registrieren.
- **Neuer Abschnitt in der Praxis-Detailansicht:** Funktion `(p: Practice) => HTMLElement` schreiben und mit `registerDetailSection()` in `src/app.ts` anmelden (siehe `visits-section.ts`, `products-view.ts`, `events-view.ts`).
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
| routing.openstreetmap.de | Fahrzeiten & Strecke für Touren (OSRM, FOSSGIS) | [Nutzungsregeln](https://routing.openstreetmap.de/about.html): Quellenangabe + Link „Karte verbessern“, max. 1 Anfrage/s, keine Massenabfragen – pro Tourberechnung 2 Anfragen |

Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, ODbL.

### Veröffentlichung

`.github/workflows/deploy.yml` baut bei jedem Push auf `main` (Tests → Build → GitHub Pages).
Der Unterordner der Seite wird über `BASE_PATH` gesetzt (automatisch der Repository-Name).
