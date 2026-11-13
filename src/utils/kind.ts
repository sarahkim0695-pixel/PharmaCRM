/**
 * Gruppen: Orthopäden, Hausärzte, Zahnärzte & Kieferorthopäden, Kliniken.
 * Bezeichnungen und automatische Erkennung (Spalte „Typ“, Tabellenblatt, Fachrichtung, Name).
 */
import type { FacilityKind, Practice } from '../types';
import { normalize } from './text';

/** Reihenfolge in Reitern und Auswahlen */
export const KIND_KEYS: FacilityKind[] = ['ortho', 'hausarzt', 'zahn', 'klinik'];

/** Einzahl, z. B. als Überschrift der Detailansicht */
export const KIND_LABEL: Record<FacilityKind, string> = {
  ortho: 'Orthopädie',
  hausarzt: 'Hausarzt',
  zahn: 'Zahnarzt / KFO',
  klinik: 'Klinik',
};

/** Mehrzahl für Reiter und Filter */
export const KIND_PLURAL: Record<FacilityKind, string> = {
  ortho: 'Orthopäden',
  hausarzt: 'Hausärzte',
  zahn: 'Zahnärzte & KFO',
  klinik: 'Kliniken',
};

/** Mehrzahl kurz – für die Gruppen-Knöpfe auf der Karte */
export const KIND_PLURAL_SHORT: Record<FacilityKind, string> = {
  ortho: 'Orthopäden',
  hausarzt: 'Hausärzte',
  zahn: 'Zahn & KFO',
  klinik: 'Kliniken',
};

/** Kurz für enge Stellen (Formular, Handy) */
export const KIND_SHORT: Record<FacilityKind, string> = {
  ortho: 'Orthopädie',
  hausarzt: 'Hausarzt',
  zahn: 'Zahn / KFO',
  klinik: 'Klinik',
};

/** Buchstabe im Pin (Orthopäden ohne – sie sind der Normalfall) */
export const KIND_PIN_LETTER: Record<FacilityKind, string> = { ortho: '', hausarzt: 'H', zahn: 'Z', klinik: '' };

/** „Praxis“ oder „Klinik“ – für Texte wie „Praxis löschen“ */
export const entityLabel = (k: FacilityKind) => (k === 'klinik' ? 'Klinik' : 'Praxis');

const CLINIC = /klinik|krankenhaus|spital|hospital|\breha\b/;
// Zahn zuerst prüfen: „Kieferorthopädie“ enthält „orthopädie“
const ZAHN = /zahn|kieferorthop|\bkfo\b|oralchirurg|mund.{0,4}kiefer|\bmkg\b|dental|implantolog|parodont|endodont|prothetik/;
const HAUSARZT = /hausarzt|hausaerzt|allgemeinmed|allgemeinarzt|praktische[rn]? arzt|innere med|internist/;
const ORTHO = /orthop|unfallchir|sportmed|chirotherap|wirbelsaul/;

/** Gruppe aus einem Text (Fachrichtung, Typ, Blatt- oder Praxisname) – undefined = nicht erkennbar */
export function kindFromText(text: string): FacilityKind | undefined {
  const t = normalize(text);
  if (!t) return undefined;
  if (CLINIC.test(t)) return 'klinik';
  if (ZAHN.test(t)) return 'zahn';
  if (HAUSARZT.test(t)) return 'hausarzt';
  if (ORTHO.test(t)) return 'ortho';
  return undefined;
}

/** Gruppe aus der Fachrichtung (Klinik nur über Name/Typ, nicht über die Fachrichtung) */
function kindFromSpecialty(specialty: string): FacilityKind | undefined {
  const k = kindFromText(specialty);
  return k === 'klinik' ? undefined : k;
}

/**
 * Gruppe einer Einrichtung. Fehlt sie (oder steht noch der alte Wert „praxis“),
 * wird sie aus Fachrichtung und Name erkannt – sonst Orthopädie.
 */
export function kindOf(p: Pick<Practice, 'kind'> & Partial<Pick<Practice, 'specialty' | 'name'>>): FacilityKind {
  if (p.kind && p.kind !== 'praxis') return p.kind;
  const fromName = kindFromText(p.name ?? '');
  if (p.kind === undefined && fromName === 'klinik') return 'klinik';
  return kindFromSpecialty(p.specialty ?? '') ?? (fromName !== 'klinik' ? fromName : undefined) ?? 'ortho';
}

/** Woher die Gruppe stammt – nur eindeutige Angaben überschreiben Änderungen aus der App */
export type KindSource = 'file' | 'column' | 'sheet' | 'specialty' | 'name' | 'default';

/**
 * Erkennt die Gruppe einer Zeile aus der Excel:
 * 1. Spalte „Typ“/„Art“ (z. B. „Klinik“, „Hausarzt“, „Zahnarzt“, „Orthopädie“)
 * 2. Tabellenblatt heißt z. B. „Kliniken“, „Hausärzte“, „Zahnärzte“
 * 3. Fachrichtung (z. B. „Allgemeinmedizin“ → Hausarzt, „Kieferorthopädie“ → Zahn & KFO)
 * 4. Name enthält „Klinik“, „Zahnarzt“, „Hausarzt“ …
 * Sonst: Orthopädie.
 */
export function detectKind(name: string, typeCell = '', sheetName = '', specialty = ''): { kind: FacilityKind; source: KindSource } {
  const fromType = kindFromText(typeCell);
  if (fromType) return { kind: fromType, source: 'column' };
  // „Praxis“/„MVZ“ in der Spalte Typ: sicher keine Klinik, Gruppe aus Fachrichtung/Name
  const typeSaysPractice = /praxis|arzt|mvz|ambulan/.test(normalize(typeCell));
  // Blattnamen wie „Praxen“ oder „Gebiet“ sagen nichts über die Gruppe
  const fromSheet = kindFromText(sheetName);
  if (fromSheet && !(typeSaysPractice && fromSheet === 'klinik')) return { kind: fromSheet, source: 'sheet' };
  const fromName = kindFromText(name);
  if (fromName === 'klinik' && !typeSaysPractice) return { kind: 'klinik', source: 'name' };
  const fromSpecialty = kindFromSpecialty(specialty);
  if (fromSpecialty) return { kind: fromSpecialty, source: 'specialty' };
  if (fromName && fromName !== 'klinik') return { kind: fromName, source: 'name' };
  return { kind: 'ortho', source: 'default' };
}

/** „5 Orthopäden“, „1 Klinik“ … */
export function kindCountText(n: number, k: FacilityKind): string {
  const one: Record<FacilityKind, string> = { ortho: 'Orthopäde', hausarzt: 'Hausarzt', zahn: 'Zahnarzt / KFO', klinik: 'Klinik' };
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one[k] : KIND_PLURAL[k]}`;
}
