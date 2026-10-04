// Skip-Bo: Rundensieger erhält 25 + 5 je Karte, die den Gegnern im Spielstapel bleibt.
import { esc, btn, stepper, fill, sum, scoreTable, leaders, simpleStandings } from './util.js';

const totals = s => s.players.map((_, p) => sum(s.data.rounds.map(r => r.pts[p])));
const blankEntry = n => ({ winner: null, cards: fill(n, 0) });

export default {
  id: 'skipbo',
  name: 'Skip-Bo',
  icon: '🃏',
  tagline: 'Punktespiel bis 500',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'target', label: 'Ziel', type: 'select', default: '500', choices: [['250', '250 Punkte'], ['500', '500 Punkte (offiziell)'], ['1000', '1000 Punkte']] },
  ],
  subtitle: s => `bis ${s.options.target} Punkte`,

  init(s) { return { rounds: [], entry: blankEntry(s.players.length) }; },

  view(s) {
    const d = s.data, e = d.entry, tot = totals(s), lead = leaders(tot);
    const table = scoreTable({
      head: s.players.map((nm, p) => esc(nm) + (lead.includes(p) && d.rounds.length ? ' 👑' : '')),
      rows: d.rounds.map((r, i) => ({ label: i + 1, cells: r.pts.map(v => (v ? `<b class="good">+${v}</b>` : '<span class="muted">–</span>')) })),
      foot: [{ label: 'Σ', cells: tot.map(v => `<b>${v}</b>`) }],
    });
    if (d.finished) return table;
    const w = e.winner;
    const pts = w == null ? 0 : 25 + 5 * sum(e.cards.filter((_, p) => p !== w));
    return `<div class="card entry">
      <div class="entry-head"><b>Runde ${d.rounds.length + 1}</b> · Ziel ${s.options.target}</div>
      <div class="entry-sub">Wer hat seinen Spielstapel zuerst abgelegt?</div>
      <div class="chips">${s.players.map((nm, p) => btn(esc(nm), 'winner', { p }, 'chip' + (w === p ? ' on' : ''))).join('')}</div>
      ${w != null ? `<div class="entry-sub">Restkarten im Spielstapel der anderen:</div>
        ${s.players.map((nm, p) => (p === w ? '' : `<div class="entry-row"><span class="er-name">${esc(nm)}</span>${stepper('cards', { p }, e.cards[p], { min: 0, max: 30 })}</div>`)).join('')}
        <div class="entry-sum ok">${esc(s.players[w])} erhält 25 + 5 × ${sum(e.cards.filter((_, p) => p !== w))} = <b>${pts}</b></div>` : ''}
      ${btn('Runde eintragen', 'endRound', {}, 'primary block', w == null)}
    </div>${table}`;
  },

  actions: {
    winner(s, ds) { s.data.entry.winner = +ds.p; },
    cards(s, ds) { const c = s.data.entry.cards; c[ds.p] = Math.max(0, Math.min(30, c[ds.p] + +ds.d)); },
    endRound(s) {
      const d = s.data, e = d.entry, n = s.players.length;
      if (e.winner == null) return;
      const pts = fill(n, 0);
      pts[e.winner] = 25 + 5 * sum(e.cards.filter((_, p) => p !== e.winner));
      d.rounds.push({ winner: e.winner, pts });
      d.entry = blankEntry(n);
      if (totals(s)[pts.findIndex(v => v > 0)] >= +s.options.target) d.finished = true;
    },
  },

  standings: s => simpleStandings(s, totals(s), false),

  rules: `
    <p>2–6 Spieler. Wer als Erster seinen Spielstapel komplett abgelegt hat, gewinnt die Runde.</p>
    <h3>Wertung (Punktespiel)</h3>
    <ul><li>Der Rundensieger erhält <b>25 Punkte</b></li><li>plus <b>5 Punkte für jede Karte</b>, die den Mitspielern noch im Spielstapel liegt.</li></ul>
    <p>Wer zuerst 500 Punkte erreicht, gewinnt das Spiel. Das Ziel lässt sich beim Start ändern.</p>`,
};
