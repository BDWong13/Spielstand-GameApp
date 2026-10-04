// Phase 10 (Kartenspiel): Phasen abhaken, Strafpunkte für Restkarten.
import { esc, btn, fill, sum, numInput, parseNum, scoreTable } from '../util.js';
import { CARDSETS, calcButton, calcOverlay, calcActions } from './common.js';

export const PHASES = [
  '2 Drillinge',
  '1 Drilling + 1 Viererfolge',
  '1 Vierling + 1 Viererfolge',
  '1 Siebenerfolge',
  '1 Achterfolge',
  '1 Neunerfolge',
  '2 Vierlinge',
  '7 Karten einer Farbe',
  '1 Fünfling + 1 Zwilling',
  '1 Fünfling + 1 Drilling',
];

const blankEntry = n => ({ done: fill(n, false), points: fill(n, 0) });

export default {
  id: 'phase10',
  name: 'Phase 10',
  icon: '🔟',
  tagline: '10 Phasen, Strafpunkte für Restkarten',
  minPlayers: 2,
  maxPlayers: 6,
  options: [],

  init(s) {
    const n = s.players.length;
    return { round: 1, phase: fill(n, 1), done10: fill(n, false), points: fill(n, 0), rounds: [], entry: blankEntry(n) };
  },

  view(s) {
    const d = s.data, n = s.players.length, e = d.entry;
    const rows = d.rounds.map((r, i) => ({
      label: i + 1,
      cells: s.players.map((_, p) => `<span class="cell-main">${r.done[p] ? '✓' : '✗'}</span><span class="cell-sub">+${r.points[p]}</span>`),
      cellCls: r.done.map(x => (x ? 'good' : 'bad')),
    }));
    const table = scoreTable({
      head: s.players.map(esc),
      rows,
      foot: [
        { label: 'Phase', cells: s.players.map((_, p) => (d.done10[p] ? '<b>✓ fertig</b>' : `<b>${d.phase[p]}</b>`)) },
        { label: 'Pkt.', cells: d.points.map(v => `<b>${v}</b>`) },
      ],
    });
    if (d.finished) return table;

    const dealer = (d.round - 1) % n;
    const entry = `<div class="card entry">
      <div class="entry-head"><b>Runde ${d.round}</b> · Geber: ${esc(s.players[dealer])}</div>
      <div class="entry-sub">Phase geschafft? Strafpunkte der Restkarten (wer ausgemacht hat: 0)</div>
      ${s.players.map((nm, p) => `<div class="entry-row wrap">
        <div class="er-name">${esc(nm)}<div class="muted small">Phase ${d.phase[p]}: ${PHASES[d.phase[p] - 1]}</div></div>
        <div class="row gap">
          ${btn(e.done[p] ? '✓ geschafft' : 'nicht geschafft', 'toggleDone', { p }, 'toggle' + (e.done[p] ? ' on' : ''))}
          ${numInput('points', { p }, e.points[p])}
          ${calcButton('points', p)}
        </div>
      </div>`).join('')}
      ${btn('Runde abschließen', 'endRound', {}, 'primary block')}
    </div>`;
    return entry + table + calcOverlay(s, CARDSETS.phase10);
  },

  inputs: {
    points(s, ds, v) { s.data.entry.points[ds.p] = parseNum(v); },
  },

  actions: {
    ...calcActions,
    toggleDone(s, ds) { const e = s.data.entry; e.done[ds.p] = !e.done[ds.p]; },
    endRound(s) {
      const d = s.data, n = s.players.length, e = d.entry;
      d.rounds.push({ done: [...e.done], points: [...e.points] });
      for (let p = 0; p < n; p++) {
        d.points[p] += e.points[p];
        if (e.done[p]) {
          if (d.phase[p] === 10) d.done10[p] = true;
          else d.phase[p]++;
        }
      }
      if (d.done10.some(Boolean)) { d.finished = true; return; }
      d.round++;
      d.entry = blankEntry(n);
    },
  },

  standings(s) {
    const d = s.data;
    return s.players.map((_, p) => {
      const ph = d.done10[p] ? 11 : d.phase[p];
      return { p, key: `${ph}|${d.points[p]}`, ph, pts: d.points[p], text: `${d.done10[p] ? 'Alle Phasen' : `Phase ${ph}`} · ${d.points[p]} Pkt.` };
    }).sort((a, b) => b.ph - a.ph || a.pts - b.pts);
  },

  rules: `
    <p>2–6 Spieler. Jeder versucht, nacheinander die 10 Phasen zu erfüllen. Wer seine Phase in einer Runde auslegt, darf in der nächsten Runde die nächste Phase versuchen. Sonst bleibt er auf seiner Phase.</p>
    <h3>Die Phasen</h3>
    <ol>${PHASES.map(p => `<li>${p}</li>`).join('')}</ol>
    <p><i>Drilling/Vierling = gleiche Zahlen, Folge = aufeinanderfolgende Zahlen (Farbe egal).</i></p>
    <h3>Strafpunkte (Karten auf der Hand)</h3>
    <ul><li>1–9: <b>5 Punkte</b></li><li>10–12: <b>10 Punkte</b></li><li>Aussetzen: <b>15 Punkte</b></li><li>Joker: <b>25 Punkte</b></li></ul>
    <p>Mit dem 🧮-Knopf kannst du die Restkarten antippen und zusammenzählen lassen.</p>
    <h3>Ende</h3>
    <p>Wer als Erster Phase 10 erfüllt, gewinnt. Schaffen das mehrere in derselben Runde, gewinnt, wer weniger Strafpunkte hat.</p>`,
};
