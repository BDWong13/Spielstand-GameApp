// Wizard: Stiche ansagen, Stiche zählen. 20 + 10 je Stich bei Treffer, −10 je Stich Abweichung.
import { esc, btn, stepper, fill, sum, signed, scoreTable, leaders, simpleStandings } from '../util.js';

const totalRounds = s => (s.options.rounds === 'custom' ? +s.options.customRounds : 60 / s.players.length);
const score = (bid, got) => (bid === got ? 20 + 10 * got : -10 * Math.abs(bid - got));
const totals = s => s.players.map((_, p) => sum(s.data.rounds.map(r => r.pts[p])));

// Reihenfolge der Ansage: links vom Geber beginnend.
function order(s) {
  const n = s.players.length, dealer = (s.data.round - 1) % n;
  return Array.from({ length: n }, (_, i) => (dealer + 1 + i) % n);
}

export default {
  id: 'wizard',
  name: 'Wizard',
  icon: '🧙',
  tagline: 'Stiche ansagen und erfüllen',
  minPlayers: 3,
  maxPlayers: 6,
  options: [
    { key: 'noEven', label: 'Ansagen dürfen nicht aufgehen', type: 'toggle', default: false, hint: 'Variante: Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen.' },
    { key: 'rounds', label: 'Rundenzahl', type: 'select', default: 'standard', choices: [['standard', 'Standard (60 ÷ Spieler)'], ['custom', 'Eigene']] },
    { key: 'customRounds', label: 'Anzahl Runden', type: 'select', default: '10', choices: [3, 5, 8, 10, 12, 15, 20].map(v => [String(v), String(v)]), showIf: o => o.rounds === 'custom' },
  ],
  subtitle: s => `${totalRounds(s)} Runden${s.options.noEven ? ' · Ansagen dürfen nicht aufgehen' : ''}`,

  init(s) {
    const n = s.players.length;
    return { round: 1, phase: 'bid', bids: fill(n, 0), tricks: fill(n, 0), rounds: [] };
  },

  view(s) {
    const d = s.data, n = s.players.length, R = totalRounds(s);
    const tot = totals(s);
    const lead = leaders(tot);
    let running = fill(n, 0);
    const rows = d.rounds.map((r, i) => {
      running = running.map((v, p) => v + r.pts[p]);
      return {
        label: i + 1,
        cells: s.players.map((_, p) => `<span class="cell-main">${running[p]}</span><span class="cell-sub ${r.pts[p] > 0 ? 'good' : 'bad'}">${r.bids[p]}/${r.tricks[p]} · ${signed(r.pts[p])}</span>`),
      };
    });
    const table = scoreTable({
      head: s.players.map((nm, p) => esc(nm) + (lead.includes(p) && d.rounds.length ? ' 👑' : '')),
      rows,
      foot: [{ label: 'Σ', cells: tot.map(v => `<b>${v}</b>`) }],
    });
    if (d.finished) return table;

    const r = d.round, ord = order(s), dealer = (r - 1) % n;
    const bidSum = sum(d.bids), trickSum = sum(d.tricks);
    let entry;
    if (d.phase === 'bid') {
      const evenBlocked = s.options.noEven && bidSum === r;
      entry = `<div class="card entry">
        <div class="entry-head"><b>Runde ${r} von ${R}</b> · ${r} ${r === 1 ? 'Karte' : 'Karten'} · Geber: ${esc(s.players[dealer])}</div>
        <div class="entry-sub">Schritt 1: Ansagen (beginnend links vom Geber)</div>
        ${ord.map(p => `<div class="entry-row"><span class="er-name">${esc(s.players[p])}${p === dealer ? ' <small class="muted">(Geber)</small>' : ''}</span>
          ${stepper('bid', { p }, d.bids[p], { min: 0, max: r })}</div>`).join('')}
        <div class="entry-sum ${bidSum === r ? 'warn' : ''}">Angesagt: ${bidSum} von ${r} · ${bidSum > r ? 'überreizt (+' + (bidSum - r) + ')' : bidSum < r ? 'unterreizt (−' + (r - bidSum) + ')' : 'geht auf'}</div>
        ${evenBlocked ? `<div class="warn-box">Die Ansagen dürfen nicht aufgehen. ${esc(s.players[dealer])} muss anders ansagen.</div>` : ''}
        ${btn('Ansagen fertig ➜', 'bidsDone', {}, 'primary block', evenBlocked)}
      </div>`;
    } else {
      entry = `<div class="card entry">
        <div class="entry-head"><b>Runde ${r} von ${R}</b> · ${r} ${r === 1 ? 'Karte' : 'Karten'}</div>
        <div class="entry-sub">Schritt 2: Gemachte Stiche</div>
        ${ord.map(p => `<div class="entry-row"><span class="er-name">${esc(s.players[p])} <small class="muted">Ansage ${d.bids[p]}</small></span>
          ${stepper('trick', { p }, d.tricks[p], { min: 0, max: r })}
          <span class="er-pts ${d.tricks[p] === d.bids[p] ? 'good' : 'bad'}">${signed(score(d.bids[p], d.tricks[p]))}</span></div>`).join('')}
        <div class="entry-sum ${trickSum !== r ? 'warn' : 'ok'}">Stiche: ${trickSum} von ${r}${trickSum !== r ? ' – die Summe muss ' + r + ' ergeben' : ' ✓'}</div>
        <div class="row gap">${btn('← Ansagen', 'backToBids', {}, 'ghost')}${btn('Runde werten', 'scoreRound', {}, 'primary grow', trickSum !== r)}</div>
      </div>`;
    }
    return entry + table;
  },

  actions: {
    bid(s, ds) { const d = s.data; d.bids[ds.p] = Math.max(0, Math.min(d.round, d.bids[ds.p] + +ds.d)); },
    trick(s, ds) { const d = s.data; d.tricks[ds.p] = Math.max(0, Math.min(d.round, d.tricks[ds.p] + +ds.d)); },
    bidsDone(s) {
      const d = s.data;
      if (s.options.noEven && sum(d.bids) === d.round) return;
      d.phase = 'tricks';
      d.tricks = [...d.bids];
      // Bei Gesamtansage ≠ Kartenzahl ist die Vorbelegung nicht gültig – dann bei 0 starten.
      if (sum(d.tricks) !== d.round) d.tricks = d.tricks.map(() => 0);
    },
    backToBids(s) { s.data.phase = 'bid'; },
    scoreRound(s) {
      const d = s.data, n = s.players.length;
      if (sum(d.tricks) !== d.round) return;
      d.rounds.push({ bids: [...d.bids], tricks: [...d.tricks], pts: d.bids.map((b, p) => score(b, d.tricks[p])) });
      if (d.round >= totalRounds(s)) { d.finished = true; return; }
      d.round++;
      d.phase = 'bid';
      d.bids = fill(n, 0);
      d.tricks = fill(n, 0);
    },
  },

  standings: s => simpleStandings(s, totals(s), false),

  rules: `
    <p>3–6 Spieler. Es werden 60 ÷ Spieleranzahl Runden gespielt (3 Spieler: 20, 4: 15, 5: 12, 6: 10). In Runde 1 gibt es 1 Karte, in Runde 2 zwei Karten usw. Der Geber wechselt im Uhrzeigersinn.</p>
    <h3>Ablauf je Runde</h3>
    <ol><li>Alle sagen an, wie viele Stiche sie machen werden, beginnend links vom Geber.</li><li>Nach dem Ausspielen werden die tatsächlichen Stiche eingetragen.</li></ol>
    <h3>Wertung</h3>
    <ul><li>Ansage genau erfüllt: <b>20 Punkte + 10 pro Stich</b></li><li>Daneben: <b>−10 Punkte pro Stich Abweichung</b></li></ul>
    <p>Wer am Ende die meisten Punkte hat, gewinnt.</p>
    <h3>Variante</h3>
    <p>„Ansagen dürfen nicht aufgehen“: Die Summe aller Ansagen darf nicht der Kartenzahl entsprechen. So kann nie jeder seine Ansage erfüllen.</p>`,
};
