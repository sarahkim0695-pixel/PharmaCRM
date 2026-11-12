"""Erzeugt tests/fixtures/Beispiel-Praxisliste.xlsx – erfundene Praxen an öffentlichen Adressen.

Aufruf: python3 tests/fixtures/make_fixture.py
Enthält gelbe Zeilen in drei Varianten (RGB, Designfarbe mit Aufhellung, indizierte Farbe).
"""
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import PatternFill, Font
from openpyxl.styles.colors import Color
from openpyxl.writer.theme import theme_xml

wb = Workbook()
# Aktuelles Office-Design verwenden (Akzent 4 = Gold FFC000, wie in Excel ab 2013)
wb.loaded_theme = theme_xml.replace("8064A2", "FFC000").encode("utf-8")
ws = wb.active
ws.title = "Gebiet"
ws.append(["Praxisliste Außendienst (Beispiel)"])
ws["A1"].font = Font(bold=True, size=14)
ws.append([])
ws.append(["Praxis", "Fachrichtung", "Straße", "PLZ", "Ort", "Status", "Hinweis", "Öffnungszeiten", "Parken (Min)", "Vor Ort (Min)"])
rows = [
    ("Praxis Dr. Anna Beispiel", "Allgemeinmedizin", "Marienplatz 8", 80331, "München", "Kunde", "", "Mo-Fr 8-12, Mo Di Do 14-18", 10, 20),
    ("Hausarztpraxis Muster", "Innere Medizin", "Leopoldstraße 50", 80802, "München", "kein Kunde", "Termin nur vormittags", "Mo-Fr 8-12 und 15-18; Mi nachmittag geschlossen", None, None),
    ("Orthopädie am Rathaus", "Orthopädie", "Altstadt 315", 84028, "Landshut", "Interessent", "", "Mo-Do 8-17, Fr 8-13", None, None),
    ("Gemeinschaftspraxis Augsburg Mitte", "Allgemeinmedizin", "Rathausplatz 2", 86150, "Augsburg", "Kunde", "Ansprechpartnerin Fr. Test", "Mo, Di, Do 8:00-12:00 / 14:00-18:00; Mi, Fr 8:00-12:00", 8, None),
    ("Praxis am Dom", "Dermatologie", "Residenzplatz 8", 94032, "Passau", "kein Kunde", "Adresse unsicher", "nach Vereinbarung", None, None),
    ("Chirurgie Ingolstadt", "Chirurgie", "Rathausplatz 2", 85049, "Ingolstadt", "Kunde", "", None, None, None),
    ("Praxis Allgäu", "Allgemeinmedizin", "Rathausplatz 22", 87435, "Kempten (Allgäu)", "Interessent", "neu eröffnet", "Mo-Fr 7:30-12:30", None, None),
    ("Praxis Unbekannt", "Allgemeinmedizin", "Nirgendwoweg 999", 80331, "München", "kein Kunde", "Adresse existiert nicht", None, None, None),
    ("Praxis Rosenheim", "Urologie", "Königstraße 24", 83022, "Rosenheim", "", "", "Mo-Fr 8-12; Di Do 15-18", None, "25 min"),
]
for r in rows:
    ws.append(list(r))

# Gelb markierte Zeilen („prüfen“) – verschiedene Arten, wie Excel Gelb speichert
yellow_rgb = PatternFill("solid", fgColor="FFFFFF00")  # Standard-Gelb
yellow_theme = PatternFill("solid", fgColor=Color(theme=7, tint=0.5999938962981048))  # Gold, heller 60 %
yellow_indexed = PatternFill("solid", fgColor=Color(indexed=13))  # Gelb aus alter Palette
orange = PatternFill("solid", fgColor="FFFFC000")  # Orange-Gelb (Gold) – zählt ebenfalls als gelb
blue = PatternFill("solid", fgColor="FFDDEBF7")  # hellblau – NICHT gelb

def fill_row(row_idx, fill):
    for col in range(1, 11):
        ws.cell(row=row_idx, column=col).fill = fill

fill_row(5, yellow_rgb)      # Hausarztpraxis Muster
fill_row(8, yellow_theme)    # Praxis am Dom
ws.cell(row=10, column=1).fill = yellow_indexed  # Praxis Allgäu – nur erste Zelle gelb
fill_row(11, blue)           # Praxis Unbekannt – blau, nicht prüfen
ws.cell(row=12, column=3).fill = orange  # Praxis Rosenheim – Straße goldgelb

for col, width in zip("ABCDEFGHIJ", (36, 18, 22, 8, 18, 12, 28, 44, 12, 12)):
    ws.column_dimensions[col].width = width

out = Path(__file__).with_name("Beispiel-Praxisliste.xlsx")
wb.save(out)
print("geschrieben:", out)
