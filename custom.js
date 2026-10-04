// Freier Zähler für beliebige Spiele.
import { esc, btn, fill, sum, numInput, parseNum, scoreTable, leaders, simpleStandings } from '../util.js';

const totals = s => s.players.map((_, p) => sum(s.data.rounds.map(r => r[p])));
const lowWins = s => s.options.win === 'low';

export default {
  id: 'custom',
  name: 'Freier Zähler',
  icon: '📝',
  tagline: 'Für jedes andere Spiel',
  minPlayers: 1,
  maxPlayers: 12,
  options: [
    { key: 'title', label: 'Name des Spiels', type: 'text', default: '', placeholder: 'z. B. Uno, Doppelkopf …' },
    { key: 'win', label: 'Gewinner', type: 'select', default: 'high', choices: [['high', 'Meiste Punkte gewinnen'], ['low', 'Wenigste Punkte gewinnen']] },
    { key: 'target', label: 'Spielende bei', type: 'select', default: '0', choices: [['0', 'Kein Ziel (manuell beenden)'], ...['50', '100', '200', '250', '300', '500', '1000', '5000'].map(v => [v, v + ' Punkten'])] },
  ],
  displayName: s => s.options.title?.trim() || 'Freier Zähler',
  subtitle: s => (lowWins(s) ? 'Wenigste Punkte gewinnen' : 'Meiste Punkte gewinnen') + (+s.options.target ? ` · Ende bei ${s.options.target}` : ''),

  init(s) { return { rounds: [], entry: fill(s.players.length, '') }; },

  view(s) {
    const d = s.data, tot = totals(s), lead = leaders(tot, lowWins(s));
    const table = scoreTable({
      head: s.players.map((nm, p) => esc(nm) + (lead.includes(p) && d.rounds.length ? ' 👑' : '')),
      rows: d.rounds.map((r, i) => ({ label: i + 1, cells: r.map(v => `<span class="${v < 0 ? 'bad' : ''}">${v}</span>`) })),
      foot: [{ label: 'Σ', cells: tot.map(v => `<b>${v}</b>`) }],
    });
    if (d.finished) return table;
    return `<div class="card entry">
      <div class="entry-head"><b>Runde ${d.rounds.length + 1}</b></div>
      ${s.players.map((nm, p) => `<div class="entry-row"><span class="er-name">${esc(nm)} <small class="muted">Σ ${tot[p]}</small></span>
        <div class="row gap">${btn('±', 'negate', { p }, 'calc-btn')}${numInput('pts', { p }, d.entry[p], { allowNeg: true })}</div></div>`).join('')}
      ${btn('Runde eintragen', 'endRound', {}, 'primary block')}
    </div>${table}`;
  },

  inputs: {
    pts(s, ds, v) { s.data.entry[ds.p] = v.replace(/[^\d-]/g, ''); },
  },

  actions: {
    negate(s, ds) {
      const v = String(s.data.entry[ds.p] || '');
      s.data.entry[ds.p] = v.startsWith('-') ? v.slice(1) : '-' + v;
    },
    endRound(s) {
      const d = s.data;
      d.rounds.push(d.entry.map(parseNum));
      d.entry = fill(s.players.length, '');
      const t = +s.options.target;
      if (t && totals(s).some(v => v >= t)) d.finished = true;
    },
  },

  standings: s => simpleStandings(s, totals(s), lowWins(s)),

  rules: `
    <p>Ein freier Block für jedes Spiel, das hier (noch) nicht eingebaut ist, z. B. Uno, Doppelkopf, Skat, Schafkopf, Mölkky oder Boule.</p>
    <ul>
      <li>Pro Runde trägst du die Punkte jedes Spielers ein. Mit <b>±</b> wird ein Wert negativ.</li>
      <li>Du legst fest, ob die meisten oder die wenigsten Punkte gewinnen.</li>
      <li>Mit einem Ziel endet das Spiel, sobald jemand diese Punktzahl erreicht. Ohne Ziel beendest du es über das Menü (⋯).</li>
    </ul>`,
};
