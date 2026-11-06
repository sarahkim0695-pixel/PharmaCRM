import { describe, expect, it } from 'vitest';
import { assembleRings, overpassQueryForPlz, overpassToPlzFeatures, relationToMultiPolygon, type OverpassElement } from '../../src/geo/osm';

const way = (pts: [number, number][]) => ({ type: 'way' as const, role: 'outer', geometry: pts.map(([lng, lat]) => ({ lat, lon: lng })) });

describe('OSM → GeoJSON', () => {
  it('fügt Wegstücke (auch umgedrehte) zu einem Ring zusammen', () => {
    const rings = assembleRings([
      [[0, 0], [1, 0]],
      [[1, 1], [1, 0]], // umgedreht
      [[1, 1], [0, 1], [0, 0]],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
    expect(rings[0]).toHaveLength(5);
  });

  it('ordnet Löcher (inner) der richtigen Fläche zu', () => {
    const rel: OverpassElement = {
      type: 'relation', id: 1, tags: { postal_code: '80331' },
      members: [
        way([[11, 48], [11.2, 48], [11.2, 48.2], [11, 48.2], [11, 48]]),
        { ...way([[11.05, 48.05], [11.1, 48.05], [11.1, 48.1], [11.05, 48.05]]), role: 'inner' },
        way([[12, 48], [12.1, 48], [12.1, 48.1], [12, 48]]),
      ],
    };
    const polys = relationToMultiPolygon(rel)!;
    expect(polys).toHaveLength(2);
    expect(polys[0]).toHaveLength(2); // Außenring + Loch
    expect(polys[1]).toHaveLength(1);
  });

  it('verwirft Flächen außerhalb Deutschlands (z. B. Spanien) und führt gleiche PLZ zusammen', () => {
    const square = (lng: number, lat: number) => way([[lng, lat], [lng + 0.1, lat], [lng + 0.1, lat + 0.1], [lng, lat]]);
    const { collection, rejected } = overpassToPlzFeatures({
      elements: [
        { type: 'relation', id: 1, tags: { postal_code: '80331', note: '80331 München' }, members: [square(11.5, 48.1)] },
        { type: 'relation', id: 2, tags: { postal_code: '80331' }, members: [square(11.7, 48.1)] },
        { type: 'relation', id: 3, tags: { postal_code: '28001', note: '28001 Madrid' }, members: [square(-3.7, 40.4)] },
        { type: 'relation', id: 4, tags: { postal_code: '6991', 'postal_code:DE': '87567', note: '6991 Riezlern' }, members: [square(10.15, 47.35)] },
      ],
    });
    expect(collection.features.map((f) => f.properties.plz)).toEqual(['80331', '87567']);
    expect(collection.features[0].geometry.coordinates).toHaveLength(2);
    expect(collection.features[0].properties.ort).toBe('München');
    expect(collection.features[1].properties.ort).toBe('Riezlern');
    expect(rejected).toEqual(['28001 (außerhalb Deutschlands)']);
  });

  it('beschränkt die Nachlade-Abfrage auf Deutschland', () => {
    const q = overpassQueryForPlz(['80331', '86150']);
    expect(q).toContain('"ISO3166-1"="DE"');
    expect(q).toContain('^(80331|86150)$');
  });
});
