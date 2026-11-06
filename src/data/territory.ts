/**
 * Start-Gebiet: Postleitzahlen, die beim allerersten Öffnen der App
 * als „mein Gebiet“ markiert sind. Danach wird das Gebiet in der App
 * gepflegt (Mehr → Gebiet) und im Gerät gespeichert.
 *
 * Hier können PLZ eingetragen werden, z. B. ['80331', '80333'].
 */
export const DEFAULT_TERRITORY_PLZ: string[] = [];

/** Kartenausschnitt, solange noch kein Gebiet gewählt ist (Ober-/Niederbayern, Schwaben). */
export const REGION_BOUNDS: [[number, number], [number, number]] = [
  [47.27, 9.85],
  [49.2, 13.85],
];
