// Planer: Aufgaben, Deadlines und Wochenplanung. Alles bleibt lokal im Browser (localStorage).
const KEY = 'planer.v1';
const COLORS = ['#f5b83d', '#4cc38a', '#3ea6ff', '#c77dff', '#ef6b6b', '#f0a04b', '#2dd4bf', '#94a3b8'];
const PRIOS = [
  { v: 0, label: 'Normal' },
  { v: 1, label: 'Wichtig' },
  { v: 2, label: 'Dringend' },
];
const ESTS = [0, 15, 30, 60, 120, 180, 300, 480];
const REPEATS = { '': 'Keine', daily: 'Täglich', weekly: 'Wöchentlich', monthly: 'Monatlich' };

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

// ---------- Daten ----------
function blank() {
  return {
    projects: [
      { id: 'p-privat', name: 'Privat', color: '#4cc38a' },
      { id: 'p-arbeit', name: 'Arbeit', color: '#3ea6ff' },
    ],
    tasks: [],
  };
}
function normalize(v) {
  if (!v || !Array.isArray(v.tasks)) return null;
  return {
    projects: Array.isArray(v.projects) ? v.projects : [],
    tasks: v.tasks.map(t => ({
      id: t.id || uid(), title: String(t.title || ''), notes: t.notes || '', project: t.project || '',
      prio: +t.prio || 0, due: t.due || null, dueTime: t.dueTime || '', plan: t.plan || null,
      est: +t.est || 0, repeat: t.repeat || '', subs: Array.isArray(t.subs) ? t.subs : [],
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
const byDue = (a, b) =>
  (a.due || '9999') .localeCompare(b.due || '9999') ||
  (a.dueTime || '99').localeCompare(b.dueTime || '99') ||
  b.prio - a.prio || a.createdAt - b.createdAt;
const byPrio = (a, b) => b.prio - a.prio || byDue(a, b);

// ---------- Zustand ----------
const VIEWS = { today: 'Heute', week: 'Woche', all: 'Alle', projects: 'Projekte' };
const ui = {
  view: VIEWS[location.hash.slice(2)] ? location.hash.slice(2) : 'today',
  weekStart: mondayOf(today()),
  filter: 'open', project: '', sort: 'due', q: '', quick: '',
  showDone: false,
  sheet: null, // { type: 'edit'|'plan'|'project'|'confirm', ... }
  focus: null,
};

const $app = document.getElementById('app');
const $toast = document.getElementById('toast');
let toastTimer;
function toast(text, undo = false) {
  $toast.innerHTML = `<span>${esc(text)}</span>${undo ? '<button data-a="undo">Rückgängig</button>' : ''}`;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, undo ? 5000 : 2500);
}

// ---------- Bausteine ----------
function dueBadge(t) {
  if (!t.due) return '';
  const n = diff(today(), t.due);
  const time = t.dueTime ? ` ${t.dueTime}` : '';
  let cls = 'b-later', txt;
  if (t.done) { cls = 'b-muted'; txt = `${short(t.due)}`; }
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
  meta.push(dueBadge(t));
  if (t.plan && !o.hidePlan && !t.done) {
    const late = t.plan < today();
    meta.push(`<span class="badge b-plan">📅 ${late ? 'seit ' : ''}${dayLabel(t.plan)}</span>`);
  }
  if (!t.done && t.plan && t.due && t.plan > t.due) meta.push('<span class="badge b-over">nach Deadline!</span>');
  if (t.subs.length) meta.push(`<span>☑ ${subsDone}/${t.subs.length}</span>`);
  if (t.est) meta.push(`<span>⏱ ${fmtMin(t.est)}</span>`);
  if (t.repeat) meta.push(`<span title="${REPEATS[t.repeat]}">↻</span>`);
  if (t.notes) meta.push('<span>📝</span>');
  return `<div class="task prio${t.prio}${t.done ? ' done' : ''}">
    <button class="check" data-a="toggle" data-id="${t.id}" aria-label="Erledigt">${t.done ? '✓' : ''}</button>
    <button class="tmain plain" data-a="edit" data-id="${t.id}">
      <span class="ttitle">${esc(t.title)}</span>
      <span class="tmeta">${meta.filter(Boolean).join('')}</span>
    </button>
    ${t.done ? '' : `<button class="icon-btn small" data-a="planSheet" data-id="${t.id}" aria-label="Einplanen">📅</button>`}
  </div>`;
}

const section = (title, list, o = {}) => !list.length && !o.always ? '' : `
  <section class="sec">
    <div class="sec-h"><h3>${title}</h3><span class="muted small">${o.extra ?? list.length}</span></div>
    ${list.length ? list.map(t => row(t, o)).join('') : `<div class="empty small">${o.empty || 'Nichts.'}</div>`}
  </section>`;

const quickInput = placeholder => `
  <div class="quick row gap">
    <input class="grow" data-f="uv.quick" data-enter="quickAdd" placeholder="${placeholder}" value="${esc(ui.quick)}" enterkeyhint="done">
    <button class="primary" data-a="quickAdd" aria-label="Hinzufügen">+</button>
  </div>`;

// ---------- Ansichten ----------
function viewToday() {
  const t0 = today();
  const o = open();
  const overdue = o.filter(t => t.due && t.due < t0).sort(byDue);
  const todays = o.filter(t => !overdue.includes(t) && (t.due === t0 || (t.plan && t.plan <= t0))).sort(byPrio);
  const soon = o.filter(t => !t.plan && t.due && t.due > t0 && diff(t0, t.due) <= 7).sort(byDue);
  const doneToday = db.tasks.filter(t => t.done && t.doneAt && iso(new Date(t.doneAt)) === t0);
  const planned = [...overdue, ...todays];
  const total = sumEst(planned) + sumEst(doneToday);
  const pct = planned.length + doneToday.length ? Math.round(doneToday.length / (planned.length + doneToday.length) * 100) : 0;
  const d = new Date();
  return `
    <div class="hero">
      <div class="muted small">${WDL[d.getDay()]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}</div>
      <div class="stats">
        <div><b>${planned.length}</b><span>offen heute</span></div>
        <div><b class="${overdue.length ? 'bad' : ''}">${overdue.length}</b><span>überfällig</span></div>
        <div><b class="good">${doneToday.length}</b><span>erledigt</span></div>
        <div><b>${total ? fmtMin(total) : '–'}</b><span>geplant</span></div>
      </div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>
    ${quickInput('Für heute: z. B. „Mail an Chef #Arbeit !“')}
    ${section('Überfällig', overdue, { cls: 'over' })}
    ${section('Heute', todays, { always: true, empty: overdue.length ? 'Erst das Überfällige 💪' : 'Nichts geplant. Hol dir was aus „Bald fällig“ oder plane in der Woche.' })}
    ${section('Bald fällig – noch nicht eingeplant', soon)}
    ${doneToday.length ? `<section class="sec">
      <button class="sec-h plain toggle" data-a="toggleDone"><h3>Heute erledigt</h3><span class="muted small">${doneToday.length} ${ui.showDone ? '▴' : '▾'}</span></button>
      ${ui.showDone ? doneToday.map(t => row(t)).join('') : ''}
    </section>` : ''}`;
}

function viewWeek() {
  const t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(ui.weekStart, i));
  const end = days[6];
  const kw = isoWeek(ui.weekStart);
  const pool = open().filter(t => !t.plan).sort(byDue);
  return `
    <div class="weeknav row gap">
      <button class="icon-btn" data-a="week" data-v="-7" aria-label="Vorige Woche">‹</button>
      <div class="grow center"><b>KW ${kw}</b><div class="muted small">${short(ui.weekStart)} – ${short(end)}</div></div>
      <button class="icon-btn" data-a="week" data-v="7" aria-label="Nächste Woche">›</button>
    </div>
    ${ui.weekStart !== mondayOf(t0) ? `<button class="ghost block" data-a="week" data-v="0">Zur aktuellen Woche</button>` : ''}
    ${pool.length ? section('Noch nicht eingeplant', pool, { extra: `${pool.length}${sumEst(pool) ? ` · ${fmtMin(sumEst(pool))}` : ''}` }) : ''}
    ${days.map(day => {
      const planned = db.tasks.filter(t => t.plan === day).sort((a, b) => a.done - b.done || byPrio(a, b));
      const deadlines = open().filter(t => t.due === day && t.plan !== day).sort(byDue);
      const est = sumEst(planned.filter(t => !t.done));
      const d = parse(day);
      const isToday = day === t0, past = day < t0;
      return `<section class="sec day${isToday ? ' is-today' : ''}${past ? ' past' : ''}">
        <div class="sec-h">
          <h3>${WDL[d.getDay()]} <span class="muted">${short(day)}</span>${isToday ? ' <span class="badge b-today">Heute</span>' : ''}</h3>
          <span class="muted small">${planned.length ? `${planned.filter(t => !t.done).length} offen` : ''}${est ? ` · ${fmtMin(est)}` : ''}</span>
          <button class="icon-btn small" data-a="new" data-plan="${day}" aria-label="Aufgabe für diesen Tag">+</button>
        </div>
        ${deadlines.map(t => `<button class="deadline plain" data-a="edit" data-id="${t.id}">⚑ Deadline: <b>${esc(t.title)}</b>${t.dueTime ? ` · ${t.dueTime}` : ''}${t.plan ? ` <span class="muted">(geplant ${dayLabel(t.plan)})</span>` : ' <span class="bad">(nicht eingeplant)</span>'}</button>`).join('')}
        ${planned.map(t => row(t, { hidePlan: true })).join('')}
        ${!planned.length && !deadlines.length ? '<div class="empty small">frei</div>' : ''}
      </section>`;
    }).join('')}`;
}

function isoWeek(s) {
  const d = parse(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function viewAll() {
  const t0 = today();
  const q = ui.q.trim().toLowerCase();
  let list = db.tasks.filter(t =>
    (ui.filter === 'all' || (ui.filter === 'done') === t.done) &&
    (!ui.project || t.project === ui.project || (ui.project === '-' && !proj(t.project))) &&
    (!q || t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)));
  list.sort(ui.sort === 'prio' ? byPrio : ui.sort === 'new' ? (a, b) => b.createdAt - a.createdAt : byDue);
  if (ui.filter === 'done') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const chip = (field, v, label) => `<button class="chip${ui[field] === v ? ' on' : ''}" data-a="set" data-k="${field}" data-v="${v}">${label}</button>`;
  let body;
  if (ui.filter === 'open' && ui.sort === 'due') {
    const wEnd = addDays(t0, 7);
    body = section('Überfällig', list.filter(t => t.due && t.due < t0))
      + section('Nächste 7 Tage', list.filter(t => t.due && t.due >= t0 && t.due <= wEnd))
      + section('Später', list.filter(t => t.due && t.due > wEnd))
      + section('Ohne Deadline', list.filter(t => !t.due));
  } else body = section(ui.filter === 'done' ? 'Erledigt' : 'Aufgaben', list);
  return `
    <input class="search" type="search" data-f="ui.q" placeholder="Suchen…" value="${esc(ui.q)}">
    <div class="chips">${chip('filter', 'open', 'Offen')}${chip('filter', 'done', 'Erledigt')}${chip('filter', 'all', 'Alle')}</div>
    <div class="row gap">
      <select class="grow" data-f="ui.project">
        <option value="">Alle Projekte</option>
        ${db.projects.map(p => `<option value="${p.id}"${ui.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
        <option value="-"${ui.project === '-' ? ' selected' : ''}>Ohne Projekt</option>
      </select>
      <select data-f="ui.sort">
        <option value="due"${ui.sort === 'due' ? ' selected' : ''}>nach Deadline</option>
        <option value="prio"${ui.sort === 'prio' ? ' selected' : ''}>nach Priorität</option>
        <option value="new"${ui.sort === 'new' ? ' selected' : ''}>neueste zuerst</option>
      </select>
    </div>
    ${quickInput('Neue Aufgabe…')}
    ${list.length ? body : `<div class="empty">${q ? 'Keine Treffer.' : 'Hier ist noch nichts. Tipp auf + um loszulegen.'}</div>`}`;
}

function viewProjects() {
  const t0 = today();
  const stats = id => {
    const all = db.tasks.filter(t => (id ? t.project === id : !proj(t.project)));
    const op = all.filter(t => !t.done);
    const next = op.filter(t => t.due).sort(byDue)[0];
    return { all, op, over: op.filter(t => t.due && t.due < t0).length, next };
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
  return `
    ${db.projects.map(p => card(p, stats(p.id))).join('')}
    ${none.all.length ? card(null, none) : ''}
    <button class="ghost block" data-a="newProject">+ Neues Projekt</button>
    <section class="sec">
      <div class="sec-h"><h3>Daten</h3></div>
      <p class="muted small">Alles wird nur auf diesem Gerät gespeichert. Mach ab und zu ein Backup.</p>
      <div class="row gap wrapr">
        <button class="grow" data-a="export">⬇︎ Exportieren</button>
        <button class="grow" data-a="import">⬆︎ Importieren</button>
      </div>
      <button class="ghost block" data-a="clearDone"${doneCount ? '' : ' disabled'}>Erledigte löschen (${doneCount})</button>
    </section>
    <section class="sec">
      <div class="sec-h"><h3>Schnelleingabe</h3></div>
      <p class="muted small"><b>#Projekt</b> ordnet zu, <b>!</b> = wichtig, <b>!!</b> = dringend.
      Beispiel: <i>Präsentation vorbereiten #Arbeit !!</i></p>
    </section>`;
}

// ---------- Sheets ----------
function sheetEdit(d) {
  const t0 = today();
  const isNew = !task(d.id);
  const dateChips = (field, extra = []) => [['Heute', t0], ['Morgen', addDays(t0, 1)], ...extra]
    .map(([l, v]) => `<button class="chip${d[field] === v ? ' on' : ''}" data-a="setD" data-k="${field}" data-v="${v}">${l}</button>`).join('');
  return `<div class="sheet-backdrop" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="Aufgabe">
    <div class="sheet-head row"><b class="grow">${isNew ? 'Neue Aufgabe' : 'Aufgabe'}</b><button class="icon-btn small" data-a="close" aria-label="Schließen">✕</button></div>
    <input class="title-in" data-f="d.title" placeholder="Was ist zu tun?" value="${esc(d.title)}" ${isNew ? 'autofocus' : ''}>
    <textarea data-f="d.notes" rows="2" placeholder="Notizen (optional)">${esc(d.notes)}</textarea>

    <label class="lbl">Deadline – bis wann muss es fertig sein?</label>
    <div class="row gap">
      <input class="grow" type="date" data-f="d.due" value="${d.due || ''}">
      <input type="time" data-f="d.dueTime" value="${d.dueTime || ''}">
    </div>
    <div class="chips">${dateChips('due', [['in 1 Woche', addDays(t0, 7)], ['Keine', '']])}</div>

    <label class="lbl">Eingeplant – wann arbeitest du daran?</label>
    <input type="date" data-f="d.plan" value="${d.plan || ''}">
    <div class="chips">${dateChips('plan', [['Keiner', '']])}</div>

    <label class="lbl">Priorität</label>
    <div class="chips">${PRIOS.map(p => `<button class="chip prio-chip p${p.v}${d.prio === p.v ? ' on' : ''}" data-a="setD" data-k="prio" data-v="${p.v}" data-num="1">${p.label}</button>`).join('')}</div>

    <label class="lbl">Projekt</label>
    <select data-f="d.project">
      <option value="">Ohne Projekt</option>
      ${db.projects.map(p => `<option value="${p.id}"${d.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    </select>

    <label class="lbl">Geschätzter Aufwand</label>
    <div class="chips">${ESTS.map(m => `<button class="chip${(+d.est || 0) === m ? ' on' : ''}" data-a="setD" data-k="est" data-v="${m}" data-num="1">${m ? fmtMin(m) : '–'}</button>`).join('')}</div>

    <label class="lbl">Wiederholen (nach dem Erledigen)</label>
    <select data-f="d.repeat">${Object.entries(REPEATS).map(([v, l]) => `<option value="${v}"${d.repeat === v ? ' selected' : ''}>${l}</option>`).join('')}</select>

    <label class="lbl">Teilschritte</label>
    ${d.subs.map(s => `<div class="sub row gap">
      <button class="check small${s.done ? ' on' : ''}" data-a="subToggle" data-id="${s.id}">${s.done ? '✓' : ''}</button>
      <input class="grow${s.done ? ' struck' : ''}" data-f="sub.${s.id}" value="${esc(s.t)}">
      <button class="icon-btn small" data-a="subDel" data-id="${s.id}" aria-label="Entfernen">✕</button>
    </div>`).join('')}
    <div class="row gap"><input class="grow" data-f="uv.newSub" data-enter="subAdd" placeholder="Teilschritt hinzufügen…" value="${esc(ui.newSub || '')}" enterkeyhint="done"><button data-a="subAdd">+</button></div>

    <button class="primary block big" data-a="saveTask">Speichern</button>
    ${isNew ? '' : `<div class="row gap">
      <button class="ghost grow" data-a="duplicate">Duplizieren</button>
      <button class="ghost grow danger" data-a="deleteTask">Löschen</button>
    </div>`}
  </div>`;
}

function sheetPlan(t) {
  const t0 = today();
  const opts = Array.from({ length: 7 }, (_, i) => addDays(t0, i));
  const nextMon = addDays(mondayOf(t0), 7);
  if (!opts.includes(nextMon)) opts.push(nextMon);
  return `<div class="sheet-backdrop" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="Einplanen">
    <div class="sheet-head row"><b class="grow">Wann bearbeitest du das?</b><button class="icon-btn small" data-a="close" aria-label="Schließen">✕</button></div>
    <div class="muted small">${esc(t.title)}${t.due ? ` · Deadline ${dayLabel(t.due)}${t.dueTime ? ' ' + t.dueTime : ''}` : ''}</div>
    <div class="chips">${opts.map(day => {
      const load = sumEst(open().filter(x => x.plan === day && x.id !== t.id));
      const after = t.due && day > t.due;
      return `<button class="chip${t.plan === day ? ' on' : ''}${after ? ' late' : ''}" data-a="planTo" data-id="${t.id}" data-v="${day}">
        ${day === nextMon && diff(t0, day) > 6 ? 'Nächste Woche' : dayLabel(day)}${load ? ` <small>· ${fmtMin(load)}</small>` : ''}</button>`;
    }).join('')}</div>
    <input type="date" data-f="uv.planPick" value="${t.plan || ''}">
    <button class="primary block" data-a="planTo" data-id="${t.id}" data-pick="1">Dieses Datum übernehmen</button>
    ${t.plan ? `<button class="ghost block" data-a="planTo" data-id="${t.id}" data-v="">Planung entfernen</button>` : ''}
  </div>`;
}

function sheetProject(d) {
  const isNew = !proj(d.id);
  return `<div class="sheet-backdrop" data-a="close"></div>
  <div class="sheet" role="dialog" aria-label="Projekt">
    <div class="sheet-head row"><b class="grow">${isNew ? 'Neues Projekt' : 'Projekt bearbeiten'}</b><button class="icon-btn small" data-a="close" aria-label="Schließen">✕</button></div>
    <input class="title-in" data-f="d.name" placeholder="Name, z. B. Uni, Haushalt, Kunde X" value="${esc(d.name)}" ${isNew ? 'autofocus' : ''}>
    <label class="lbl">Farbe</label>
    <div class="chips">${COLORS.map(c => `<button class="swatch${d.color === c ? ' on' : ''}" style="--c:${c}" data-a="setD" data-k="color" data-v="${c}" aria-label="Farbe ${c}"></button>`).join('')}</div>
    <button class="primary block big" data-a="saveProject">Speichern</button>
    ${isNew ? '' : '<button class="ghost block danger" data-a="deleteProject">Projekt löschen</button>'}
  </div>`;
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
  const body = { today: viewToday, week: viewWeek, all: viewAll, projects: viewProjects }[ui.view]();
  const s = ui.sheet;
  const sheet = !s ? '' : s.type === 'edit' ? sheetEdit(s.draft) : s.type === 'plan' ? sheetPlan(task(s.id)) : s.type === 'project' ? sheetProject(s.draft) : sheetConfirm(s);
  const overdue = open().filter(t => t.due && t.due < today()).length;
  const wasOpen = !!$app.querySelector('.sheet');
  $app.innerHTML = `
    <header class="top"><div class="wrap row"><h1 class="grow">${VIEWS[ui.view]}</h1>
      <button class="primary new-btn" data-a="new">+ Aufgabe</button></div></header>
    <main class="wrap">${body}</main>
    <nav class="tabs">${Object.entries(VIEWS).map(([k, l]) => `<button class="${ui.view === k ? 'on' : ''}" data-a="go" data-v="${k}">
      <span class="ti">${{ today: '☀︎', week: '▦', all: '☰', projects: '◧' }[k]}</span>${l}${k === 'today' && overdue ? `<i class="dot">${overdue}</i>` : ''}</button>`).join('')}</nav>
    ${sheet}`;
  document.body.classList.toggle('locked', !!s);
  if (wasOpen) $app.querySelector('.sheet')?.classList.add('still'); // nur beim Öffnen animieren
  const target = ui.focus ? $app.querySelector(`[data-f="${ui.focus}"]`) : fkey ? $app.querySelector(`[data-f="${fkey}"]`) : $app.querySelector('[autofocus]');
  ui.focus = null;
  if (target && (fkey || target.hasAttribute('autofocus') || target.dataset.f)) {
    target.focus({ preventScroll: true });
    try { if (sel && sel[0] != null) target.setSelectionRange(sel[0], sel[1]); } catch {}
  }
}

// ---------- Aktionen ----------
const newDraft = (preset = {}) => ({
  id: uid(), title: '', notes: '', project: ui.view === 'all' && ui.project && ui.project !== '-' ? ui.project : '',
  prio: 0, due: null, dueTime: '', plan: ui.view === 'today' ? today() : null, est: 0, repeat: '', subs: [],
  done: false, doneAt: null, createdAt: Date.now(), ...preset,
});

function complete(t) {
  snap();
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  let msg = t.done ? `„${t.title}“ erledigt ✓` : 'Wieder offen';
  if (t.done && t.repeat) {
    const base = t.due || t.plan || today();
    const step = s => t.repeat === 'daily' ? addDays(s, 1) : t.repeat === 'weekly' ? addDays(s, 7) : addMonths(s, 1);
    let nextBase = step(base);
    while (nextBase < today()) nextBase = step(nextBase);
    const shift = diff(base, nextBase);
    db.tasks.push({
      ...t, id: uid(), done: false, doneAt: null, createdAt: Date.now(),
      subs: t.subs.map(s => ({ ...s, id: uid(), done: false })),
      due: t.due ? addDays(t.due, shift) : null,
      plan: t.plan ? addDays(t.plan, shift) : null,
    });
    msg += ` · nächste: ${dayLabel(nextBase)}`;
  }
  save();
  toast(msg, true);
}

function quickAdd() {
  let title = ui.quick.trim();
  if (!title) return;
  let project = '', prio = 0;
  title = title.replace(/(^|\s)#(\S+)/g, (m, sp, name) => {
    let p = db.projects.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!p) { p = { id: uid(), name, color: COLORS[db.projects.length % COLORS.length] }; db.projects.push(p); }
    project = p.id; return sp;
  });
  title = title.replace(/(^|\s)(!{1,2})(?=\s|$)/g, (m, sp, ex) => { prio = Math.max(prio, ex.length); return sp; }).replace(/\s+/g, ' ').trim();
  if (!title) return;
  const d = newDraft({ title, prio });
  if (project) d.project = project;
  db.tasks.push(d);
  ui.quick = '';
  ui.focus = 'uv.quick';
  save();
  toast('Hinzugefügt');
}

const actions = {
  go: ({ v }) => { ui.view = v; history.replaceState(null, '', `#/${v}`); window.scrollTo(0, 0); },
  new: ({ plan }) => { ui.newSub = ''; ui.sheet = { type: 'edit', draft: newDraft(plan ? { plan } : {}) }; },
  edit: ({ id }) => { ui.newSub = ''; ui.sheet = { type: 'edit', draft: structuredClone(task(id)) }; },
  close: () => { ui.sheet = null; },
  toggle: ({ id }) => complete(task(id)),
  toggleDone: () => { ui.showDone = !ui.showDone; },
  undo: () => {
    if (!undoSnap) return;
    db = JSON.parse(undoSnap); undoSnap = null; save(); $toast.hidden = true;
  },
  set: ({ k, v }) => { ui[k] = v; },
  setD: ({ k, v, num }) => {
    const d = ui.sheet.draft;
    d[k] = num ? +v : (v === '' ? (k === 'due' || k === 'plan' ? null : '') : v);
    if (k === 'due' && !v) d.dueTime = '';
  },
  week: ({ v }) => { ui.weekStart = +v ? addDays(ui.weekStart, +v) : mondayOf(today()); },
  quickAdd,
  saveTask: () => {
    const d = ui.sheet.draft;
    d.title = d.title.trim();
    if (!d.title) { toast('Bitte einen Titel eingeben'); ui.focus = 'd.title'; return; }
    if (ui.newSub?.trim()) d.subs.push({ id: uid(), t: ui.newSub.trim(), done: false });
    d.due = d.due || null; d.plan = d.plan || null; d.est = +d.est || 0;
    d.subs = d.subs.filter(s => s.t.trim());
    const i = db.tasks.findIndex(t => t.id === d.id);
    if (i >= 0) db.tasks[i] = d; else db.tasks.push(d);
    save(); ui.sheet = null; toast(i >= 0 ? 'Gespeichert' : 'Aufgabe angelegt');
  },
  duplicate: () => {
    const d = ui.sheet.draft;
    ui.sheet.draft = { ...structuredClone(d), id: uid(), title: `${d.title} (Kopie)`, done: false, doneAt: null, createdAt: Date.now() };
    toast('Kopie – noch nicht gespeichert');
  },
  deleteTask: () => {
    const id = ui.sheet.draft.id;
    ui.sheet = { type: 'confirm', text: 'Aufgabe wirklich löschen?', yes: 'Löschen', run: () => {
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
  planSheet: ({ id }) => { ui.planPick = task(id).plan || ''; ui.sheet = { type: 'plan', id }; },
  planTo: ({ id, v, pick }) => {
    const val = pick ? ui.planPick : v;
    if (pick && !val) { toast('Bitte ein Datum wählen'); return; }
    task(id).plan = val || null; save(); ui.sheet = null;
    toast(val ? `Eingeplant: ${dayLabel(val)}` : 'Planung entfernt');
  },
  openProject: ({ id }) => { ui.project = id; ui.filter = 'open'; actions.go({ v: 'all' }); },
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
      if (ui.project === id) ui.project = '';
      save(); toast('Projekt gelöscht', true);
    } };
  },
  clearDone: () => {
    const n = db.tasks.filter(t => t.done).length;
    ui.sheet = { type: 'confirm', text: `${n} erledigte Aufgabe(n) endgültig löschen?`, yes: 'Löschen', run: () => {
      snap(); db.tasks = db.tasks.filter(t => !t.done); save(); toast('Aufgeräumt', true);
    } };
  },
  export: () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `planer-backup-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => document.getElementById('importFile').click(),
};

function runAction(el) {
  const fn = actions[el.dataset.a];
  if (!fn) return;
  fn({ ...el.dataset });
  render();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (el && !el.disabled) runAction(el);
});

function onField(e) {
  const el = e.target, f = el.dataset?.f;
  if (!f) return;
  const isText = el.tagName === 'TEXTAREA' || ['text', 'search', ''].includes(el.getAttribute('type') || '');
  if (e.type === 'change' && isText) return; // Textfelder werden schon per input übernommen
  const dot = f.indexOf('.');
  const scope = f.slice(0, dot), name = f.slice(dot + 1);
  const v = el.value;
  if (scope === 'ui') { ui[name] = v; render(); }
  else if (scope === 'uv') ui[name] = v;
  else if (scope === 'd') {
    ui.sheet.draft[name] = v;
    if (name === 'due' || name === 'plan') render(); // Chips aktualisieren
  } else if (scope === 'sub') { const s = ui.sheet.draft.subs.find(x => x.id === name); if (s) s.t = v; }
}
$app.addEventListener('input', onField);
$app.addEventListener('change', onField);

$app.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const el = e.target;
  if (el.dataset.enter) { e.preventDefault(); onField({ type: 'input', target: el }); actions[el.dataset.enter](); render(); }
  else if (el.dataset.f === 'd.title') { e.preventDefault(); actions.saveTask(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheet) { ui.sheet = null; render(); }
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
document.addEventListener('visibilitychange', () => { if (!document.hidden && !ui.sheet) render(); });

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
