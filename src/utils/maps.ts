/** Links in Apple Karten (Route) und Telefon. */
import type { Practice } from '../types';

export function fullAddress(p: Pick<Practice, 'street' | 'plz' | 'city'>): string {
  return [p.street, `${p.plz} ${p.city}`.trim()].filter(Boolean).join(', ');
}

/**
 * Route in Apple Karten öffnen.
 * - Adresse gefunden → Adresse übergeben (Apple zeigt dann den schönen Ortsnamen)
 * - Pin von Hand gesetzt / ungenau → exakte Koordinaten verwenden
 */
export function appleMapsUrl(p: Practice): string {
  const hasCoords = p.lat !== undefined && p.lng !== undefined;
  if (hasCoords && p.geoStatus !== 'ok') {
    return `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`;
  }
  const addr = encodeURIComponent(`${fullAddress(p)}, Deutschland`);
  const hint = hasCoords ? `&sll=${p.lat},${p.lng}` : '';
  return `https://maps.apple.com/?daddr=${addr}${hint}&dirflg=d`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
