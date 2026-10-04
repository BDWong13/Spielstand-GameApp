// Kleine Helfer, die von App-Kern und allen Spielen genutzt werden.

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sum = arr => arr.reduce((a, b) => a + (Number(b) || 0), 0);
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
export const fill = (n, v) => Array.from({ length: n }, () => (typeof v === 'function' ? v() : v));
export const signed = n => (n > 0 ? '+' + n : String(n));

export function dataAttrs(o = {}) {
  return Object.entries(o).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
}

export function btn(label, action, ds = {}, cls = '', disabled = false) {
  return `<button type="button" class="${cls}" data-a="${action}"${dataAttrs(ds)}${disabled ? ' disabled' : ''}>${label}</button>`;
}

export function stepper(action, ds, value, { min = -Infinity, max = Infinity } = {}) {
  return `<div class="stepper">
    ${btn('−', action, { ...ds, d: -1 }, 'step', value <= min)}
    <span class="step-val">${value}</span>
    ${btn('+', action, { ...ds, d: 1 }, 'step', value >= max)}
  </div>`;
}

export function numInput(input, ds, value, { placeholder = '0', allowNeg = false } = {}) {
  return `<input class="num" type="text" inputmode="${allowNeg ? 'text' : 'numeric'}" pattern="${allowNeg ? '-?[0-9]*' : '[0-9]*'}"
    autocomplete="off" placeholder="${placeholder}" value="${value ? esc(value) : ''}" data-in="${input}"${dataAttrs(ds)}>`;
}

export const parseNum = v => {
  const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
};

// Tabelle mit Runden als Zeilen, Spielern als Spalten.
export function scoreTable({ corner = 'Rd.', head, rows, foot = [] }) {
  const row = (r, tag) => `<tr${r.cls ? ` class="${r.cls}"` : ''}><th>${r.label}</th>${r.cells
    .map((c, i) => `<${tag}${r.cellCls?.[i] ? ` class="${r.cellCls[i]}"` : ''}>${c}</${tag}>`).join('')}</tr>`;
  return `<div class="table-wrap" data-keep-scroll="tbl"><table class="score">
    <thead><tr><th>${corner}</th>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(r => row(r, 'td')).join('') : `<tr class="empty"><th></th><td colspan="${head.length}">Noch keine Runde gespielt</td></tr>`}</tbody>
    ${foot.length ? `<tfoot>${foot.map(r => row(r, 'td')).join('')}</tfoot>` : ''}
  </table></div>`;
}

// Index des/der Besten (für Hervorhebung von Führenden).
export function leaders(values, lowWins = false) {
  if (!values.length) return [];
  const best = lowWins ? Math.min(...values) : Math.max(...values);
  return values.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
}

// Sortiert Spieler nach Punkten, liefert Standings-Einträge für den Gewinner-Bildschirm.
export function simpleStandings(s, totals, lowWins, unit = 'Pkt.') {
  return s.players
    .map((name, p) => ({ p, key: totals[p], text: `${totals[p]} ${unit}` }))
    .sort((a, b) => (lowWins ? a.key - b.key : b.key - a.key));
}
