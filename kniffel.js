// Kniffel: klassischer Block mit Bonus ab 63 Punkten oben.
import { esc, btn, sum } from '../util.js';

const UPPER = [1, 2, 3, 4, 5, 6].map(v => ({ k: 'u' + v, label: ['Einser', 'Zweier', 'Dreier', 'Vierer', 'Fünfer', 'Sechser'][v - 1], face: v }));
const LOWER = [
  { k: 'p3', label: 'Dreierpasch', sum: true },
  { k: 'p4', label: 'Viererpasch', sum: true },
  { k: 'fh', label: 'Full House', fixed: 25 },
  { k: 'ks', label: 'Kleine Straße', fixed: 30 },
  { k: 'gs', label: 'Große Straße', fixed: 40 },
  { k: 'kn', label: 'Kniffel', fixed: 50 },
  { k: 'ch', label: 'Chance', sum: true },
];
const ALL = [...UPPER, ...LOWER];
const CAT = Object.fromEntries(ALL.map(c => [c.k, c]));

function calc(sheet, extra) {
  const upper = sum(UPPER.map(c => sheet[c.k]));
  const bonus = upper >= 63 ? 35 : 0;
  const lower = sum(LOWER.map(c => sheet[c.k])) + extra * 50;
  return { upper, bonus, upperTotal: upper + bonus, lower, total: upper + bonus + lower };
}
const filled = sheet => ALL.filter(c => sheet[c.k] != null).length;
const currentPlayer = s => {
  const f = s.data.sheets.map(filled);
  const min = Math.min(...f);
  return f.indexOf(min);
};

function choices(c) {
  if (c.face) return [0, 1, 2, 3, 4, 5].map(k => k * c.face);
  if (c.fixed) return [c.fixed, 0];
  return [0, ...Array.from({ length: 26 }, (_, i) => i + 5)];
}

export default {
  id: 'kniffel',
  name: 'Kniffel',
  icon: '🎲',
  tagline: 'Der klassische Würfelblock',
  minPlayers: 1,
  maxPlayers: 8,
  options: [
    { key: 'extraKniffel', label: 'Bonus für weitere Kniffel (+50)', type: 'toggle', default: false, hint: 'Hausregel: Jeder weitere Kniffel bringt 50 Extrapunkte, wenn das Kniffel-Feld schon mit 50 belegt ist.' },
  ],

  init(s) {
    return { sheets: s.players.map(() => ({})), extra: s.players.map(() => 0) };
  },

  view(s) {
    const d = s.data, cur = d.finished ? -1 : currentPlayer(s);
    const res = d.sheets.map((sh, p) => calc(sh, d.extra[p]));
    const best = Math.max(...res.map(r => r.total));
    const cell = (p, c) => {
      const v = d.sheets[p][c.k];
      const sel = s.ui.sel && s.ui.sel.p === p && s.ui.sel.k === c.k;
      const cnt = c.face && v ? `<small class="muted"> (${v / c.face}×)</small>` : '';
      return `<td class="kn-cell${v === 0 ? ' struck' : ''}${sel ? ' sel' : ''}${p === cur ? ' cur' : ''}" data-a="pick" data-p="${p}" data-k="${c.k}">${v == null ? '' : v === 0 ? '—' : v + cnt}</td>`;
    };
    const sumRow = (label, f, cls = '') => `<tr class="sum ${cls}"><th>${label}</th>${res.map(f).map(v => `<td>${v}</td>`).join('')}</tr>`;
    const head = s.players.map((nm, p) => `<th class="${p === cur ? 'active' : ''}">${esc(nm)}</th>`).join('');
    const table = `<div class="table-wrap" data-keep-scroll="tbl"><table class="score kniffel">
      <thead><tr><th></th>${head}</tr></thead>
      <tbody>
        ${UPPER.map(c => `<tr><th>${c.label}</th>${s.players.map((_, p) => cell(p, c)).join('')}</tr>`).join('')}
        ${sumRow('Summe oben', r => `${r.upper}<small class="muted">/63</small>`)}
        ${sumRow('Bonus (ab 63)', r => (r.bonus ? '+35' : '–'))}
        ${sumRow('Gesamt oben', r => r.upperTotal, 'strong')}
        ${LOWER.map(c => `<tr><th>${c.label}${c.fixed ? ` <small class="muted">(${c.fixed})</small>` : ''}</th>${s.players.map((_, p) => cell(p, c)).join('')}</tr>`).join('')}
        ${s.options.extraKniffel ? `<tr><th>Bonus-Kniffel</th>${d.extra.map((x, p) => `<td class="kn-cell" data-a="pickExtra" data-p="${p}">${x ? '+' + x * 50 : ''}</td>`).join('')}</tr>` : ''}
        ${sumRow('Gesamt unten', r => r.lower, 'strong')}
        ${sumRow('Endsumme', r => `${r.total}${r.total === best && r.total > 0 ? ' 👑' : ''}`, 'total')}
      </tbody></table></div>`;

    let picker = '';
    const sel = s.ui.sel;
    if (sel) {
      const c = CAT[sel.k];
      const cur = d.sheets[sel.p][sel.k];
      const opts = choices(c);
      picker = `<div class="sheet-backdrop" data-a="pickClose"></div><div class="sheet">
        <div class="sheet-title">${esc(s.players[sel.p])}: ${c.label}</div>
        ${c.face ? `<div class="muted small center">Wie viele Würfel zeigen eine ${c.face}? Die Punkte rechnet die App aus.</div>` : c.sum ? '<div class="muted small center">Augensumme aller 5 Würfel</div>' : ''}
        ${c.face
          ? `<div class="pick-grid count">${opts.map((v, k) => btn(`<b>${k} ×</b><small>${k === 0 ? 'streichen' : `= ${v} Pkt.`}</small>`, 'setVal', { v }, 'key count-key' + (v === cur && cur != null ? ' on' : ''))).join('')}</div>`
          : `<div class="pick-grid ${c.sum ? 'dense' : ''}">${opts.map(v => btn(v === 0 ? 'Streichen (0)' : String(v), 'setVal', { v }, 'key' + (v === cur ? ' on' : '') + (v === 0 ? ' wide muted' : ''))).join('')}</div>`}
        <div class="row gap">${cur != null ? btn('Eintrag löschen', 'clearVal', {}, 'ghost grow') : ''}${btn('Abbrechen', 'pickClose', {}, 'ghost grow')}</div>
      </div>`;
    }
    if (s.ui.selExtra != null) {
      const p = s.ui.selExtra;
      picker = `<div class="sheet-backdrop" data-a="pickClose"></div><div class="sheet">
        <div class="sheet-title">${esc(s.players[p])}: weitere Kniffel</div>
        <div class="pick-grid">${[0, 1, 2, 3, 4].map(k => btn(`${k} × 50`, 'setExtra', { k }, 'key' + (k === d.extra[p] ? ' on' : ''))).join('')}</div>
        ${btn('Abbrechen', 'pickClose', {}, 'ghost block')}
      </div>`;
    }
    const hint = d.finished ? '' : `<div class="info-line">Am Zug: <b>${esc(s.players[cur])}</b> · Feld antippen zum Eintragen</div>`;
    return hint + table + picker;
  },

  actions: {
    pick(s, ds) { s.ui.sel = { p: +ds.p, k: ds.k }; s.ui.selExtra = null; },
    pickExtra(s, ds) { s.ui.selExtra = +ds.p; s.ui.sel = null; },
    pickClose(s) { s.ui.sel = null; s.ui.selExtra = null; },
    setVal(s, ds) {
      const { p, k } = s.ui.sel;
      s.data.sheets[p][k] = +ds.v;
      s.ui.sel = null;
      if (s.data.sheets.every(sh => filled(sh) === ALL.length)) s.data.finished = true;
    },
    clearVal(s) {
      const { p, k } = s.ui.sel;
      delete s.data.sheets[p][k];
      s.ui.sel = null;
    },
    setExtra(s, ds) { s.data.extra[s.ui.selExtra] = +ds.k; s.ui.selExtra = null; },
  },

  standings(s) {
    const tot = s.data.sheets.map((sh, p) => calc(sh, s.data.extra[p]).total);
    return s.players.map((_, p) => ({ p, key: tot[p], text: `${tot[p]} Pkt.` })).sort((a, b) => b.key - a.key);
  },

  rules: `
    <p>Beliebig viele Spieler. Jeder hat pro Zug bis zu 3 Würfe mit 5 Würfeln und muss danach genau ein Feld eintragen oder streichen (0). Nach 13 Runden ist der Block voll.</p>
    <h3>Oberer Block</h3>
    <p>Einser bis Sechser: Summe der Würfel mit dieser Augenzahl. In der App gibst du nur die <b>Anzahl der Würfel</b> ein (z. B. 3 × Vierer), die Punkte (12) werden automatisch berechnet. Ab <b>63 Punkten</b> oben gibt es <b>35 Bonuspunkte</b> (das entspricht drei gleichen Würfeln pro Zahl).</p>
    <h3>Unterer Block</h3>
    <ul>
      <li><b>Dreierpasch:</b> mind. 3 gleiche – Summe aller Augen</li>
      <li><b>Viererpasch:</b> mind. 4 gleiche – Summe aller Augen</li>
      <li><b>Full House:</b> 3 gleiche + 2 gleiche – 25 Punkte</li>
      <li><b>Kleine Straße:</b> 4 aufeinanderfolgende – 30 Punkte</li>
      <li><b>Große Straße:</b> 5 aufeinanderfolgende – 40 Punkte</li>
      <li><b>Kniffel:</b> 5 gleiche – 50 Punkte</li>
      <li><b>Chance:</b> beliebig – Summe aller Augen</li>
    </ul>
    <p>Die App zeigt an, wer am Zug ist, und bietet für jedes Feld nur gültige Werte an.</p>`,
};
