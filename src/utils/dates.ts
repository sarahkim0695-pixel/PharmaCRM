/** Datumsfunktionen – alle Datumswerte werden als „YYYY-MM-DD“ gespeichert. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Heutiges Datum als „YYYY-MM-DD“ (lokale Zeit). */
export function todayStr(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** „YYYY-MM-DD“ (optional mit Uhrzeit) → Date in lokaler Zeit. */
export function parseDate(s: string): Date {
  const [datePart, timePart] = s.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = (timePart ?? '00:00').split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

/** Ganze Tage zwischen zwei Daten (b - a). */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Tage seit einem Datum bis heute. */
export function daysSince(s: string, today = new Date()): number {
  return daysBetween(parseDate(s), today);
}

/** „06.11.2026“ bzw. „06.11.2026, 14:30“ */
export function formatDate(s: string | undefined): string {
  if (!s) return '';
  const d = parseDate(s);
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (s.includes('T')) {
    return `${date}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
  }
  return date;
}

/** „Mo, 06.11.“ – kurz für Listen */
export function formatDateShort(s: string): string {
  const d = parseDate(s);
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

/** „heute“, „gestern“, „vor 12 Tagen“, „in 3 Tagen“ */
export function relativeDays(s: string, today = new Date()): string {
  const diff = daysBetween(today, parseDate(s));
  if (diff === 0) return 'heute';
  if (diff === -1) return 'gestern';
  if (diff === 1) return 'morgen';
  if (diff < 0) {
    const n = -diff;
    if (n >= 60) return `vor ${Math.round(n / 30)} Monaten`;
    return `vor ${n} Tagen`;
  }
  return `in ${diff} Tagen`;
}
