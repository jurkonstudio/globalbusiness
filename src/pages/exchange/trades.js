import { shell } from '../../components/shell.js';
import { supabase } from '../../core/supabase.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { money2, qty as fq, timeAgo } from '../../core/format.js';

export function render() {
  return shell('Exchange', 'Trades', `<div id="trades">${skeleton(4, 64)}</div>`);
}

export async function mount() {
  const el = document.getElementById('trades');
  if (!el) return;
  const { data, error } = await supabase.rpc('exchange_recent_trades', { p_resource: null, p_limit: 50 });
  if (!el.isConnected) return;
  if (error) { el.innerHTML = errorBlock('Trades could not be loaded.'); return; }
  if (!data?.length) {
    el.innerHTML = stateBlock({ icon: 'exchange', title: 'No trades yet', text: 'Trades appear here after players buy from the exchange.' });
    return;
  }
  el.innerHTML = `<div class="card"><table class="tbl" style="width:100%">
    <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Buyer</th><th>Seller</th><th>When</th></tr></thead>
    <tbody>${data.map((t) => `<tr>
      <td>${esc(t.resource_slug)}</td><td>${fq(t.qty)}</td><td>${money2(t.price)}</td>
      <td>${esc(t.buyer_name || 'Unknown')}</td><td>${esc(t.seller_name || 'Unknown')}</td>
      <td class="muted">${esc(timeAgo(t.created_at))}</td></tr>`).join('')}</tbody></table></div>`;
}
