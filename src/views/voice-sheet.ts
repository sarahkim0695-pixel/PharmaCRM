/**
 * „Per Sprache planen“: Auftrag sprechen (oder tippen), Vorschau „Das habe ich verstanden“,
 * dann ausführen.
 *
 * Spracherkennung: die eingebaute Web-Spracherkennung von Safari/Chrome (auf dem iPad wie
 * das Diktieren von Apple). Gibt es sie nicht (z. B. in manchen Home-Bildschirm-Apps),
 * diktiert man über das Mikrofon der Tastatur ins Textfeld – das klappt immer.
 * Ausgewertet wird der Text direkt in der App (src/tour/voice.ts).
 */
import { store } from '../state/store';
import { formatTime } from '../tour/opening-hours';
import { formatMinutes } from '../tour/durations';
import { applyVoiceCommand, type VoiceResult } from '../tour/voice-apply';
import { interpretCommand, isEmpty, type PracticeRef, type VoiceCommand } from '../tour/voice';
import type { LatLng } from '../tour/travel';
import { openSheet } from '../ui/dialog';
import { debounce, h, setChildren } from '../ui/dom';
import { iconEl } from '../ui/icons';
import { STATE_LABEL } from '../utils/customer';
import { parseDate } from '../utils/dates';
import { KIND_PLURAL } from '../utils/kind';
import { collator } from '../utils/text';

/** Minimale Typen der Web-Spracherkennung (nicht in allen TS-Bibliotheken enthalten) */
interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

export function speechRecognitionAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

/** Kurze Rückmeldung vorlesen (nur wenn gesprochen wurde) */
function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* ohne Sprachausgabe */
  }
}

/** „ausführen“ / „los geht's“ am Ende = gleich ausführen */
const RUN_WORD = /[\s,.]*(ausführen|los geht'?s|plan das|fertig planen)[\s.!]*$/i;

/** Beispiele mit echten Orten/Praxen aus den eigenen Daten */
function examples(): string[] {
  const practices = store.practiceList();
  const byCity = new Map<string, number>();
  for (const p of practices) if (p.city) byCity.set(p.city, (byCity.get(p.city) ?? 0) + 1);
  const city = [...byCity.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Augsburg';
  const p = practices.find((x) => x.city === city && x.name.split(' ').length <= 4) ?? practices[0];
  const name = p ? p.name.replace(/\s*\(.*\)$/, '') : 'Dr. Huber';
  return [
    `Morgen Tour in ${city}, nur fällige, maximal 6 Besuche, Mittagspause halb eins`,
    `Freitag ${name} um 10 Uhr fest, Rest mit passenden Besuchen auffüllen`,
    `Muster und Kataloge für ${name} mitnehmen, Visitenkarten einpacken`,
  ];
}

export function openVoicePlanner(opts: {
  currentDate: string;
  getPosition: () => Promise<LatLng | null>;
  onDone: (result: VoiceResult) => void;
}): void {
  const ctx = () => ({ today: new Date(), practices: store.practiceList() });
  let cmd: VoiceCommand | null = null;
  let spoken = false;
  let listening = false;
  let busy = false;
  let rec: Recognition | null = null;

  const text = h('textarea', {
    class: 'voice-text',
    rows: 3,
    placeholder: 'Was soll ich planen? Tippe hier – oder sprich über das Mikrofon.',
    oninput: debounce(() => interpret(), 250),
  }) as HTMLTextAreaElement;
  const micBtn = h('button', { class: 'voice-mic', 'aria-label': 'Sprechen', onclick: () => toggleListening() });
  const status = h('div', { class: 'voice-status muted small' });
  const preview = h('div', { class: 'voice-preview' });
  const runBtn = h('button', { class: 'btn btn-primary', disabled: true, onclick: () => void run() }, 'Ausführen');

  const canListen = speechRecognitionAvailable();

  function renderMic() {
    setChildren(micBtn, iconEl('mic', 34));
    micBtn.classList.toggle('listening', listening);
    micBtn.hidden = !canListen;
    status.textContent = listening
      ? 'Ich höre zu … tippe nochmal, wenn du fertig bist.'
      : canListen
        ? 'Tippe auf das Mikrofon und sprich deinen Auftrag.'
        : 'Tippe ins Feld und nutze das 🎤 auf der Tastatur zum Diktieren.';
  }

  function toggleListening() {
    if (listening) {
      rec?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    rec = new Ctor();
    rec.lang = 'de-DE';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    const base = text.value.trim();
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      text.value = [base, (finalText + interim).trim()].filter(Boolean).join(base && !/[.,;]$/.test(base) ? '. ' : ' ');
      interpret();
    };
    rec.onerror = (e) => {
      listening = false;
      renderMic();
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        status.textContent = 'Mikrofon nicht erlaubt. Erlaube es in den Einstellungen – oder diktiere über das 🎤 der Tastatur.';
      } else if (e.error === 'no-speech') {
        status.textContent = 'Ich habe nichts gehört – nochmal versuchen?';
      } else if (e.error !== 'aborted') {
        status.textContent = 'Spracherkennung gerade nicht möglich – diktiere über das 🎤 der Tastatur.';
      }
    };
    rec.onend = () => {
      listening = false;
      renderMic();
      if (text.value.trim()) {
        spoken = true;
        interpret();
        // „… ausführen“ am Ende: gleich loslegen
        if (RUN_WORD.test(text.value) && cmd && !isEmpty(cmd)) void run();
      }
    };
    try {
      rec.start();
      listening = true;
      renderMic();
    } catch {
      status.textContent = 'Spracherkennung gerade nicht möglich – diktiere über das 🎤 der Tastatur.';
    }
  }

  function interpret() {
    const t = text.value.replace(RUN_WORD, '').trim();
    cmd = t ? interpretCommand(t, ctx()) : null;
    renderPreview();
  }

  function refSelect(r: PracticeRef): HTMLElement {
    if (r.candidates.length <= 1) return h('b', null, nameOf(r.practiceId));
    const sel = h(
      'select',
      { class: 'voice-pick', onchange: () => (r.practiceId = sel.value) },
      r.candidates.map((id) => h('option', { value: id, selected: id === r.practiceId }, `${nameOf(id)} – ${store.getPractice(id)?.city ?? ''}`)),
    ) as HTMLSelectElement;
    return sel;
  }
  const nameOf = (id?: string) => (id ? (store.getPractice(id)?.name ?? '?') : '?');
  const day = (date: string) => parseDate(date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const item = (icon: string, ...content: (Node | string | null)[]) => h('li', null, h('span', { class: 'voice-icon' }, icon), h('span', null, ...content));

  function renderPreview() {
    runBtn.disabled = !cmd || isEmpty(cmd) || busy;
    if (!cmd) {
      setChildren(preview, h('p', { class: 'muted small' }, 'Beispiele – antippen zum Übernehmen:'), h('div', { class: 'voice-examples' },
        examples().map((ex) => h('button', { class: 'chip-toggle', onclick: () => { text.value = ex; interpret(); } }, `„${ex}“`)),
      ));
      return;
    }
    const c = cmd;
    const lines: HTMLElement[] = [];
    lines.push(item('🗓️', c.date ? `Tour für ${day(c.date)}` : `Tour für ${day(opts.currentDate)} (gerade geöffnet)`));
    if (c.clear) lines.push(item('🧹', 'Tour leeren und neu planen'));
    if (c.region) lines.push(item('📍', `${c.region.cities.join(', ')}${c.region.radiusKm ? ` + ${c.region.radiusKm} km Umkreis` : ' (nur dort)'}`));
    else if (c.radiusKm !== undefined) lines.push(item('📍', `Umkreis ${c.radiusKm} km`));
    if (c.kinds) {
      const names = c.kinds.kinds.map((k) => KIND_PLURAL[k]).join(', ');
      lines.push(item('👥', c.kinds.mode === 'set' ? `Nur ${names}` : c.kinds.mode === 'add' ? `Zusätzlich ${names}` : `Ohne ${names}`));
    }
    if (c.states?.length) lines.push(item('🚦', `Nur: ${c.states.map((s) => STATE_LABEL[s]).join(', ')}`));
    for (const f of c.fixed) {
      const p = f.practiceId ? store.getPractice(f.practiceId) : undefined;
      const replaces = f.time !== undefined && p?.nextAppointment && !p.nextAppointment.startsWith(c.date ?? opts.currentDate) && p.nextAppointment >= new Date().toISOString().slice(0, 10);
      lines.push(item('📌', refSelect(f), f.optional ? ' – wenn es passt' : ' – fest', f.time !== undefined ? `, Termin ${formatTime(f.time)} Uhr` : '',
        f.minutes !== undefined ? `, ${formatMinutes(f.minutes)} vor Ort` : '',
        replaces ? h('small', { class: 'muted' }, ` (ersetzt Termin am ${p!.nextAppointment!.slice(8, 10)}.${p!.nextAppointment!.slice(5, 7)}.)`) : null));
    }
    if (c.fill) lines.push(item('➕', `Mit passenden Besuchen auffüllen${c.onlyDue ? ' – nur fällige' : ''}`));
    for (const e of c.exclude) lines.push(item('🚫', 'Ohne ', refSelect(e)));
    for (const b of c.bring) lines.push(item('🎒', `${b.items}`, b.target ? h('span', null, ' → ', refSelect(b.target)) : ' (für den Tag)'));
    if (c.note) lines.push(item('📝', `Notiz: ${c.note}`));
    const frame = [
      c.dayStart !== undefined ? `Start ${formatTime(c.dayStart)}` : '',
      c.dayEnd !== undefined ? `Ende ${formatTime(c.dayEnd)}` : '',
      c.maxVisits !== undefined ? `max. ${c.maxVisits} Besuche` : '',
    ].filter(Boolean);
    if (frame.length) lines.push(item('⏰', frame.join(' · ')));
    if (c.lunch) {
      const l = c.lunch;
      lines.push(item('🍽️', !l.enabled ? 'Keine Mittagspause'
        : l.from !== undefined && l.to !== undefined && l.minutes !== undefined && l.to - l.from > l.minutes
          ? `Mittagspause ${l.minutes} Min. zwischen ${formatTime(l.from)} und ${formatTime(l.to)}`
          : l.from !== undefined
            ? `Mittagspause ${formatTime(l.from)}–${formatTime(l.to ?? l.from + (l.minutes ?? 45))}`
            : `Mittagspause ${l.minutes ?? 45} Min.`));
    }
    for (const b of c.blocks) {
      const when = b.from === undefined ? `${formatMinutes(b.minutes)}, irgendwann am Tag`
        : b.to !== undefined && b.to - b.from === b.minutes ? `${formatTime(b.from)}–${formatTime(b.to)}`
        : `${formatMinutes(b.minutes)} zwischen ${formatTime(b.from)} und ${formatTime(b.to ?? b.from + b.minutes)}`;
      lines.push(item(b.kind === 'termin' ? '🎓' : '☕', h('b', null, b.title), ` – ${when}`));
    }
    if (c.startMode) lines.push(item('🚗', c.startMode === 'here' ? 'Start am aktuellen Standort' : 'Start zuhause'));
    if (c.returnHome !== undefined) lines.push(item('🏠', c.returnHome ? 'Zum Schluss nach Hause' : 'Nicht nach Hause zurück'));
    for (const pl of c.unknownPlaces) lines.push(item('⚠️', `Keine Einträge in „${pl}“ gefunden`));
    const unknown = [...new Set(c.unknown)].sort(collator.compare);
    setChildren(
      preview,
      h('p', { class: 'voice-head' }, isEmpty(c) ? 'Das habe ich leider nicht verstanden.' : 'Das habe ich verstanden:'),
      isEmpty(c) ? null : h('ul', { class: 'voice-list' }, lines),
      unknown.length ? h('p', { class: 'muted small' }, `Nicht verstanden: ${unknown.join(', ')}`) : null,
    );
  }

  async function run() {
    if (!cmd || isEmpty(cmd) || busy) return;
    busy = true;
    rec?.abort();
    setChildren(runBtn, h('span', { class: 'spinner spinner-light' }), 'Plane …');
    runBtn.disabled = true;
    try {
      const result = await applyVoiceCommand(cmd, { currentDate: opts.currentDate, getPosition: opts.getPosition });
      if (spoken) speak(result.error ? `${result.summary} ${result.error}` : result.summary);
      sheet.close();
      opts.onDone(result);
    } catch (err) {
      busy = false;
      setChildren(runBtn, 'Ausführen');
      runBtn.disabled = false;
      status.textContent = `Fehler: ${(err as Error).message}`;
    }
  }

  const sheet = openSheet({
    title: '🎙️ Tour per Sprache planen',
    wide: true,
    content: [
      h('div', { class: 'voice-input' }, micBtn, h('div', { class: 'grow' }, text, status)),
      preview,
      h('details', { class: 'details voice-help' },
        h('summary', null, 'Was kann ich sagen?'),
        h('ul', { class: 'bullets' },
          h('li', null, h('b', null, 'Tag: '), '„morgen“, „Dienstag“, „nächste Woche Freitag“, „am 3.12.“'),
          h('li', null, h('b', null, 'Ort: '), '„in Augsburg“, „rund um Landshut“, „im Umkreis von 20 km“'),
          h('li', null, h('b', null, 'Praxen: '), '„Dr. Huber um 10 Uhr fest, dauert eine Stunde“, „Praxis am Dom wenn es passt“, „ohne Dr. Lang“'),
          h('li', null, h('b', null, 'Auswahl: '), '„Rest auffüllen“, „nur fällige“, „nur Orthopäden“, „auch Hausärzte“, „nur Kunden in den Startlöchern“'),
          h('li', null, h('b', null, 'Zeiten: '), '„ab 7:30 los“, „bis 16 Uhr fertig“, „Mittagspause halb eins“, „ohne Mittagspause“, „maximal 6 Besuche“'),
          h('li', null, h('b', null, 'Platzhalter & Pausen: '), '„Online-Schulung von 14 bis 15:30“, „Telefonkonferenz um 9, 30 Minuten“, „Kaffeepause 20 Minuten zwischen 15 und 17 Uhr“'),
          h('li', null, h('b', null, 'Packliste: '), '„Muster A für Dr. Huber mitnehmen“, „Visitenkarten einpacken“, „Notiz: Parkhaus nehmen“'),
          h('li', null, h('b', null, 'Sofort ausführen: '), 'am Ende „ausführen“ sagen.'),
        ),
        h('p', { class: 'muted small' }, 'Die Spracherkennung übernimmt dein Gerät (wie beim Diktieren). Was du sagst, wertet RepMap direkt auf dem Gerät aus – deine Praxisdaten werden nirgends hingeschickt.'),
      ),
    ],
    footer: [h('button', { class: 'btn', onclick: () => sheet.close() }, 'Abbrechen'), runBtn],
    onClose: () => rec?.abort(),
  });
  renderMic();
  renderPreview();
  if (!canListen) text.focus();
}
