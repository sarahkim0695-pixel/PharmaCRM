/**
 * Sprachsteuerung für die Tourplanung – versteht gesprochene oder getippte Sätze wie
 *
 *   „Plane mir für Dienstag eine Tour in Augsburg. Dr. Huber um 10 Uhr fest,
 *    den Rest mit fälligen Orthopäden auffüllen, Mittagspause halb eins, maximal 6 Besuche.“
 *
 * Alles läuft direkt auf dem Gerät (keine Daten an fremde Server). Der Satz wird in
 * Teilsätze zerlegt (Punkt, Komma, „dann“ …); in jedem Teilsatz werden Datum, Orte,
 * Praxen (unscharf, z. B. „Doktor Maier“ ≈ „Dr. Meyer“), Uhrzeiten, Mittagspause,
 * Gruppen, Kundenstatus, Anzahl, Mitbringen und Notizen erkannt.
 */
import type { CustomerState, FacilityKind, Practice } from '../types';
import { kindOf } from '../utils/kind';

export interface VoiceContext {
  today: Date;
  practices: Pick<Practice, 'id' | 'name' | 'city' | 'specialty' | 'kind'>[];
}

/** Eine genannte Praxis (eindeutig oder mit Auswahl, falls mehrere passen) */
export interface PracticeRef {
  /** Was gesagt wurde, z. B. „Dr. Huber“ */
  said: string;
  /** passende Einträge – genau einer = eindeutig */
  candidates: string[];
  /** gewählter Eintrag (bei mehreren der erste, in der Vorschau änderbar) */
  practiceId?: string;
}

export interface FixedVisit extends PracticeRef {
  /** Termin um … (Minuten seit Mitternacht) */
  time?: number;
  /** „wenn es passt“ → optional statt fest */
  optional?: boolean;
  /** „dauert eine Stunde“ → Zeit vor Ort für diesen Besuch */
  minutes?: number;
}

export interface VoiceCommand {
  text: string;
  date?: string;
  clear?: boolean;
  region?: { cities: string[]; radiusKm?: number };
  radiusKm?: number;
  /** Gruppen setzen / ergänzen / herausnehmen */
  kinds?: { mode: 'set' | 'add' | 'remove'; kinds: FacilityKind[] };
  states?: CustomerState[];
  onlyDue?: boolean;
  fill?: boolean;
  fixed: FixedVisit[];
  exclude: PracticeRef[];
  bring: { target?: PracticeRef; items: string }[];
  note?: string;
  maxVisits?: number;
  dayStart?: number;
  dayEnd?: number;
  lunch?: { enabled: boolean; from?: number; to?: number; minutes?: number };
  startMode?: 'home' | 'here';
  returnHome?: boolean;
  /** Orte, die genannt wurden, zu denen es keine Einträge gibt */
  unknownPlaces: string[];
  /** Wörter, die nicht verstanden wurden */
  unknown: string[];
}

// ---------- Text vorbereiten ----------

/** Kleinbuchstaben ohne Umlaute/Akzente – gleiche Länge wie das Original (ß → s) */
export function fold(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const l = c.toLowerCase();
    if (l === 'ß') out += 's';
    else if (l.length !== 1) out += c;
    else out += l.normalize('NFD')[0];
  }
  return out;
}

/** Lautähnlich vergleichen: Meier/Maier/Mayer, Schmidt/Schmitt, Lehmann/Lemann */
export function phon(w: string): string {
  return w
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/(ey|ay|ai|ei)/g, 'ei')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/ck/g, 'k').replace(/dt/g, 't').replace(/tz/g, 'z')
    .replace(/d$/, 't')
    .replace(/h(?![aeiou])/g, '')
    .replace(/(.)\1+/g, '$1');
}

const NUMBER_WORDS: Record<string, number> = {
  eins: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwolf: 12,
  dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
  funfundzwanzig: 25, dreisig: 30, funfunddreisig: 35, vierzig: 40, funfundvierzig: 45, funfzig: 50, sechzig: 60, neunzig: 90,
};

/** Zahlwörter und Uhrzeit-Redewendungen in Ziffern umwandeln (nur für die Auswertung) */
function digitize(w: string): string {
  let s = w
    .replace(/\bein uhr\b/g, '1 uhr')
    .replace(/\beine stunde\b/g, '60 minuten')
    .replace(/\beine halbe stunde\b|\bhalbe stunde\b/g, '30 minuten')
    .replace(/\bdreiviertel stunde\b/g, '45 minuten')
    .replace(/\banderthalb stunden\b/g, '90 minuten');
  s = s.replace(/\b[a-z]+\b/g, (word) => (NUMBER_WORDS[word] !== undefined ? String(NUMBER_WORDS[word]) : word));
  // „2 Stunden“ → „120 minuten“, „1,5 Stunden“ → „90 minuten“
  s = s
    .replace(/\b(\d{1,2})[,.]5\s*stunden?\b/g, (_, n) => `${Number(n) * 60 + 30} minuten`)
    .replace(/\b(\d{1,2})\s*stunden?\b/g, (_, n) => `${Number(n) * 60} minuten`);
  // „halb neun“ = 8:30, „viertel nach acht“ = 8:15, „viertel vor neun“ = 8:45,
  // bayerisch „viertel neun“ = 8:15, „dreiviertel neun“ = 8:45
  const hm = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')} uhr`;
  s = s
    .replace(/\bhalb (\d{1,2})\b/g, (_, n) => hm(Number(n) - 1 || 12, 30))
    .replace(/\bviertel nach (\d{1,2})\b/g, (_, n) => hm(Number(n), 15))
    .replace(/\bviertel vor (\d{1,2})\b/g, (_, n) => hm(Number(n) - 1 || 12, 45))
    .replace(/\bdreiviertel (\d{1,2})\b/g, (_, n) => hm(Number(n) - 1 || 12, 45))
    .replace(/\bviertel (\d{1,2})\b/g, (_, n) => hm(Number(n) - 1 || 12, 15));
  return s;
}

/** Teilsätze: an Satzende, Semikolon, Zeilenumbruch, Komma und „dann“/„außerdem“ trennen */
export function splitClauses(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1] ?? '';
    const prevWord = (cur.match(/([A-Za-zÄÖÜäöüß]+)$/)?.[1] ?? '').toLowerCase();
    const isAbbrev = ['dr', 'prof', 'med', 'str', 'nr', 'ca', 'bzw', 'z', 'b', 'hr', 'st', 'dipl', 'univ', 'fr'].includes(prevWord);
    const endOfSentence = (c === '.' || c === '!' || c === '?') && (next === '' || /\s/.test(next)) && !/\d$/.test(cur) && !isAbbrev;
    const comma = c === ',' && !(/\d$/.test(cur) && /\d/.test(next));
    if (c === ';' || c === '\n' || endOfSentence || comma) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out
    .flatMap((part) => part.split(/\s+(?:und dann|dann|danach|au(?:ß|ss)erdem|zusätzlich)\s+/i))
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------- Uhrzeiten ----------

interface TimeHit { start: number; end: number; minutes: number }

/** Uhrzeiten im (gefalteten, digitalisierten) Teilsatz finden */
function findTimes(w: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const add = (start: number, end: number, h: number, m: number) => {
    if (h > 23 || m > 59) return;
    if (hits.some((x) => start < x.end && x.start < end)) return;
    // Geschäftszeiten: „um 2“ = 14 Uhr
    const hh = h > 0 && h < 7 ? h + 12 : h;
    hits.push({ start, end, minutes: hh * 60 + m });
  };
  for (const m of w.matchAll(/\b(\d{1,2})[:.](\d{2})\b(?:\s*uhr)?/g)) add(m.index!, m.index! + m[0].length, Number(m[1]), Number(m[2]));
  for (const m of w.matchAll(/\b(\d{1,2})\s*uhr(?:\s+(\d{1,2})\b(?!\s*(?:km|kilometer|min|minuten|besuch|praxen|termin|stopp|kunden)))?/g)) {
    add(m.index!, m.index! + m[0].length, Number(m[1]), Number(m[2] ?? 0));
  }
  for (const m of w.matchAll(/\b(?:um|ab|bis|gegen|von|zwischen|und|spatestens|fruhestens)\s+(\d{1,2})\b(?![.:]\d)(?!\s*(?:km|kilometer|min|minuten|besuch|praxen|termin|stopp|kunden|arzte|\.))/g)) {
    const numStart = m.index! + m[0].lastIndexOf(m[1]);
    add(numStart, numStart + m[1].length, Number(m[1]), 0);
  }
  return hits.sort((a, b) => a.start - b.start);
}

// ---------- Datum ----------

const WEEKDAYS = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
const MONTHS = ['januar', 'februar', 'marz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function findDate(w: string, today: Date): { date: string; start: number; end: number } | undefined {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const plus = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  let m = w.match(/\bubermorgen\b/);
  if (m) return { date: ymd(plus(2)), start: m.index!, end: m.index! + m[0].length };
  m = w.match(/\bmorgen\b(?!s)/);
  if (m) return { date: ymd(plus(1)), start: m.index!, end: m.index! + m[0].length };
  m = w.match(/\bheute\b/);
  if (m) return { date: ymd(base), start: m.index!, end: m.index! + m[0].length };

  m = w.match(new RegExp(`\\b(?:(?:am|fur|den)\\s+)?(?:(nachste[nrs]?|kommende[nrs]?|diese[nrs]?)\\s+)?(woche\\s+)?(${WEEKDAYS.join('|')})s?\\b`));
  if (m) {
    const target = WEEKDAYS.indexOf(m[3]);
    const todayIdx = (base.getDay() + 6) % 7;
    let diff = (target - todayIdx + 7) % 7 || 7; // nächster solcher Tag (nicht heute)
    if (m[2] && m[1]?.startsWith('nachste')) {
      // „nächste Woche Dienstag“ → Dienstag der nächsten Kalenderwoche
      diff = 7 - todayIdx + target;
    }
    return { date: ymd(plus(diff)), start: m.index!, end: m.index! + m[0].length };
  }

  const resolve = (day: number, month: number, year?: number) => {
    if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
    let y = year ? (year < 100 ? 2000 + year : year) : base.getFullYear();
    let d = new Date(y, month - 1, day);
    if (!year && d < base) d = new Date(++y, month - 1, day);
    return ymd(d);
  };
  m = w.match(new RegExp(`\\b(?:am\\s+)?(\\d{1,2})\\.?\\s*(${MONTHS.join('|')})\\b(?:\\s+(\\d{4}))?`));
  if (m) {
    const date = resolve(Number(m[1]), MONTHS.indexOf(m[2]) + 1, m[3] ? Number(m[3]) : undefined);
    if (date) return { date, start: m.index!, end: m.index! + m[0].length };
  }
  m = w.match(/\b(?:am\s+)?(\d{1,2})\.(\d{1,2})\.(\d{2,4})?/);
  if (m) {
    const date = resolve(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined);
    if (date) return { date, start: m.index!, end: m.index! + m[0].length };
  }
  return undefined;
}

// ---------- Praxen und Orte ----------

/** Wörter, die keine Namen sind (Befehle, Füllwörter, Fachbegriffe) */
const VOCAB = new Set(
  (
    'plane plan planen mach mache erstelle erstell bitte mir mich ich du wir eine einen ein einer tour route fahrt besuchstour tag tage ' +
    'am an im in um ab bis von zu zum zur bei mit fur und oder auch noch dann danach ausserdem auserdem zusatzlich die der das den dem des ' +
    'fest feste fester festen fix termin termine uhr rest restlichen restliche restlich mal soll sollst will mochte muss mussen kann ' +
    'gerne gern danke ok okay so wie was wo wann heute morgen ubermorgen woche nachste nachsten nachster kommende kommenden diese diesen dieser ' +
    'praxis praxen arzt arzte arztin doktor dr frau herr prof besuch besuche besuchen kunden kunde stopps stopp stops fahren fahre fahr ' +
    'hin dort da hier dazu alle allen alles nur maximal max hochstens mindestens etwa ungefahr circa ca km kilometer umkreis umgebung raum ' +
    'rund herum gegend nahe umland minuten min stunde stunden zeit zeiten einplanen einplane plane einbauen nimm nehme auf mache ' +
    'gibt geben anschliesend anschliessend zuerst erst zuletzt danach vorher nachher spater fruher wieder bitte tour moglichst ' +
    'orthopadie chirurgie medizin zentrum mvz gemeinschaftspraxis klinikum klinik hausarztpraxis zahnarztpraxis ' +
    'montag dienstag mittwoch donnerstag freitag samstag sonntag montags dienstags mittwochs donnerstags freitags'
  ).split(' '),
);
const TITLES = new Set(['dr', 'med', 'dent', 'prof', 'dipl', 'univ', 'priv', 'doz', 'herr', 'frau', 'praxis', 'gemeinschaftspraxis', 'facharztpraxis', 'hausarztpraxis', 'arztpraxis', 'zahnarztpraxis', 'praxisgemeinschaft', 'fur', 'und', 'gbr', 'mvz', 'partg', 'mbb']);
const GENERIC = new Set(['am', 'im', 'an', 'der', 'die', 'das', 'den', 'dem', 'zum', 'zur', 'orthopadie', 'chirurgie', 'zentrum', 'klinik', 'klinikum', 'medizin', 'allgemeinmedizin', 'innere', 'hausarzt', 'zahnarzt', 'kieferorthopadie', 'unfallchirurgie', 'sport', 'gesundheit', 'neu', 'alt', 'st', 'sankt']);
const CUE = /^(dr|doktor|doctor|praxis|frau|herr|bei|zu|zum|zur|termin)$/;
/** Titel vor einem Namen, die zum Treffer gehören („Dr.“, „Praxis“) */
const NAME_PREFIX = new Set(['dr', 'doktor', 'med', 'dent', 'prof', 'dipl', 'univ', 'praxis', 'frau', 'herr', 'gemeinschaftspraxis', 'hausarztpraxis', 'zahnarztpraxis', 'arztpraxis', 'facharztpraxis']);
const BRING = /\b(mitnehmen|mitbringen|einpacken|einstecken|bring|bringe|nimm|nehme|pack|packe|dabei haben|dabeihaben)\b/;
/** Wörter, die in Befehlen vorkommen, aber nicht als „nicht verstanden“ gemeldet werden */
const IGNORE = new Set(
  (
    'wenn es passt optional moglich falls eventuell vielleicht ohne kein keine keinen nicht nach hause zuhause daheim zuruck heim von ab hier ' +
    'neu nochmal besucht lange sein fertig start starten los losfahren beginn beginnen anfangen ende feierabend schluss spatestens fruh fruhestens ' +
    'zwischen wieder machen mache weg weglassen streichen raus entfernen auslassen kontakt startlochern lass lasse aus dauert dauern'
  ).split(' '),
);

const words = (s: string) => fold(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

interface NameIndex {
  id: string;
  city: string;
  /** Namensbestandteile ohne Titel (z. B. ["anna", "beispiel"] oder ["orthopadie", "am", "rathaus"]) */
  core: string[];
}

interface Hit { start: number; end: number; ids: string[] }

/** Wort-Positionen im Arbeitsstring */
function tokens(w: string): { word: string; start: number; end: number }[] {
  return [...w.matchAll(/[a-z0-9]+/g)].map((m) => ({ word: m[0], start: m.index!, end: m.index! + m[0].length }));
}

function cityKeys(city: string): string[][] {
  const base = fold(city).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const full = base.split(' ').filter(Boolean);
  const keys = [full];
  if (full.length > 1 && full[0].length >= 4) keys.push([full[0]]); // „Kempten (Allgäu)“ → „kempten“
  return keys;
}

class Matcher {
  names: NameIndex[];
  cities: { name: string; keys: string[][] }[];
  cityWords: Set<string>;

  constructor(ctx: VoiceContext) {
    this.names = ctx.practices.map((p) => ({ id: p.id, city: p.city, core: words(p.name).filter((x) => !TITLES.has(x)) }));
    const cityNames = [...new Set(ctx.practices.map((p) => p.city).filter(Boolean))];
    this.cities = cityNames.map((name) => ({ name, keys: cityKeys(name) }));
    this.cityWords = new Set(this.cities.flatMap((c) => c.keys.flat()));
  }

  /**
   * Praxen im Teilsatz finden (längste Treffer zuerst).
   * `requireCue`: einzelne Wörter nur mit „Dr.“, „für“, „bei“ … davor (z. B. beim Mitbringen,
   * damit „Muster A mitnehmen“ nicht die „Praxis Muster“ trifft).
   */
  practices(w: string, requireCue = false): Hit[] {
    const toks = tokens(w);
    const hits: Hit[] = [];
    const taken = new Set<number>();
    const same = (a: string, b: string) => a === b || (a.length >= 4 && phon(a) === phon(b));
    // 1. ganzer Name (ohne Titel), auch ohne Vornamen: „anna beispiel“, „orthopadie am rathaus“, „beispiel“
    const candidates = new Map<string, { len: number; ids: string[] }>();
    for (const n of this.names) {
      const variants: string[][] = [];
      if (n.core.length) variants.push(n.core);
      // Nachname allein (bei „Vorname Nachname“) – nur wenn kein allgemeines Wort und kein Ort
      const last = n.core[n.core.length - 1];
      if (n.core.length >= 2 && last && last.length >= 3 && !GENERIC.has(last) && !this.cityWords.has(last) && !VOCAB.has(last)) variants.push([last]);
      if (n.core.length === 1 && (GENERIC.has(n.core[0]) || this.cityWords.has(n.core[0]) || VOCAB.has(n.core[0]))) variants.pop();
      for (const v of variants) {
        for (let i = 0; i + v.length <= toks.length; i++) {
          if (!v.every((x, k) => same(toks[i + k].word, x))) continue;
          // einzelnes Wort: nur mit Hinweis davor („Dr.“, „bei“ …) oder wenn es lang genug ist
          if (v.length === 1) {
            const before = toks.slice(Math.max(0, i - 2), i).map((t) => t.word);
            const cued = before.some((b) => CUE.test(b) || (requireCue && /^(fur|zu|zur|zum|bei)$/.test(b)));
            if (!cued && (requireCue || v[0].length < 5)) continue;
          }
          const key = `${i}:${v.length}`;
          const c = candidates.get(key) ?? { len: v.length, ids: [] };
          if (!c.ids.includes(n.id)) c.ids.push(n.id);
          candidates.set(key, c);
        }
      }
    }
    // längere Treffer haben Vorrang
    const sorted = [...candidates.entries()].sort((a, b) => b[1].len - a[1].len);
    for (const [key, c] of sorted) {
      const i = Number(key.split(':')[0]);
      const range = Array.from({ length: c.len }, (_, k) => i + k);
      if (range.some((r) => taken.has(r))) continue;
      range.forEach((r) => taken.add(r));
      // Titel/Hinweis davor mitnehmen („Dr.“, „Praxis“), damit sie nicht als „unbekannt“ erscheinen
      let s = i;
      while (s > 0 && NAME_PREFIX.has(toks[s - 1].word)) s--;
      hits.push({ start: toks[s].start, end: toks[i + c.len - 1].end, ids: c.ids });
    }
    return hits.sort((a, b) => a.start - b.start);
  }

  /** Orte im Teilsatz finden */
  places(w: string): { start: number; end: number; city: string }[] {
    const toks = tokens(w);
    const out: { start: number; end: number; city: string }[] = [];
    for (const c of this.cities) {
      for (const key of c.keys) {
        for (let i = 0; i + key.length <= toks.length; i++) {
          if (key.every((x, k) => toks[i + k].word === x)) {
            if (!out.some((o) => o.city === c.name)) out.push({ start: toks[i].start, end: toks[i + key.length - 1].end, city: c.name });
          }
        }
      }
    }
    return out;
  }
}

// ---------- Auswerten ----------

/** Enthält der Teilsatz etwas, das nach einer Anweisung aussieht (Datum, Uhrzeit, Ort, „Dr.“ …)? */
function hasCommandSignal(f: string, matcher: Matcher): boolean {
  const w = digitize(f);
  return (
    !!findDate(w, new Date()) ||
    findTimes(w).length > 0 ||
    matcher.places(w).length > 0 ||
    /\b(dr|doktor|praxis|bei|termin|tour|mittag\w*|pause|besuche?|km|kilometer|fallige?n?|auffullen|rest|nur|ohne|ab|bis)\b/.test(w) ||
    KIND_PATTERNS.some(([, re]) => new RegExp(re.source).test(w))
  );
}

const KIND_PATTERNS: [FacilityKind, RegExp][] = [
  ['ortho', /\b(orthopaden|orthopade|orthopadinnen|orthopadie|orthopadischen?|orthos)\b/g],
  ['hausarzt', /\b(hausarzte|hausarzt|hausarztin|hausarztinnen|allgemeinmediziner|allgemeinarzte)\b/g],
  ['zahn', /\b(zahnarzte|zahnarzt|zahnarztin|zahnarztinnen|kfo|kieferorthopaden|kieferorthopade|zahnmediziner|zahnarztpraxen)\b/g],
  ['klinik', /\b(kliniken|klinik|krankenhaus|krankenhauser|klinikum|kliniken)\b/g],
];

/** Liest einen gesprochenen/getippten Auftrag */
export function interpretCommand(text: string, ctx: VoiceContext): VoiceCommand {
  const cmd: VoiceCommand = { text, fixed: [], exclude: [], bring: [], unknownPlaces: [], unknown: [] };
  const matcher = new Matcher(ctx);
  const byId = new Map(ctx.practices.map((p) => [p.id, p]));
  const ref = (said: string, ids: string[], regionCities: string[]): PracticeRef => {
    // mehrere Treffer: den im genannten Ort bevorzugen
    const inRegion = ids.filter((id) => regionCities.includes(byId.get(id)?.city ?? ''));
    const ordered = inRegion.length ? [...inRegion, ...ids.filter((id) => !inRegion.includes(id))] : ids;
    return { said: said.trim(), candidates: ordered, practiceId: ordered[0] };
  };
  const mentionedCities: string[] = [];
  let pendingItems = '';
  let sawPlanWord = false;
  /** Was der vorige Teilsatz war – für „…, 30 Minuten“ / „…, dauert eine Stunde“ */
  let prevClause: 'lunch' | 'fixed' | 'other' = 'other';

  const clauses = splitClauses(text);
  for (let ci = 0; ci < clauses.length; ci++) {
    const clause = clauses[ci];
    const original = clause;
    const f = fold(clause);

    // „Muster A, Katalog für Dr. Huber mitnehmen“: Aufzählung vor dem Komma gehört zum Mitbringen
    const nextIsBring = BRING.test(fold(clauses[ci + 1] ?? ''));
    if (nextIsBring && !BRING.test(f) && !hasCommandSignal(f, matcher)) {
      pendingItems = [pendingItems, original.trim()].filter(Boolean).join(', ');
      continue;
    }

    // Notiz: „Notiz: …“, „Merke: …“
    const note = f.match(/^\s*(notiz|notieren|merke|merk dir|erinnerung|erinnere mich( daran)?)\b[:\s]*/);
    if (note) {
      const t = original.slice(note[0].length).trim();
      if (t) cmd.note = cmd.note ? `${cmd.note}; ${t}` : t;
      continue;
    }

    // Mitbringen: „Muster A für Dr. Huber mitnehmen“, „Bring Katalog zu Praxis am Dom“, „Visitenkarten einpacken“
    if (BRING.test(f)) {
      let w = f;
      const bringHits = matcher.practices(w, true);
      // Ziel = die Praxis hinter „für/zu/bei“ – sonst die letzte genannte
      const hit =
        bringHits.find((x) => /\b(fur|zu|zur|zum|bei)\s+((dr|doktor|praxis|frau|herr)\s+)*$/.test(w.slice(0, x.start))) ?? bringHits[bringHits.length - 1];
      let target: PracticeRef | undefined;
      let items = original;
      if (hit) {
        target = ref(original.slice(hit.start, hit.end), hit.ids, mentionedCities);
        items = original.slice(0, hit.start) + ' ' + original.slice(hit.end);
        w = w.slice(0, hit.start) + ' '.repeat(hit.end - hit.start) + w.slice(hit.end);
      }
      items = items
        .replace(/\b(bitte|noch|auch|ich|will|möchte|mochte|muss|soll|sollte|mir|und dann)\b/gi, ' ')
        .replace(/\b(mitnehmen|mitbringen|einpacken|einstecken|bringen|bringe|bring|nimm|nehme|nehmen|packe|pack|dabei haben|dabeihaben|mit|ein)\b/gi, ' ')
        .replace(/\b(für|fur|zu|zur|zum|bei|in die|in der|in den)\b\s*$/gi, ' ')
        .replace(/^\s*(für|fur|zu|zur|zum|bei)\b/gi, ' ')
        .replace(/\b(für|fur|zu|zur|zum|bei)\s*$/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (pendingItems) items = [pendingItems, items].filter(Boolean).join(', ');
      pendingItems = '';
      if (items) cmd.bring.push({ target, items });
      continue;
    }

    let w = digitize(f);
    const w0 = w; // unverändert – für Verneinungen vor/nach einem Wort
    const consume = (start: number, end: number) => {
      w = w.slice(0, start) + ' '.repeat(Math.max(0, end - start)) + w.slice(end);
    };
    const take = (re: RegExp): RegExpMatchArray | null => {
      const m = w.match(re);
      if (m) consume(m.index!, m.index! + m[0].length);
      return m;
    };
    /** „ohne Dr. Huber“, „nicht zu Praxis X“, „Dr. Huber weglassen“ */
    const negatedAt = (start: number, end: number) =>
      /\b(ohne|nicht|kein\w*|ausser|auser)\s+((zu|zur|zum|bei|in|nach|die|der|das|den|dem|dr|doktor|praxis|frau|herr)\s+)*$/.test(w0.slice(Math.max(0, start - 40), start)) ||
      /^\s*(weg|weglassen|streichen|raus|rausnehmen|entfernen|auslassen|nicht)\b/.test(w0.slice(end, end + 20));
    let understood = false;
    const planWord = /\b(plane|plan|planen|erstelle|erstell|mach|mache|tour)\b/.test(w);

    // Neu anfangen
    if (take(/\b(neu anfangen|von vorne?|alles loschen|tour leeren|leere die tour|neu planen|starte neu|nochmal neu)\b/)) {
      cmd.clear = true;
      understood = true;
    }

    // Datum
    const date = findDate(w, ctx.today);
    if (date) {
      cmd.date = date.date;
      consume(date.start, date.end);
      understood = true;
    }

    // Mittagspause – nur Zeiten rund um das Wort „Mittag/Pause“
    const lunchWord = w.match(/\b(mittag\w*|pause|essen)\b/);
    if (lunchWord) {
      const lunch = { ...(cmd.lunch ?? { enabled: true }) } as NonNullable<VoiceCommand['lunch']>;
      const at = lunchWord.index!;
      const near = (start: number) => start >= at - 14 && start <= at + lunchWord[0].length + 40;
      if (/\b(keine?n?|ohne|nicht)\s+(\w+\s+)?$/.test(w.slice(Math.max(0, at - 20), at)) || /^\w*\s+(weglassen|streichen|ausfallen)\b/.test(w.slice(at))) {
        lunch.enabled = false;
        take(/\b(keine?n?|ohne|nicht)\b/);
      } else {
        lunch.enabled = true;
        const min = w.slice(at).match(/\b(\d{1,3})\s*(min|minuten)\b/) ?? w.match(/\b(\d{1,3})\s*(min|minuten)\b/);
        if (min) {
          lunch.minutes = Number(min[1]);
          take(new RegExp(`\\b${min[1]}\\s*(min|minuten)\\b`));
        }
        const times = findTimes(w).filter((t) => near(t.start));
        if (times.length >= 2) {
          lunch.from = times[0].minutes;
          lunch.to = times[1].minutes;
          if (!/\bzwischen\b/.test(w) && lunch.minutes === undefined) lunch.minutes = lunch.to - lunch.from;
        } else if (times.length === 1) {
          lunch.from = times[0].minutes;
          lunch.minutes ??= 45;
          lunch.to = times[0].minutes + lunch.minutes;
        }
        times.forEach((t) => consume(t.start, t.end));
      }
      cmd.lunch = lunch;
      consume(at, at + lunchWord[0].length);
      understood = true;
    }

    // Start: von zuhause / ab hier; Rückkehr
    if (take(/\b(von|ab)\s+(hier|meinem standort|meiner position|aktuellem standort|wo ich bin)\b|\bjetzt los\b/)) {
      cmd.startMode = 'here';
      understood = true;
    }
    if (take(/\b(von|ab)\s+(zuhause|zu hause|daheim)\b/)) {
      cmd.startMode = 'home';
      understood = true;
    }
    if (take(/\bnicht\s+(mehr\s+)?(nach hause|heim|zuruck)\w*\b|\bende beim letzten\w*\b|\bnicht zuruckfahren\b/)) {
      cmd.returnHome = false;
      understood = true;
    }

    // Arbeitsbeginn und -ende („ab 8 los“, „bis 16 Uhr fertig“, „um 17 Uhr zuhause“, „von 8 bis 16 Uhr“)
    const anyPractice = matcher.practices(w).length > 0;
    for (const t of findTimes(w)) {
      const before = w.slice(Math.max(0, t.start - 25), t.start);
      const after = w.slice(t.end, t.end + 25);
      const startCue = anyPractice ? /\b(start\w*|los\w*|beginn\w*|anfang\w*|fruh\w*|ab)\s*(um\s*)?$/ : /\b(start\w*|los\w*|beginn\w*|anfang\w*|fruh\w*|ab|von)\s*(um\s*)?$/;
      if (startCue.test(before) || /^\s*(uhr\s*)?(los|starten|anfangen|beginnen|losfahren)\b/.test(after)) {
        cmd.dayStart = t.minutes;
        consume(t.start, t.end);
        understood = true;
      } else if (
        (/\b(bis|ende|feierabend|fertig|schluss|spatestens|zuhause|daheim|zuruck)\b[^0-9]*$/.test(before) && !anyPractice) ||
        /^\s*(uhr\s*)?(fertig|zuhause|zu hause|daheim|feierabend|schluss|zuruck|ende|wieder)\b/.test(after)
      ) {
        cmd.dayEnd = t.minutes;
        if (/(zuhause|zu hause|daheim|zuruck)/.test(before + after)) cmd.returnHome = true;
        consume(t.start, t.end);
        understood = true;
      }
    }

    // Anzahl Besuche
    const max = take(/\b(?:(?:max|maximal|hochstens|bis zu|nicht mehr als)\s+)?(\d{1,2})\s+(besuche?|praxen|termine|stopps?|kunden|arzte|einrichtungen)\b/);
    if (max) {
      cmd.maxVisits = Number(max[1]);
      understood = true;
    }

    // Umkreis
    const km = take(/\b(?:im\s+)?(?:umkreis\s+(?:von\s+)?)?(\d{1,3})\s*(km|kilometer)\b(?:\s+umkreis)?/);
    if (km) {
      cmd.radiusKm = Number(km[1]);
      understood = true;
    }

    // Praxen (vor Orten und Gruppen: „Orthopädie am Rathaus“, „Chirurgie Ingolstadt“)
    const hits = matcher.practices(w);
    const clausePractices = hits.map((hit) => ({ hit, said: original.slice(hit.start, hit.end) }));
    hits.forEach((hit) => consume(hit.start, hit.end));

    // Orte
    const places = matcher.places(w).filter((p) => !negatedAt(p.start, p.end));
    for (const p of matcher.places(w)) consume(p.start, p.end);
    if (places.length) {
      places.forEach((p) => mentionedCities.push(p.city));
      const cities = [...new Set([...(cmd.region?.cities ?? []), ...places.map((p) => p.city)])];
      cmd.region = { cities, radiusKm: cmd.region?.radiusKm };
      if (/\bnur\s+(direkt\s+)?(in|im)\b/.test(w0)) cmd.region.radiusKm = 0;
      else if (/\b(rund|herum|umgebung|raum|umland|gegend|nahe)\b/.test(w0)) cmd.region.radiusKm ??= 15;
      understood = true;
    }

    // Kundenstatus und „fällig“ (vor der Verneinung, wegen „nicht in Kontakt“)
    const states: CustomerState[] = [];
    if (take(/\bbestellende?n?\b|\bbestellkunden\b|\bstammkunden\b|\baktive?n? kunden\b/)) states.push('aktiv');
    if (take(/\bin den startlochern\b|\bstartlochern?\b|\binteressenten\b|\bim gesprach\b/)) states.push('prozess');
    if (take(/\bnicht in kontakt\b|\bneukunden\b|\bneue kunden\b|\bakquise\b|\bkaltakquise\b|\bnoch nie kontakt\b/)) states.push('kein');
    if (states.length) {
      cmd.states = [...new Set([...(cmd.states ?? []), ...states])];
      understood = true;
    }
    if (take(/\b(fallige?n?|fallig|uberfallige?n?|lange nicht besucht\w*|dringende?n?)\b/)) {
      cmd.onlyDue = true;
      cmd.fill = true;
      understood = true;
    }

    // Gruppen: „nur Orthopäden“, „auch Hausärzte“, „ohne Kliniken“
    const kinds: FacilityKind[] = [];
    let kindNeg = false;
    for (const [k, re] of KIND_PATTERNS) {
      for (const m of w.matchAll(re)) {
        if (!kinds.includes(k)) kinds.push(k);
        if (negatedAt(m.index!, m.index! + m[0].length)) kindNeg = true;
      }
      w = w.replace(re, (x) => ' '.repeat(x.length));
    }
    if (kinds.length) {
      const add = /\b(auch|zusatzlich|plus|dazu|ebenfalls)\b/.test(w);
      const mode = kindNeg ? 'remove' : add ? 'add' : 'set';
      if (cmd.kinds && cmd.kinds.mode === mode) cmd.kinds.kinds = [...new Set([...cmd.kinds.kinds, ...kinds])];
      else cmd.kinds = { mode, kinds };
      understood = true;
    }

    // Auffüllen
    let fillWord = false;
    while (take(/\b(auffullen|auffulle|fulle|full|fullen|erganze|erganzen|erganz|vorschlagen|vorschlage|schlag|schlage|passende?n?|rest|restliche?n?|aufstocken|weitere?n?)\b/)) fillWord = true;
    if (fillWord) {
      cmd.fill = true;
      understood = true;
    }

    // Genannte Praxen: fest (mit Uhrzeit = Termin) oder ausgeschlossen
    if (clausePractices.length) {
      const times = findTimes(w);
      const optional = /\b(optional|wenn es passt|wenn moglich|falls zeit|falls es passt|eventuell|vielleicht)\b/.test(w0);
      clausePractices.forEach(({ hit, said }, i) => {
        const r = ref(said, hit.ids, [...mentionedCities, ...(cmd.region?.cities ?? [])]);
        if (negatedAt(hit.start, hit.end)) {
          cmd.exclude.push(r);
          return;
        }
        // Uhrzeit hinter dem Namen (bis zum nächsten Namen) gehört zu dieser Praxis
        const nextStart = clausePractices[i + 1]?.hit.start ?? Infinity;
        const t = times.find((x) => x.start >= hit.end && x.start < nextStart) ?? (clausePractices.length === 1 ? times[0] : undefined);
        // „Dr. Huber 90 Minuten“, „bei Dr. Huber eine Stunde einplanen“ → Zeit vor Ort
        const durRe = /\b(\d{1,3})\s*(min|minuten)\b/g;
        const dur = [...w.matchAll(durRe)].find((m) => m.index! >= hit.end && m.index! < nextStart) ?? (clausePractices.length === 1 ? [...w.matchAll(durRe)][0] : undefined);
        cmd.fixed.push({ ...r, time: t?.minutes, optional: optional || undefined, minutes: dur ? Number(dur[1]) : undefined });
        if (t) consume(t.start, t.end);
        if (dur) consume(dur.index!, dur.index! + dur[0].length);
      });
      understood = true;
    }

    // „…, dauert eine Stunde“ direkt nach einer Praxis → Zeit vor Ort für diesen Besuch
    const loneVisit = w.match(/^\s*(?:(?:dauert|dauer|braucht|brauche|einplanen|eingeplant|zeit|vor ort|etwa|ca|ungefahr|bitte|mit|fur)\s+)*(\d{1,3})\s*(min|minuten)\b(?:\s+(?:einplanen|vor ort|dauer|zeit|lang|bleiben))*\s*$/);
    if (loneVisit && prevClause === 'fixed' && !clausePractices.length && cmd.fixed.length) {
      cmd.fixed[cmd.fixed.length - 1].minutes = Number(loneVisit[1]);
      consume(0, w.length);
      understood = true;
    }

    // „…, 30 Minuten“ direkt nach der Mittagspause
    const lone = w.match(/^\s*(\d{1,3})\s*(min|minuten)\s*$/);
    if (lone && cmd.lunch?.enabled && prevClause === 'lunch') {
      const minutes = Number(lone[1]);
      if (cmd.lunch.from !== undefined && cmd.lunch.to !== undefined && cmd.lunch.to - cmd.lunch.from === (cmd.lunch.minutes ?? 0)) {
        cmd.lunch.to = cmd.lunch.from + minutes; // feste Pause: Ende verschieben
      }
      cmd.lunch.minutes = minutes;
      consume(lone.index!, lone.index! + lone[0].length);
      understood = true;
    }

    // „in Regensburg“, obwohl es dort keine Einträge gibt
    const unknownPlace = w.match(/\b(?:in|nach|raum|rund um)\s+([a-z][a-z-]{3,})\b/);
    if (unknownPlace && !VOCAB.has(unknownPlace[1]) && !IGNORE.has(unknownPlace[1])) {
      const s0 = unknownPlace.index! + unknownPlace[0].length - unknownPlace[1].length;
      cmd.unknownPlaces.push(original.slice(s0, s0 + unknownPlace[1].length));
      consume(unknownPlace.index!, unknownPlace.index! + unknownPlace[0].length);
      understood = true;
    }

    // Übrig gebliebene Wörter
    const rest = tokens(w)
      .map((t) => t.word)
      .filter((x) => !VOCAB.has(x) && !IGNORE.has(x) && !/^\d+$/.test(x));
    if (!understood && rest.length) {
      // evtl. Aufzählung von Dingen zum Mitnehmen vor „… mitnehmen“
      pendingItems = [pendingItems, original.trim()].filter(Boolean).join(', ');
      continue;
    }
    if (planWord) sawPlanWord = true;
    cmd.unknown.push(...rest);
    prevClause = lunchWord ? 'lunch' : clausePractices.length && !clausePractices.every(({ hit }) => negatedAt(hit.start, hit.end)) ? 'fixed' : prevClause === 'fixed' && loneVisit ? 'fixed' : 'other';
  }
  if (pendingItems) cmd.unknown.push(...words(pendingItems).filter((x) => !VOCAB.has(x)));

  // Region ohne Umkreis: Standard 10 km (wie in der Tour-Ansicht)
  if (cmd.region && cmd.region.radiusKm === undefined) cmd.region.radiusKm = cmd.radiusKm ?? 10;
  // Ohne genannte Praxen, aber mit Ort, Datum oder „Tour“: Vorschläge machen
  if (cmd.region) cmd.fill = true;
  if (!cmd.fixed.length && !cmd.fill && (cmd.states || cmd.onlyDue || cmd.kinds?.mode === 'set')) cmd.fill = true;
  // „Plane mir Dienstag eine Tour“ ohne Praxen und Ort → Vorschläge rund um zuhause
  if (sawPlanWord && !cmd.fixed.length && !cmd.bring.some((b) => b.target)) cmd.fill = true;
  return cmd;
}

/** Ist überhaupt etwas verstanden worden? */
export function isEmpty(cmd: VoiceCommand): boolean {
  return (
    !cmd.date && !cmd.clear && !cmd.region && cmd.radiusKm === undefined && !cmd.kinds && !cmd.states && !cmd.onlyDue && !cmd.fill &&
    !cmd.fixed.length && !cmd.exclude.length && !cmd.bring.length && !cmd.note && cmd.maxVisits === undefined &&
    cmd.dayStart === undefined && cmd.dayEnd === undefined && !cmd.lunch && !cmd.startMode && cmd.returnHome === undefined
  );
}

/** Gruppe einer Praxis (für Anzeige in der Vorschau) */
export const kindOfRef = (p: Pick<Practice, 'kind' | 'specialty' | 'name'>) => kindOf(p);
