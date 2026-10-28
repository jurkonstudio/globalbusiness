import { shell } from '../../components/shell.js';
import { fetchLedger, ledgerList } from '../../components/ledger.js';
import { supabase } from '../../core/supabase.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, skeleton, metric } from '../../components/ui.js';
import { money2, qty } from '../../core/format.js';

export function render() {
  return shell('Retail', 'Sales Reports', `<div id="sr">${skeleton(3, 80)}</div>`);
}

export async function mount() {
  const el = document.getElementById('sr');
  await supabase.rpc('retail_sync');
  const { rows, error, capped } = await fetchLedger({ kinds: ['retail_sale'], limit: 1000 });
  if (!el) return;
  if (error) { el.innerHTML = errorBlock('Sales could not be loaded. Run migration 013 if this is a new database.'); return; }
  if (!rows.length) { el.innerHTML = stateBlock({ icon: 'bars', title: 'No sales yet', text: 'Put a product on sale in your Grocery Store and customers will start buying.', action: { href: '#/retail/stores', label: 'Open stores' } }); return; }

  const dayAgo = Date.now() - 86400000;
  const sum = (list) => list.reduce((a, t) => ({ n: a.n + Number(t.qty ?? 0), rev: a.rev + Number(t.amount) }), { n: 0, rev: 0 });
  const all = sum(rows), last = sum(rows.filter((t) => +new Date(t.created_at) >= dayAgo));
  const by = {};
  for (const t of rows) { const k = t.resources?.name ?? 'Other'; (by[k] ??= []).push(t); }
  const table = Object.entries(by).map(([name, list]) => ({ name, ...sum(list) })).sort((a, b) => b.rev - a.rev);

  el.innerHTML = `<div class="metrics">${metric({ label: 'Last 24 hours', value: money2(last.rev), sub: `${qty(last.n)} items` })}
      ${metric({ label: capped ? 'Latest 1,000 sales' : 'All time', value: money2(all.rev), sub: `${qty(all.n)} items` })}</div>
    <h2 class="sec">By product</h2>
    <table class="tbl"><thead><tr><th>Product</th><th>Items</th><th>Income</th><th>Avg. price</th></tr></thead><tbody>
    ${table.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${qty(r.n)}</td><td class="num">${money2(r.rev)}</td><td class="num">${money2(r.n ? r.rev / r.n : 0)}</td></tr>`).join('')}</tbody></table>
    <h2 class="sec">Latest sales</h2>${ledgerList(rows.slice(0, 20))}
    <p class="honest">Each row is a batch of customers settled by the server (when you open the game, or when it settles your stores).</p>`;
}
