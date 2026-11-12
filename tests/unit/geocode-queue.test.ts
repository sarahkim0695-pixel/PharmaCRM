import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeQueue } from '../../src/geo/geocoder';
import { store } from '../../src/state/store';
import type { Practice } from '../../src/types';

const practice = (id: string, street: string): Practice => ({
  id, name: id, specialty: '', street, plz: '80331', city: 'München', status: '', hint: '', phone: '',
  needsReview: false, geoStatus: 'pending', products: {}, source: 'import', createdAt: '', updatedAt: '',
});

beforeEach(async () => {
  await store.load();
  await store.clearAll();
  // Nur Zeitgeber vortäuschen – die Test-Datenbank braucht echtes setImmediate
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  geocodeQueue.fetchFn = undefined;
});

describe('Adresssuche-Warteschlange', () => {
  it('versucht es nach einem Verbindungsfehler automatisch erneut', async () => {
    await store.savePractices([practice('a', 'Marienplatz 1'), practice('b', 'Marienplatz 2')]);
    let calls = 0;
    geocodeQueue.fetchFn = async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch'); // wackelige Verbindung
      return new Response(JSON.stringify([{ lat: '48.1', lon: '11.5', display_name: 'x', place_rank: 30, address: { postcode: '80331' } }]));
    };
    geocodeQueue.start();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(geocodeQueue.status.state).toBe('retry');
    expect(store.getPractice('a')?.geoStatus).toBe('pending');

    // nach 30 s geht es weiter (Zeit schrittweise vorspulen, Datenbank dazwischen arbeiten lassen)
    for (let i = 0; i < 60 && geocodeQueue.status.state !== 'idle'; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
      await new Promise((r) => setImmediate(r));
    }
    expect(geocodeQueue.status.state).toBe('idle');
    expect(store.getPractice('a')?.geoStatus).toBe('ok');
    expect(store.getPractice('b')?.geoStatus).toBe('ok');
  });
});
