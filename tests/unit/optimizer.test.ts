import { describe, expect, it } from 'vitest';
import { optimizeTour, simulate, type OptInput, type OptStop } from '../../src/tour/optimizer';

const T = (h: number, m = 0) => h * 60 + m;
/** Orte auf einer Linie: Fahrzeit = Abstand in Minuten */
const lineTravel = (pos: number[]) => pos.map((a) => pos.map((b) => Math.abs(a - b)));
const stop = (o: Partial<OptStop> = {}): OptStop => ({ windows: [{ from: T(0), to: T(23) }], park: 5, visit: 15, must: false, weight: 1, ...o });
const base = (o: Partial<OptInput>): OptInput => ({ dayStart: T(8), dayEnd: T(18), returnToStart: true, stops: [], travel: [[0]], ...o });

describe('Tour-Optimierung', () => {
  it('fährt Stopps auf einer Linie der Reihe nach ab', () => {
    // Start bei 0, Stopps bei 30, 10, 20 (Minuten entfernt)
    const r = optimizeTour(base({ stops: [stop(), stop(), stop()], travel: lineTravel([0, 30, 10, 20]) }));
    expect(r.dropped).toEqual([]);
    expect([r.order, [...r.order].reverse()]).toContainEqual([1, 2, 0]); // 10 → 20 → 30 (oder umgekehrt)
    expect(r.driveMinutes).toBe(60); // hin 30, zurück 30
  });

  it('beachtet Öffnungszeiten (vormittags/nachmittags)', () => {
    const r = optimizeTour(
      base({
        stops: [
          stop({ windows: [{ from: T(14), to: T(17) }] }), // nah, aber nur nachmittags
          stop({ windows: [{ from: T(8), to: T(11) }] }), // weit, nur vormittags
        ],
        travel: lineTravel([0, 10, 40]),
      }),
    );
    expect(r.order).toEqual([1, 0]);
    const visits = r.items.filter((i) => i.kind === 'visit');
    expect(visits[1].start).toBeGreaterThanOrEqual(T(14));
  });

  it('legt die Mittagspause in die Mittagsschließung der Praxen', () => {
    const hours = [{ from: T(8), to: T(11, 45) }, { from: T(14), to: T(17, 45) }];
    const r = optimizeTour(
      base({
        lunch: { from: T(12), to: T(14), minutes: 45 },
        stops: Array.from({ length: 6 }, () => stop({ windows: hours, visit: 30 })),
        travel: lineTravel([0, 5, 10, 15, 20, 25, 30]),
      }),
    );
    expect(r.lunchIncluded).toBe(true);
    const brk = r.items.find((i) => i.kind === 'break')!;
    expect(brk.start).toBeGreaterThanOrEqual(T(12));
    expect(brk.end).toBeLessThanOrEqual(T(14));
    expect(r.dropped).toEqual([]);
    // kein Besuch während der Pause
    for (const v of r.items) if (v.kind === 'visit') expect(v.end <= brk.start || v.start >= brk.end).toBe(true);
  });

  it('hält Termine ein und lässt Unmögliches weg', () => {
    const r = optimizeTour(
      base({
        stops: [
          stop({ must: true, windows: [{ from: T(10, 30), to: T(10, 30) }] }), // Termin 10:30
          stop({ windows: [] }), // an dem Tag geschlossen
          stop(),
        ],
        travel: lineTravel([0, 20, 5, 10]),
      }),
    );
    expect(r.dropped).toEqual([1]);
    const appt = r.items.find((i) => i.kind === 'visit' && i.stop === 0)!;
    expect(appt.kind === 'visit' && appt.start).toBe(T(10, 30));
  });

  it('nimmt bei zu vielen Praxen die wichtigeren mit', () => {
    // Tag 8:00–9:30: nur 2 Besuche passen (je 5 Fahrt + 5 Parken + 15 vor Ort)
    const r = optimizeTour(
      base({
        dayEnd: T(9, 0),
        stops: [stop(), stop({ weight: 1.3 }), stop(), stop({ weight: 1.3 })],
        travel: lineTravel([0, 5, 5, 5, 5]),
      }),
    );
    expect(r.order.sort()).toEqual([1, 3]);
    expect(r.end).toBeLessThanOrEqual(T(9));
  });

  it('fährt so spät los, dass vor der ersten Praxis nicht gewartet werden muss', () => {
    const r = optimizeTour(base({ stops: [stop({ windows: [{ from: T(9), to: T(11) }] })], travel: lineTravel([0, 20]) }));
    expect(r.departure).toBe(T(8, 35)); // 20 Fahrt + 5 Parken → Besuch ab 9:00
    expect(r.waitMinutes).toBe(0);
  });

  it('erkennt unmögliche Reihenfolgen', () => {
    const input = base({ dayEnd: T(8, 30), stops: [stop()], travel: lineTravel([0, 20]) });
    expect(simulate(input, [0])).toBeNull(); // 20 hin + 5 + 15 + 20 zurück > 30 min
    expect(optimizeTour(input).dropped).toEqual([0]);
  });

  it('schafft 25 Stopps schnell', () => {
    const pos = Array.from({ length: 26 }, (_, i) => ((i * 37) % 60) + (i ? 1 : 0));
    const t0 = Date.now();
    const r = optimizeTour(base({ dayEnd: T(20), stops: Array.from({ length: 25 }, () => stop({ visit: 10 })), travel: lineTravel(pos) }));
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(r.dropped.length).toBe(0);
  });
});
