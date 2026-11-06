import { describe, expect, it } from 'vitest';
import { cleanStreet, geocodeAddress } from '../../src/geo/geocoder';

type Hit = { lat: string; lon: string; display_name: string; place_rank: number; address: { postcode: string } };
function fakeFetch(responses: Hit[][]) {
  const urls: string[] = [];
  const fn = async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(responses.shift() ?? []), { status: 200 });
  };
  return { fn, urls };
}
const hit = (rank: number, postcode = '80331'): Hit => ({ lat: '48.137', lon: '11.575', display_name: 'Marienplatz 8, München', place_rank: rank, address: { postcode } });
const addr = { street: 'Marienplatz 8', plz: '80331', city: 'München' };

describe('Adresssuche (Nominatim)', () => {
  it('bereinigt Straßenangaben', () => {
    expect(cleanStreet('Hauptstr. 5, 1. OG')).toBe('Hauptstr. 5');
    expect(cleanStreet('Bahnhofstraße 12 / Eingang B')).toBe('Bahnhofstraße 12');
    expect(cleanStreet('Am Markt 3 2. OG')).toBe('Am Markt 3');
  });

  it('nutzt zuerst die strukturierte Suche, nur in Deutschland', async () => {
    const { fn, urls } = fakeFetch([[hit(30)]]);
    const r = await geocodeAddress(addr, fn);
    expect(r).toMatchObject({ status: 'ok', lat: 48.137, lng: 11.575 });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('street=Marienplatz+8');
    expect(urls[0]).toContain('postalcode=80331');
    expect(urls[0]).toContain('countrycodes=de');
  });

  it('weicht auf Freitext aus und meldet „nicht gefunden“', async () => {
    const { fn, urls } = fakeFetch([[], []]);
    const r = await geocodeAddress(addr, fn);
    expect(r.status).toBe('not_found');
    expect(urls[1]).toContain('q=Marienplatz%208%2C%2080331%20M%C3%BCnchen');
  });

  it('markiert ungenaue Treffer (nur Ort oder falsche PLZ) als „ungefähr“', async () => {
    expect((await geocodeAddress(addr, fakeFetch([[hit(16)]]).fn)).status).toBe('approx');
    expect((await geocodeAddress(addr, fakeFetch([[hit(30, '80333')]]).fn)).status).toBe('approx');
  });

  it('hält mindestens 1 Sekunde Abstand zwischen Anfragen', async () => {
    const { fn } = fakeFetch([[], [hit(30)]]);
    const t0 = Date.now();
    await geocodeAddress(addr, fn);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });
});
