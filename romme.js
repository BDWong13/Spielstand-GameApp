// Rommé: Strafpunkte für Handkarten, Hand-Rommé zählt doppelt. Wenigste Punkte gewinnen.
import { esc, btn, fill, sum, numInput, parseNum, scoreTable, leaders, simpleStandings } from './util.js';
import { CARDSETS, calcButton, calcOverlay, calcActions } from './common.js';

const totals = s => s.players.map((_, p) => sum(s.data.rounds.map(r => r.pts[p])));
const blankEntry = n => ({ winner: null, hand: false, points: fill(n, 0) });

export default {
  id: 'romme',
  name: 'Rommé',
  icon: '♠️',
  tagline: 'Minuspunkte für Handkarten',
  minPlayers: 2,
  maxPlayers: 6,
  options: [
    { key: 'end', label: 'Spielende', type: 'select', default: 'limit', choices: [['limit', 'Bei Punktelimit'], ['rounds', 'Nach fester Rundenzahl']] },
    { key: 'limit', label: 'Punktelimit', type: 'select', default: '500', choices: ['100', '200', '300', '500', '1000'].map(v => [v, v + ' Punkte']), showIf: o => o.end === 'limit' },
    { key: 'rounds', label: 'Runden', type: 'select', default: '10', choices: ['5', '8', '10', '12', '15', '20'].map(v => [v, v + ' Runden']), showIf: o => o.end === 'rounds' },
  ],
  subtitle: s => (s.options.end === 'limit' ? `Ende bei ${s.options.limit} Strafpunkten` : `${s.options.rounds} Runden`),

  init(s) { return { rounds: [], entry: blankEntry(s.players.length) }; },

  view(s) {
    const d = s.data, e = d.entry, tot = totals(s), lead = leaders(tot, true);
    const table = scoreTable({
      head: s.players.map((nm, p) => esc(nm) + (lead.includes(p) && d.rounds.length ? ' 👑' : '')),
      rows: d.rounds.map((r, i) => ({
        label: i + 1 + (r.hand ? '<small>✋</small>' : ''),
        cells: r.pts.map((v, p) => (p === r.winner ? '<b class="good">raus</b>' : v)),
      })),
      foot: [{ label: 'Σ', cells: tot.map(v => `<b>${v}</b>`) }],
    });
    if (d.finished) return table;
    const w = e.winner;
    const nr = d.rounds.length + 1;
    return `<div class="card entry">
      <div class="entry-head"><b>Runde ${nr}</b>${s.options.end === 'rounds' ? ` von ${s.options.rounds}` : ` · Limit ${s.options.limit}`}</div>
      <div class="entry-sub">Wer hat ausgemacht?</div>
      <div class="chips">${s.players.map((nm, p) => btn(esc(nm), 'winner', { p }, 'chip' + (w === p ? ' on' : ''))).join('')}</div>
      ${btn(e.hand ? '✋ Hand-Rommé: Punkte zählen doppelt' : 'Hand-Rommé? (alle Karten auf einmal abgelegt)', 'toggleHand', {}, 'toggle block' + (e.hand ? ' on' : ''))}
      <div class="entry-sub">Punkte der Handkarten:</div>
      ${s.players.map((nm, p) => (p === w ? '' : `<div class="entry-row"><span class="er-name">${esc(nm)}</span>
        <div class="row gap">${numInput('points', { p }, e.points[p])}${calcButton('points', p)}</div></div>`)).join('')}
      ${btn('Runde eintragen', 'endRound', {}, 'primary block', w == null)}
    </div>${table}${calcOverlay(s, CARDSETS.romme)}`;
  },

  inputs: {
    points(s, ds, v) { s.data.entry.points[ds.p] = parseNum(v); },
  },

  actions: {
    ...calcActions,
    winner(s, ds) { s.data.entry.winner = +ds.p; },
    toggleHand(s) { s.data.entry.hand = !s.data.entry.hand; },
    endRound(s) {
      const d = s.data, e = d.entry, n = s.players.length;
      if (e.winner == null) return;
      const pts = e.points.map((v, p) => (p === e.winner ? 0 : v * (e.hand ? 2 : 1)));
      d.rounds.push({ winner: e.winner, hand: e.hand, pts });
      d.entry = blankEntry(n);
      const o = s.options;
      if (o.end === 'limit' ? totals(s).some(t => t >= +o.limit) : d.rounds.length >= +o.rounds) d.finished = true;
    },
  },

  standings: s => simpleStandings(s, totals(s), true),

  rules: `
    <p>2–6 Spieler. Wer alle Karten ablegen konnte, beendet die Runde („raus“). Alle anderen bekommen die Werte ihrer Handkarten als Strafpunkte.</p>
    <h3>Kartenwerte</h3>
    <ul><li>2–9: Augenwert</li><li>10, Bube, Dame, König: <b>10</b></li><li>Ass: <b>11</b></li><li>Joker: <b>20</b></li></ul>
    <h3>Hand-Rommé</h3>
    <p>Legt jemand alle Karten in einem Zug ab, ohne vorher ausgelegt zu haben, zählen die Strafpunkte der anderen doppelt.</p>
    <h3>Spielende</h3>
    <p>Entweder sobald jemand das Punktelimit erreicht oder nach einer festen Rundenzahl. Es gewinnt, wer die <b>wenigsten</b> Punkte hat.</p>`,
};
