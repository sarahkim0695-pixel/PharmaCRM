/**
 * Tour-Optimierung: In welcher Reihenfolge besuche ich die Praxen, damit
 *  1. möglichst alle (wichtigen) Praxen in den Tag passen,
 *  2. ich möglichst früh fertig bin (wenig Fahr- und Wartezeit),
 *  3. Öffnungszeiten, Termine, Mittagspause und Feierabend eingehalten werden?
 *
 * Verfahren (Heuristik, für bis zu ca. 40 Stopps in Millisekunden):
 *  - „Günstigstes Einfügen“: Stopps nacheinander dort einfügen, wo sie den Tag am wenigsten verlängern
 *  - Verbessern durch Verschieben, Tauschen und Umdrehen von Teilstücken (2-opt)
 *  - mehrere Durchläufe mit leichtem Zufall, der beste gewinnt
 *  - zum Schluss: Abfahrt so spät wie möglich, ohne später fertig zu werden (weniger Warten)
 *
 * Diese Datei kennt keine Praxen und keine Karte – nur Zahlen. Dadurch ist sie gut testbar.
 */
import type { TimeRange } from '../types';

export interface OptStop {
  /** Erlaubte Startzeiten des Besuchs (Minuten seit Mitternacht), aufsteigend sortiert */
  windows: TimeRange[];
  /** Parken & Fußweg (Minuten) – nach der Ankunft, vor dem Besuch */
  park: number;
  /** Aufenthalt vor Ort (Minuten) */
  visit: number;
  /** Muss in die Tour (z. B. Termin) */
  must: boolean;
  /** Wichtigkeit (> 0), z. B. höher bei „lange nicht besucht“ */
  weight: number;
}

export interface OptInput {
  dayStart: number;
  dayEnd: number;
  returnToStart: boolean;
  /** Pause: Beginn frühestens `from`, Ende spätestens `to` */
  lunch?: { from: number; to: number; minutes: number };
  stops: OptStop[];
  /** Fahrminuten: Index 0 = Start, i + 1 = stops[i] */
  travel: number[][];
  /** Höchstens so viele Besuche (feste Stopps zählen mit, werden aber nie weggelassen) */
  maxVisits?: number;
}

export type OptItem =
  | { kind: 'visit'; stop: number; driveStart: number; driveMinutes: number; arrive: number; start: number; end: number; wait: number }
  | { kind: 'break'; start: number; end: number };

export interface OptResult {
  /** Reihenfolge der Stopps (Indizes in input.stops) */
  order: number[];
  items: OptItem[];
  dropped: number[];
  lunchIncluded: boolean;
  departure: number;
  /** Zeitpunkt Rückkehr (bzw. Ende des letzten Besuchs) */
  end: number;
  driveMinutes: number;
  waitMinutes: number;
  returnDrive: number;
}

const LUNCH = -1;
const MUST_PENALTY = 1_000_000;
const LUNCH_PENALTY = 100_000;
const STOP_PENALTY = 1_000;

interface Sim {
  items: OptItem[];
  end: number;
  drive: number;
  wait: number;
  returnDrive: number;
}

/** Spielt eine Reihenfolge durch. null = nicht machbar. */
export function simulate(input: OptInput, seq: number[], departure = input.dayStart): Sim | null {
  let time = departure;
  let loc = 0;
  let drive = 0;
  let wait = 0;
  const items: OptItem[] = [];
  for (const el of seq) {
    if (el === LUNCH) {
      const L = input.lunch!;
      const s = Math.max(time, L.from);
      if (s + L.minutes > L.to) return null;
      items.push({ kind: 'break', start: s, end: s + L.minutes });
      time = s + L.minutes;
      continue;
    }
    const st = input.stops[el];
    const d = input.travel[loc][el + 1];
    const driveStart = time;
    time += d;
    drive += d;
    const arrive = time;
    const ready = arrive + st.park;
    let start = -1;
    for (const w of st.windows) {
      if (w.to >= ready) {
        start = Math.max(ready, w.from);
        break;
      }
    }
    if (start < 0) return null;
    wait += start - ready;
    const end = start + st.visit;
    items.push({ kind: 'visit', stop: el, driveStart, driveMinutes: d, arrive, start, end, wait: start - ready });
    time = end;
    loc = el + 1;
  }
  let returnDrive = 0;
  if (input.returnToStart) {
    returnDrive = input.travel[loc][0];
    time += returnDrive;
    drive += returnDrive;
  }
  if (time > input.dayEnd) return null;
  return { items, end: time, drive, wait, returnDrive };
}

function penalty(input: OptInput, seq: number[]): number {
  const inSeq = new Set(seq);
  let p = 0;
  input.stops.forEach((s, i) => {
    if (!inSeq.has(i)) p += s.must ? MUST_PENALTY : STOP_PENALTY * s.weight;
  });
  if (input.lunch && !inSeq.has(LUNCH)) p += LUNCH_PENALTY;
  return p;
}

/** Je kleiner, desto besser. */
function cost(input: OptInput, seq: number[], sim: Sim): number {
  return penalty(input, seq) + (sim.end - input.dayStart) + 0.05 * sim.drive;
}

function evaluate(input: OptInput, seq: number[]): number {
  const sim = simulate(input, seq);
  return sim ? cost(input, seq, sim) : Infinity;
}

/** Kleiner Zufallsgenerator mit Startwert (für reproduzierbare Ergebnisse). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Günstigstes Einfügen aller noch fehlenden Elemente. */
function insertAll(input: OptInput, seq: number[], candidates: number[], noise: number, rand: () => number): number[] {
  const open = new Set(candidates.filter((c) => !seq.includes(c)));
  let current = seq;
  for (;;) {
    const curSim = simulate(input, current);
    if (!curSim) break;
    const base = curSim.end + 0.05 * curSim.drive;
    let best: { seq: number[]; score: number; el: number } | null = null;
    const visits = current.filter((x) => x !== LUNCH).length;
    for (const el of open) {
      // Höchstzahl an Besuchen erreicht → nur noch Pause und feste Stopps
      if (el !== LUNCH && !input.stops[el].must && input.maxVisits !== undefined && visits >= input.maxVisits) continue;
      const prio = el === LUNCH ? LUNCH_PENALTY : input.stops[el].must ? MUST_PENALTY : STOP_PENALTY * input.stops[el].weight;
      for (let pos = 0; pos <= current.length; pos++) {
        const cand = [...current.slice(0, pos), el, ...current.slice(pos)];
        const sim = simulate(input, cand);
        if (!sim) continue;
        const delta = sim.end + 0.05 * sim.drive - base;
        const score = delta * (1 + noise * (rand() - 0.5)) - prio;
        if (!best || score < best.score) best = { seq: cand, score, el };
      }
    }
    if (!best) break;
    current = best.seq;
    open.delete(best.el);
  }
  return current;
}

/** Lokale Verbesserung: verschieben, tauschen, umdrehen – solange es besser wird. */
function improve(input: OptInput, seq: number[], all: number[]): number[] {
  let best = seq;
  let bestCost = evaluate(input, best);
  for (let round = 0; round < 60; round++) {
    let improved = false;
    const n = best.length;
    // Verschieben eines Elements
    for (let i = 0; i < n && !improved; i++) {
      for (let j = 0; j < n && !improved; j++) {
        if (i === j) continue;
        const cand = [...best];
        const [el] = cand.splice(i, 1);
        cand.splice(j, 0, el);
        const c = evaluate(input, cand);
        if (c < bestCost - 1e-9) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    // Teilstück umdrehen (2-opt)
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        const cand = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = evaluate(input, cand);
        if (c < bestCost - 1e-9) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    // Zwei Elemente tauschen
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        const cand = [...best];
        [cand[i], cand[j]] = [cand[j], cand[i]];
        const c = evaluate(input, cand);
        if (c < bestCost - 1e-9) {
          best = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    // Fehlende Stopps doch noch unterbringen?
    if (!improved && best.length < all.length) {
      const cand = insertAll(input, best, all, 0, () => 0.5);
      const c = evaluate(input, cand);
      if (c < bestCost - 1e-9) {
        best = cand;
        bestCost = c;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return best;
}

export function optimizeTour(input: OptInput, opts: { restarts?: number; seed?: number } = {}): OptResult {
  const rand = rng(opts.seed ?? 42);
  // Weniger Durchläufe bei vielen Stopps, damit es auf dem iPad schnell bleibt
  const restarts = opts.restarts ?? (input.stops.length <= 12 ? 24 : input.stops.length <= 25 ? 12 : 6);
  const all = [...input.stops.keys()];
  const withLunch = input.lunch ? [LUNCH, ...all] : all;

  let best: number[] = [];
  let bestCost = evaluate(input, best);
  for (let r = 0; r < restarts; r++) {
    // Erster Durchlauf ohne Zufall, danach mit leichtem Rauschen
    let seq = insertAll(input, [], withLunch, r === 0 ? 0 : 0.6, rand);
    seq = improve(input, seq, withLunch);
    const c = evaluate(input, seq);
    if (c < bestCost) {
      best = seq;
      bestCost = c;
    }
  }

  // Möglichst spät losfahren, ohne später fertig zu werden (spart Wartezeit)
  const base = simulate(input, best)!;
  let departure = input.dayStart;
  for (const step of [15, 5, 1]) {
    while (departure - input.dayStart < 6 * 60) {
      const s = simulate(input, best, departure + step);
      if (!s || s.end > base.end) break;
      departure += step;
    }
  }
  const sim = simulate(input, best, departure)!;
  const inSeq = new Set(best);
  return {
    order: best.filter((x) => x !== LUNCH),
    items: sim.items,
    dropped: all.filter((i) => !inSeq.has(i)),
    lunchIncluded: inSeq.has(LUNCH),
    departure,
    end: sim.end,
    driveMinutes: sim.drive,
    waitMinutes: sim.wait,
    returnDrive: sim.returnDrive,
  };
}
