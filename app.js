// App-Kern: Navigation, Speicherung (localStorage), Spieler-Setup, Rückgängig, Gewinneranzeige.
import { GAMES, GAME_LIST } from './games/index.js';
import { esc, uid, btn } from './util.js';

const KEY = { sessions: 'zb.sessions', players: 'zb.players', settings: 'zb.settings' };
const load = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } };

let sessions = load(KEY.sessions, []).filter(s => GAMES[s.game]);
let known = load(KEY.players, []);
let settings = { wake: true, ...load(KEY.settings, {}) };
let draft = null;
let lastView = null;
let focusName = false;
let pending = null; // offene Sicherheitsabfrage { text, yes, run }

// Eigene Bestätigung statt window.confirm (wird in manchen Browsern/App-Ansichten unterdrückt).
function ask(text, yes, run) { pending = { text, yes, run }; }
function confirmView() {
  if (!pending) return '';
  return `<div class="sheet-backdrop" data-a="app:confirmNo"></div><div class="sheet confirm">
    <div class="sheet-title">${esc(pending.text)}</div>
    <div class="row gap">${btn('Abbrechen', 'app:confirmNo', {}, 'ghost grow')}${btn(esc(pending.yes), 'app:confirmYes', {}, 'primary grow danger-bg')}</div>
  </div>`;
}

const $app = document.getElementById('app');
const persist = () => save(KEY.sessions, sessions.map(({ ui, ...rest }) => rest));
let persistTimer;
const persistSoon = () => { clearTimeout(persistTimer); persistTimer = setTimeout(persist, 300); };

const route = () => {
  const [view = 'home', arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { view: view || 'home', arg: arg && decodeURIComponent(arg) };
};
const findSession = id => sessions.find(s => s.id === id);
const currentSession = () => { const r = route(); return r.view === 'play' ? findSession(r.arg) : null; };
const gameName = s => GAMES[s.game].displayName?.(s) || GAMES[s.game].name;

function timeAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'gerade eben';
  if (m < 60) return `vor ${m} Min.`;
  const h = Math.round(m / 60);
  if (h < 24) return `vor ${h} Std.`;
  return new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function placed(list) {
  let place = 0, lastKey;
  return list.map((x, i) => {
    if (i === 0 || x.key !== lastKey) place = i + 1;
    lastKey = x.key;
    return { ...x, place };
  });
}
const winnersOf = s => placed(GAMES[s.game].standings(s)).filter(x => x.place === 1).map(x => s.players[x.p]);

// ---------- Ansichten ----------
function homeView() {
  const running = sessions.filter(s => !s.data.finished);
  const done = sessions.filter(s => s.data.finished);
  return `<header class="hero"><h1>Spielstand</h1><p>Die Mini-Game-App: Punkte zählen statt Block und Stift. Auch offline.</p></header>
  <main class="wrap">
    ${running.length ? `<h2 class="section">Weiterspielen</h2>
      ${running.map(s => `<div class="list-item">
        <a class="li-main" href="#/play/${s.id}"><span class="li-icon">${GAMES[s.game].icon}</span>
          <span class="li-text"><b>${esc(gameName(s))}</b><small>${s.players.map(esc).join(', ')} · ${timeAgo(s.updatedAt)}</small></span></a>
        ${btn('✕', 'app:delete', { id: s.id }, 'icon-btn muted')}</div>`).join('')}` : ''}
    <h2 class="section">Neues Spiel</h2>
    <div class="game-grid">${GAME_LIST.map(g => `<a class="game-card" href="#/setup/${g.id}">
      <span class="gc-icon">${g.icon}</span><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small>
      <span class="gc-players">${g.minPlayers === g.maxPlayers ? g.minPlayers : `${g.minPlayers}–${g.maxPlayers}`} ${esc(g.playerLabel ? g.playerLabel + 'en' : 'Spieler')}</span></a>`).join('')}</div>
    <h2 class="section">Mehr</h2>
    <a class="list-item li-main" href="#/history"><span class="li-icon">📜</span><span class="li-text"><b>Verlauf</b><small>${done.length} beendete Spiele</small></span></a>
    <div class="list-item">${btn(`<span class="li-icon">💡</span><span class="li-text"><b>Display anlassen</b><small>Bildschirm bleibt während des Spiels an</small></span><span class="switch${settings.wake ? ' on' : ''}"></span>`, 'app:toggleWake', {}, 'li-main plain')}</div>
    ${known.length ? `<div class="list-item">${btn(`<span class="li-icon">👥</span><span class="li-text"><b>Gespeicherte Namen löschen</b><small>${known.length} Namen</small></span>`, 'app:clearKnown', {}, 'li-main plain')}</div>` : ''}
  </main>`;
}

function newDraft(gameId) {
  const g = GAMES[gameId];
  const prev = sessions.find(s => s.game === gameId);
  const options = Object.fromEntries(g.options.map(o => [o.key, o.default]));
  if (prev) Object.assign(options, prev.options);
  const players = prev ? prev.players.slice(0, g.maxPlayers) : [];
  return { game: gameId, players, options };
}

function optionField(o, val) {
  const hint = o.hint ? `<small class="muted">${esc(o.hint)}</small>` : '';
  if (o.type === 'select') {
    return `<label class="field"><span>${esc(o.label)}</span><select data-ch="opt" data-key="${o.key}">
      ${o.choices.map(([v, l]) => `<option value="${esc(v)}"${String(val) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</label>`;
  }
  if (o.type === 'toggle') {
    return `<div class="field">${btn(`<span>${esc(o.label)}</span><span class="switch${val ? ' on' : ''}"></span>`, 'app:toggleOpt', { key: o.key }, 'toggle-row plain')}${hint}</div>`;
  }
  return `<label class="field"><span>${esc(o.label)}</span><input type="text" data-cin="optText" data-key="${o.key}" value="${esc(val)}" placeholder="${esc(o.placeholder || '')}" maxlength="30">${hint}</label>`;
}

function setupView(gameId) {
  const g = GAMES[gameId];
  if (!g) { location.hash = '#/'; return ''; }
  if (!draft || draft.game !== gameId) draft = newDraft(gameId);
  const label = g.playerLabel || 'Spieler';
  const labelPl = g.playerLabel ? g.playerLabel + 'en' : 'Spieler';
  const n = draft.players.length;
  const suggestions = known.filter(k => !draft.players.includes(k)).slice(0, 16);
  const full = n >= g.maxPlayers;
  const opts = g.options.filter(o => !o.showIf || o.showIf(draft.options));
  const problem = n < g.minPlayers ? `Mindestens ${g.minPlayers} ${g.minPlayers === 1 ? label : labelPl} nötig` : '';
  return `<header class="bar"><a class="icon-btn" href="#/">‹</a><div class="bar-title"><b>${g.icon} ${esc(g.name)}</b><small>Neues Spiel</small></div><a class="icon-btn" href="#/rules/${g.id}">?</a></header>
  <main class="wrap">
    <div class="card">
      <h3 class="card-title">${esc(labelPl)} <small class="muted">${n} / ${g.minPlayers === g.maxPlayers ? g.maxPlayers : `${g.minPlayers}–${g.maxPlayers}`}</small></h3>
      ${g.playerHint ? `<p class="muted small">${esc(g.playerHint)}</p>` : ''}
      <div class="player-list">${draft.players.map((p, i) => `<div class="player-row">
        <span class="pr-num">${i + 1}</span><span class="pr-name">${esc(p)}</span>
        ${btn('↑', 'app:moveUp', { i }, 'icon-btn small', i === 0)}${btn('✕', 'app:removePlayer', { i }, 'icon-btn small muted')}</div>`).join('')}</div>
      ${full ? `<p class="muted small">Maximal ${g.maxPlayers} ${labelPl}.</p>` : `<form class="add-form" data-form="addPlayer" autocomplete="off">
        <input name="name" type="text" placeholder="Name eingeben" maxlength="24" enterkeyhint="done" autocapitalize="words">
        <button type="submit" class="primary">+</button></form>
        ${suggestions.length ? `<div class="chips">${suggestions.map(k => btn('+ ' + esc(k), 'app:addKnown', { name: k }, 'chip')).join('')}</div>` : ''}`}
      ${n > 1 ? btn('🔀 Reihenfolge mischen', 'app:shuffle', {}, 'ghost block small') : ''}
    </div>
    ${opts.length ? `<div class="card"><h3 class="card-title">Einstellungen</h3>${opts.map(o => optionField(o, draft.options[o.key])).join('')}</div>` : ''}
    ${problem ? `<p class="center muted">${problem}</p>` : ''}
    ${btn('Spiel starten', 'app:start', {}, 'primary block big', !!problem)}
  </main>`;
}

function playView(id) {
  const s = findSession(id);
  if (!s) { location.hash = '#/'; return ''; }
  const g = GAMES[s.game];
  s.ui ??= {};
  const sub = g.subtitle?.(s) || '';
  let overlay = '';
  if (s.ui.menu) {
    overlay = `<div class="sheet-backdrop" data-a="app:closeMenu"></div><div class="sheet">
      <div class="sheet-title">${esc(gameName(s))}</div>
      <a class="menu-item" href="#/rules/${g.id}">📖 Regeln & Wertung</a>
      ${s.data.finished ? btn('🏆 Ergebnis anzeigen', 'app:showWin', {}, 'menu-item') : btn('🏁 Spiel jetzt beenden', 'app:endGame', {}, 'menu-item')}
      ${btn('🔁 Neues Spiel, gleiche Spieler', 'app:rematch', {}, 'menu-item')}
      ${btn('🗑️ Spiel löschen', 'app:delete', { id: s.id }, 'menu-item danger')}
      ${btn('Schließen', 'app:closeMenu', {}, 'ghost block')}
    </div>`;
  } else if (s.data.finished && !s.ui.hideWin) {
    const list = placed(g.standings(s));
    const winners = list.filter(x => x.place === 1).map(x => esc(s.players[x.p]));
    overlay = `<div class="sheet-backdrop"></div><div class="sheet win">
      <div class="trophy">🏆</div>
      <h2>${winners.join(' & ')} ${winners.length > 1 ? 'gewinnen' : 'gewinnt'}!</h2>
      <ol class="standings">${list.map(x => `<li class="${x.place === 1 ? 'first' : ''}"><span class="st-place">${x.place}.</span><span class="st-name">${esc(s.players[x.p])}</span><span class="st-score">${esc(x.text)}</span></li>`).join('')}</ol>
      ${btn('🔁 Revanche', 'app:rematch', {}, 'primary block')}
      <div class="row gap">${btn('Block ansehen', 'app:hideWin', {}, 'ghost grow')}<a class="btn ghost grow" href="#/">Übersicht</a></div>
      ${s.history.length ? btn('↶ Letzte Eingabe rückgängig', 'app:undo', {}, 'ghost block small') : ''}
    </div>`;
  }
  return `<header class="bar"><a class="icon-btn" href="#/">‹</a>
    <div class="bar-title"><b>${g.icon} ${esc(gameName(s))}</b><small>${esc(sub)}</small></div>
    ${btn('↶', 'app:undo', {}, 'icon-btn', !s.history.length)}${btn('⋯', 'app:menu', {}, 'icon-btn')}</header>
  <main class="wrap play play-${g.id}">${s.data.finished && s.ui.hideWin ? `<div class="done-banner">🏆 Beendet · ${winnersOf(s).map(esc).join(' & ')} ${btn('Ergebnis', 'app:showWin', {}, 'chip')}</div>` : ''}${g.view(s)}</main>${overlay}`;
}

function rulesView(gameId) {
  const g = GAMES[gameId];
  if (!g) { location.hash = '#/'; return ''; }
  return `<header class="bar">${btn('‹', 'app:back', {}, 'icon-btn')}<div class="bar-title"><b>${g.icon} ${esc(g.name)}</b><small>Regeln & Wertung</small></div><span class="icon-btn"></span></header>
  <main class="wrap"><div class="card rules">${g.rules}</div></main>`;
}

function historyView() {
  const done = sessions.filter(s => s.data.finished);
  return `<header class="bar"><a class="icon-btn" href="#/">‹</a><div class="bar-title"><b>📜 Verlauf</b><small>${done.length} Spiele</small></div><span class="icon-btn"></span></header>
  <main class="wrap">${done.length ? done.map(s => `<div class="list-item">
      <a class="li-main" href="#/play/${s.id}"><span class="li-icon">${GAMES[s.game].icon}</span>
        <span class="li-text"><b>${esc(gameName(s))} · 🏆 ${winnersOf(s).map(esc).join(' & ')}</b><small>${s.players.map(esc).join(', ')} · ${timeAgo(s.finishedAt || s.updatedAt)}</small></span></a>
      ${btn('✕', 'app:delete', { id: s.id }, 'icon-btn muted')}</div>`).join('') + btn('Verlauf komplett löschen', 'app:clearHistory', {}, 'ghost block danger')
    : '<p class="center muted">Noch keine beendeten Spiele.</p>'}</main>`;
}

// ---------- Rendering ----------
let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

function render() {
  const r = route();
  const scroll = {};
  $app.querySelectorAll('[data-keep-scroll]').forEach(el => { scroll[el.dataset.keepScroll] = el.scrollLeft; });
  const hadSheet = !!$app.querySelector('.sheet');
  const html = { setup: setupView, play: playView, rules: rulesView, history: historyView }[r.view]?.(r.arg) ?? homeView();
  $app.innerHTML = html + confirmView();
  // Offene Sheets nicht bei jedem Tipp neu hereinfahren lassen.
  if (hadSheet) $app.querySelectorAll('.sheet, .sheet-backdrop').forEach(el => el.classList.add('still'));
  $app.querySelectorAll('[data-keep-scroll]').forEach(el => { el.scrollLeft = scroll[el.dataset.keepScroll] || 0; });
  const viewKey = r.view + '/' + (r.arg || '');
  if (viewKey !== lastView) { window.scrollTo(0, 0); lastView = viewKey; }
  if (focusName) { focusName = false; $app.querySelector('.add-form input')?.focus(); }
  updateWake(r.view === 'play');
}

// ---------- Display anlassen ----------
let wakeLock = null, wakePending = false;
async function updateWake(on) {
  if (on && settings.wake && 'wakeLock' in navigator && !wakeLock && !wakePending && document.visibilityState === 'visible') {
    wakePending = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { /* nicht unterstützt oder verweigert */ }
    wakePending = false;
  } else if ((!on || !settings.wake) && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateWake(route().view === 'play');
  else persist();
});
window.addEventListener('pagehide', persist);

// ---------- Aktionen ----------
function rememberPlayers(names) {
  known = [...names, ...known.filter(k => !names.includes(k))].slice(0, 40);
  save(KEY.players, known);
}

function createSession(gameId, players, options) {
  const s = { id: uid(), game: gameId, players: [...players], options: { ...options }, history: [], createdAt: Date.now(), updatedAt: Date.now(), ui: {} };
  s.data = GAMES[gameId].init(s);
  sessions.unshift(s);
  if (!GAMES[gameId].playerLabel) rememberPlayers(players); // Teamnamen nicht als Spieler merken
  persist();
  location.hash = '#/play/' + s.id;
}

function addPlayer(name) {
  const g = GAMES[draft.game];
  name = name.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (draft.players.includes(name)) { toast(`„${name}“ ist schon dabei`); return; }
  if (draft.players.length >= g.maxPlayers) return;
  draft.players.push(name);
}

const core = {
  start() {
    const g = GAMES[draft.game];
    if (draft.players.length < g.minPlayers) return;
    createSession(draft.game, draft.players, draft.options);
  },
  addKnown(ds) { addPlayer(ds.name); },
  removePlayer(ds) { draft.players.splice(+ds.i, 1); },
  moveUp(ds) { const i = +ds.i, p = draft.players; [p[i - 1], p[i]] = [p[i], p[i - 1]]; },
  shuffle() {
    const p = draft.players;
    for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  },
  toggleOpt(ds) { draft.options[ds.key] = !draft.options[ds.key]; },
  toggleWake() { settings.wake = !settings.wake; save(KEY.settings, settings); },
  clearKnown() { ask('Alle gespeicherten Namen löschen?', 'Löschen', () => { known = []; save(KEY.players, known); }); },
  confirmYes() { const p = pending; pending = null; p?.run(); },
  confirmNo() { pending = null; },
  back() { if (history.length > 1) history.back(); else location.hash = '#/'; },
  menu() { const s = currentSession(); if (s) s.ui.menu = true; },
  closeMenu() { const s = currentSession(); if (s) s.ui.menu = false; },
  hideWin() { const s = currentSession(); if (s) s.ui.hideWin = true; },
  showWin() { const s = currentSession(); if (s) { s.ui.hideWin = false; s.ui.menu = false; } },
  undo() {
    const s = currentSession();
    if (!s || !s.history.length) return;
    s.data = JSON.parse(s.history.pop());
    if (!s.data.finished) s.finishedAt = null;
    s.ui = { mode: s.ui.mode };
    s.updatedAt = Date.now();
    persist();
  },
  endGame() {
    const s = currentSession();
    if (!s) return;
    s.ui.menu = false;
    ask('Spiel jetzt beenden und den aktuellen Stand werten?', 'Beenden', () => {
      s.history.push(JSON.stringify(s.data));
      s.data.finished = true;
      s.finishedAt = Date.now();
      s.ui = {};
      persist();
    });
  },
  rematch() {
    const s = currentSession();
    if (!s) return;
    // Bei der Revanche beginnt der nächste Spieler.
    createSession(s.game, [...s.players.slice(1), s.players[0]], s.options);
  },
  delete(ds) {
    const s = findSession(ds.id);
    if (!s) return;
    if (s.ui) s.ui.menu = false;
    ask(`${gameName(s)} mit ${s.players.join(', ')} löschen?`, 'Löschen', () => {
      sessions = sessions.filter(x => x.id !== ds.id);
      persist();
      if (route().view === 'play') location.hash = '#/';
    });
  },
  clearHistory() {
    ask('Alle beendeten Spiele aus dem Verlauf löschen?', 'Alle löschen', () => {
      sessions = sessions.filter(s => !s.data.finished);
      persist();
    });
  },
};

function gameAction(name, ds, el) {
  const s = currentSession();
  if (!s) return;
  const fn = GAMES[s.game].actions?.[name];
  if (!fn) return;
  const before = JSON.stringify(s.data);
  fn(s, ds, el);
  if (JSON.stringify(s.data) !== before) {
    s.history.push(before);
    if (s.history.length > 300) s.history.shift();
    s.updatedAt = Date.now();
    if (s.data.finished && !s.finishedAt) {
      s.finishedAt = Date.now();
      s.ui.hideWin = false;
      navigator.vibrate?.([80, 60, 120]);
    }
    persist();
  }
  if (s.ui.toast) { toast(s.ui.toast); s.ui.toast = null; }
}

$app.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a;
  if (a.startsWith('app:')) core[a.slice(4)]?.(el.dataset, el);
  else gameAction(a, el.dataset, el);
  render();
});

$app.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.cin === 'optText' && draft) { draft.options[el.dataset.key] = el.value; return; }
  if (!el.dataset.in) return;
  const s = currentSession();
  if (!s) return;
  const g = GAMES[s.game];
  g.inputs?.[el.dataset.in]?.(s, el.dataset, el.value);
  s.updatedAt = Date.now();
  persistSoon();
  const live = g.live?.(s) || {};
  for (const [k, v] of Object.entries(live)) { const t = $app.querySelector(`[data-live="${k}"]`); if (t) t.textContent = v; }
});

$app.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.ch === 'opt' && draft) { draft.options[el.dataset.key] = el.value; render(); }
});

$app.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === 'addPlayer') {
    addPlayer(f.elements.name.value);
    focusName = true;
    render();
  }
});

window.addEventListener('hashchange', () => { pending = null; render(); });
render();

// ---------- Offline ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker:', err));
}
navigator.storage?.persist?.().catch(() => {});
