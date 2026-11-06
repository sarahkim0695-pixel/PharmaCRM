/**
 * Schlanker Excel-Leser (.xlsx) – liest Zellwerte UND Hintergrundfarben.
 *
 * Eine .xlsx-Datei ist ein ZIP-Archiv mit XML-Dateien. Wir entpacken sie mit
 * `fflate` und lesen die XML-Dateien mit dem eingebauten DOMParser.
 * Die Füllfarbe brauchen wir, um gelb markierte Zeilen („prüfen“) zu erkennen.
 */
import { strFromU8, unzipSync } from 'fflate';

export type CellValue = string | number | boolean | null;

export interface SheetCell {
  value: CellValue;
  /** Hintergrundfarbe als „RRGGBB“, falls gesetzt */
  fill?: string;
}

export interface SheetData {
  name: string;
  /** rows[zeile][spalte] – beide 0-basiert */
  rows: SheetCell[][];
  /** Hintergrundfarbe einer ganzen Zeile (Zeilenformat), falls gesetzt */
  rowFills: (string | undefined)[];
}

const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Standard-Farbtabelle von Excel für „indexed“-Farben. */
const INDEXED_COLORS = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
];

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml');
}

/** Alle Elemente mit lokalem Namen – unabhängig vom XML-Namensraum-Präfix. */
function all(root: Document | Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagNameNS('*', localName));
}

function children(el: Element, localName: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === localName);
}

/** „AB12“ → Spalte 27 (0-basiert) */
export function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ---------- Farben ----------

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255];
}

/** Excel-„Tint“ (aufhellen/abdunkeln) anwenden. */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const l2 = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  return rgbToHex(...hslToRgb(h, s, l2));
}

/** Ist die Farbe „gelb“ (inkl. hellgelb und goldgelb, aber nicht orange)? */
export function isYellow(hex: string | undefined): boolean {
  if (!hex) return false;
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (s < 0.15 || v < 0.6) return false;
  let hue: number;
  const d = max - min;
  if (max === r) hue = 60 * (((g - b) / d) % 6);
  else if (max === g) hue = 60 * ((b - r) / d + 2);
  else hue = 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  return hue >= 40 && hue <= 70;
}

function readThemeColors(doc: Document | null): string[] {
  if (!doc) return [];
  const scheme = all(doc, 'clrScheme')[0];
  if (!scheme) return [];
  const get = (name: string) => {
    const el = children(scheme, name)[0];
    const c = el?.firstElementChild;
    if (!c) return '000000';
    return (c.getAttribute('val') && c.localName === 'srgbClr' ? c.getAttribute('val') : c.getAttribute('lastClr')) ?? '000000';
  };
  // Excel-Reihenfolge: 0=lt1, 1=dk1, 2=lt2, 3=dk2, 4–9=accent1–6, 10=hlink, 11=folHlink
  return ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(get);
}

function resolveColor(el: Element | undefined, theme: string[]): string | undefined {
  if (!el) return undefined;
  const rgb = el.getAttribute('rgb');
  const tint = parseFloat(el.getAttribute('tint') ?? '0') || 0;
  let hex: string | undefined;
  if (rgb) hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  else if (el.hasAttribute('theme')) hex = theme[Number(el.getAttribute('theme'))];
  else if (el.hasAttribute('indexed')) hex = INDEXED_COLORS[Number(el.getAttribute('indexed'))];
  return hex ? applyTint(hex.toUpperCase(), tint) : undefined;
}

/** Liefert pro Zellformat-Index (s="…") die Hintergrundfarbe. */
function readStyleFills(styles: Document | null, theme: string[]): (string | undefined)[] {
  if (!styles) return [];
  const fillsEl = all(styles, 'fills')[0];
  const fills = fillsEl
    ? children(fillsEl, 'fill').map((f) => {
        const pf = children(f, 'patternFill')[0];
        if (!pf) return undefined;
        const type = pf.getAttribute('patternType');
        if (!type || type === 'none') return undefined;
        return resolveColor(children(pf, 'fgColor')[0] ?? children(pf, 'bgColor')[0], theme);
      })
    : [];
  const xfsEl = all(styles, 'cellXfs')[0];
  if (!xfsEl) return [];
  return children(xfsEl, 'xf').map((xf) => fills[Number(xf.getAttribute('fillId') ?? 0)]);
}

function readSharedStrings(doc: Document | null): string[] {
  if (!doc) return [];
  return all(doc, 'si').map((si) =>
    all(si, 't')
      // Lautschrift (rPh) ignorieren
      .filter((t) => t.parentElement?.localName !== 'rPh')
      .map((t) => t.textContent ?? '')
      .join(''),
  );
}

function resolvePath(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return target.startsWith('xl/') ? target : `xl/${target}`;
}

/** Liest alle Tabellenblätter einer .xlsx-Datei. */
export function readXlsx(data: ArrayBuffer | Uint8Array): SheetData[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('Die Datei ist keine gültige Excel-Datei (.xlsx).');
  }
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null);
  const xml = (path: string) => {
    const t = text(path);
    return t ? parseXml(t) : null;
  };

  const workbook = xml('xl/workbook.xml');
  if (!workbook) throw new Error('Die Datei ist keine gültige Excel-Datei (.xlsx).');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const relMap = new Map<string, string>();
  if (rels) all(rels, 'Relationship').forEach((r) => relMap.set(r.getAttribute('Id') ?? '', r.getAttribute('Target') ?? ''));

  const theme = readThemeColors(xml('xl/theme/theme1.xml'));
  const xfFills = readStyleFills(xml('xl/styles.xml'), theme);
  const shared = readSharedStrings(xml('xl/sharedStrings.xml'));

  const sheets: SheetData[] = [];
  all(workbook, 'sheet').forEach((sheetEl, i) => {
    const rid = sheetEl.getAttributeNS(NS_REL, 'id') ?? sheetEl.getAttribute('r:id') ?? '';
    const target = relMap.get(rid);
    const path = target ? resolvePath(target) : `xl/worksheets/sheet${i + 1}.xml`;
    const doc = xml(path);
    if (!doc) return;

    const rows: SheetCell[][] = [];
    const rowFills: (string | undefined)[] = [];
    let rowCounter = 0;
    for (const rowEl of all(doc, 'row')) {
      const r = Number(rowEl.getAttribute('r') ?? rowCounter + 1) - 1;
      rowCounter = r + 1;
      if (rowEl.getAttribute('customFormat') === '1' && rowEl.hasAttribute('s')) {
        rowFills[r] = xfFills[Number(rowEl.getAttribute('s'))];
      }
      const cells: SheetCell[] = [];
      let colCounter = 0;
      for (const c of children(rowEl, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? columnIndex(ref) : colCounter;
        colCounter = col + 1;
        const t = c.getAttribute('t');
        const v = children(c, 'v')[0]?.textContent ?? null;
        let value: CellValue = null;
        if (t === 's') value = v !== null ? (shared[Number(v)] ?? '') : null;
        else if (t === 'inlineStr') value = all(c, 't').map((x) => x.textContent ?? '').join('');
        else if (t === 'str') value = v;
        else if (t === 'b') value = v === '1';
        else if (t === 'e') value = null;
        else if (v !== null && v !== '') value = Number(v);
        const fill = c.hasAttribute('s') ? xfFills[Number(c.getAttribute('s'))] : undefined;
        cells[col] = { value, fill };
      }
      rows[r] = cells;
    }
    // Lücken auffüllen (leere Zeilen/Zellen)
    for (let i2 = 0; i2 < rows.length; i2++) {
      rows[i2] = rows[i2] ?? [];
      for (let j = 0; j < rows[i2].length; j++) rows[i2][j] = rows[i2][j] ?? { value: null };
    }
    sheets.push({ name: sheetEl.getAttribute('name') ?? `Tabelle${i + 1}`, rows, rowFills });
  });
  return sheets;
}
