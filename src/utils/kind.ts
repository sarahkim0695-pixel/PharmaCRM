/** Praxis oder Klinik: Bezeichnungen und automatische Erkennung. */
import type { FacilityKind, Practice } from '../types';
import { normalize } from './text';

export const KIND_LABEL: Record<FacilityKind, string> = { praxis: 'Praxis', klinik: 'Klinik' };
export const KIND_PLURAL: Record<FacilityKind, string> = { praxis: 'Praxen', klinik: 'Kliniken' };

export function kindOf(p: Pick<Practice, 'kind'>): FacilityKind {
  return p.kind ?? 'praxis';
}

const CLINIC_WORDS = /klinik|krankenhaus|spital|hospital/;

/** Woher die Art stammt – nur eindeutige Angaben überschreiben Änderungen aus der App */
export type KindSource = 'column' | 'sheet' | 'name' | 'default';

/**
 * Erkennt die Art einer Einrichtung:
 * 1. Spalte „Typ“/„Art“ (z. B. „Klinik“, „Praxis“, „MVZ“)
 * 2. Tabellenblatt heißt z. B. „Kliniken“
 * 3. Name enthält „Klinik“, „Klinikum“, „Krankenhaus“ …
 */
export function detectKind(name: string, typeCell = '', sheetName = ''): { kind: FacilityKind; source: KindSource } {
  const t = normalize(typeCell);
  if (t) {
    if (CLINIC_WORDS.test(t) || /\breha\b/.test(t)) return { kind: 'klinik', source: 'column' };
    if (/praxis|arzt|mvz|ambulan/.test(t)) return { kind: 'praxis', source: 'column' };
  }
  const sh = normalize(sheetName);
  if (CLINIC_WORDS.test(sh)) return { kind: 'klinik', source: 'sheet' };
  if (/praxen|praxis/.test(sh)) return { kind: 'praxis', source: 'sheet' };
  if (CLINIC_WORDS.test(normalize(name))) return { kind: 'klinik', source: 'name' };
  return { kind: 'praxis', source: 'default' };
}

/** „Praxis“/„Praxen“ oder „Einrichtung(en)“, sobald es auch Kliniken gibt */
export function entityWord(n: number, hasClinics: boolean): string {
  const [one, many] = hasClinics ? ['Einrichtung', 'Einrichtungen'] : ['Praxis', 'Praxen'];
  return `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;
}
