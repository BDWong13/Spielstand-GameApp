// Dart: X01 (301/501/701) und Cricket, mit Legs, Bust-Erkennung und Checkout-Vorschlägen.
import { esc, btn, fill } from '../util.js';

const CRICKET = [20, 19, 18, 17, 16, 15, 25];
const IMPOSSIBLE = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);

const dartLabel = d => (d.n === 0 ? '–' : d.n === 25 ? (d.m === 2 ? 'Bull' : '25') : (d.m === 3 ? 'T' : d.m === 2 ? 'D' : '') + d.n);

// ---------- Checkout-Rechner ----------
const THROWS = (() => {
  const t = [];
  for (let n = 1; n <= 20; n++) for (const m of [1, 2, 3]) t.push({ n, m });
  t.push({ n: 25, m: 1 }, { n: 25, m: 2 });
  return t.map(x => ({ ...x, v: x.n * x.m }));
})();
const FINAL_PREF = [20, 16, 18, 12, 10, 8, 14, 19, 17, 15, 13, 11, 9, 6, 4, 7, 5, 3, 2, 1];
function setupCost(t) {
  if (t.m === 3) return t.n >= 15 ? (20 - t.n) * 0.5 : 5 + (15 - t.n) * 0.3;
  if (t.m === 1) return t.n === 25 ? 4 : 1.5;
  return t.n === 25 ? 6 : 8;
}
const finalCost = t => (t.n === 25 ? 5 : t.m === 3 ? 9 : FINAL_PREF.indexOf(t.n) * 0.4);

const coCache = new Map();
export function checkout(rem, dartsLeft, out) {
  if (out === 'single' || rem > 170 || rem < 2 || dartsLeft < 1) return null;
  const key = `${rem}|${dartsLeft}|${out}`;
  if (coCache.has(key)) return coCache.get(key);
  const finals = THROWS.filter(t => (out === 'master' ? t.m >= 2 : t.m === 2));
  let best = null;
  const consider = (path, cost) => { if (!best || cost < best.cost) best = { path, cost }; };
  for (let k = 1; k <= dartsLeft && !best; k++) {
    for (const f of finals) {
      const need = rem - f.v;
      if (k === 1) { if (need === 0) consider([f], finalCost(f)); continue; }
      for (const a of THROWS) {
        if (k === 2) { if (a.v === need) consider([a, f], setupCost(a) + finalCost(f)); continue; }
        if (a.v >= need) continue;
        for (const b of THROWS) if (a.v + b.v === need) consider([a, b, f], setupCost(a) + setupCost(b) + finalCost(f));
      }
    }
  }
  const res = best ? best.path.map(dartLabel).join(' · ') : null;
  coCache.set(key, res);
  return res;
}

// ---------- Spielzustand ----------
function legState(s, starter) {
  const n = s.players.length;
  const o = s.options;
  const base = { current: starter, turn: [], last: fill(n, null), legOver: null };
  if (o.variant === 'cricket') {
    return { ...base, marks: fill(n, () => Object.fromEntries(CRICKET.map(c => [c, 0]))), points: fill(n, 0) };
  }
  const start = +o.variant;
  return { ...base, remaining: fill(n, start), isIn: fill(n, o.in !== 'double'), turnStart: start, turnStartIn: o.in !== 'double' };
}

const isCricket = s => s.options.variant === 'cricket';

function endTurn(s, { bust = false, win = false, scored = null } = {}) {
  const d = s.data, p = d.current, st = d.stats[p];
  if (!isCricket(s)) {
    const pts = bust ? 0 : scored ?? d.turnStart - d.remaining[p];
    st.points += pts;
    st.darts += d.turn.length || 3;
    st.best = Math.max(st.best, pts);
    d.last[p] = { darts: d.turn, scored: pts, bust };
  } else {
    st.darts += d.turn.length;
    d.last[p] = { darts: d.turn };
  }
  d.turn = [];
  if (win) {
    d.legsWon[p]++;
    if (d.legsWon[p] >= +s.options.legs) { d.finished = true; d.winner = p; }
    else d.legOver = { winner: p };
    return;
  }
  d.current = (p + 1) % s.players.length;
  if (!isCricket(s)) { d.turnStart = d.remaining[d.current]; d.turnStartIn = d.isIn[d.current]; }
}

function throwX01(s, dart) {
  const d = s.data, p = d.current, o = s.options;
  let val = dart.n * dart.m;
  if (!d.isIn[p]) {
    if (dart.m === 2) d.isIn[p] = true;
    else val = 0;
  }
  const rem = d.remaining[p] - val;
  d.turn.push(dart);
  const bust = rem < 0
    || (o.out !== 'single' && rem === 1)
    || (rem === 0 && o.out === 'double' && dart.m !== 2)
    || (rem === 0 && o.out === 'master' && dart.m === 1);
  if (bust) {
    d.remaining[p] = d.turnStart;
    d.isIn[p] = d.turnStartIn;
    return endTurn(s, { bust: true });
  }
  d.remaining[p] = rem;
  if (rem === 0) return endTurn(s, { win: true });
  if (d.turn.length === 3) endTurn(s);
}

function throwCricket(s, dart) {
  const d = s.data, p = d.current, n = s.players.length;
  d.turn.push(dart);
  if (CRICKET.includes(dart.n)) {
    const have = d.marks[p][dart.n];
    const extra = Math.max(0, dart.m - Math.max(0, 3 - have));
    d.marks[p][dart.n] = Math.min(3, have + dart.m);
    d.stats[p].marks += dart.m;
    const othersOpen = [...Array(n).keys()].some(q => q !== p && d.marks[q][dart.n] < 3);
    if (extra > 0 && othersOpen) d.points[p] += extra * dart.n;
  }
  const closedAll = CRICKET.every(c => d.marks[p][c] >= 3);
  const others = d.points.filter((_, q) => q !== p);
  if (closedAll && d.points[p] >= Math.max(0, ...others)) return endTurn(s, { win: true });
  if (d.turn.length === 3) endTurn(s);
}

// ---------- Ansicht ----------
const markSym = m => ['', '／', '✕', 'Ⓧ'][m];

function playersView(s) {
  const d = s.data, o = s.options, cricket = isCricket(s);
  const showLegs = +o.legs > 1;
  if (cricket) {
    return `<div class="table-wrap"><table class="score cricket">
      <thead><tr><th></th>${s.players.map((nm, p) => `<th class="${p === d.current && !d.finished ? 'active' : ''}">${esc(nm)}${showLegs ? `<small> · ${d.legsWon[p]} L</small>` : ''}</th>`).join('')}</tr></thead>
      <tbody>${CRICKET.map(c => `<tr><th>${c === 25 ? 'Bull' : c}</th>${s.players.map((_, p) =>
        `<td class="mark m${d.marks[p][c]}${s.players.every((__, q) => d.marks[q][c] >= 3) ? ' dead' : ''}">${markSym(d.marks[p][c])}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th>Punkte</th>${d.points.map(v => `<td class="big">${v}</td>`).join('')}</tr>
      <tr><th>MPR</th>${d.stats.map(st => `<td>${st.darts ? (st.marks / st.darts * 3).toFixed(2) : '–'}</td>`).join('')}</tr></tfoot>
    </table></div>`;
  }
  return `<div class="dart-players">${s.players.map((nm, p) => {
    const st = d.stats[p];
    const active = p === d.current && !d.finished && !d.legOver;
    const last = d.last[p];
    const lastTxt = !last ? '' : last.bust ? '<span class="bad">Bust</span>' : `${last.scored}${last.darts.length ? ` <small>(${last.darts.map(dartLabel).join(' ')})</small>` : ''}`;
    const co = active ? checkout(d.remaining[p], 3 - d.turn.length, o.out) : null;
    return `<div class="dart-player${active ? ' active' : ''}">
      <div class="dp-head"><span class="dp-name">${esc(nm)}</span>${showLegs ? `<span class="badge">${d.legsWon[p]} Legs</span>` : ''}${!d.isIn[p] ? '<span class="badge warn">nicht drin</span>' : ''}</div>
      <div class="dp-main"><span class="dp-rem">${d.remaining[p]}</span>
        <div class="dp-stats"><div>Ø ${st.darts ? (st.points / st.darts * 3).toFixed(1) : '–'}</div><div>Letzte: ${lastTxt || '–'}</div></div></div>
      ${active ? `<div class="dp-turn">${[0, 1, 2].map(i => `<span class="slot">${d.turn[i] ? dartLabel(d.turn[i]) : ''}</span>`).join('')}
        ${co ? `<span class="checkout">🎯 ${co}</span>` : ''}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function padView(s) {
  const d = s.data, ui = s.ui, cricket = isCricket(s);
  if (d.finished) return '';
  if (d.legOver) {
    return `<div class="pad"><div class="leg-over">🏆 ${esc(s.players[d.legOver.winner])} gewinnt Leg ${d.leg}!</div>
      ${btn('Nächstes Leg starten', 'nextLeg', {}, 'primary block')}</div>`;
  }
  const mode = cricket ? 'darts' : ui.mode || 'darts';
  const mod = ui.mod || 1;
  const toggle = cricket ? '' : `<div class="seg">${btn('Einzelpfeile', 'setMode', { m: 'darts' }, mode === 'darts' ? 'on' : '', d.turn.length > 0)}${btn('Aufnahme (Summe)', 'setMode', { m: 'sum' }, mode === 'sum' ? 'on' : '', d.turn.length > 0)}</div>`;
  if (mode === 'sum') {
    const buf = ui.buf || '';
    const quick = [26, 41, 45, 60, 81, 85, 100, 140, 180];
    return `<div class="pad">${toggle}
      <div class="sum-display">${buf || '<span class="muted">Punkte der Aufnahme</span>'}</div>
      <div class="quick">${quick.map(q => btn(q, 'sumQuick', { v: q }, 'chip')).join('')}</div>
      <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => btn(k, 'sumKey', { k }, 'key')).join('')}
        ${btn('⌫', 'sumKey', { k: 'del' }, 'key')}${btn('0', 'sumKey', { k: 0 }, 'key')}${btn('OK', 'sumOk', {}, 'key primary')}</div>
      <div class="row gap">${btn('↶ Rückgängig', 'app:undo', {}, 'ghost grow')}</div>
    </div>`;
  }
  const nums = cricket ? [20, 19, 18, 17, 16, 15] : Array.from({ length: 20 }, (_, i) => i + 1);
  return `<div class="pad">${toggle}
    <div class="seg mods">${btn('Double', 'setMod', { m: 2 }, mod === 2 ? 'on dbl' : '')}${btn('Triple', 'setMod', { m: 3 }, mod === 3 ? 'on tpl' : '')}</div>
    <div class="numgrid${cricket ? ' cricket' : ''}">${nums.map(n => btn((mod === 3 ? 'T' : mod === 2 ? 'D' : '') + n, 'dart', { n }, 'key')).join('')}
      ${btn(mod === 2 ? 'Bull' : '25', 'dart', { n: 25 }, 'key', mod === 3)}${btn('Miss', 'dart', { n: 0 }, 'key muted')}</div>
    <div class="row gap">${btn('↶ Rückgängig', 'app:undo', {}, 'ghost grow')}${btn('Weiter ➜', 'skipTurn', {}, 'ghost grow')}</div>
  </div>`;
}

export default {
  id: 'dart',
  name: 'Dart',
  icon: '🎯',
  tagline: '301 · 501 · 701 · Cricket',
  minPlayers: 1,
  maxPlayers: 8,
  options: [
    { key: 'variant', label: 'Variante', type: 'select', default: '501', choices: [['301', '301'], ['501', '501'], ['701', '701'], ['cricket', 'Cricket']] },
    { key: 'out', label: 'Checkout', type: 'select', default: 'double', choices: [['double', 'Double Out'], ['single', 'Single Out'], ['master', 'Master Out (Double/Triple)']], showIf: o => o.variant !== 'cricket' },
    { key: 'in', label: 'Check-in', type: 'select', default: 'single', choices: [['single', 'Straight In'], ['double', 'Double In']], showIf: o => o.variant !== 'cricket' },
    { key: 'legs', label: 'Legs zum Sieg', type: 'select', default: '1', choices: [['1', '1'], ['2', '2 (Best of 3)'], ['3', '3 (Best of 5)'], ['4', '4 (Best of 7)'], ['5', '5 (Best of 9)']] },
  ],
  subtitle: s => (isCricket(s) ? 'Cricket' : `${s.options.variant} · ${{ double: 'Double Out', single: 'Single Out', master: 'Master Out' }[s.options.out]}`) + (+s.options.legs > 1 ? ` · First to ${s.options.legs}` : ''),

  init(s) {
    const n = s.players.length;
    return { leg: 1, starter: 0, legsWon: fill(n, 0), stats: fill(n, () => ({ points: 0, darts: 0, best: 0, marks: 0 })), ...legState(s, 0) };
  },

  view(s) {
    const d = s.data;
    return `<div class="info-line">Leg ${d.leg}${!isCricket(s) && s.options.in === 'double' ? ' · Double In' : ''}</div>${playersView(s)}${padView(s)}`;
  },

  actions: {
    setMod(s, ds) { s.ui.mod = s.ui.mod === +ds.m ? 1 : +ds.m; },
    setMode(s, ds) { s.ui.mode = ds.m; s.ui.buf = ''; },
    dart(s, ds) {
      const d = s.data;
      if (d.finished || d.legOver) return;
      const n = +ds.n;
      let m = n === 0 ? 1 : s.ui.mod || 1;
      if (n === 25 && m === 3) return;
      s.ui.mod = 1;
      const dart = { n, m };
      if (isCricket(s)) throwCricket(s, dart); else throwX01(s, dart);
    },
    skipTurn(s) {
      const d = s.data;
      if (d.finished || d.legOver) return;
      while (d.turn.length < 3) d.turn.push({ n: 0, m: 1 });
      endTurn(s);
    },
    sumKey(s, ds) {
      const buf = s.ui.buf || '';
      if (ds.k === 'del') s.ui.buf = buf.slice(0, -1);
      else if (buf.length < 3) s.ui.buf = (buf + ds.k).replace(/^0+(?=\d)/, '');
    },
    sumQuick(s, ds) { s.ui.buf = String(ds.v); },
    sumOk(s) {
      const d = s.data, p = d.current, o = s.options;
      const v = parseInt(s.ui.buf || '0', 10);
      if (v > 180 || IMPOSSIBLE.has(v)) { s.ui.buf = ''; s.ui.toast = `${v} ist mit 3 Darts nicht möglich`; return; }
      s.ui.buf = '';
      if (!d.isIn[p] && v > 0) d.isIn[p] = true;
      const scored = d.isIn[p] ? v : 0;
      const rem = d.remaining[p] - scored;
      if (rem < 0 || (o.out !== 'single' && rem === 1)) {
        d.isIn[p] = d.turnStartIn;
        return endTurn(s, { bust: true });
      }
      d.remaining[p] = rem;
      endTurn(s, { win: rem === 0, scored });
    },
    nextLeg(s) {
      const d = s.data;
      d.leg++;
      d.starter = (d.starter + 1) % s.players.length;
      Object.assign(d, legState(s, d.starter));
    },
  },

  standings(s) {
    const d = s.data, cricket = isCricket(s);
    return s.players.map((_, p) => ({
      p,
      key: `${d.legsWon[p]}|${cricket ? d.points[p] : -d.remaining[p]}`,
      sortA: d.legsWon[p], sortB: cricket ? d.points[p] : -d.remaining[p],
      text: (+s.options.legs > 1 ? `${d.legsWon[p]} Legs · ` : '') + (cricket ? `${d.points[p]} Pkt.` : `Rest ${d.remaining[p]}`)
        + (d.stats[p].darts ? cricket ? ` · MPR ${(d.stats[p].marks / d.stats[p].darts * 3).toFixed(2)}` : ` · Ø ${(d.stats[p].points / d.stats[p].darts * 3).toFixed(1)}` : ''),
    })).sort((a, b) => b.sortA - a.sortA || b.sortB - a.sortB);
  },

  rules: `
    <h3>X01 (301 / 501 / 701)</h3>
    <p>Jeder startet mit der gewählten Punktzahl und wirft pro Aufnahme 3 Darts. Die geworfenen Punkte werden abgezogen. Wer zuerst genau auf 0 kommt, gewinnt das Leg.</p>
    <ul>
      <li><b>Double Out:</b> Der letzte Dart muss ein Doppel sein (Bull = Doppel-25).</li>
      <li><b>Master Out:</b> Der letzte Dart muss ein Doppel oder Triple sein.</li>
      <li><b>Double In:</b> Gezählt wird erst ab dem ersten getroffenen Doppel.</li>
      <li><b>Bust:</b> Wer unter 0 fällt (oder bei Double/Master Out auf 1 landet bzw. ohne passenden Dart auf 0), bekommt für die ganze Aufnahme 0 Punkte. Der Stand wird zurückgesetzt.</li>
    </ul>
    <p>Die App zeigt einen Checkout-Weg an, sobald ein Finish möglich ist.</p>
    <h3>Cricket</h3>
    <p>Gespielt werden 15–20 und Bull. Single = 1 Treffer, Double = 2, Triple = 3. Mit 3 Treffern ist eine Zahl „geschlossen“. Weitere Treffer auf eine geschlossene Zahl bringen Punkte, solange ein Gegner sie noch offen hat. Gewonnen hat, wer alle Zahlen geschlossen hat und mindestens so viele Punkte hat wie jeder Gegner.</p>
    <h3>Eingabe</h3>
    <p>Optional Double/Triple antippen, dann die Zahl. „Weiter“ beendet die Aufnahme und füllt fehlende Darts als Fehlwürfe auf. Bei X01 kannst du auch nur die Summe einer Aufnahme eingeben.</p>`,
};
