import { shell } from '../../components/shell.js';
import { metric, stateBlock, errorBlock, skeleton } from '../../components/ui.js';
import { fetchLedger, sumFlows, kindLabel, PAGE_CAP } from '../../components/ledger.js';
import { money, money2, signed2 } from '../../core/format.js';

const PERIODS = { '24h': { label: 'Last 24 hours', ms: 864e5 }, '7d': { label: 'Last 7 days', ms: 7 * 864e5 }, '30d': { label: 'Last 30 days', ms: 30 * 864e5 } };
let period = '24h';

export function render() {
  return shell('Headquarters', 'Statistics', `<div class="dash">
    <div class="seg wide" id="pp" role="group" aria-label="Period">${Object.entries(PERIODS).map(([k, p]) => `<button data-p="${k}">${p.label.replace('Last ', '')}</button>`).join('')}</div>
    <div id="stats">${skeleton(3, 80)}</div>
    <p class="honest">These figures are <b>cash flow</b> taken from the cash ledger: money in minus money out. They are not profit, because
      stock produced and goods or buildings you own are not valued. Asset value and history over time are not tracked by the game yet.</p>
  </div>`);
}

const breakdown = (byKind, side, total) => {
  const rows = Object.entries(byKind).filter(([, v]) => v[side] > 0).sort((a, b) => b[1][side] - a[1][side]);
  if (!rows.length) return '<p class="muted">None in this period.</p>';
  return `<ul class="feed">${rows.map(([k, v]) => `<li class="fi"><div class="tx"><b>${kindLabel(k)}</b><small>${v.n} entr${v.n === 1 ? 'y' : 'ies'}</small>
    <div class="prog" aria-hidden="true"><i style="width:${(v[side] / total * 100).toFixed(1)}%"></i></div></div>
    <span class="amt num">${money2(v[side])}</span></li>`).join('')}</ul>`;
};

export async function mount() {
  const el = document.getElementById('stats');
  const run = async () => {
    document.querySelectorAll('#pp button').forEach((b) => { b.classList.toggle('on', b.dataset.p === period); b.setAttribute('aria-pressed', String(b.dataset.p === period)); });
    el.innerHTML = skeleton(3, 80);
    const { rows, error, capped } = await fetchLedger({ since: Date.now() - PERIODS[period].ms, limit: PAGE_CAP });
    if (!document.getElementById('stats')) return;
    if (error) { el.innerHTML = errorBlock('The ledger is unavailable. If this is a new database, run migration 007 and 008.'); return; }
    if (!rows.length) { el.innerHTML = stateBlock({ icon: 'chart', title: 'No cash movements in this period', text: 'Trade, build or complete a mission and the numbers will fill in.' }); return; }
    const f = sumFlows(rows);
    el.innerHTML = `<div class="kpis k3">
      ${metric({ label: 'Money in', value: `<span class="num">${money(f.income)}</span>`, tone: 'pos', sub: PERIODS[period].label })}
      ${metric({ label: 'Money out', value: `<span class="num">${money(f.expense)}</span>`, tone: 'neg', sub: PERIODS[period].label })}
      ${metric({ label: 'Net cash flow', value: `<span class="num">${signed2(f.net)}</span>`, tone: f.net < 0 ? 'neg' : 'pos', sub: `${f.count} ledger entries` })}</div>
      ${capped ? '<p class="honest">The ledger returned its 1,000-entry limit, so older entries in this period are missing and the totals are partial.</p>' : ''}
      <section style="margin-top:1rem"><div class="sec-h"><h2>Money in, by source</h2></div>${breakdown(f.byKind, 'income', f.income || 1)}</section>
      <section style="margin-top:1rem"><div class="sec-h"><h2>Money out, by use</h2></div>${breakdown(f.byKind, 'expense', f.expense || 1)}</section>`;
  };
  document.getElementById('pp').onclick = (e) => { if (e.target.dataset.p) { period = e.target.dataset.p; run(); } };
  await run();
}
