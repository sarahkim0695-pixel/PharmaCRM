# RepMap

**Gebietskarte, Praxen, Besuche und Produkte für den Außendienst** – als Web-App (PWA) für iPad und iPhone.
Alle Daten bleiben auf dem Gerät. Es gibt keinen Server und keine Datenbank im Internet.

| Funktion | Was sie kann |
| --- | --- |
| 🗺️ **Gebietskarte** | Dein Gebiet als gelbe PLZ-Flächen (Ober-/Niederbayern, Schwaben). PLZ per Antippen oder als Liste hinzufügen/entfernen. |
| 👥 **Gruppen** | **Orthopäden, Hausärzte, Zahnärzte & Kieferorthopäden, Kliniken** – in der Liste als Reiter, auf der Karte einzeln ein- und ausschaltbar. Beim Öffnen der App: nur Orthopäden. Erkennung beim Import über die Fachrichtung, Spalte „Typ“ oder das Tabellenblatt. |
| 🧹 **Doppelte Standorte** | Doppelte Zeilen werden beim Import aussortiert; unklare Fälle (gleiche Adresse/gleicher Name) zum Prüfen und Zusammenführen. |
| 📋 **Praxen** | Excel-Import (`.xlsx`), automatische Adresssuche, gelb markierte Zeilen erscheinen als **„prüfen“**. Pin von Hand setzen, wenn eine Adresse nicht gefunden wird. |
| 📍 **Pins** | Ampelfarben: grün = bestellender Kunde, orange = in den Startlöchern, rot = nicht in Kontakt. Form: Punkt = Orthopäde, **H** = Hausarzt, **Z** = Zahnarzt/KFO, Quadrat = Klinik. Beim Hineinzoomen einzelne Pins statt Zahlen. Antippen: Kurzinfo, Route in Apple Karten, Details. |
| 🔎 **Liste** | Suchen, filtern (Status, Ort, Fachrichtung, PLZ, „prüfen“, Produkt, Veranstaltung …), sortieren (auch „in der Nähe“). Praxen anlegen, bearbeiten, löschen. **Mehrere bearbeiten**: Status oder Intervall für alle angezeigten auf einmal setzen. |
| 📝 **Besuche** | Besuche mit Datum, Ansprechpartner und Notiz. Nächster Termin. Übersicht „Termine“, „lange nicht besucht“, „Verlauf“. |
| 📦 **Produkte** | Eigene Produktliste. Pro Praxis: „angeboten“ oder „kauft“. |
| 📣 **Veranstaltungen** | Einmal eintragen – gilt für alle Praxen. Pro Praxis: „noch nicht angefragt“, „kein Interesse“ oder „Interesse“. |
| 🚦 **Kundenstatus & Intervall** | Ampel je Praxis: 🟢 bestellender Kunde, 🟠 in den Startlöchern, 🔴 nicht in Kontakt – und wie oft besucht werden soll (für jede Praxis kürzer oder länger einstellbar). Die App zeigt, wann ein Besuch fällig ist. |
| 🕘 **Öffnungszeiten** | Aus der Excel oder in der App: Öffnungszeiten je Wochentag und Zeitaufwand pro Praxis (Parken & Weg, vor Ort). |
| 🎙️ **Sprachsteuerung** | Tour per Sprache planen: „Morgen in Augsburg, Dr. Huber um 10 fest, Rest auffüllen, Mittagspause halb eins“ – die App zeigt, was sie verstanden hat, und plant los. Läuft komplett auf dem Gerät. |
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
- **Gruppe** (siehe unten): Orthopäden, Hausärzte, Zahnärzte & KFO oder Kliniken – meist erkennt die App das an der Fachrichtung.
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

#### Gruppen: Orthopäden, Hausärzte, Zahnärzte & KFO, Kliniken

Jeder Eintrag gehört zu einer von vier Gruppen. Die App erkennt sie beim Import in dieser Reihenfolge:

1. **Spalte „Typ“** (oder „Art“), z. B. „Orthopädie“, „Hausarzt“, „Zahnarzt“, „KFO“, „Klinik“.
2. **Name des Tabellenblatts**, z. B. „Hausärzte“, „Zahnärzte“, „Kieferorthopäden“, „Kliniken“. Die App liest **alle Blätter** der Datei ein – du kannst also jede Gruppe auf ein eigenes Blatt schreiben.
3. **Fachrichtung**:

| Fachrichtung z. B. | Gruppe |
| --- | --- |
| Orthopädie, Unfallchirurgie | **Orthopäden** |
| Allgemeinmedizin, Hausarzt, Innere Medizin, Praktischer Arzt | **Hausärzte** |
| Zahnmedizin, Zahnarzt, Kieferorthopädie, KFO, Oralchirurgie, Mund-Kiefer-Gesichtschirurgie | **Zahnärzte & KFO** |
| Name enthält „Klinik“, „Klinikum“, „Krankenhaus“ | **Kliniken** |
| alles andere | **Orthopäden** |

4. **Ganze Datei auf einmal**: In der Import-Vorschau unter „Gruppe“ z. B. **„alle sind Hausärzte“** wählen – praktisch, wenn du eine eigene Hausärzte-Liste ohne Fachrichtung hast.

Die Gruppe lässt sich in der App jederzeit ändern (**Bearbeiten** → Orthopädie / Hausarzt / Zahn / KFO / Klinik); eine so gewählte Gruppe überschreibt ein späterer Import nur, wenn Typ-Spalte, Blattname oder die Auswahl „alle sind …“ etwas anderes sagen.
Importierst du später nur eine Liste einer Gruppe (z. B. nur Hausärzte), schlägt die App keine Einträge der anderen Gruppen zum Löschen vor.

**In der App:**
- **Liste:** Oben vier **Reiter** – Orthopäden, Hausärzte, Zahnärzte & KFO, Kliniken – mit der Anzahl. Suche und Filter gelten im gewählten Reiter; findet die Suche dort nichts, zeigt die App, in welchem anderen Reiter es Treffer gibt. Auch **Besuche → Fällig** hat diese Reiter.
- **Karte:** Unter der Suche je Gruppe ein Knopf mit Haken – antippen blendet die Gruppe ein oder aus (z. B. nur Orthopäden, Orthopäden + Hausärzte oder nur Hausärzte). Pins: Punkt = Orthopäde, **H** = Hausarzt, **Z** = Zahnarzt/KFO, Quadrat mit Kreuz = Klinik.
- **Beim Öffnen der App** zeigen Liste und Karte immer **nur die Orthopäden**. „Auf Karte“ bei einem Hausarzt blendet die Hausärzte automatisch dazu ein.

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

**Die Öffnungszeiten werden beim Import automatisch übernommen** – du musst sie nicht von Hand eintragen.
Die Import-Vorschau zeigt, bei wie vielen Einträgen das geklappt hat, aus welcher Spalte, und drei Beispiele zum Prüfen.

So darfst du die Öffnungszeiten schreiben – die App versteht viele Varianten:

- Tage: `Mo`, `Di`, `Mi`, `Do`, `Fr`, `Sa`, `So` (auch ausgeschrieben oder mit Punkt), Bereiche wie `Mo-Fr` / `Mo.–Fr.`, Listen wie `Mo, Di, Do` oder `Mo/Di/Do`, `wochentags`
- Zeiten: `8-12`, `08:00-12:00`, `8.30 - 12.30 Uhr`, `8 bis 12 Uhr`, `8h30-12h`, mehrere mit „und“, Komma oder `/`: `8-12 und 14-18`
- Mehrere Angaben hintereinander: `Mo-Fr 8-12, Mo Di Do 14-18` (vormittags täglich, nachmittags Mo/Di/Do)
- **Mittagspause**: `Mo-Fr 8-18, Mittagspause 12-14` → 8–12 und 14–18
- **Ausnahmen**: `Mi nachmittag geschlossen`, `Fr geschlossen`, `Mo-Fr 8-12 außer Mi`
- **Mehrere Zeilen in einer Zelle** (Alt+Enter) wie `Montag 8-12 14-18` ⏎ `Dienstag 8-12` – eine Zeile ohne Tag gilt für den Tag davor
- Tage ohne Angabe gelten als geschlossen. Ohne Tagesangabe (z. B. nur `8-12`) gilt Mo–Fr.

**Diese Spalten erkennt die App** (Überschrift egal ob groß/klein, mit oder ohne Punkt):

| Variante | Überschriften (Beispiele) | Inhalt (Beispiel) |
| --- | --- | --- |
| Eine Spalte | `Öffnungszeiten`, `Sprechzeiten`, `Sprechstunden`, `Praxiszeiten` | `Mo-Fr 8-12, Mo Di Do 14-18` |
| Zwei Spalten | `Öffnungszeiten vormittags` + `Öffnungszeiten nachmittags` | `Mo-Fr 8-12` / `Mo Di Do 15-18` |
| Je Wochentag | `Mo`, `Di`, `Mi` … oder `Montag`, `Öffnungszeiten Montag` | `8-12, 14-18` oder `geschlossen` |
| Je Wochentag geteilt | `Mo vormittags` + `Mo nachmittags` (auch `Mo VM` / `Mo NM`) | `8-12` / `14-18` |
| Je Wochentag von/bis | `Montag von`, `Montag bis` (zweites Fenster: `Montag von 2`, `Montag bis 2`) | `08:00` / `12:00` (auch als Excel-Uhrzeit) |
| Mehrere Tage | `Mo-Fr`, `Mo-Do`, `Sa` | `8-18` |
| Mittagspause | `Mittagspause` | `12-14` (wird abgezogen) |

Gut zu wissen:
- Hat Excel aus `8-12` heimlich ein Datum gemacht (Anzeige „08. Dez“), liest die App es trotzdem richtig als 8–12 Uhr.
- Gibt es **keine** Spalte für Öffnungszeiten, schaut die App in die Spalte **Hinweis** – aber nur, wenn dort ausschließlich Öffnungszeiten stehen (z. B. `Mo-Fr 8-12 Uhr`).
- **Schon importiert?** Ergänze die Spalte in deiner Excel und importiere die Datei einfach noch einmal: Die Öffnungszeiten kommen dazu, Besuche, Produkte, Pins usw. bleiben erhalten.
- Leere Zellen überschreiben nichts, was du in der App eingetragen hast. Nicht lesbare Angaben (z. B. „nach Vereinbarung“) zeigt die Import-Vorschau an – die trägst du dann in der App nach (Praxis öffnen → **Öffnungszeiten & Zeitaufwand → Bearbeiten**).

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
   **Längerer Termin?** In der Zeile **⏱ Vor Ort** bei der Praxis mit **+** die Dauer erhöhen (bzw. mit **−** verkürzen) – 5 Minuten bis 4 Stunden. Das gilt **nur für diesen Tag**; der normale Zeitaufwand der Praxis bleibt. „Standard (… min)“ setzt zurück. Danach **Neu berechnen** – im Zeitplan steht dann „länger eingeplant“.
5. **Nur einen Ort / eine Region wählen**: Unter „Wohin?“ einen oder mehrere Orte und einen Umkreis wählen → **Tour vorschlagen**. Die App stellt die Tour aus Praxen dort zusammen – fällige Besuche, Praxen in den Startlöchern und bestellende Kunden zuerst – und rechnet sie gleich durch.
   **Vorschläge aus**: Standardmäßig schlägt die App nur Orthopäden vor; mit den Knöpfen darüber nimmst du z. B. Hausärzte dazu. Auch unter „Praxen auswählen“ kannst du die Gruppen ein- und ausschalten.
6. **Feste Praxen + passende Besuche**: 1–2 Praxen auswählen (z. B. ein Termin) und **Passende Besuche ergänzen** tippen. Die App sucht fällige Praxen **auf der Strecke** (wenig Umweg) und **in der Nähe** und plant so viele ein, wie in den Tag passen (höchstens die eingestellte Zahl Besuche). Auch bei einer Wartezeit hilft **Lücke füllen**.
7. **Packliste**: Unter „Packliste & Notizen“ trägst du ein, was du an diesem Tag allgemein brauchst, und bei jeder Praxis unter „Mitbringen“ (🎒), was du dort mitbringen willst – z. B. „Muster A, Katalog“. Daraus entsteht automatisch eine Liste zum Abhaken; gleiche Dinge erscheinen nur einmal mit allen Praxen dazu.
8. Unterwegs: bei jedem Stopp **Navigation** (Apple Karten) und **Besuch erfassen**. Verspätet? **Ab jetzt neu planen** rechnet ab deinem aktuellen Standort und der aktuellen Uhrzeit mit den noch offenen Praxen neu.
9. **Auf Karte zeigen**: nummerierte Stopps und Strecke. **Ganze Route (Google Maps)** öffnet alle Stopps auf einmal (bis 9 Zwischenstopps).

#### 🎙️ Tour per Sprache planen

Im Tab **Tour** ganz oben auf **Per Sprache planen** tippen → aufs große **Mikrofon** tippen und sprechen (oder ins Feld tippen bzw. über das 🎤 der Tastatur diktieren). Die App zeigt sofort **„Das habe ich verstanden“** – passt alles, auf **Ausführen** tippen. Dann wird die Tour eingetragen, mit passenden Besuchen ergänzt und berechnet; nach einer gesprochenen Anweisung liest die App das Ergebnis kurz vor.

Beispiele:
- „Morgen Tour in Augsburg, nur fällige Orthopäden, maximal 6 Besuche, Mittagspause halb eins“
- „Dienstag Dr. Huber um 10 Uhr fest, Praxis am Dom wenn es passt, Rest auffüllen, ohne Dr. Lang“
- „Nächste Woche Freitag rund um Landshut, auch Hausärzte, nur Kunden in den Startlöchern“
- „Ab 7:30 los, bis 16 Uhr fertig, keine Mittagspause“
- „Muster A und Katalog für Dr. Huber mitnehmen, Visitenkarten einpacken“ (→ Packliste)
- „Notiz: Parkhaus am Dom nehmen“

| Das versteht die App | Zum Beispiel |
| --- | --- |
| Tag | „heute“, „morgen“, „übermorgen“, „Dienstag“, „nächste Woche Freitag“, „am 3.12.“, „am 5. Januar“ |
| Ort / Umkreis | „in Augsburg“ (+10 km), „nur in Augsburg“, „rund um Landshut“ (+15 km), „im Umkreis von 20 km“ |
| Praxen | „Dr. Huber“, „Doktor Maier“ (findet auch Meier/Meyer), „Praxis am Dom“; „um 10 Uhr“ = Termin; „dauert eine Stunde“ / „90 Minuten einplanen“ = längerer Besuch; „wenn es passt“ = optional; „ohne …“ / „… weglassen“ |
| Auswahl | „Rest auffüllen“, „nur fällige“, „nur Orthopäden“, „auch Hausärzte“, „ohne Kliniken“, „nur bestellende Kunden“ / „in den Startlöchern“ / „nicht in Kontakt“ |
| Zeiten | „ab 7:30 los“, „bis 16 Uhr fertig“, „um 17 Uhr zuhause“, „maximal 6 Besuche“, „halb neun“, „viertel nach acht“, „dreiviertel neun“ |
| Mittagspause | „Mittagspause halb eins“, „Mittagspause von 12:30 bis 13:15“, „zwischen 12 und 14 Uhr, 30 Minuten“, „ohne Mittagspause“ |
| Start / Ende | „von hier aus starten“, „nicht nach Hause zurück“, „neu anfangen“ |
| Packliste / Notiz | „… für Dr. Huber mitnehmen“, „… einpacken“, „Notiz: …“ |
| Sofort ausführen | am Ende „ausführen“ sagen |

Gut zu wissen:
- Passen mehrere Praxen zu einem Namen, wählst du in der Vorschau die richtige aus (die im genannten Ort ist vorausgewählt).
- Was die App nicht verstanden hat, steht unter „Nicht verstanden“ – es wird nichts geraten.
- Ein gesagter Termin („Dr. Huber um 10 Uhr“) wird bei der Praxis als nächster Termin eingetragen.
- **Datenschutz:** Die Umwandlung von Sprache in Text übernimmt dein iPad (wie beim Diktieren). Was du gesagt hast, wertet RepMap direkt auf dem Gerät aus – deine Praxisdaten gehen dabei nirgends hin.
- Funktioniert das Mikrofon in der App nicht (z. B. Mikrofon nicht erlaubt), diktiere einfach über das 🎤 der Tastatur ins Feld.

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
  utils/kind.ts           Gruppen (Orthopäden, Hausärzte, Zahn & KFO, Kliniken): Bezeichnungen und Erkennung
  utils/customer.ts       Kundenstatus (aktiv/im Gespräch/kein), Besuchsintervall, Fälligkeit
  tour/packing.ts         Packliste aus Tagesnotizen und „Mitbringen“ je Besuch
  import/xlsx-reader.ts   Excel-Leser inkl. Farberkennung (gelb = „prüfen“)
  import/practice-import.ts  Spalten erkennen, Zeilen lesen, mit vorhandenen Praxen zusammenführen
  geo/geocoder.ts         Adresssuche (Nominatim) mit Warteschlange, 1 Anfrage/s, Zwischenspeicher
  geo/plz-data.ts         PLZ-Flächen laden, fehlende über Overpass nachladen
  tour/opening-hours.ts   Öffnungszeiten lesen („Mo-Fr 8-12, Mo Di Do 14-18“), anzeigen, abfragen
  import/hours-import.ts  Öffnungszeiten-Spalten in der Excel erkennen (Text, je Wochentag, von/bis, Pause)
  tour/optimizer.ts       Tour-Optimierung (Zeitfenster, Pause, Feierabend) – reine Rechenlogik
  tour/planner.ts         Tagesplan: Praxen + Öffnungszeiten + Fahrzeiten → Optimierer → Uhrzeiten
  tour/travel.ts          Fahrzeiten/Strecke (OSRM-Routing der FOSSGIS, sonst Schätzung)
  tour/voice.ts           Sprachsteuerung: deutsche Sätze → Anweisungen (Datum, Ort, Praxen, Zeiten …)
  tour/voice-apply.ts     Sprachsteuerung: Anweisungen auf die Tour anwenden und berechnen
  views/voice-sheet.ts    Sprachsteuerung: Mikrofon (Web Speech API), Vorschau, Ausführen
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
tests/e2e/smoke.mjs       Browser-Durchlauf (Gebiet, Import, Pins, Liste, Besuche, Produkte, Backup, Tour, Doppelte, Klinik, Veranstaltungen, Gruppen, Sprache)
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
