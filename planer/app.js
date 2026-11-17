// Planer: Aufgaben, Deadlines, Wochenplanung mit Kapazität, „Warten auf“, Fokus-Timer,
// Vorlagen mit Rückwärtsplanung, Eisenhower-Matrix, Wochenrückblick und Kalender-Export.
// Alles bleibt lokal im Browser (localStorage).
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
const DEFAULT_SETTINGS = { capacity: 360, focus: 25, skipWeekend: true, lastReview: null };

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
    tasks: [], templates: structuredClone(DEFAULT_TEMPLATES),
    settings: { ...DEFAULT_SETTINGS, lastReview: today() },
  };
}
function normalize(v) {
  if (!v || !Array.isArray(v.tasks)) return null;
  return {
    projects: Array.isArray(v.projects) ? v.projects : [],
    templates: Array.isArray(v.templates) ? v.templates : structuredClone(DEFAULT_TEMPLATES),
    settings: { ...DEFAULT_SETTINGS, lastReview: today(), ...(v.settings || {}) },
    tasks: v.tasks.map(t => ({
      id: t.id || uid(), title: String(t.title || ''), notes: t.notes || '', project: t.project || '',
      prio: +t.prio || 0, due: t.due || null, dueTime: t.dueTime || '', plan: t.plan || null,
      est: +t.est || 0, spent: +t.spent || 0, repeat: t.repeat || '', subs: Array.isArray(t.subs) ? t.subs : [],
      status: t.status === 'waiting' ? 'waiting' : 'open', waitingFor: t.waitingFor || '', followUp: t.followUp || null,
      done: !!t.done, doneAt: t.doneAt || null, createdAt: t.createdAt || Date.now(),
    })),
  };
}
let db = (() => { try { return normalize(JSON.parse(localStorage.getItem(KEY))) || blank(); } catch { return blank(); } })();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { toast('Speichern fehlgeschlagen – Speicher voll?'); }
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

// ---------- Zustand ----------
const TABS = { today: 'Heute', week: 'Woche', all: 'Alle', waiting: 'Warten', more: 'Mehr' };
const VIEWS = { ...TABS, review: 'Wochenrückblick' };
const ui = {
  view: VIEWS[location.hash.slice(2)] ? location.hash.slice(2) : 'today',
  weekStart: mondayOf(today()),
  filter: 'open', project: '', sort: 'due', mode: 'list', q: '', quick: '',
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
    meta.push(`<span class="badge b-plan">📅 ${t.plan < today() ? 'seit ' : ''}${dayLabel(t.plan)}</span>`);
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

const capBar = mins => {
  const c = cap(), pct = Math.min(100, Math.round(mins / c * 100));
  return `<span class="cap${mins > c ? ' over' : ''}"><small>${fmtMin(mins)} / ${fmtMin(c)}</small><span class="bar"><i style="width:${pct}%"></i></span></span>`;
};

// ---------- Ansichten ----------
function viewToday() {
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
  return `
    ${reviewDue ? '<button class="banner" data-a="go" data-v="review">🗓 <span class="grow"><b>Wochenrückblick fällig</b><br><small>15 Minuten: aufräumen, neu planen, nächste Woche vorbereiten</small></span> ›</button>' : ''}
    <div class="hero">
      <div class="muted small">${WDL[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()} · KW ${isoWeek(t0)}</div>
      <div class="stats">
        <div><b>${planned.length}</b><span>offen heute</span></div>
        <div><b class="${overdue.length ? 'bad' : ''}">${overdue.length}</b><span>überfällig</span></div>
        <div><b class="good">${doneToday.length}</b><span>erledigt</span></div>
        <div><b class="${est > cap() ? 'warn' : ''}">${est ? fmtMin(est) : '–'}</b><span>Aufwand</span></div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      ${est > cap() ? `<p class="small warn hint">Mehr geplant als deine Tageskapazität (${fmtMin(cap())}). Schieb etwas mit 📅 auf einen anderen Tag.</p>` : ''}
    </div>
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
    ${section('Noch nicht eingeplant', pool, { extra: `${pool.length}${sumEst(pool) ? ` · ${fmtMin(sumEst(pool))}` : ''}`, hint: 'Mit 📅 einem Tag zuordnen. Die Tage zeigen, wie voll sie schon sind.' })}
    ${days.map(day => {
      const planned = db.tasks.filter(t => t.plan === day && t.status !== 'waiting').sort((a, b) => a.done - b.done || byPrio(a, b));
      const deadlines = open().filter(t => t.due === day && t.plan !== day).sort(byDue);
      const est = sumEst(planned.filter(t => !t.done));
      const d = parse(day);
      const isToday = day === t0;
      return `<section class="sec day${isToday ? ' is-today' : ''}${day < t0 ? ' past' : ''}">
        <div class="sec-h">
          <h3>${WDL[d.getDay()]} <span class="muted">${short(day)}</span>${isToday ? ' <span class="badge b-today">Heute</span>' : ''}</h3>
          ${est ? capBar(est) : ''}
          <button class="icon-btn small" data-a="new" data-plan="${day}" aria-label="Aufgabe für diesen Tag">+</button>
        </div>
        ${deadlines.map(t => `<button class="deadline plain" data-a="edit" data-id="${t.id}">⚑ Deadline: <b>${esc(t.title)}</b>${t.dueTime ? ` · ${t.dueTime}` : ''}${t.status === 'waiting' ? ` <span class="muted">(⏳ ${esc(t.waitingFor)})</span>` : t.plan ? ` <span class="muted">(geplant ${dayLabel(t.plan)})</span>` : ' <span class="bad">(nicht eingeplant)</span>'}</button>`).join('')}
        ${planned.map(t => row(t, { hidePlan: true })).join('')}
        ${!planned.length && !deadlines.length ? '<div class="empty small">frei</div>' : ''}
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
  const setChip = (k, v, label) => `<button class="chip${+s[k] === v ? ' on' : ''}" data-a="setS" data-k="${k}" data-v="${v}">${label}</button>`;
  return `
    <button class="banner" data-a="go" data-v="review">🗓 <span class="grow"><b>Wochenrückblick</b><br><small>${s.lastReview ? `Zuletzt: ${dayLabel(s.lastReview)}` : 'Noch nie gemacht'}</small></span> ›</button>

    <section class="sec"><div class="sec-h"><h3>Vorlagen mit Rückwärtsplanung</h3></div>
      <p class="muted small hint">Für wiederkehrende Ergebnisse wie Bericht, Newsletter oder Präsentation: Deadline eingeben, und die Schritte werden rückwärts auf die Tage davor verteilt.</p>
      ${db.templates.map(tp => { const st = parseSteps(tp.text); const m = st.reduce((x, y) => x + y.est, 0); return `<div class="tcard row gap">
        <button class="plain grow col" data-a="applyTpl" data-id="${tp.id}"><b>${esc(tp.name)}</b><small class="muted">${st.length} Schritte${m ? ` · ${fmtMin(m)}` : ''}</small></button>
        <button class="primary small-btn" data-a="applyTpl" data-id="${tp.id}">Anwenden</button>
        <button class="icon-btn small" data-a="editTpl" data-id="${tp.id}" aria-label="Vorlage bearbeiten">✎</button>
      </div>`; }).join('')}
      <button class="ghost block" data-a="newTpl">+ Neue Vorlage</button>
    </section>

    <section class="sec"><div class="sec-h"><h3>Projekte</h3></div>
      ${db.projects.map(p => card(p, stats(p.id))).join('')}
      ${none.all.length ? card(null, none) : ''}
      <button class="ghost block" data-a="newProject">+ Neues Projekt</button>
    </section>

    <section class="sec"><div class="sec-h"><h3>Einstellungen</h3></div>
      <label class="lbl">Tageskapazität – wie viel Aufgabenzeit du neben Meetings realistisch hast</label>
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
      <button class="block" data-a="exportIcs">📆 Deadlines als Kalender-Datei (.ics)</button>
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
      return `<div class="row gap"><span class="lday">${WD[parse(d).getDay()]} ${short(d)}</span>${capBar(m)}${dl ? `<span class="badge b-soon">⚑ ${dl}</span>` : ''}</div>`;
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
    <input type="date" data-f="d.plan" value="${d.plan || ''}">
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
      const full = load + (t.est || 0) > cap();
      return `<button class="chip${t.plan === day ? ' on' : ''}${t.due && day > t.due ? ' late' : ''}${full ? ' full' : ''}" data-a="planTo" data-id="${t.id}" data-v="${day}">
        ${day === nextMon && diff(t0, day) > 6 ? 'Nächste Woche' : dayLabel(day)}${load ? ` <small>· ${fmtMin(load)}</small>` : ''}</button>`;
    }).join('')}</div>
    <p class="muted small hint">Rot umrandet: nach der Deadline. Gestrichelt: Der Tag wäre über deiner Kapazität.</p>
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
      <h1 class="grow">${VIEWS[ui.view]}</h1>
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

// ---------- Aktionen ----------
const newDraft = (preset = {}) => ({
  id: uid(), title: '', notes: '', project: ui.view === 'all' && ui.project && ui.project !== '-' ? ui.project : '',
  prio: 0, due: null, dueTime: '', plan: ui.view === 'today' ? today() : null, est: 0, spent: 0, repeat: '', subs: [],
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
  d.subs = d.subs.filter(s => s.t.trim());
  const i = db.tasks.findIndex(t => t.id === d.id);
  if (i >= 0) db.tasks[i] = d; else db.tasks.push(d);
  save(); ui.sheet = null;
  return { d, isNew: i < 0 };
}

function exportIcs() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const e = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const list = open().filter(t => t.due);
  if (!list.length) { toast('Keine offenen Deadlines zum Exportieren'); return; }
  const events = list.map(t => {
    const d = t.due.replace(/-/g, '');
    const when = t.dueTime
      ? `DTSTART:${d}T${t.dueTime.replace(':', '')}00\r\nDURATION:PT30M`
      : `DTSTART;VALUE=DATE:${d}\r\nDTEND;VALUE=DATE:${addDays(t.due, 1).replace(/-/g, '')}`;
    const p = proj(t.project);
    const desc = [p && `Projekt: ${p.name}`, t.status === 'waiting' && `Warten auf: ${t.waitingFor}`, t.notes].filter(Boolean).join('\n');
    return `BEGIN:VEVENT\r\nUID:${t.id}@planer\r\nDTSTAMP:${stamp}\r\n${when}\r\nSUMMARY:${e('⚑ ' + t.title)}\r\n${desc ? `DESCRIPTION:${e(desc)}\r\n` : ''}TRANSP:TRANSPARENT\r\nEND:VEVENT`;
  });
  download(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Planer//DE\r\nCALSCALE:GREGORIAN\r\n${events.join('\r\n')}\r\nEND:VCALENDAR\r\n`, `planer-deadlines-${today()}.ics`, 'text/calendar');
  toast(`${list.length} Deadlines exportiert – Datei im Kalender öffnen`);
}

const actions = {
  go: ({ v }) => { ui.view = v; history.replaceState(null, '', `#/${v}`); window.scrollTo(0, 0); },
  goWeek: ({ v }) => { ui.weekStart = v; actions.go({ v: 'week' }); },
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
    d[k] = num ? +v : (v === '' && ['due', 'plan', 'followUp'].includes(k) ? null : v);
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
    task(id).plan = val || null; save(); ui.sheet = null;
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
  exportIcs,
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
  else if (scope === 'd') {
    ui.sheet.draft[name] = v;
    if (ui.sheet.type === 'apply' && name === 'title') ui.sheet.draft.titleTouched = true;
    if (RERENDER_D.includes(name) && !quiet) render();
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

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(2);
  if (VIEWS[v] && v !== ui.view) { ui.view = v; render(); }
});
// Datum wechselt um Mitternacht oder nach langer Pause: beim Zurückkehren neu zeichnen.
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickTimer(); if (!ui.sheet) render(); } });

render();
tickTimer();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
