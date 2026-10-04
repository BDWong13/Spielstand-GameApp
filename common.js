// Gemeinsame Bausteine: Kartenrechner (Strafpunkte aus Handkarten zusammenzählen).
import { esc, btn, sum } from './util.js';

export const CARDSETS = {
  phase10: [
    { label: '1–9', v: 5 }, { label: '10–12', v: 10 },
    { label: 'Aussetzen', v: 15 }, { label: 'Joker', v: 25 },
  ],
  romme: [
    ...[2, 3, 4, 5, 6, 7, 8, 9].map(v => ({ label: String(v), v })),
    { label: '10 / B / D / K', v: 10 }, { label: 'Ass', v: 11 }, { label: 'Joker', v: 20 },
  ],
};

export const calcButton = (field, p) => btn('🧮', 'calcOpen', { field, p }, 'calc-btn');

export function calcOverlay(s, set) {
  const c = s.ui.calc;
  if (!c) return '';
  const total = sum(c.items);
  return `<div class="sheet-backdrop" data-a="calcClose"></div>
  <div class="sheet">
    <div class="sheet-title">${esc(s.players[c.p])}: ${esc(c.title || 'Kartenwerte')}</div>
    <div class="calc-total">${total}</div>
    <div class="calc-items">${c.items.length ? c.items.join(' + ') : 'Tippe die Karten an'}</div>
    <div class="calc-grid">${set.map(k => btn(`<b>${esc(k.label)}</b><small>${k.v}</small>`, 'calcAdd', { v: k.v }, 'calc-key')).join('')}</div>
    <div class="row gap">
      ${btn('⌫', 'calcPop', {}, 'ghost')}
      ${btn('Leeren', 'calcClear', {}, 'ghost')}
      ${btn(`${total} übernehmen`, 'calcApply', {}, 'primary grow')}
    </div>
  </div>`;
}

// Erwartet, dass das Spiel seine Eingaben in s.data.entry[field][p] hält.
export const calcActions = {
  calcOpen(s, ds) { s.ui.calc = { field: ds.field, p: +ds.p, items: [], title: ds.title }; },
  calcAdd(s, ds) { s.ui.calc.items.push(+ds.v); },
  calcPop(s) { s.ui.calc.items.pop(); },
  calcClear(s) { s.ui.calc.items = []; },
  calcClose(s) { s.ui.calc = null; },
  calcApply(s) {
    const c = s.ui.calc;
    s.data.entry[c.field][c.p] = sum(c.items);
    s.ui.calc = null;
  },
};
