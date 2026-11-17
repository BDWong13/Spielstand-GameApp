// Planer: Aufgaben, Deadlines, Wochenplanung mit Kapazität, „Warten auf“, Fokus-Timer,
// Vorlagen mit Rückwärtsplanung, Eisenhower-Matrix, Wochenrückblick, Kalender mit Terminen,
// Zeitplan (Time-Blocking) und Import aus iPhone-/Outlook-Kalender.
// Alles bleibt lokal im Browser (localStorage).
import { sync, initSync, localChanged, syncNow, signIn, signUp, signOut, createFeed } from './sync.js';

const KEY = 'planer.v1';
const TKEY = 'planer.timer';
const COLORS = ['#f5b83d', '#4cc38a', '#3ea6ff', '#c77dff', '#ef6b6b', '#f0a04b', '#2dd4bf', '#94a3b8'];
const PRIOS = [{ v: 0, label: 'Normal' }, { v: 1, label: 'Wichtig' }, { v: 2, label: 'Dringend' }];
const ESTS = [0, 15, 30, 60, 120, 180, 300, 480];
const REPEATS = { '': 'Keine', daily: 'Täglich', weekdays: 'Werktags', weekly: 'Wöchentlich', monthly: 'Monatlich' };
const DEFAULT_TEMPLATES = [
  { id: 'tpl-bericht', name: 'Monatsbericht / Newsletter', project: '', text:
    'T-7 Änderungen & Inhalte sammeln ~1h\nT-5 Daten aktualisieren & prüfen ~2h\nT-3 Entwurf erstellen ~2h\nT-2 Feedback einholen ~30m\nT-1 Korrekturen einarbeiten ~1h\nT Versenden ~15m' },
  { id: 'tpl-praesi', name: 'Präsentation', project: '', text:
    'T-7 Storyline & Kernaussagen festlegen ~1h\nT-5 Analyse / Zahlen aufbereiten ~3h\nT-3 Folien bauen ~3h\nT-2 Probelauf & Feedback ~1h\nT-1 Finalisieren ~1h\nT Präsentieren' },
];
const DEFAULT_SETTINGS = { capacity: 360, focus: 25, skipWeekend: true, lastReview: null, workStart: '08:00', workEnd: '17:00' };
const BLOCK_RE = /urlaub|krank|feiertag|abwesend|frei\b|out of office|\booo\b|vacation|holiday/i;
const EV_REPEATS = { '': 'Keine', daily: 'Täglich', weekdays: 'Werktags', weekly: 'Wöchentlich', monthly: 'Monatlich' };

// ---------- Hilfen ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonths = (s, n) => {
  const d = parse(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
};
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const mondayOf = s => addDays(s, -((parse(s).getDay() + 6) % 7));
const isWeekend = s => [0, 6].includes(parse(s).getDay());
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WDL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const short = s => { const d = parse(s); return `${d.getDate()}. ${MON[d.getMonth()]}`; };
const dayLabel = s => {
  const n = diff(today(), s);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === -1) return 'Gestern';
  const d = parse(s);
  return n > 0 && n < 7 ? WD[d.getDay()] : `${WD[d.getDay()]} ${short(s)}`;
};
const fmtMin = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)}:${pad(m % 60)} h` : `${m / 60} h`);
const sumEst = list => list.reduce((a, t) => a + (+t.est || 0), 0);
const toMin = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const isoWeek = s => {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
};

// Datumswörter für die Schnelleingabe: heute, morgen, übermorgen, mo…so, 15.12., 15.12.27, +3
const WD_WORDS = { so: 0, sonntag: 0, mo: 1, montag: 1, di: 2, dienstag: 2, mi: 3, mittwoch: 3, do: 4, donnerstag: 4, fr: 5, freitag: 5, sa: 6, samstag: 6 };
function parseDateWord(w) {
  const t0 = today(); w = w.toLowerCase().replace(/[,;]$/, '');
  if (w === 'heute') return t0;
  if (w === 'morgen') return addDays(t0, 1);
  if (w === 'übermorgen' || w === 'uebermorgen') return addDays(t0, 2);
  if (w in WD_WORDS) return addDays(t0, (WD_WORDS[w] - parse(t0).getDay() + 7) % 7);
  let m = w.match(/^\+(\d{1,3})$/);
  if (m) return addDays(t0, +m[1]);
  m = w.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})?$/);
  if (m) {
    let y = m[3] ? +m[3] : parse(t0).getFullYear();
    if (y < 100) y += 2000;
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) return null;
    let s = iso(d);
    if (!m[3] && s < t0) s = iso(new Date(y + 1, +m[2] - 1, +m[1]));
    return s;
  }
  return null;
}
const parseEst = (n, u) => { const v = parseFloat(n.replace(',', '.')); return Math.round(/^(h|std)/i.test(u) ? v * 60 : v); };

function quickParse(text) {
  const r = { prio: 0, projectName: '', due: null, dueTime: '', plan: null, est: 0 };
  let s = ` ${text} `;
  s = s.replace(/\sbis\s+(\S+)(?:\s+(\d{1,2}:\d{2}))?(?=\s)/i, (m, w, tm) => {
    const d = parseDateWord(w); if (!d) return m;
    r.due = d; if (tm) r.dueTime = tm.padStart(5, '0'); return ' ';
  });
  s = s.replace(/\s@(\S+)(?=\s)/, (m, w) => { const d = parseDateWord(w); if (!d) return m; r.plan = d; return ' '; });
  s = s.replace(/\s~(\d+(?:[.,]\d+)?)\s?(h|std|min|m)(?=\s)/i, (m, n, u) => { r.est = parseEst(n, u); return ' '; });
  s = s.replace(/\s#(\S+)(?=\s)/g, (m, name) => { r.projectName = name; return ' '; });
  s = s.replace(/\s(!{1,2})(?=\s)/g, (m, ex) => { r.prio = Math.max(r.prio, ex.length); return ' '; });
  r.title = s.replace(/\s+/g, ' ').trim();
  return r;
}

// Vorlagen-Zeilen: „T-5 Titel ~2h“ (5 Tage vor Deadline), „T Titel“ (am Deadline-Tag)
function parseSteps(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^T\s*(?:([+-])\s*(\d+))?\s+(.+?)(?:\s+~(\d+(?:[.,]\d+)?)\s?(h|std|min|m))?$/i);
    if (!m) return { off: 0, t: l, est: 0 };
    return { off: m[2] ? (m[1] === '+' ? 1 : -1) * +m[2] : 0, t: m[3], est: m[4] ? parseEst(m[4], m[5]) : 0 };
  });
}
function stepDate(deadline, off) {
  let d = addDays(deadline, off);
  if (db.settings.skipWeekend && off !== 0) while (isWeekend(d)) d = addDays(d, off < 0 ? -1 : 1);
  return d;
}

// ---------- Daten ----------
function blank() {
  return {
    projects: [
      { id: 'p-arbeit', name: 'Arbeit', color: '#3ea6ff' },
      { id: 'p-privat', name: 'Privat', color: '#4cc38a' },
    ],
    tasks: [], events: [], templates: structuredClone(DEFAULT_TEMPLATES),
    settings: { ...DEFAULT_SETTINGS, lastReview: today() },
  };
}
function normalize(v) {
  if (!v || !Array.isArray(v.tasks)) return null;
  return {
    projects: Array.isArray(v.projects) ? v.projects : [],
    templates: Array.isArray(v.templates) ? v.templates : structuredClone(DEFAULT_TEMPLATES),
    events: (Array.isArray(v.events) ? v.events : []).filter(e => e && e.date).map(e => ({
      id: e.id || uid(), title: String(e.title || ''), date: e.date, endDate: e.endDate || null,
      start: e.start || '', end: e.end || '', allDay: !!e.allDay, blocks: !!e.blocks, repeat: e.repeat || '',
      location: e.location || '', notes: e.notes || '', source: e.source || '', uid: e.uid || '',
    })),
    settings: { ...DEFAULT_SETTINGS, lastReview: today(), ...(v.settings || {}) },
    tasks: v.tasks.map(t => ({
      id: t.id || uid(), title: String(t.title || ''), notes: t.notes || '', project: t.project || '',
      prio: +t.prio || 0, due: t.due || null, dueTime: t.dueTime || '', plan: t.plan || null, planTime: t.plan && t.planTime || '',
      est: +t.est || 0, spent: +t.spent || 0, repeat: t.repeat || '', subs: Array.isArray(t.subs) ? t.subs : [],
      status: t.status === 'waiting' ? 'waiting' : 'open', waitingFor: t.waitingFor || '', followUp: t.followUp || null,
      done: !!t.done, doneAt: t.doneAt || null, createdAt: t.createdAt || Date.now(),
    })),
  };
}
let db = (() => { try { return normalize(JSON.parse(localStorage.getItem(KEY))) || blank(); } catch { return blank(); } })();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Speichern fehlgeschlagen – Speicher voll?'); }
  localChanged();
}
let undoSnap = null;
const snap = () => { undoSnap = JSON.stringify(db); };

const task = id => db.tasks.find(t => t.id === id);
const proj = id => db.projects.find(p => p.id === id);
const open = () => db.tasks.filter(t => !t.done);
const active = () => db.tasks.filter(t => !t.done && t.status !== 'waiting');
const waiting = () => db.tasks.filter(t => !t.done && t.status === 'waiting');
const cap = () => +db.settings.capacity || 360;
const doneOn = (t, day) => t.done && t.doneAt && iso(new Date(t.doneAt)) === day;
const byDue = (a, b) =>
  (a.due || '9999').localeCompare(b.due || '9999') ||
  (a.dueTime || '99').localeCompare(b.dueTime || '99') ||
  b.prio - a.prio || a.createdAt - b.createdAt;
const byPrio = (a, b) => b.prio - a.prio || byDue(a, b);
const persons = () => [...new Set(db.tasks.map(t => t.waitingFor).filter(Boolean))].sort();
function projectByName(name) {
  let p = db.projects.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) { p = { id: uid(), name, color: COLORS[db.projects.length % COLORS.length] }; db.projects.push(p); }
  return p.id;
}

// ---------- Kalender ----------
function occursOn(e, day) {
  if (day < e.date) return false;
  if (!e.repeat) return day <= (e.endDate || e.date);
  if (e.repeat === 'daily') return true;
  if (e.repeat === 'weekdays') return !isWeekend(day);
  if (e.repeat === 'weekly') return parse(day).getDay() === parse(e.date).getDay();
  if (e.repeat === 'monthly') return parse(day).getDate() === parse(e.date).getDate();
  return false;
}
// Termine eines Tages mit Minuten (s/en) für diesen Tag; mehrtägige Termine werden passend beschnitten.
function eventsOn(day) {
  return db.events.filter(e => occursOn(e, day)).map(e => {
    let s = e.allDay ? 0 : toMin(e.start), en = e.allDay ? 1440 : (e.end ? toMin(e.end) : s + 60);
    if (!e.repeat && !e.allDay && e.endDate && e.endDate !== e.date) {
      if (day !== e.date) s = 0;
      if (day !== e.endDate) en = 1440;
    } else if (en <= s) en = Math.min(1440, s + 30);
    return { ...e, s, en };
  }).sort((a, b) => b.allDay - a.allDay || a.s - b.s);
}
const blockedOn = day => eventsOn(day).some(e => e.allDay && e.blocks);
const work = () => [toMin(db.settings.workStart || '08:00'), toMin(db.settings.workEnd || '17:00')];
function mergeIv(iv) {
  const out = [];
  iv.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]).forEach(([a, b]) => {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  });
  return out;
}
// Freie Minuten innerhalb der Arbeitszeit nach Abzug der Termine
function freeOn(day) {
  if (blockedOn(day)) return 0;
  const [ws, we] = work();
  const busy = mergeIv(eventsOn(day).filter(e => !e.allDay).map(e => [Math.max(ws, e.s), Math.min(we, e.en)]));
  return Math.max(0, we - ws - busy.reduce((a, [x, y]) => a + y - x, 0));
}
const capOn = day => Math.min(cap(), freeOn(day));
const meetingMin = day => { const [ws, we] = work(); return mergeIv(eventsOn(day).filter(e => !e.allDay).map(e => [Math.max(ws, e.s), Math.min(we, e.en)])).reduce((a, [x, y]) => a + y - x, 0); };

// Aufgaben automatisch in freie Lücken legen (nach Priorität, dann Deadline)
function autoPlan(day) {
  const t0 = today();
  const [ws, we] = work();
  if (blockedOn(day)) return { placed: 0, left: [] };
  const start = day === t0 ? Math.max(ws, Math.ceil(nowMin() / 15) * 15) : ws;
  const busy = eventsOn(day).filter(e => !e.allDay).map(e => [e.s, e.en]);
  db.tasks.filter(t => t.plan === day && t.planTime && !t.done).forEach(t => busy.push([toMin(t.planTime), toMin(t.planTime) + (t.est || 30)]));
  const cand = active().filter(t => !(t.plan === day && t.planTime) && (day === t0
    ? (t.plan && t.plan <= t0) || (t.due && t.due <= t0)
    : t.plan === day)).sort(byPrio);
  let placed = 0; const left = [];
  for (const t of cand) {
    const dur = t.est || 30;
    let s = start, ok = false;
    while (s + dur <= we) {
      const clash = busy.find(([a, b]) => s < b && s + dur > a);
      if (!clash) { ok = true; break; }
      s = Math.ceil(clash[1] / 5) * 5;
    }
    if (ok) { t.plan = day; t.planTime = fromMin(s); busy.push([s, s + dur]); placed++; } else left.push(t);
  }
  return { placed, left };
}

// ---------- Import: .ics-Dateien und iPhone-Kurzbefehl ----------
const unescIcs = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const [, name, params, value] = m;
    if (name === 'EXDATE') (cur.EXDATE ||= []).push(...value.split(','));
    else if (name === 'RECURRENCE-ID') cur.RID = { params, value };
    else cur[name] = { params, value };
  }
  return out;
}
// Zeiten mit TZID werden als Ortszeit gelesen (passt, solange Kalender und Gerät in derselben Zeitzone sind).
function icsDate(p) {
  const v = String(p?.value || '').trim();
  let m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '', allDay: true };
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  if (m[7]) {
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: iso(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}
const DAYCODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function expandRrule(rule, start, from, to, ex) {
  const o = Object.fromEntries(rule.split(';').map(x => x.split('=')));
  const iv = +o.INTERVAL || 1, count = +o.COUNT || 0;
  const until = o.UNTIL ? icsDate({ value: o.UNTIL })?.date : null;
  const byday = o.BYDAY ? o.BYDAY.split(',').map(x => DAYCODES.indexOf(x.slice(-2))).filter(x => x >= 0) : [];
  const end = until && until < to ? until : to;
  const out = []; let n = 0;
  const push = d => { n++; if (d >= from && !ex.includes(d)) out.push(d); };
  if (o.FREQ === 'WEEKLY') {
    const days = byday.length ? byday : [parse(start).getDay()];
    for (let wk = mondayOf(start), i = 0; i < 600 && wk <= end; i++, wk = addDays(wk, 7 * iv)) {
      for (const d of days.map(x => addDays(wk, (x + 6) % 7)).sort()) {
        if (d < start || d > end) continue;
        if (count && n >= count) return out;
        push(d);
      }
    }
  } else if (['DAILY', 'MONTHLY', 'YEARLY'].includes(o.FREQ)) {
    for (let i = 0, d = start; i < 3000 && d <= end; i++) {
      if (count && n >= count) break;
      if (!(o.FREQ === 'DAILY' && byday.length && !byday.includes(parse(d).getDay()))) push(d);
      d = o.FREQ === 'DAILY' ? addDays(d, iv) : addMonths(start, (o.FREQ === 'MONTHLY' ? iv : 12 * iv) * (i + 1));
    }
  } else push(start);
  return out;
}
function icsToEvents(raw, source) {
  const from = addDays(today(), -30), to = addDays(today(), 400);
  const overrides = new Set(raw.filter(r => r.RID).map(r => `${r.UID?.value}|${icsDate(r.RID)?.date}`));
  const out = [];
  for (const r of raw) {
    if (!r.DTSTART || r.STATUS?.value === 'CANCELLED') continue;
    const st = icsDate(r.DTSTART); if (!st) continue;
    let en = r.DTEND ? icsDate(r.DTEND) : null;
    if (!en && r.DURATION) {
      const m = r.DURATION.value.match(/P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/) || [];
      const mins = ((+m[1] || 0) * 7 * 1440) + ((+m[2] || 0) * 1440) + ((+m[3] || 0) * 60) + (+m[4] || 0);
      const total = toMin(st.time) + mins;
      en = st.allDay ? { date: addDays(st.date, Math.max(1, Math.round(mins / 1440))) } : { date: addDays(st.date, Math.floor(total / 1440)), time: fromMin(total % 1440) };
    }
    let endDate = st.date, endTime = '';
    if (st.allDay) endDate = en ? addDays(en.date, -1) : st.date;
    else if (en) { endDate = en.date; endTime = en.time || ''; if (endTime === '00:00' && endDate > st.date) { endDate = addDays(endDate, -1); endTime = '23:59'; } }
    else endTime = fromMin(Math.min(1439, toMin(st.time) + 60));
    if (endDate < st.date) endDate = st.date;
    const span = diff(st.date, endDate);
    const title = unescIcs(r.SUMMARY?.value) || '(ohne Titel)';
    const u = r.UID?.value || '';
    if (u.endsWith('@planer') || isPlanerEntry(title)) continue;
    const ex = (r.EXDATE || []).map(x => icsDate({ value: x })?.date);
    const dates = r.RRULE && !r.RID ? expandRrule(r.RRULE.value, st.date, from, to, ex) : [st.date];
    for (const d of dates) {
      if (addDays(d, span) < from || d > to) continue;
      if (r.RRULE && overrides.has(`${u}|${d}`)) continue;
      out.push({
        id: uid(), title, date: d, endDate: span ? addDays(d, span) : null,
        start: st.allDay ? '' : st.time, end: st.allDay ? '' : endTime, allDay: !!st.allDay,
        blocks: !!st.allDay && BLOCK_RE.test(title), repeat: '', location: unescIcs(r.LOCATION?.value), notes: '', source, uid: u,
      });
    }
  }
  return out;
}
function parseAnyDate(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/);
  if (m && m[4] && /([zZ]|[+-]\d{2}:?\d{2})$/.test(v)) {
    const d = new Date(v);
    if (!isNaN(d)) return { date: iso(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : '' };
  m = v.match(/^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2,4})(?:,?\s*(?:um\s*)?(\d{1,2}):(\d{2}))?/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return { date: `${y}-${pad(+m[2])}-${pad(+m[1])}`, time: m[4] ? `${pad(+m[4])}:${m[5]}` : '' }; }
  return null;
}
// Zeilen vom Kurzbefehl: Start | Ende | Titel | Kalender | Ganztägig
function parseShortcut(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.split('|').map(x => x.trim());
    if (parts.length < 3) continue;
    const st = parseAnyDate(parts[0]); if (!st) continue;
    const en = parseAnyDate(parts[1]);
    const allDay = /^(ja|yes|true|1|wahr)$/i.test(parts[4] || '') || (!st.time && !(en && en.time));
    let endDate = en ? en.date : st.date, endTime = en ? en.time : '';
    if (allDay) { if (en && en.time === '00:00' && endDate > st.date) endDate = addDays(endDate, -1); }
    else if (endTime === '00:00' && endDate > st.date) { endDate = addDays(endDate, -1); endTime = '23:59'; }
    if (endDate < st.date) endDate = st.date;
    const title = parts[2] || '(ohne Titel)';
    if (isPlanerEntry(title, parts[3])) continue;
    out.push({
      id: uid(), title, date: st.date, endDate: endDate !== st.date ? endDate : null,
      start: allDay ? '' : st.time, end: allDay ? '' : (endTime || fromMin(Math.min(1439, toMin(st.time) + 60))), allDay,
      blocks: allDay && BLOCK_RE.test(title), repeat: '', location: '', notes: parts[3] ? `Kalender: ${parts[3]}` : '', source: 'iphone', uid: '',
    });
  }
  return out;
}
// Vom Planer exportierte Einträge (⚑ Deadline, ▶ Zeitblock, Kalender „Planer“) nicht zurückimportieren.
const isPlanerEntry = (title, cal = '') => /^[⚑▶]/.test(title) || /^planer$/i.test(String(cal).trim());
const srcLabel = s => s === 'iphone' ? 'iPhone-Kalender' : s.startsWith('ics:') ? s.slice(4) : 'Planer';
function importEvents(list, source) {
  snap();
  db.events = db.events.filter(e => e.source !== source).concat(list);
  save();
  toast(`${list.length} Termine aus „${srcLabel(source)}“ übernommen`, true);
}

// ---------- Zustand ----------
const TABS = { today: 'Heute', week: 'Woche', all: 'Alle', waiting: 'Warten', more: 'Mehr' };
const VIEWS = { ...TABS, review: 'Wochenrückblick' };
const ui = {
  view: VIEWS[location.hash.slice(2)] ? location.hash.slice(2) : 'today',
  weekStart: mondayOf(today()),
  filter: 'open', project: '', sort: 'due', mode: 'list', q: '', quick: '',
  todayMode: 'list', day: today(),
  showDone: false, sheet: null, focus: null,
};

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
const $timer = document.getElementById('timer');
let toastTimer;
function toast(text, undo = false) {
  $toast.innerHTML = `<span>${esc(text)}</span>${undo ? '<button data-a="undo">Rückgängig</button>' : ''}`;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, undo ? 5000 : 2800);
}
function download(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- Fokus-Timer ----------
let timer = (() => { try { return JSON.parse(localStorage.getItem(TKEY)); } catch { return null; } })();
const saveTimer = () => { try { timer ? localStorage.setItem(TKEY, JSON.stringify(timer)) : localStorage.removeItem(TKEY); } catch {} };
function startTimer(id) {
  if (timer) stopTimer();
  const now = Date.now();
  timer = { id, start: now, end: now + (+db.settings.focus || 25) * 60000 };
  saveTimer();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  tickTimer();
}
function stopTimer() {
  if (!timer) return {};
  const t = task(timer.id);
  const mins = Math.round((Math.min(Date.now(), timer.end) - timer.start) / 60000);
  if (t && mins > 0) { t.spent = (t.spent || 0) + mins; save(); }
  timer = null; saveTimer(); tickTimer();
  return { t, mins };
}
function alarm(title, body) {
  try {
    const c = new AudioContext(), o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(.2, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .9);
    o.start(); o.stop(c.currentTime + .9);
  } catch {}
  navigator.vibrate?.([200, 100, 200]);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    (navigator.serviceWorker?.getRegistration() || Promise.resolve(null))
      .then(r => r ? r.showNotification(title, { body }) : new Notification(title, { body })).catch(() => {});
  }
}
function tickTimer() {
  document.body.classList.toggle('has-timer', !!timer);
  if (!timer) { $timer.hidden = true; $timer.dataset.id = ''; return; }
  const left = timer.end - Date.now();
  if (left <= 0) {
    const { t, mins } = stopTimer();
    alarm('Fokus-Session fertig', t ? `+${mins} min auf „${t.title}“ – kurze Pause!` : 'Kurze Pause!');
    toast(`Fokus-Session fertig: +${mins} min${t ? ` auf „${t.title}“` : ''}. Pause! ☕`);
    render();
    return;
  }
  if ($timer.dataset.id !== timer.id) {
    const t = task(timer.id);
    $timer.dataset.id = timer.id;
    $timer.innerHTML = `<i class="pulse"></i><button class="plain grow ttl" data-a="edit" data-id="${timer.id}">${esc(t ? t.title : 'Fokus')}</button>
      <b class="left"></b><button data-a="timerStop">Stopp</button>`;
  }
  $timer.hidden = false;
  $timer.querySelector('.left').textContent = `${Math.floor(left / 60000)}:${pad(Math.floor(left / 1000) % 60)}`;
}
setInterval(tickTimer, 1000);

// ---------- Bausteine ----------
function dueBadge(t) {
  if (!t.due) return '';
  const n = diff(today(), t.due);
  const time = t.dueTime ? ` ${t.dueTime}` : '';
  let cls = 'b-later', txt;
  if (t.done) { cls = 'b-muted'; txt = short(t.due); }
  else if (n < 0) { cls = 'b-over'; txt = n === -1 ? 'seit gestern fällig' : `${-n} Tage überfällig`; }
  else if (n === 0) { cls = 'b-today'; txt = `Heute${time}`; }
  else if (n === 1) { cls = 'b-soon'; txt = `Morgen${time}`; }
  else if (n < 7) { cls = 'b-soon'; txt = `${WD[parse(t.due).getDay()]}${time} · in ${n} Tagen`; }
  else txt = `${short(t.due)}${time}`;
  return `<span class="badge ${cls}" title="Deadline">⚑ ${txt}</span>`;
}

function row(t, o = {}) {
  const p = proj(t.project);
  const subsDone = t.subs.filter(s => s.done).length;
  const meta = [];
  if (p && !o.hideProject) meta.push(`<span class="pname"><i class="pdot" style="--c:${p.color}"></i>${esc(p.name)}</span>`);
  if (t.status === 'waiting' && !t.done) {
    const late = t.followUp && t.followUp <= today();
    meta.push(`<span class="badge b-wait">⏳ ${esc(t.waitingFor || 'Warten')}${t.followUp ? ` · nachfassen ${dayLabel(t.followUp)}` : ''}</span>`);
    if (late) meta.push('<span class="badge b-over">nachhaken!</span>');
  }
  meta.push(dueBadge(t));
  if (t.plan && !o.hidePlan && !t.done && t.status !== 'waiting') {
    meta.push(`<span class="badge b-plan">📅 ${t.plan < today() ? 'seit ' : ''}${dayLabel(t.plan)}${t.planTime ? ` ${t.planTime}` : ''}</span>`);
  } else if (t.planTime && o.hidePlan && !t.done) {
    meta.push(`<span class="badge b-plan">🕘 ${t.planTime}</span>`);
  }
  if (!t.done && t.plan && t.due && t.plan > t.due) meta.push('<span class="badge b-over">nach Deadline!</span>');
  if (t.subs.length) meta.push(`<span>☑ ${subsDone}/${t.subs.length}</span>`);
  if (t.est || t.spent) {
    const over = t.est && t.spent > t.est;
    meta.push(`<span class="${over ? 'warn' : ''}">⏱ ${t.spent ? `${fmtMin(t.spent)}${t.est ? ' / ' : ''}` : ''}${t.est ? fmtMin(t.est) : ''}</span>`);
  }
  if (t.repeat) meta.push(`<span title="${REPEATS[t.repeat]}">↻</span>`);
  if (t.notes) meta.push('<span>📝</span>');
  const running = timer && timer.id === t.id;
  let btns = '';
  if (!t.done) {
    if (o.unwait && t.status === 'waiting') btns += `<button class="icon-btn small" data-a="unwait" data-id="${t.id}" title="Ist da – wieder aktiv" aria-label="Wieder aktiv">↩</button>`;
    else {
      if (o.focus) btns += `<button class="icon-btn small${running ? ' on' : ''}" data-a="${running ? 'timerStop' : 'focus'}" data-id="${t.id}" title="Fokus-Timer" aria-label="Fokus-Timer">${running ? '■' : '▶'}</button>`;
      if (t.status !== 'waiting') btns += `<button class="icon-btn small" data-a="planSheet" data-id="${t.id}" title="Einplanen" aria-label="Einplanen">📅</button>`;
    }
  }
  return `<div class="task prio${t.prio}${t.done ? ' done' : ''}${running ? ' running' : ''}">
    <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Erledigt">${t.done ? '✓' : ''}</button>
    <button class="tmain plain" data-a="edit" data-id="${t.id}">
      <span class="ttitle">${esc(t.title)}</span>
      <span class="tmeta">${meta.filter(Boolean).join('')}</span>
    </button>${btns}
  </div>`;
}

const section = (title, list, o = {}) => !list.length && !o.always ? '' : `
  <section class="sec${o.cls ? ' ' + o.cls : ''}">
    <div class="sec-h"><h3>${title}</h3><span class="muted small">${o.extra ?? list.length}</span></div>
    ${o.hint ? `<p class="muted small hint">${o.hint}</p>` : ''}
    ${list.length ? list.map(t => row(t, o)).join('') : `<div class="empty small">${o.empty || 'Nichts.'}</div>`}
  </section>`;

const quickInput = placeholder => `
  <div class="quick row gap">
    <input class="grow" data-f="uv.quick" data-enter="quickAdd" placeholder="${placeholder}" value="${esc(ui.quick)}" enterkeyhint="done" autocomplete="off">
    <button class="primary" data-a="quickAdd" aria-label="Hinzufügen">+</button>
  </div>`;

const capBar = (mins, c = cap()) => {
  const pct = c ? Math.min(100, Math.round(mins / c * 100)) : 100;
  return `<span class="cap${mins > c ? ' over' : ''}"><small>${fmtMin(mins)} / ${fmtMin(c)}</small><span class="bar"><i style="width:${pct}%"></i></span></span>`;
};

// ---------- Ansichten ----------
const evTime = e => e.allDay ? (e.blocks ? 'blockiert' : 'ganztägig') : `${fromMin(e.s)}–${fromMin(Math.min(e.en, 1439))}`;
const evRow = e => `<button class="ev plain${e.blocks ? ' blocks' : ''}" data-a="editEvent" data-id="${e.id}"><span class="evt">${evTime(e)}</span><span class="grow">${esc(e.title)}${e.location ? ` <span class="muted">· ${esc(e.location)}</span>` : ''}</span></button>`;
const modeSwitch = () => `<div class="chips seg"><button class="chip${ui.todayMode === 'list' ? ' on' : ''}" data-a="set" data-k="todayMode" data-v="list">☰ Liste</button><button class="chip${ui.todayMode === 'timeline' ? ' on' : ''}" data-a="todayTimeline">🕘 Zeitplan</button></div>`;

function viewTimeline() {
  const t0 = today(), day = ui.day;
  const [ws, we] = work();
  const ev = eventsOn(day);
  const allDay = ev.filter(e => e.allDay);
  const items = [
    ...ev.filter(e => !e.allDay).map(e => ({ kind: 'ev', id: e.id, s: e.s, en: e.en, title: e.title, sub: e.location })),
    ...db.tasks.filter(t => t.plan === day && t.planTime && t.status !== 'waiting').map(t => ({ kind: 'task', id: t.id, s: toMin(t.planTime), en: Math.min(1440, toMin(t.planTime) + (t.est || 30)), title: t.title, done: t.done, prio: t.prio })),
  ].sort((a, b) => a.s - b.s || b.en - a.en);
  // Überlappungen nebeneinander anordnen
  const groups = []; let g = [], gEnd = -1;
  for (const i of items) { if (g.length && i.s >= gEnd) { groups.push(g); g = []; gEnd = -1; } g.push(i); gEnd = Math.max(gEnd, i.en); }
  if (g.length) groups.push(g);
  groups.forEach(gr => { const ends = []; gr.forEach(i => { let l = ends.findIndex(e => e <= i.s); if (l < 0) { l = ends.length; ends.push(0); } ends[l] = i.en; i.lane = l; }); gr.forEach(i => { i.lanes = ends.length; }); });
  const from = Math.floor(Math.min(ws, ...items.map(i => i.s)) / 60) * 60;
  const to = Math.min(1440, Math.ceil(Math.max(we, ...items.map(i => i.en)) / 60) * 60);
  const PX = 1.1;
  const unsched = active().filter(t => !(t.plan === day && t.planTime) && (day === t0 ? (t.plan && t.plan <= t0) || (t.due && t.due <= t0) : t.plan === day)).sort(byPrio);
  const blockedMin = items.filter(i => i.kind === 'task' && !i.done).reduce((a, i) => a + i.en - i.s, 0);
  const free = freeOn(day);
  const hours = []; for (let m = from; m <= to; m += 60) hours.push(m);
  const now = day === t0 ? nowMin() : -1;
  return `
    <div class="weeknav row gap">
      <button class="icon-btn" data-a="day" data-v="-1" aria-label="Vorheriger Tag">‹</button>
      <div class="grow center"><b>${WDL[parse(day).getDay()]}, ${short(day)}</b><div class="muted small">${blockedOn(day) ? 'Tag blockiert' : `Termine ${fmtMin(meetingMin(day)) || '–'} · frei ${fmtMin(free)}${blockedMin ? ` · Aufgaben ${fmtMin(blockedMin)}` : ''}`}</div></div>
      <button class="icon-btn" data-a="day" data-v="1" aria-label="Nächster Tag">›</button>
    </div>
    ${day !== t0 ? '<button class="ghost block" data-a="day" data-v="0">Zu heute</button>' : ''}
    <div class="row gap tl-actions">
      <button class="primary grow" data-a="autoPlan"${unsched.length ? '' : ' disabled'}>⚡ ${unsched.length} Aufgabe${unsched.length === 1 ? '' : 'n'} in freie Zeit legen</button>
      <button data-a="newEvent" data-v="${day}">+ Termin</button>
    </div>
    ${allDay.length ? `<div class="allday">${allDay.map(evRow).join('')}</div>` : ''}
    <div class="timeline" style="height:${(to - from) * PX}px">
      ${hours.map(m => `<div class="hr" style="top:${(m - from) * PX}px"><span>${pad(m / 60)}:00</span></div>`).join('')}
      <div class="work" style="top:${(ws - from) * PX}px;height:${(we - ws) * PX}px"></div>
      ${items.map(i => `<button class="blk ${i.kind}${i.done ? ' done' : ''}${i.kind === 'task' ? ' prio' + i.prio : ''}" data-a="${i.kind === 'ev' ? 'editEvent' : 'edit'}" data-id="${i.id}"
        style="top:${(i.s - from) * PX}px;height:${Math.max(20, (i.en - i.s) * PX - 2)}px;left:calc(46px + (100% - 50px) * ${i.lane} / ${i.lanes});width:calc((100% - 50px) / ${i.lanes} - 3px)">
        <b>${esc(i.title)}</b><small>${fromMin(i.s)}–${fromMin(Math.min(i.en, 1439))}${i.sub ? ' · ' + esc(i.sub) : ''}</small></button>`).join('')}
      ${now >= from && now <= to ? `<div class="now" style="top:${(now - from) * PX}px"></div>` : ''}
    </div>
    ${items.some(i => i.kind === 'task') ? `<button class="ghost block" data-a="clearTimes" data-v="${day}">Zeitblöcke dieses Tages entfernen</button>` : ''}
    ${section('Noch ohne Uhrzeit', unsched, { focus: true, hint: 'Mit ⚡ füllt der Planer die Lücken zwischen deinen Terminen, wichtige Aufgaben zuerst. Eine feste Uhrzeit setzt du in der Aufgabe.' })}`;
}

function viewToday() {
  if (ui.todayMode === 'timeline') return modeSwitch() + viewTimeline();
  const t0 = today();
  const a = active();
  const overdue = a.filter(t => t.due && t.due < t0).sort(byDue);
  const todays = a.filter(t => !overdue.includes(t) && (t.due === t0 || (t.plan && t.plan <= t0))).sort(byPrio);
  const follow = waiting().filter(t => (t.followUp && t.followUp <= t0) || (t.due && t.due <= t0)).sort(byDue);
  const soon = a.filter(t => !t.plan && t.due && t.due > t0 && diff(t0, t.due) <= 7).sort(byDue);
  const doneToday = db.tasks.filter(t => doneOn(t, t0));
  const planned = [...overdue, ...todays];
  const est = sumEst(planned);
  const pct = planned.length + doneToday.length ? Math.round(doneToday.length / (planned.length + doneToday.length) * 100) : 0;
  const d = new Date();
  const reviewDue = !db.settings.lastReview || diff(db.settings.lastReview, t0) >= 7;
  const evs = eventsOn(t0).filter(e => e.allDay || e.en > nowMin());
  const nextEv = evs.find(e => !e.allDay && e.s >= nowMin());
  return `
    ${reviewDue ? '<button class="banner" data-a="go" data-v="review">🗓 <span class="grow"><b>Wochenrückblick fällig</b><br><small>15 Minuten: aufräumen, neu planen, nächste Woche vorbereiten</small></span> ›</button>' : ''}
    <div class="hero">
      <div class="muted small">${WDL[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()} · KW ${isoWeek(t0)}</div>
      <div class="stats">
        <div><b>${planned.length}</b><span>offen heute</span></div>
        <div><b class="${overdue.length ? 'bad' : ''}">${overdue.length}</b><span>überfällig</span></div>
        <div><b class="good">${doneToday.length}</b><span>erledigt</span></div>
        <div><b class="${est > capOn(t0) ? 'warn' : ''}">${est ? fmtMin(est) : '–'}</b><span>Aufwand / ${fmtMin(capOn(t0))} frei</span></div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${est > capOn(t0) ? `<p class="small warn hint">Mehr geplant, als heute frei ist (${fmtMin(capOn(t0))}${meetingMin(t0) ? ` nach ${fmtMin(meetingMin(t0))} Terminen` : ''}). Schieb etwas mit 📅 auf einen anderen Tag.</p>` : ''}
    </div>
    ${modeSwitch()}
    ${evs.length ? `<section class="sec"><div class="sec-h"><h3>Termine heute</h3><span class="muted small">${nextEv ? `nächster ${nextEv.s - nowMin() < 60 ? `in ${nextEv.s - nowMin()} min` : `um ${fromMin(nextEv.s)}`}` : ''}</span></div>${evs.map(evRow).join('')}</section>` : ''}
    ${quickInput('z. B. „Bericht bis fr ~2h #Arbeit !“')}
    ${section('Überfällig', overdue, { focus: true, cls: 'over' })}
    ${section('Heute', todays, { focus: true, always: true, empty: overdue.length ? 'Erst das Überfällige 💪' : 'Nichts geplant. Hol dir etwas aus „Bald fällig“ oder plane in der Woche.' })}
    ${section('Nachfassen', follow, { unwait: true, hint: 'Du wartest auf jemanden – heute nachhaken.' })}
    ${section('Bald fällig – noch nicht eingeplant', soon)}
    ${doneToday.length ? `<section class="sec">
      <button class="sec-h plain toggle" data-a="toggleDone"><h3>Heute erledigt</h3><span class="muted small">${doneToday.length} ${ui.showDone ? '▴' : '▾'}</span></button>
      ${ui.showDone ? doneToday.map(t => row(t)).join('') : ''}
    </section>` : ''}`;
}

function viewWeek() {
  const t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(ui.weekStart, i));
  const pool = active().filter(t => !t.plan).sort(byDue);
  const weekEst = sumEst(active().filter(t => t.plan && t.plan >= days[0] && t.plan <= days[6]));
  return `
    <div class="weeknav row gap">
      <button class="icon-btn" data-a="week" data-v="-7" aria-label="Vorige Woche">‹</button>
      <div class="grow center"><b>KW ${isoWeek(ui.weekStart)}</b><div class="muted small">${short(days[0])} – ${short(days[6])}${weekEst ? ` · ${fmtMin(weekEst)} geplant` : ''}</div></div>
      <button class="icon-btn" data-a="week" data-v="7" aria-label="Nächste Woche">›</button>
    </div>
    ${ui.weekStart !== mondayOf(t0) ? '<button class="ghost block" data-a="week" data-v="0">Zur aktuellen Woche</button>' : ''}
    ${section('Noch nicht eingeplant', pool, { extra: `${pool.length}${sumEst(pool) ? ` · ${fmtMin(sumEst(pool))}` : ''}`, hint: 'Mit 📅 einem Tag zuordnen. Die Balken zeigen, wie voll ein Tag ist (Aufgaben ÷ freie Zeit nach Terminen).' })}
    ${days.map(day => {
      const planned = db.tasks.filter(t => t.plan === day && t.status !== 'waiting').sort((a, b) => a.done - b.done || byPrio(a, b));
      const deadlines = open().filter(t => t.due === day && t.plan !== day).sort(byDue);
      const est = sumEst(planned.filter(t => !t.done));
      const evs = eventsOn(day);
      const d = parse(day);
      const isToday = day === t0;
      return `<section class="sec day${isToday ? ' is-today' : ''}${day < t0 ? ' past' : ''}">
        <div class="sec-h">
          <h3>${WDL[d.getDay()]} <span class="muted">${short(day)}</span>${isToday ? ' <span class="badge b-today">Heute</span>' : ''}</h3>
          ${blockedOn(day) ? '<span class="badge b-wait">blockiert</span>' : est || evs.length ? capBar(est, capOn(day)) : ''}
          <button class="icon-btn small" data-a="openDay" data-v="${day}" aria-label="Zeitplan dieses Tages" title="Zeitplan">🕘</button>
          <button class="icon-btn small" data-a="choose" data-v="${day}" aria-label="Neu für diesen Tag">+</button>
        </div>
        ${evs.map(evRow).join('')}
        ${deadlines.map(t => `<button class="deadline plain" data-a="edit" data-id="${t.id}">⚑ Deadline: <b>${esc(t.title)}</b>${t.dueTime ? ` · ${t.dueTime}` : ''}${t.status === 'waiting' ? ` <span class="muted">(⏳ ${esc(t.waitingFor)})</span>` : t.plan ? ` <span class="muted">(geplant ${dayLabel(t.plan)})</span>` : ' <span class="bad">(nicht eingeplant)</span>'}</button>`).join('')}
        ${planned.map(t => row(t, { hidePlan: true })).join('')}
        ${!planned.length && !deadlines.length && !evs.length ? '<div class="empty small">frei</div>' : ''}
      </section>`;
    }).join('')}`;
}

function viewMatrix(list) {
  const t0 = today();
  const urgent = t => t.prio === 2 || (t.due && diff(t0, t.due) <= 2);
  const important = t => t.prio >= 1;
  const q = [
    ['Sofort erledigen', 'wichtig & dringend', list.filter(t => important(t) && urgent(t)), 'q1'],
    ['Einplanen', 'wichtig, nicht dringend – hier entsteht Fortschritt', list.filter(t => important(t) && !urgent(t)), 'q2'],
    ['Schnell erledigen oder abgeben', 'dringend, nicht wichtig', list.filter(t => !important(t) && urgent(t)), 'q3'],
    ['Später oder streichen', 'weder noch', list.filter(t => !important(t) && !urgent(t)), 'q4'],
  ];
  return `<p class="muted small hint">„Wichtig“ = Priorität Wichtig oder Dringend. „Dringend“ = Priorität Dringend oder Deadline in ≤ 2 Tagen.</p>
    <div class="matrix">${q.map(([title, sub, l, cls]) => `<section class="quad ${cls}">
      <div class="sec-h"><h3>${title}</h3><span class="muted small">${l.length}</span></div>
      <div class="muted small qsub">${sub}</div>
      ${l.sort(byDue).map(t => row(t, { focus: true })).join('') || '<div class="empty small">leer</div>'}
    </section>`).join('')}</div>`;
}

function viewAll() {
  const t0 = today();
  const q = ui.q.trim().toLowerCase();
  const match = t =>
    (!ui.project || t.project === ui.project || (ui.project === '-' && !proj(t.project))) &&
    (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q) || t.waitingFor.toLowerCase().includes(q));
  const list = db.tasks.filter(t => match(t) && (ui.filter === 'all' || (ui.filter === 'done') === t.done));
  list.sort(ui.sort === 'prio' ? byPrio : ui.sort === 'new' ? (a, b) => b.createdAt - a.createdAt : byDue);
  if (ui.filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const chip = (field, v, label) => `<button class="chip${ui[field] === v ? ' on' : ''}" data-a="set" data-k="${field}" data-v="${v}">${label}</button>`;
  let body;
  if (ui.mode === 'matrix') body = viewMatrix(active().filter(match));
  else if (ui.filter === 'open' && ui.sort === 'due') {
    const wEnd = addDays(t0, 7);
    body = section('Überfällig', list.filter(t => t.due && t.due < t0))
      + section('Nächste 7 Tage', list.filter(t => t.due && t.due >= t0 && t.due <= wEnd))
      + section('Später', list.filter(t => t.due && t.due > wEnd))
      + section('Ohne Deadline', list.filter(t => !t.due));
  } else body = section(ui.filter === 'done' ? 'Erledigt' : 'Aufgaben', list);
  return `
    <div class="chips seg">${chip('mode', 'list', '☰ Liste')}${chip('mode', 'matrix', '◫ Matrix')}</div>
    <input class="search" type="search" data-f="ui.q" placeholder="Suchen…" value="${esc(ui.q)}">
    ${ui.mode === 'list' ? `<div class="chips">${chip('filter', 'open', 'Offen')}${chip('filter', 'done', 'Erledigt')}${chip('filter', 'all', 'Alle')}</div>` : ''}
    <div class="row gap">
      <select class="grow" data-f="ui.project">
        <option value="">Alle Projekte</option>
        ${db.projects.map(p => `<option value="${p.id}"${ui.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="-"${ui.project === '-' ? ' selected' : ''}>Ohne Projekt</option>
      </select>
      ${ui.mode === 'list' ? `<select data-f="ui.sort">
        <option value="due"${ui.sort === 'due' ? ' selected' : ''}>nach Deadline</option>
        <option value="prio"${ui.sort === 'prio' ? ' selected' : ''}>nach Priorität</option>
        <option value="new"${ui.sort === 'new' ? ' selected' : ''}>neueste zuerst</option>
      </select>` : ''}
    </div>
    ${ui.mode === 'list' ? quickInput('Neue Aufgabe…') : ''}
    ${ui.mode === 'matrix' || list.length ? body : `<div class="empty">${q ? 'Keine Treffer.' : 'Hier ist noch nichts. Tipp auf + um loszulegen.'}</div>`}`;
}

function viewWaiting() {
  const list = waiting().sort((a, b) => (a.followUp || '9999').localeCompare(b.followUp || '9999') || byDue(a, b));
  const groups = {};
  list.forEach(t => { (groups[t.waitingFor || 'Ohne Angabe'] ||= []).push(t); });
  return `<p class="muted small hint">Alles, was du abgegeben hast oder wofür du auf Daten, Feedback oder eine Freigabe wartest.
    Mit ↩ holst du eine Aufgabe zurück, sobald die Antwort da ist.</p>
    ${list.length ? Object.entries(groups).map(([who, l]) => section(`⏳ ${esc(who)}`, l, { unwait: true })).join('')
      : '<div class="empty">Du wartest gerade auf niemanden. Im Bearbeiten-Fenster einer Aufgabe kannst du „Warten auf …“ wählen.</div>'}`;
}

function viewMore() {
  const t0 = today();
  const stats = id => {
    const all = db.tasks.filter(t => (id ? t.project === id : !proj(t.project)));
    const op = all.filter(t => !t.done);
    return { all, op, over: op.filter(t => t.due && t.due < t0).length, next: op.filter(t => t.due).sort(byDue)[0] };
  };
  const card = (p, s) => `
    <div class="pcard" style="--c:${p ? p.color : 'var(--muted)'}">
      <button class="plain pmain" data-a="openProject" data-id="${p ? p.id : '-'}">
        <span class="row gap"><i class="pdot"></i><b class="grow">${esc(p ? p.name : 'Ohne Projekt')}</b>
          <span class="muted small">${s.op.length} offen${s.over ? ` · <span class="bad">${s.over} überfällig</span>` : ''}</span></span>
        <span class="bar"><i style="width:${s.all.length ? Math.round((s.all.length - s.op.length) / s.all.length * 100) : 0}%"></i></span>
        <span class="muted small">${s.next ? `Nächste Deadline: ${esc(s.next.title)} – ${dayLabel(s.next.due)}` : 'Keine offene Deadline'}</span>
      </button>
      ${p ? `<button class="icon-btn small" data-a="editProject" data-id="${p.id}" aria-label="Projekt bearbeiten">✎</button>` : ''}
    </div>`;
  const none = stats('');
  const doneCount = db.tasks.filter(t => t.done).length;
  const s = db.settings;
  const sources = Object.entries(db.events.reduce((a, e) => { a[e.source] = (a[e.source] || 0) + 1; return a; }, {}));
  const setChip = (k, v, label) => `<button class="chip${+s[k] === v ? ' on' : ''}" data-a="setS" data-k="${k}" data-v="${v}">${label}</button>`;
  return `
    <button class="banner" data-a="go" data-v="review">🗓 <span class="grow"><b>Wochenrückblick</b><br><small>${s.lastReview ? `Zuletzt: ${dayLabel(s.lastReview)}` : 'Noch nie gemacht'}</small></span> ›</button>
    ${sync.configured ? `<button class="banner sync-banner" data-a="account">☁︎ <span class="grow"><b>Sync & Claude</b><br><small>${sync.email ? `${esc(sync.email)} · ${SYNC_LABEL[sync.state]}` : 'Handy, Laptop und Claude verbinden'}</small></span> ›</button>` : ''}

    <section class="sec"><div class="sec-h"><h3>Vorlagen mit Rückwärtsplanung</h3></div>
      <p class="muted small hint">Für wiederkehrende Ergebnisse wie Bericht, Newsletter oder Präsentation: Deadline eingeben, und die Schritte werden rückwärts auf die Tage davor verteilt.</p>
      ${db.templates.map(tp => { const st = parseSteps(tp.text); const m = st.reduce((x, y) => x + y.est, 0); return `<div class="tcard row gap">
        <button class="plain grow col" data-a="applyTpl" data-id="${tp.id}"><b>${esc(tp.name)}</b><small class="muted">${st.length} Schritte${m ? ` · ${fmtMin(m)}` : ''}</small></button>
        <button class="primary small-btn" data-a="applyTpl" data-id="${tp.id}">Anwenden</button>
        <button class="icon-btn small" data-a="editTpl" data-id="${tp.id}" aria-label="Vorlage bearbeiten">✎</button>
      </div>`; }).join('')}
      <button class="ghost block" data-a="newTpl">+ Neue Vorlage</button>
    </section>

    <section class="sec"><div class="sec-h"><h3>Kalender</h3></div>
      <p class="muted small hint">Deine Termine bestimmen, wie viel Zeit pro Tag für Aufgaben bleibt. Ganztägige Termine wie „Urlaub“ oder „Krank“ blockieren den Tag.</p>
      <button class="block" data-a="pasteSheet">📱 Termine aus iPhone-Kalender übernehmen</button>
      <button class="block" data-a="importIcs">📥 Kalender-Datei (.ics) importieren – Outlook, Google, Mac</button>
      <button class="block" data-a="exportIcs">📤 Planer → Kalender (.ics): Deadlines, Zeitblöcke, eigene Termine</button>
      <button class="ghost block" data-a="newEvent">+ Eigener Termin</button>
      ${sources.length ? `<div class="srclist">${sources.map(([src, n]) => `<div class="row gap"><span class="grow">${esc(srcLabel(src))} <span class="muted small">· ${n} Termine</span></span>${src ? `<button class="ghost small-btn danger" data-a="dropSource" data-v="${esc(src)}">Entfernen</button>` : ''}</div>`).join('')}</div>` : ''}
      <label class="lbl">Arbeitszeit (Rahmen für Zeitplan und freie Zeit)</label>
      <div class="row gap"><input type="time" data-f="s.workStart" value="${s.workStart}"><span class="muted">bis</span><input type="time" data-f="s.workEnd" value="${s.workEnd}"></div>
    </section>

    <section class="sec"><div class="sec-h"><h3>Projekte</h3></div>
      ${db.projects.map(p => card(p, stats(p.id))).join('')}
      ${none.all.length ? card(null, none) : ''}
      <button class="ghost block" data-a="newProject">+ Neues Projekt</button>
    </section>

    <section class="sec"><div class="sec-h"><h3>Einstellungen</h3></div>
      <label class="lbl">Max. Aufgabenzeit pro Tag (gilt zusätzlich zur freien Zeit nach Terminen)</label>
      <div class="chips">${[180, 240, 300, 360, 420, 480].map(v => setChip('capacity', v, fmtMin(v))).join('')}</div>
      <label class="lbl">Dauer einer Fokus-Session</label>
      <div class="chips">${[25, 45, 60, 90].map(v => setChip('focus', v, `${v} min`)).join('')}</div>
      <label class="lbl">Vorlagen: Schritte nicht aufs Wochenende legen</label>
      <div class="chips"><button class="chip${s.skipWeekend ? ' on' : ''}" data-a="setS" data-k="skipWeekend" data-v="1">Ja</button><button class="chip${s.skipWeekend ? '' : ' on'}" data-a="setS" data-k="skipWeekend" data-v="0">Nein</button></div>
    </section>

    <section class="sec"><div class="sec-h"><h3>Daten</h3></div>
      <p class="muted small hint">Alles wird nur auf diesem Gerät gespeichert. Mach ab und zu ein Backup.</p>
      <div class="row gap">
        <button class="grow" data-a="export">⬇︎ Backup</button>
        <button class="grow" data-a="import">⬆︎ Laden</button>
      </div>
      <button class="ghost block" data-a="clearDone"${doneCount ? '' : ' disabled'}>Erledigte löschen (${doneCount})</button>
    </section>

    <section class="sec"><div class="sec-h"><h3>Schnelleingabe – Spickzettel</h3></div>
      <div class="help small">
        <div><code>bis fr</code> Deadline (heute, morgen, mo–so, 15.12., +3) · <code>bis fr 10:00</code> mit Uhrzeit</div>
        <div><code>@mo</code> eingeplant für Montag</div>
        <div><code>~2h</code> / <code>~30m</code> geschätzter Aufwand</div>
        <div><code>#Projekt</code> Projekt (wird angelegt, wenn es fehlt)</div>
        <div><code>!</code> wichtig · <code>!!</code> dringend</div>
        <div class="muted">Beispiel: <i>Dashboard-Review bis do ~1h @mi #Arbeit !</i></div>
        <div class="muted">Am Computer: <code>N</code> = neue Aufgabe, <code>Esc</code> = schließen</div>
      </div>
    </section>`;
}

function viewReview() {
  const t0 = today();
  const mon = mondayOf(t0);
  const doneWeek = db.tasks.filter(t => t.done && t.doneAt && iso(new Date(t.doneAt)) >= mon);
  const spentWeek = doneWeek.reduce((x, t) => x + (t.spent || 0), 0);
  const measured = doneWeek.filter(t => t.est && t.spent);
  const ratio = measured.length ? Math.round(measured.reduce((x, t) => x + t.spent / t.est, 0) / measured.length * 100) : null;
  const a = active();
  const overdue = a.filter(t => (t.due && t.due < t0) || (t.plan && t.plan < t0)).sort(byDue);
  const wait = waiting().sort((x, y) => (x.followUp || '9999').localeCompare(y.followUp || '9999'));
  const horizon = addDays(t0, 14);
  const unplanned = a.filter(t => !t.plan && t.due && t.due <= horizon && t.due >= t0).sort(byDue);
  const noDue = a.filter(t => !t.due && !t.plan).sort(byPrio);
  const next = addDays(mon, 7);
  const nextDays = Array.from({ length: 5 }, (_, i) => addDays(next, i));
  const step = (n, title, body) => `<section class="sec rstep"><div class="sec-h"><h3><span class="num">${n}</span>${title}</h3></div>${body}</section>`;
  return `
    <p class="muted small hint">Geh die Schritte einmal pro Woche durch, z. B. Freitagnachmittag. Danach ist der Planer wieder aktuell und nichts hängt mehr im Kopf.</p>
    ${step(1, 'Erfolge ansehen', `<div class="hero"><div class="stats three">
      <div><b class="good">${doneWeek.length}</b><span>erledigt diese Woche</span></div>
      <div><b>${spentWeek ? fmtMin(spentWeek) : '–'}</b><span>fokussiert erfasst</span></div>
      <div><b class="${ratio > 120 ? 'warn' : ''}">${ratio != null ? ratio + ' %' : '–'}</b><span>Ist ÷ Schätzung</span></div>
    </div>${ratio > 120 ? '<p class="small warn hint">Du brauchst im Schnitt länger als geschätzt. Plane künftig mehr Puffer ein.</p>' : ''}</div>`)}
    ${step(2, 'Liegengebliebenes neu planen', overdue.length ? overdue.map(t => row(t)).join('') : '<div class="empty small">Nichts liegengeblieben 👍</div>')}
    ${step(3, 'Warten auf: bei wem nachhaken?', wait.length ? wait.map(t => row(t, { unwait: true })).join('') : '<div class="empty small">Du wartest auf niemanden.</div>')}
    ${step(4, 'Deadlines der nächsten 14 Tage einplanen', unplanned.length ? unplanned.map(t => row(t)).join('') : '<div class="empty small">Alle Deadlines sind eingeplant.</div>')}
    ${step(5, 'Nächste Woche: Auslastung', `<div class="loadlist">${nextDays.map(d => {
      const m = sumEst(active().filter(t => t.plan === d));
      const dl = open().filter(t => t.due === d).length;
      return `<div class="row gap"><span class="lday">${WD[parse(d).getDay()]} ${short(d)}</span>${blockedOn(d) ? '<span class="grow muted small">blockiert</span>' : capBar(m, capOn(d))}${dl ? `<span class="badge b-soon">⚑ ${dl}</span>` : ''}</div>`;
    }).join('')}</div>
      <button class="ghost block" data-a="goWeek" data-v="${next}">In der Wochenansicht planen ›</button>`)}
    ${noDue.length ? step(6, 'Ohne Termin: noch relevant?', `<p class="muted small hint">Streich, was nicht mehr wichtig ist. Gib dem Rest eine Deadline oder einen Plan-Tag.</p>${noDue.map(t => row(t)).join('')}`) : ''}
    <button class="primary block big" data-a="reviewDone">✓ Rückblick abschließen</button>`;
}

// ---------- Sheets ----------
const sheetWrap = (title, body, cls = '') => `<div class="sheet-backdrop" data-a="close"></div>
  <div class="sheet ${cls}" role="dialog" aria-label="${esc(title)}">
    <div class="sheet-head row"><b class="grow">${esc(title)}</b><button class="icon-btn small" data-a="close" aria-label="Schließen">✕</button></div>
    ${body}
  </div>`;

function sheetEdit(d) {
  const t0 = today();
  const isNew = !task(d.id);
  const dateChips = (field, list) => list
    .map(([l, v]) => `<button class="chip${(d[field] || '') === v ? ' on' : ''}" data-a="setD" data-k="${field}" data-v="${v}">${l}</button>`).join('');
  const running = timer && timer.id === d.id;
  const waitingMode = d.status === 'waiting';
  return sheetWrap(isNew ? 'Neue Aufgabe' : 'Aufgabe', `
    <input class="title-in" data-f="d.title" placeholder="Was ist zu tun?" value="${esc(d.title)}" ${isNew ? 'autofocus' : ''} autocomplete="off">
    <textarea data-f="d.notes" rows="2" placeholder="Notizen, Links, Ansprechpartner… (optional)">${esc(d.notes)}</textarea>

    <div class="chips seg">
      <button class="chip${waitingMode ? '' : ' on'}" data-a="setD" data-k="status" data-v="open">Ich mache es</button>
      <button class="chip${waitingMode ? ' on' : ''}" data-a="setD" data-k="status" data-v="waiting">⏳ Warten auf …</button>
    </div>
    ${waitingMode ? `
      <input data-f="d.waitingFor" list="persons" placeholder="Auf wen oder was? (Name, Team, Daten …)" value="${esc(d.waitingFor)}" autocomplete="off">
      <datalist id="persons">${persons().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
      <label class="lbl">Nachfassen am</label>
      <input type="date" data-f="d.followUp" value="${d.followUp || ''}">
      <div class="chips">${dateChips('followUp', [['Morgen', addDays(t0, 1)], ['in 3 Tagen', addDays(t0, 3)], ['in 1 Woche', addDays(t0, 7)], ['Kein', '']])}</div>` : ''}

    <label class="lbl">Deadline – bis wann muss es fertig sein?</label>
    <div class="row gap">
      <input class="grow" type="date" data-f="d.due" value="${d.due || ''}">
      <input type="time" data-f="d.dueTime" value="${d.dueTime || ''}">
    </div>
    <div class="chips">${dateChips('due', [['Heute', t0], ['Morgen', addDays(t0, 1)], ['Freitag', addDays(t0, (5 - parse(t0).getDay() + 7) % 7)], ['in 1 Woche', addDays(t0, 7)], ['Keine', '']])}</div>

    ${waitingMode ? '' : `
    <label class="lbl">Eingeplant – wann arbeitest du daran?</label>
    <div class="row gap">
      <input class="grow" type="date" data-f="d.plan" value="${d.plan || ''}">
      ${d.plan ? `<input type="time" data-f="d.planTime" value="${d.planTime || ''}" title="Uhrzeit (Zeitblock)" aria-label="Uhrzeit">` : ''}
    </div>
    <div class="chips">${dateChips('plan', [['Heute', t0], ['Morgen', addDays(t0, 1)], ['Keiner', '']])}</div>`}

    <label class="lbl">Priorität</label>
    <div class="chips">${PRIOS.map(p => `<button class="chip prio-chip p${p.v}${d.prio === p.v ? ' on' : ''}" data-a="setD" data-k="prio" data-v="${p.v}" data-num="1">${p.label}</button>`).join('')}</div>

    <label class="lbl">Projekt</label>
    <select data-f="d.project">
      <option value="">Ohne Projekt</option>
      ${db.projects.map(p => `<option value="${p.id}"${d.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>

    <label class="lbl">Geschätzter Aufwand${d.spent ? ` · bisher fokussiert: <b>${fmtMin(d.spent)}</b>` : ''}</label>
    <div class="chips">${ESTS.map(m => `<button class="chip${(+d.est || 0) === m ? ' on' : ''}" data-a="setD" data-k="est" data-v="${m}" data-num="1">${m ? fmtMin(m) : '–'}</button>`).join('')}</div>

    <label class="lbl">Wiederholen (beim Abhaken kommt die nächste)</label>
    <select data-f="d.repeat">${Object.entries(REPEATS).map(([v, l]) => `<option value="${v}"${d.repeat === v ? ' selected' : ''}>${l}</option>`).join('')}</select>

    <label class="lbl">Teilschritte</label>
    ${d.subs.map(s => `<div class="sub row gap">
      <button class="check small${s.done ? ' on' : ''}" data-a="subToggle" data-id="${s.id}" aria-label="Teilschritt erledigt">${s.done ? '✓' : ''}</button>
      <input class="grow${s.done ? ' struck' : ''}" data-f="sub.${s.id}" value="${esc(s.t)}">
      <button class="icon-btn small" data-a="subDel" data-id="${s.id}" aria-label="Entfernen">✕</button>
    </div>`).join('')}
    <div class="row gap"><input class="grow" data-f="uv.newSub" data-enter="subAdd" placeholder="Teilschritt hinzufügen…" value="${esc(ui.newSub || '')}" enterkeyhint="done" autocomplete="off"><button data-a="subAdd">+</button></div>

    <button class="primary block big" data-a="saveTask">Speichern</button>
    ${!waitingMode && !d.done ? `<button class="block" data-a="${running ? 'timerStop' : 'saveFocus'}">${running ? '■ Fokus-Timer stoppen' : `▶ Speichern & ${db.settings.focus} min fokussieren`}</button>` : ''}
    ${isNew ? '' : `<div class="row gap">
      <button class="ghost grow" data-a="duplicate">Duplizieren</button>
      <button class="ghost grow danger" data-a="deleteTask">Löschen</button>
    </div>`}`);
}

function sheetPlan(t) {
  const t0 = today();
  const opts = Array.from({ length: 7 }, (_, i) => addDays(t0, i));
  const nextMon = addDays(mondayOf(t0), 7);
  if (!opts.includes(nextMon)) opts.push(nextMon);
  return sheetWrap('Wann bearbeitest du das?', `
    <div class="muted small">${esc(t.title)}${t.due ? ` · Deadline ${dayLabel(t.due)}${t.dueTime ? ' ' + t.dueTime : ''}` : ''}${t.est ? ` · ${fmtMin(t.est)}` : ''}</div>
    <div class="chips">${opts.map(day => {
      const load = sumEst(active().filter(x => x.plan === day && x.id !== t.id));
      const full = load + (t.est || 0) > capOn(day);
      return `<button class="chip${t.plan === day ? ' on' : ''}${t.due && day > t.due ? ' late' : ''}${full ? ' full' : ''}" data-a="planTo" data-id="${t.id}" data-v="${day}">
        ${day === nextMon && diff(t0, day) > 6 ? 'Nächste Woche' : dayLabel(day)} <small>· ${blockedOn(day) ? 'blockiert' : `${fmtMin(load) === '0 min' ? '' : fmtMin(load) + ' / '}${fmtMin(capOn(day))} frei`}</small></button>`;
    }).join('')}</div>
    <p class="muted small hint">Je Tag: schon geplant / frei nach Terminen. Rot umrandet: nach der Deadline. Gestrichelt: Der Tag wäre zu voll.</p>
    <input type="date" data-f="uv.planPick" value="${t.plan || ''}">
    <button class="primary block" data-a="planTo" data-id="${t.id}" data-pick="1">Dieses Datum übernehmen</button>
    ${t.plan ? `<button class="ghost block" data-a="planTo" data-id="${t.id}" data-v="">Planung entfernen</button>` : ''}`);
}

function sheetProject(d) {
  const isNew = !proj(d.id);
  return sheetWrap(isNew ? 'Neues Projekt' : 'Projekt bearbeiten', `
    <input class="title-in" data-f="d.name" placeholder="Name, z. B. Dashboards, Reporting, Privat" value="${esc(d.name)}" ${isNew ? 'autofocus' : ''}>
    <label class="lbl">Farbe</label>
    <div class="chips">${COLORS.map(c => `<button class="swatch${d.color === c ? ' on' : ''}" style="--c:${c}" data-a="setD" data-k="color" data-v="${c}" aria-label="Farbe ${c}"></button>`).join('')}</div>
    <button class="primary block big" data-a="saveProject">Speichern</button>
    ${isNew ? '' : '<button class="ghost block danger" data-a="deleteProject">Projekt löschen</button>'}`);
}

function sheetTemplate(d) {
  const isNew = !db.templates.some(x => x.id === d.id);
  return sheetWrap(isNew ? 'Neue Vorlage' : 'Vorlage bearbeiten', `
    <input class="title-in" data-f="d.name" placeholder="Name, z. B. Quartalsreport" value="${esc(d.name)}" ${isNew ? 'autofocus' : ''}>
    <label class="lbl">Standard-Projekt</label>
    <select data-f="d.project"><option value="">Ohne Projekt</option>
      ${db.projects.map(p => `<option value="${p.id}"${d.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <label class="lbl">Schritte – eine Zeile pro Schritt</label>
    <textarea data-f="d.text" rows="8" class="mono" placeholder="T-5 Daten ziehen ~2h&#10;T-2 Feedback einholen ~30m&#10;T Abgabe">${esc(d.text)}</textarea>
    <p class="muted small hint"><code>T-5</code> = 5 Tage vor der Deadline, <code>T</code> = am Deadline-Tag, <code>~2h</code> oder <code>~30m</code> = Aufwand.</p>
    <button class="primary block big" data-a="saveTpl">Speichern</button>
    ${isNew ? '' : '<button class="ghost block danger" data-a="deleteTpl">Vorlage löschen</button>'}`);
}

function sheetApply(d) {
  const tp = db.templates.find(x => x.id === d.tpl);
  const steps = tp ? parseSteps(tp.text) : [];
  const t0 = today();
  return sheetWrap('Vorlage anwenden', `
    <div class="chips">${db.templates.map(x => `<button class="chip${x.id === d.tpl ? ' on' : ''}" data-a="setD" data-k="tpl" data-v="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <label class="lbl">Titel (steht vor jedem Schritt)</label>
    <input data-f="d.title" value="${esc(d.title)}" placeholder="z. B. Newsletter Dezember" autocomplete="off">
    <label class="lbl">Deadline</label>
    <input type="date" data-f="d.deadline" value="${d.deadline || ''}">
    <label class="lbl">Projekt</label>
    <select data-f="d.project"><option value="">Ohne Projekt</option>
      ${db.projects.map(p => `<option value="${p.id}"${d.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    ${d.deadline ? `<label class="lbl">Vorschau</label><div class="preview">${steps.map(s => {
      const day = stepDate(d.deadline, s.off);
      return `<div class="row gap${day < t0 ? ' bad' : ''}"><span class="lday">${WD[parse(day).getDay()]} ${short(day)}</span><span class="grow">${esc(s.t)}</span><span class="muted small">${s.est ? fmtMin(s.est) : ''}</span></div>`;
    }).join('')}</div>
    ${steps.some(s => stepDate(d.deadline, s.off) < t0) ? '<p class="small bad hint">Einige Schritte liegen in der Vergangenheit und werden als überfällig angelegt.</p>' : ''}` : '<p class="muted small hint">Wähl eine Deadline, dann siehst du die Vorschau.</p>'}
    <button class="primary block big" data-a="doApply"${d.deadline && steps.length ? '' : ' disabled'}>${steps.length} Aufgaben anlegen</button>`);
}

function sheetEvent(d) {
  const isNew = !db.events.some(e => e.id === d.id);
  const imported = !!d.source;
  const yn = (k, on, labels) => `<div class="chips seg">${labels.map(([l, v]) => `<button class="chip${(!!d[k]) === v ? ' on' : ''}" data-a="setD" data-k="${k}" data-v="${v ? 1 : 0}">${l}</button>`).join('')}</div>`;
  return sheetWrap(isNew ? 'Neuer Termin' : 'Termin', `
    ${imported ? `<p class="muted small hint">Importiert aus „${esc(srcLabel(d.source))}“. Änderungen hier werden beim nächsten Import überschrieben.</p>` : ''}
    <input class="title-in" data-f="d.title" placeholder="z. B. Jour fixe, Arzt, Training, Urlaub" value="${esc(d.title)}" ${isNew ? 'autofocus' : ''} autocomplete="off">
    ${yn('allDay', d.allDay, [['Mit Uhrzeit', false], ['Ganztägig', true]])}
    <label class="lbl">${d.allDay ? 'Von' : 'Datum'}</label>
    <input type="date" data-f="d.date" value="${d.date || ''}">
    ${d.allDay ? `
      <label class="lbl">Bis (optional, für mehrere Tage)</label>
      <input type="date" data-f="d.endDate" value="${d.endDate || ''}">
      <label class="lbl">Blockiert den Tag für Aufgaben? (Urlaub, krank, Feiertag)</label>
      ${yn('blocks', d.blocks, [['Nein', false], ['Ja, blockieren', true]])}` : `
      <div class="row gap"><label class="lbl grow">Beginn</label><label class="lbl grow">Ende</label></div>
      <div class="row gap"><input class="grow" type="time" data-f="d.start" value="${d.start || ''}"><input class="grow" type="time" data-f="d.end" value="${d.end || ''}"></div>`}
    ${imported ? '' : `<label class="lbl">Wiederholen</label>
      <select data-f="d.repeat">${Object.entries(EV_REPEATS).map(([v, l]) => `<option value="${v}"${d.repeat === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`}
    <label class="lbl">Ort (optional)</label>
    <input data-f="d.location" value="${esc(d.location)}" autocomplete="off">
    <textarea data-f="d.notes" rows="2" placeholder="Notizen (optional)">${esc(d.notes)}</textarea>
    <button class="primary block big" data-a="saveEvent">Speichern</button>
    ${isNew ? '' : '<button class="ghost block danger" data-a="deleteEvent">Termin löschen</button>'}`);
}

function sheetPaste(d) {
  const n = d.text ? (d.text.includes('BEGIN:VCALENDAR') ? icsToEvents(parseIcs(d.text), 'iphone') : parseShortcut(d.text)).length : 0;
  return sheetWrap('Termine aus dem iPhone-Kalender', `
    <p class="small hint">Eine Web-App darf den iPhone-Kalender nicht direkt lesen. Ein <b>Kurzbefehl</b> kopiert deine Termine, und du fügst sie hier ein. Einmal einrichten, danach dauert es zwei Fingertipps.</p>
    <details class="howto"${n ? '' : ' open'}><summary>Kurzbefehl einrichten (einmalig, ca. 3 Minuten)</summary>
      <ol class="small">
        <li>App <b>Kurzbefehle</b> öffnen → <b>+</b> → Name: <i>Planer-Kalender</i>.</li>
        <li>Aktion <b>Kalenderereignisse suchen</b> hinzufügen. Filter: <i>Startdatum</i> → <i>ist in den nächsten</i> → <i>14 Tage</i>. Optional mit <i>Kalender ist …</i> einschränken.</li>
        <li>Aktion <b>Wiederholen mit jedem</b> (Eingabe: Kalenderereignisse).</li>
        <li>Darin <b>Datum formatieren</b>: Eingabe <i>Wiederholungsobjekt → Startdatum</i>, Format <i>ISO 8601</i>, <i>Zeit einschließen</i> an.</li>
        <li>Darin noch einmal <b>Datum formatieren</b> mit <i>Wiederholungsobjekt → Enddatum</i> (gleiche Einstellungen).</li>
        <li>Darin Aktion <b>Text</b> mit genau dieser Zeile (Variablen über die Leiste einfügen):<br>
          <code>Formatiertes Datum | Formatiertes Datum 2 | Titel | Kalender | Ganztägig</code><br>
          Titel, Kalender und Ganztägig sind Eigenschaften von <i>Wiederholungsobjekt</i>.</li>
        <li>Nach <i>Ende der Wiederholung</i>: <b>Text kombinieren</b> mit <i>Neue Zeilen</i>.</li>
        <li><b>In Zwischenablage kopieren</b>.</li>
      </ol>
      <p class="muted small">Danach: Kurzbefehl ausführen (auch per Siri oder Widget), Planer öffnen → Mehr → hier → „Aus Zwischenablage einfügen“.<br>
      Hinweis: Die Namen der Aktionen können je nach iOS-Version leicht abweichen.</p>
    </details>
    <button class="block" data-a="pasteClip">📋 Aus Zwischenablage einfügen</button>
    <textarea data-f="d.text" rows="5" class="mono" placeholder="…oder hier einfügen. Erwartet pro Zeile: Start | Ende | Titel | Kalender | Ganztägig. Ein .ics-Text geht auch.">${esc(d.text || '')}</textarea>
    <p class="muted small hint">${d.text ? `${n} Termine erkannt.` : ''} Bisher übernommene iPhone-Termine werden dabei ersetzt.</p>
    <button class="primary block big" data-a="doPaste"${n ? '' : ' disabled'}>${n ? `${n} Termine übernehmen` : 'Übernehmen'}</button>`);
}

function sheetChoose(day) {
  return sheetWrap(`${WDL[parse(day).getDay()]}, ${short(day)}`, `
    <div class="row gap">
      <button class="primary grow big" data-a="new" data-plan="${day}">+ Aufgabe</button>
      <button class="grow big" data-a="newEvent" data-v="${day}">+ Termin</button>
    </div>`);
}

const SYNC_LABEL = { off: 'Nicht angemeldet', connecting: 'Verbinde …', ok: 'Synchron', pending: 'Speichere …', offline: 'Offline – wird nachgeholt', error: 'Fehler' };
function sheetAccount(d) {
  if (!sync.configured) return sheetWrap('Sync & Claude', '<p class="small hint">Sync ist in dieser Version noch nicht eingerichtet. Die App läuft rein lokal.</p>');
  if (!sync.email) return sheetWrap('Sync & Claude', `
    <p class="small hint">Mit einem Konto sind deine Daten auf allen Geräten gleich (Handy, Laptop), und Claude kann Aufgaben und Termine für dich verwalten. Deine bisherigen Daten auf diesem Gerät werden übernommen.</p>
    <input type="email" data-f="d.email" placeholder="E-Mail" value="${esc(d.email || '')}" autocomplete="email" autocapitalize="off">
    <input type="password" data-f="d.password" placeholder="Passwort (mind. 8 Zeichen)" value="${esc(d.password || '')}" autocomplete="current-password" style="margin-top:8px">
    ${d.msg ? `<p class="small hint ${d.msgBad ? 'bad' : 'good'}">${esc(d.msg)}</p>` : ''}
    <button class="primary block big" data-a="signIn"${d.busy ? ' disabled' : ''}>Anmelden</button>
    <button class="block" data-a="signUp"${d.busy ? ' disabled' : ''}>Neues Konto erstellen</button>
    <p class="muted small hint">Beim Erstellen bekommst du eine Bestätigungs-Mail. Link anklicken, dann hier anmelden. Auf jedem weiteren Gerät meldest du dich einfach mit denselben Daten an.</p>`);
  return sheetWrap('Sync & Claude', `
    <div class="srclist">
      <div class="row gap"><span class="grow">Konto</span><b>${esc(sync.email)}</b></div>
      <div class="row gap"><span class="grow">Status</span><span class="sync-${sync.state}">● ${SYNC_LABEL[sync.state]}</span></div>
      <div class="row gap"><span class="grow muted">Zuletzt abgeglichen</span><span class="muted">${sync.lastSync ? `${pad(sync.lastSync.getHours())}:${pad(sync.lastSync.getMinutes())}` : '–'}</span></div>
    </div>
    ${sync.error ? `<p class="small bad hint">${esc(sync.error)}</p>` : ''}
    <button class="block" data-a="syncNow">↻ Jetzt abgleichen</button>

    <label class="lbl">Kalender-Abo (iPhone, Mac, Outlook)</label>
    <p class="small hint">Ein geheimer Link, den dein Kalender abonniert. Er zeigt Deadlines (⚑), Zeitblöcke (▶) und deine eigenen Termine und aktualisiert sich selbst. Kein Export nötig, keine Dubletten. Den Kalender-Namen „Planer“ bitte so lassen, dann werden diese Einträge beim Import nicht doppelt gezählt.</p>
    ${sync.feedUrl ? `
      <a class="btn primary block" href="${esc(sync.feedUrl.replace(/^https:/, 'webcal:'))}">📆 Im Kalender abonnieren</a>
      <button class="block" data-a="copyFeed">Link kopieren</button>
      <button class="ghost block small-btn" data-a="renewFeed">Neuen Link erzeugen (alter wird ungültig)</button>`
      : '<button class="primary block" data-a="makeFeed">Abo-Link erstellen</button>'}

    <label class="lbl">Claude als Assistent</label>
    <p class="small hint">Claude kann deine Aufgaben und Termine lesen und ändern, wenn in deiner Claude-Unterhaltung der <b>Supabase-Connector</b> verbunden ist. Sag zum Beispiel: „Trag mir im Planer ein: Bericht bis Freitag, 2 Stunden, Projekt Arbeit“ oder „Was ist diese Woche überfällig?“. Änderungen erscheinen nach wenigen Sekunden hier.</p>

    <button class="ghost block danger" data-a="signOut">Abmelden</button>
    <p class="muted small hint">Beim Abmelden bleiben die Daten auf diesem Gerät, werden aber nicht mehr abgeglichen.</p>`);
}

function sheetConfirm(s) {
  return `<div class="sheet-backdrop" data-a="close"></div>
  <div class="sheet confirm"><div class="sheet-head"><b>${esc(s.text)}</b></div>
    <div class="row gap"><button class="ghost grow" data-a="close">Abbrechen</button><button class="primary grow danger-bg" data-a="confirmYes">${esc(s.yes)}</button></div>
  </div>`;
}

// ---------- Render ----------
function render() {
  const a = document.activeElement;
  const fkey = a && a.dataset && a.dataset.f;
  let sel = null; try { sel = fkey ? [a.selectionStart, a.selectionEnd] : null; } catch {}
  const body = { today: viewToday, week: viewWeek, all: viewAll, waiting: viewWaiting, more: viewMore, review: viewReview }[ui.view]();
  const s = ui.sheet;
  const sheet = !s ? '' : {
    edit: () => sheetEdit(s.draft), plan: () => sheetPlan(task(s.id)), project: () => sheetProject(s.draft),
    template: () => sheetTemplate(s.draft), apply: () => sheetApply(s.draft), confirm: () => sheetConfirm(s),
    event: () => sheetEvent(s.draft), export: () => sheetExport(), account: () => sheetAccount(s.draft), paste: () => sheetPaste(s.draft), choose: () => sheetChoose(s.day),
  }[s.type]();
  const t0 = today();
  const badge = {
    today: active().filter(t => t.due && t.due < t0).length,
    waiting: waiting().filter(t => t.followUp && t.followUp <= t0).length,
  };
  const wasOpen = !!$app.querySelector('.sheet');
  const tab = ui.view === 'review' ? 'more' : ui.view;
  $app.innerHTML = `
    <header class="top"><div class="wrap row gap">
      ${ui.view === 'review' ? '<button class="icon-btn" data-a="go" data-v="more" aria-label="Zurück">‹</button>' : ''}
      <h1 class="grow">${ui.view === 'today' && ui.todayMode === 'timeline' && ui.day !== today() ? dayLabel(ui.day) : VIEWS[ui.view]}</h1>
      ${sync.configured ? `<button class="icon-btn small sync-dot sync-${sync.state}" data-a="account" title="Sync: ${SYNC_LABEL[sync.state]}" aria-label="Sync: ${SYNC_LABEL[sync.state]}">${sync.state === 'off' ? '☁︎' : '●'}</button>` : ''}
      ${ui.view === 'review' ? '' : '<button class="primary new-btn" data-a="new">+ Aufgabe</button>'}</div></header>
    <main class="wrap">${body}</main>
    <nav class="tabs">${Object.entries(TABS).map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-a="go" data-v="${k}">
      <span class="ti">${{ today: '☀︎', week: '▦', all: '☰', waiting: '⏳', more: '⋯' }[k]}</span>${l}${badge[k] ? `<i class="dot">${badge[k]}</i>` : ''}</button>`).join('')}</nav>
    ${sheet}`;
  document.body.classList.toggle('locked', !!s);
  if (wasOpen) $app.querySelector('.sheet')?.classList.add('still'); // nur beim Öffnen animieren
  const target = ui.focus ? $app.querySelector(`[data-f="${ui.focus}"]`) : fkey ? $app.querySelector(`[data-f="${fkey}"]`) : $app.querySelector('[autofocus]');
  ui.focus = null;
  if (target) {
    target.focus({ preventScroll: true });
    try { if (sel && sel[0] != null) target.setSelectionRange(sel[0], sel[1]); } catch {}
  }
}

// ---------- Konto ----------
async function accountCall(fn, okMsg) {
  const d = ui.sheet.draft;
  d.busy = true; d.msg = ''; render();
  try {
    const r = await fn(d);
    if (r !== false) { ui.sheet = { type: 'account', draft: {} }; toast(okMsg); }
  } catch (e) { d.msg = e.message || String(e); d.msgBad = true; }
  d.busy = false;
  render();
}

// ---------- Aktionen ----------
const newDraft = (preset = {}) => ({
  id: uid(), title: '', notes: '', project: ui.view === 'all' && ui.project && ui.project !== '-' ? ui.project : '',
  prio: 0, due: null, dueTime: '', plan: ui.view === 'today' ? today() : null, planTime: '', est: 0, spent: 0, repeat: '', subs: [],
  status: ui.view === 'waiting' ? 'waiting' : 'open', waitingFor: '', followUp: ui.view === 'waiting' ? addDays(today(), 3) : null,
  done: false, doneAt: null, createdAt: Date.now(), ...preset,
});

function nextOccurrence(t) {
  const base = t.due || t.plan || today();
  const step = s => {
    if (t.repeat === 'daily') return addDays(s, 1);
    if (t.repeat === 'weekdays') { let d = addDays(s, 1); while (isWeekend(d)) d = addDays(d, 1); return d; }
    if (t.repeat === 'weekly') return addDays(s, 7);
    return addMonths(s, 1);
  };
  let next = step(base);
  while (next < today()) next = step(next);
  const shift = diff(base, next);
  return {
    ...t, id: uid(), done: false, doneAt: null, createdAt: Date.now(), spent: 0, status: 'open', followUp: null,
    subs: t.subs.map(s => ({ ...s, id: uid(), done: false })),
    due: t.due ? addDays(t.due, shift) : null,
    plan: t.plan ? addDays(t.plan, shift) : null,
  };
}

function complete(t) {
  snap();
  if (timer && timer.id === t.id) stopTimer();
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  let msg = t.done ? `„${t.title}“ erledigt ✓` : 'Wieder offen';
  if (t.done && t.repeat) {
    const n = nextOccurrence(t);
    db.tasks.push(n);
    msg += ` · nächste: ${dayLabel(n.due || n.plan)}`;
  }
  save();
  toast(msg, true);
}

function quickAdd() {
  const r = quickParse(ui.quick);
  if (!r.title) return;
  const d = newDraft({ title: r.title, prio: r.prio, est: r.est, due: r.due, dueTime: r.dueTime, status: 'open', followUp: null });
  if (r.plan) d.plan = r.plan;
  if (r.projectName) d.project = projectByName(r.projectName);
  db.tasks.push(d);
  ui.quick = '';
  ui.focus = 'uv.quick';
  save();
  const bits = [d.due && `Deadline ${dayLabel(d.due)}`, d.plan && `geplant ${dayLabel(d.plan)}`, d.est && fmtMin(d.est)].filter(Boolean);
  toast(`Hinzugefügt${bits.length ? ' · ' + bits.join(' · ') : ''}`);
}

function saveDraft() {
  const d = ui.sheet.draft;
  d.title = d.title.trim();
  if (!d.title) { toast('Bitte einen Titel eingeben'); ui.focus = 'd.title'; return null; }
  if (ui.newSub?.trim()) { d.subs.push({ id: uid(), t: ui.newSub.trim(), done: false }); ui.newSub = ''; }
  d.due = d.due || null; d.plan = d.plan || null; d.followUp = d.followUp || null; d.est = +d.est || 0;
  if (!d.due) d.dueTime = '';
  if (d.status === 'waiting') { d.plan = null; d.waitingFor = d.waitingFor.trim(); } else d.followUp = null;
  if (!d.plan) d.planTime = '';
  d.subs = d.subs.filter(s => s.t.trim());
  const i = db.tasks.findIndex(t => t.id === d.id);
  if (i >= 0) db.tasks[i] = d; else db.tasks.push(d);
  save(); ui.sheet = null;
  return { d, isNew: i < 0 };
}

// Export-Einträge mit Signatur. Damit lässt sich erkennen, was seit dem letzten Export neu oder geändert ist.
function icsItems() {
  const e = x => String(x).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const dt = (date, time) => `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
  const ev = (id, summary, when, desc, extra = '') => ({
    key: id,
    text: `BEGIN:VEVENT\r\nUID:${id}@planer\r\nDTSTAMP:@@STAMP@@\r\n${when}\r\nSUMMARY:${e(summary)}\r\n${desc ? `DESCRIPTION:${e(desc)}\r\n` : ''}${extra}END:VEVENT`,
  });
  const allDay = (from, to) => `DTSTART;VALUE=DATE:${from.replace(/-/g, '')}\r\nDTEND;VALUE=DATE:${addDays(to, 1).replace(/-/g, '')}`;
  const out = [];
  open().filter(t => t.due && t.due >= addDays(today(), -1)).forEach(t => {
    const p = proj(t.project);
    const desc = [p && `Projekt: ${p.name}`, t.status === 'waiting' && `Warten auf: ${t.waitingFor}`, t.notes].filter(Boolean).join('\n');
    out.push(ev(`${t.id}-due`, `⚑ ${t.title}`, t.dueTime ? `DTSTART:${dt(t.due, t.dueTime)}\r\nDURATION:PT30M` : allDay(t.due, t.due), desc, 'TRANSP:TRANSPARENT\r\n'));
  });
  active().filter(t => t.plan && t.planTime && t.plan >= today()).forEach(t => {
    out.push(ev(`${t.id}-block`, `▶ ${t.title}`, `DTSTART:${dt(t.plan, t.planTime)}\r\nDURATION:PT${t.est || 30}M`, t.notes));
  });
  const RR = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY' };
  db.events.filter(x => !x.source).forEach(x => {
    const when = x.allDay ? allDay(x.date, x.endDate || x.date) : `DTSTART:${dt(x.date, x.start)}\r\nDTEND:${dt(x.endDate || x.date, x.end || fromMin(Math.min(1439, toMin(x.start) + 60)))}`;
    out.push(ev(x.id, x.title, when, x.notes, `${x.location ? `LOCATION:${e(x.location)}\r\n` : ''}${x.repeat ? `RRULE:${RR[x.repeat]}\r\n` : ''}`));
  });
  const done = db.settings.exported || {};
  out.forEach(it => { it.sig = it.text; it.state = !done[it.key] ? 'new' : done[it.key] !== it.sig ? 'changed' : 'same'; });
  return out;
}
function exportIcs(mode) {
  const items = icsItems().filter(it => mode === 'all' || it.state !== 'same');
  if (!items.length) { toast(mode === 'all' ? 'Nichts zum Exportieren' : 'Nichts Neues seit dem letzten Export 👍'); return; }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  download(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Planer//DE\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Planer\r\n${items.map(it => it.text.replace('@@STAMP@@', stamp)).join('\r\n')}\r\nEND:VCALENDAR\r\n`, `planer-${today()}.ics`, 'text/calendar');
  db.settings.exported = { ...(db.settings.exported || {}) };
  items.forEach(it => { db.settings.exported[it.key] = it.sig; });
  save();
  const changed = items.filter(it => it.state === 'changed').length;
  toast(`${items.length} Einträge exportiert${changed ? ` – ${changed} geänderte: alte Version im Kalender löschen` : ''}`);
}

function sheetExport() {
  const items = icsItems();
  const n = items.filter(i => i.state === 'new'), c = items.filter(i => i.state === 'changed');
  const title = it => esc(it.text.match(/SUMMARY:(.*)/)[1].replace(/\\([,;\\])/g, '$1'));
  return sheetWrap('Planer → Kalender', `
    <p class="small hint">Exportiert Deadlines (⚑), Zeitblöcke (▶) und eigene Termine als .ics-Datei. Auf dem iPhone die Datei öffnen und <b>„Alle hinzufügen“</b> wählen, am besten in einen eigenen Kalender „Planer“.</p>
    <div class="srclist">
      <div class="row gap"><span class="grow">Neu seit letztem Export</span><b>${n.length}</b></div>
      <div class="row gap"><span class="grow">Geändert</span><b class="${c.length ? 'warn' : ''}">${c.length}</b></div>
      <div class="row gap"><span class="grow muted">Schon im Kalender, unverändert</span><span class="muted">${items.length - n.length - c.length}</span></div>
    </div>
    ${c.length ? `<p class="small warn hint">Bei geänderten Einträgen legt der Apple-Kalender eine zweite Version an. Die alte Version dort bitte löschen: ${c.slice(0, 4).map(title).join(', ')}${c.length > 4 ? ' …' : ''}</p>` : ''}
    <button class="primary block big" data-a="doExport" data-v="new"${n.length + c.length ? '' : ' disabled'}>Nur Neues & Geändertes (${n.length + c.length})</button>
    <button class="block" data-a="doExport" data-v="all">Alles exportieren (${items.length})</button>
    <button class="ghost block small-btn" data-a="resetExport">Export-Verlauf zurücksetzen (nach Löschen des Kalenders „Planer“)</button>`);
}

const actions = {
  go: ({ v }) => { ui.view = v; history.replaceState(null, '', `#/${v}`); window.scrollTo(0, 0); },
  goWeek: ({ v }) => { ui.weekStart = v; actions.go({ v: 'week' }); },
  todayTimeline: () => { ui.todayMode = 'timeline'; ui.day = today(); },
  day: ({ v }) => { ui.day = +v ? addDays(ui.day, +v) : today(); },
  openDay: ({ v }) => { ui.todayMode = 'timeline'; ui.day = v; actions.go({ v: 'today' }); },
  choose: ({ v }) => { ui.sheet = { type: 'choose', day: v }; },
  newEvent: ({ v }) => {
    const [ws] = work(); const st = Math.max(ws, Math.ceil(nowMin() / 30) * 30);
    const date = v || today();
    const start = date === today() && st < 1380 ? fromMin(st) : fromMin(Math.max(ws, 9 * 60));
    ui.sheet = { type: 'event', draft: { id: uid(), title: '', date, endDate: null, start, end: fromMin(Math.min(1439, toMin(start) + 60)), allDay: false, blocks: false, repeat: '', location: '', notes: '', source: '', uid: '' } };
  },
  editEvent: ({ id }) => { ui.sheet = { type: 'event', draft: structuredClone(db.events.find(e => e.id === id)) }; },
  saveEvent: () => {
    const d = ui.sheet.draft;
    d.title = d.title.trim();
    if (!d.title) { toast('Bitte einen Titel eingeben'); ui.focus = 'd.title'; return; }
    if (!d.date) { toast('Bitte ein Datum wählen'); return; }
    if (d.allDay) { d.start = ''; d.end = ''; if (!d.endDate || d.endDate <= d.date) d.endDate = null; }
    else {
      if (!d.start) { toast('Bitte eine Startzeit eingeben'); return; }
      if (!d.end || toMin(d.end) <= toMin(d.start)) d.end = fromMin(Math.min(1439, toMin(d.start) + 60));
      d.endDate = null; d.blocks = false;
    }
    const i = db.events.findIndex(e => e.id === d.id);
    if (i >= 0) db.events[i] = d; else db.events.push(d);
    save(); ui.sheet = null; toast(i >= 0 ? 'Termin gespeichert' : 'Termin angelegt');
  },
  deleteEvent: () => {
    const id = ui.sheet.draft.id;
    ui.sheet = { type: 'confirm', text: 'Termin löschen?', yes: 'Löschen', run: () => {
      snap(); db.events = db.events.filter(e => e.id !== id); save(); toast('Termin gelöscht', true);
    } };
  },
  autoPlan: () => {
    snap();
    const { placed, left } = autoPlan(ui.day);
    save();
    toast(left.length ? `${placed} eingeplant, ${left.length} ${left.length === 1 ? 'passt' : 'passen'} heute nicht mehr rein` : `${placed} Aufgabe${placed === 1 ? '' : 'n'} in freie Zeit gelegt`, true);
  },
  clearTimes: ({ v }) => { snap(); db.tasks.forEach(t => { if (t.plan === v && !t.done) t.planTime = ''; }); save(); toast('Zeitblöcke entfernt', true); },
  account: () => { ui.sheet = { type: 'account', draft: { email: '', password: '' } }; },
  signIn: () => accountCall(d => signIn(d.email.trim(), d.password), 'Angemeldet – Daten werden abgeglichen'),
  signUp: () => accountCall(async d => {
    if ((d.password || '').length < 8) throw new Error('Passwort bitte mit mindestens 8 Zeichen');
    const needsConfirm = await signUp(d.email.trim(), d.password);
    if (needsConfirm) { d.msg = 'Fast geschafft: Bitte den Link in der Bestätigungs-Mail öffnen und dich danach hier anmelden.'; d.msgBad = false; return false; }
  }, 'Konto erstellt – Daten werden hochgeladen'),
  signOut: () => { signOut(); ui.sheet = null; toast('Abgemeldet – Daten bleiben auf diesem Gerät'); },
  syncNow: () => { syncNow().then(() => { toast('Abgeglichen'); render(); }).catch(e => toast(e.message)); },
  makeFeed: () => { createFeed().then(render).catch(e => toast(e.message)); },
  renewFeed: () => {
    ui.sheet = { type: 'confirm', text: 'Neuen Abo-Link erzeugen? Der alte funktioniert dann nicht mehr und muss im Kalender ersetzt werden.', yes: 'Erzeugen', run: () => {
      createFeed(true).then(() => { ui.sheet = { type: 'account', draft: {} }; render(); }).catch(e => toast(e.message));
    } };
  },
  copyFeed: () => { navigator.clipboard.writeText(sync.feedUrl).then(() => toast('Link kopiert')).catch(() => toast(sync.feedUrl)); },
  pasteSheet: () => { ui.sheet = { type: 'paste', draft: { text: '' } }; },
  pasteClip: async () => {
    try {
      const txt = await navigator.clipboard.readText();
      if (ui.sheet?.type === 'paste') { ui.sheet.draft.text = txt; render(); }
      if (!txt) toast('Zwischenablage ist leer');
    } catch { toast('Kein Zugriff auf die Zwischenablage – bitte ins Feld einfügen'); ui.focus = 'd.text'; render(); }
  },
  doPaste: () => {
    const txt = ui.sheet.draft.text || '';
    const list = txt.includes('BEGIN:VCALENDAR') ? icsToEvents(parseIcs(txt), 'iphone') : parseShortcut(txt);
    if (!list.length) { toast('Keine Termine erkannt'); return; }
    ui.sheet = null; importEvents(list, 'iphone');
  },
  importIcs: () => document.getElementById('icsFile').click(),
  dropSource: ({ v }) => {
    ui.sheet = { type: 'confirm', text: `Alle Termine aus „${srcLabel(v)}“ entfernen?`, yes: 'Entfernen', run: () => {
      snap(); db.events = db.events.filter(e => e.source !== v); save(); toast('Entfernt', true);
    } };
  },
  new: ({ plan }) => { ui.newSub = ''; ui.sheet = { type: 'edit', draft: newDraft(plan ? { plan } : {}) }; },
  edit: ({ id }) => { ui.newSub = ''; ui.sheet = { type: 'edit', draft: structuredClone(task(id)) }; },
  close: () => { ui.sheet = null; },
  toggle: ({ id }) => complete(task(id)),
  toggleDone: () => { ui.showDone = !ui.showDone; },
  undo: () => { if (!undoSnap) return; db = JSON.parse(undoSnap); undoSnap = null; save(); $toast.hidden = true; },
  set: ({ k, v }) => { ui[k] = v; },
  setS: ({ k, v }) => { db.settings[k] = k === 'skipWeekend' ? v === '1' : +v; save(); },
  setD: ({ k, v, num }) => {
    const d = ui.sheet.draft;
    d[k] = ['allDay', 'blocks'].includes(k) ? v === '1' : num ? +v : (v === '' && ['due', 'plan', 'followUp'].includes(k) ? null : v);
    if (k === 'plan') d.planTime = '';
    if (k === 'due' && !v) d.dueTime = '';
    if (k === 'status' && v === 'waiting' && !d.followUp) d.followUp = addDays(today(), 3);
    if (k === 'tpl') { const tp = db.templates.find(x => x.id === v); if (tp) { d.project = tp.project; if (!d.titleTouched) d.title = tp.name; } }
  },
  week: ({ v }) => { ui.weekStart = +v ? addDays(ui.weekStart, +v) : mondayOf(today()); },
  quickAdd,
  saveTask: () => { const r = saveDraft(); if (r) toast(r.isNew ? 'Aufgabe angelegt' : 'Gespeichert'); },
  saveFocus: () => { const r = saveDraft(); if (r) { startTimer(r.d.id); toast(`Fokus: ${db.settings.focus} min – leg los!`); } },
  focus: ({ id }) => { startTimer(id); toast(`Fokus: ${db.settings.focus} min – leg los!`); },
  timerStop: () => { const { t, mins } = stopTimer(); toast(mins > 0 ? `+${mins} min auf „${t?.title}“ erfasst` : 'Timer gestoppt'); },
  duplicate: () => {
    const d = ui.sheet.draft;
    ui.sheet.draft = { ...structuredClone(d), id: uid(), title: `${d.title} (Kopie)`, spent: 0, done: false, doneAt: null, createdAt: Date.now() };
    toast('Kopie – noch nicht gespeichert');
  },
  deleteTask: () => {
    const id = ui.sheet.draft.id;
    ui.sheet = { type: 'confirm', text: 'Aufgabe wirklich löschen?', yes: 'Löschen', run: () => {
      if (timer && timer.id === id) { timer = null; saveTimer(); tickTimer(); }
      snap(); db.tasks = db.tasks.filter(t => t.id !== id); save(); toast('Gelöscht', true);
    } };
  },
  confirmYes: () => { const run = ui.sheet.run; ui.sheet = null; run(); },
  subToggle: ({ id }) => { const s = ui.sheet.draft.subs.find(x => x.id === id); s.done = !s.done; },
  subDel: ({ id }) => { ui.sheet.draft.subs = ui.sheet.draft.subs.filter(x => x.id !== id); },
  subAdd: () => {
    const t = (ui.newSub || '').trim();
    if (t) ui.sheet.draft.subs.push({ id: uid(), t, done: false });
    ui.newSub = ''; ui.focus = 'uv.newSub';
  },
  unwait: ({ id }) => {
    snap(); const t = task(id); t.status = 'open'; t.followUp = null;
    if (!t.plan) t.plan = today();
    save(); toast(`„${t.title}“ ist wieder bei dir und für ${dayLabel(t.plan)} eingeplant`, true);
  },
  planSheet: ({ id }) => { ui.planPick = task(id).plan || ''; ui.sheet = { type: 'plan', id }; },
  planTo: ({ id, v, pick }) => {
    const val = pick ? ui.planPick : v;
    if (pick && !val) { toast('Bitte ein Datum wählen'); return; }
    const t = task(id); if (t.plan !== (val || null)) t.planTime = '';
    t.plan = val || null; save(); ui.sheet = null;
    toast(val ? `Eingeplant: ${dayLabel(val)}` : 'Planung entfernt');
  },
  reviewDone: () => { db.settings.lastReview = today(); save(); toast('Rückblick erledigt 🎉'); actions.go({ v: 'today' }); },
  openProject: ({ id }) => { ui.project = id; ui.filter = 'open'; ui.mode = 'list'; actions.go({ v: 'all' }); },
  newProject: () => { ui.sheet = { type: 'project', draft: { id: uid(), name: '', color: COLORS[db.projects.length % COLORS.length] } }; },
  editProject: ({ id }) => { ui.sheet = { type: 'project', draft: { ...proj(id) } }; },
  saveProject: () => {
    const d = ui.sheet.draft; d.name = d.name.trim();
    if (!d.name) { toast('Bitte einen Namen eingeben'); return; }
    const i = db.projects.findIndex(p => p.id === d.id);
    if (i >= 0) db.projects[i] = d; else db.projects.push(d);
    save(); ui.sheet = null;
  },
  deleteProject: () => {
    const id = ui.sheet.draft.id;
    const n = db.tasks.filter(t => t.project === id).length;
    ui.sheet = { type: 'confirm', text: `Projekt löschen?${n ? ` ${n} Aufgabe(n) bleiben erhalten (ohne Projekt).` : ''}`, yes: 'Löschen', run: () => {
      snap(); db.projects = db.projects.filter(p => p.id !== id);
      db.tasks.forEach(t => { if (t.project === id) t.project = ''; });
      db.templates.forEach(t => { if (t.project === id) t.project = ''; });
      if (ui.project === id) ui.project = '';
      save(); toast('Projekt gelöscht', true);
    } };
  },
  newTpl: () => { ui.sheet = { type: 'template', draft: { id: uid(), name: '', project: '', text: '' } }; },
  editTpl: ({ id }) => { ui.sheet = { type: 'template', draft: { ...db.templates.find(x => x.id === id) } }; },
  saveTpl: () => {
    const d = ui.sheet.draft; d.name = d.name.trim();
    if (!d.name) { toast('Bitte einen Namen eingeben'); return; }
    if (!parseSteps(d.text).length) { toast('Mindestens einen Schritt eintragen'); return; }
    const i = db.templates.findIndex(x => x.id === d.id);
    if (i >= 0) db.templates[i] = d; else db.templates.push(d);
    save(); ui.sheet = null; toast('Vorlage gespeichert');
  },
  deleteTpl: () => {
    const id = ui.sheet.draft.id;
    ui.sheet = { type: 'confirm', text: 'Vorlage löschen?', yes: 'Löschen', run: () => {
      snap(); db.templates = db.templates.filter(x => x.id !== id); save(); toast('Vorlage gelöscht', true);
    } };
  },
  applyTpl: ({ id }) => {
    const tp = db.templates.find(x => x.id === id);
    ui.sheet = { type: 'apply', draft: { tpl: id, title: tp.name, deadline: '', project: tp.project } };
  },
  doApply: () => {
    const d = ui.sheet.draft;
    const tp = db.templates.find(x => x.id === d.tpl);
    if (!tp || !d.deadline) return;
    snap();
    const title = d.title.trim() || tp.name;
    const steps = parseSteps(tp.text);
    steps.forEach((s, i) => {
      const day = stepDate(d.deadline, s.off);
      db.tasks.push(newDraft({
        title: `${title}: ${s.t}`, project: d.project, est: s.est, due: day, plan: day,
        prio: i === steps.length - 1 ? 1 : 0, status: 'open', followUp: null, createdAt: Date.now() + i,
      }));
    });
    save(); ui.sheet = null;
    toast(`${steps.length} Aufgaben angelegt – siehe Woche`, true);
  },
  clearDone: () => {
    const n = db.tasks.filter(t => t.done).length;
    ui.sheet = { type: 'confirm', text: `${n} erledigte Aufgabe(n) endgültig löschen?`, yes: 'Löschen', run: () => {
      snap(); db.tasks = db.tasks.filter(t => !t.done); save(); toast('Aufgeräumt', true);
    } };
  },
  export: () => download(JSON.stringify(db, null, 2), `planer-backup-${today()}.json`, 'application/json'),
  exportIcs: () => { ui.sheet = { type: 'export' }; },
  doExport: ({ v }) => { ui.sheet = null; exportIcs(v); },
  resetExport: () => { db.settings.exported = {}; save(); toast('Verlauf zurückgesetzt – beim nächsten Export kommt alles neu'); },
  import: () => document.getElementById('importFile').click(),
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  fn({ ...el.dataset });
  render();
});

const RERENDER_D = ['due', 'plan', 'followUp', 'deadline'];
function onField(e) {
  const el = e.target, f = el.dataset?.f;
  if (!f) return;
  const type = el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : (el.getAttribute('type') || 'text');
  const isText = ['text', 'search', 'textarea'].includes(type);
  if (e.type === 'change' && isText) return; // Textfelder werden schon per input übernommen
  const quiet = e.type === 'input' && ['date', 'time'].includes(type); // Datum erst beim „change“ neu zeichnen
  const dot = f.indexOf('.');
  const scope = f.slice(0, dot), name = f.slice(dot + 1);
  const v = el.value;
  if (scope === 'ui') { ui[name] = v; if (!quiet) render(); }
  else if (scope === 'uv') ui[name] = v;
  else if (scope === 's') { if (v) { db.settings[name] = v; save(); } if (!quiet) render(); }
  else if (scope === 'd') {
    ui.sheet.draft[name] = v;
    if (ui.sheet.type === 'apply' && name === 'title') ui.sheet.draft.titleTouched = true;
    if (name === 'plan' && ui.sheet.type === 'edit') { ui.sheet.draft.planTime = ''; }
    if ((RERENDER_D.includes(name) && !quiet) || (ui.sheet.type === 'paste' && name === 'text' && e.type === 'input' && v.length - (ui.lastPasteLen || 0) > 20)) render();
    if (ui.sheet?.type === 'paste') ui.lastPasteLen = v.length;
  } else if (scope === 'sub') { const s = ui.sheet.draft.subs.find(x => x.id === name); if (s) s.t = v; }
}
$app.addEventListener('input', onField);
$app.addEventListener('change', onField);

$app.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const el = e.target;
  if (el.dataset.enter) { e.preventDefault(); onField({ type: 'input', target: el }); actions[el.dataset.enter](); render(); }
  else if (el.dataset.f === 'd.title' && ui.sheet?.type === 'edit') { e.preventDefault(); actions.saveTask(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); return; }
  const tag = document.activeElement?.tagName;
  if (!ui.sheet && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
    e.preventDefault(); actions.new({}); render();
  }
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  file.text().then(txt => {
    let data; try { data = normalize(JSON.parse(txt)); } catch { data = null; }
    if (!data) { toast('Keine gültige Backup-Datei'); return; }
    ui.sheet = { type: 'confirm', text: `Backup mit ${data.tasks.length} Aufgaben laden? Die aktuellen Daten werden ersetzt.`, yes: 'Laden', run: () => {
      snap(); db = data; save(); toast('Backup geladen', true);
    } };
    render();
  });
});

document.getElementById('icsFile').addEventListener('change', e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  file.text().then(txt => {
    const list = icsToEvents(parseIcs(txt), 'ics:' + file.name.replace(/\.ics$/i, ''));
    if (!list.length) { toast('Keine Termine in der Datei gefunden'); return; }
    importEvents(list, 'ics:' + file.name.replace(/\.ics$/i, ''));
    render();
  });
});

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(2);
  if (VIEWS[v] && v !== ui.view) { ui.view = v; render(); }
});
// Datum wechselt um Mitternacht oder nach langer Pause: beim Zurückkehren neu zeichnen.
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickTimer(); if (!ui.sheet) render(); } });

render();
tickTimer();

initSync({
  getDb: () => db,
  replaceDb: next => { db = normalize(next) || db; save(); if (!ui.sheet || ['account', 'export'].includes(ui.sheet.type)) render(); else renderSoon(); },
  onStatus: () => { if (!ui.sheet || ui.sheet.type === 'account') render(); else updateSyncDot(); },
});
// Während ein Fenster offen ist, die Seite dahinter nicht neu zeichnen (Eingaben bleiben erhalten).
let renderSoonTimer;
function renderSoon() { clearTimeout(renderSoonTimer); renderSoonTimer = setTimeout(() => { if (!ui.sheet) render(); else renderSoon(); }, 1500); }
function updateSyncDot() {
  const el = $app.querySelector('.sync-dot');
  if (el) { el.className = `icon-btn small sync-dot sync-${sync.state}`; el.textContent = sync.state === 'off' ? '☁︎' : '●'; }
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
