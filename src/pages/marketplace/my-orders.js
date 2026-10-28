import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, skeleton, confirmDialog, busy } from '../../components/ui.js';
import { fetchResources, cents, marketError } from '../../components/market.js';
import { money2, qty as fq, timeAgo } from '../../core/format.js';

export function render() {
  return shell('Market', 'My orders', `<div id="mo">${skeleton(2, 100)}</div>`);
}

export async function mount() {
  const el = document.getElementById('mo');
  const [res, ord] = await Promise.all([fetchResources(),
    supabase.from('market_orders').select('id, resource_id, qty, price, created_at').eq('seller_id', state.company.id).order('created_at', { ascending: false })]);
  if (!el) return;
  if (res.error || ord.error) { el.innerHTML = errorBlock('Your orders could not be loaded.'); return; }
  const byId = Object.fromEntries(res.data.map((r) => [r.id, r]));
  if (!ord.data.length) { el.innerHTML = stateBlock({ icon: 'orders', title: 'You have no open orders', text: 'List stock on the market and it will appear here until it sells.', action: { href: '#/marketplace/sell', label: 'Sell something' } }); return; }
  const open = cents(ord.data.reduce((s, o) => s + Number(o.qty) * Number(o.price), 0));
  el.innerHTML = `<dl class="sum" style="margin-bottom:.75rem"><div><dt>Open orders</dt><dd class="num">${ord.data.length}</dd></div><div><dt>Value if everything sells</dt><dd class="num">${money2(open)}</dd></div></dl>
    <div class="stack">${ord.data.map((o) => { const r = byId[o.resource_id];
      return `<article class="order"><div class="top"><div><b>${esc(r?.name ?? 'Unknown')}</b><div class="meta"><span>${fq(o.qty)} left</span><span>Listed ${timeAgo(o.created_at)}</span></div></div>
        <div class="px">${money2(o.price)}<small style="display:block;font:500 .72rem var(--font-body);color:#5b6672">per unit</small></div></div>
        <button class="btn-ghost" data-cancel="${o.id}">Cancel order</button></article>`; }).join('')}</div>
    <p class="honest">Sales are paid straight to your cash. See them in the <a href="#/banking/transactions" class="tag">cash ledger</a>. Cancelling returns the remaining stock to your warehouse.</p>`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    const o = ord.data.find((x) => x.id === b.dataset.cancel), r = byId[o.resource_id];
    const yes = await confirmDialog({ title: 'Cancel this order?', confirmLabel: 'Cancel order', cancelLabel: 'Keep it', danger: true,
      rows: [['Resource', esc(r?.name ?? '')], ['Returned to warehouse', fq(o.qty)], ['Listed price', money2(o.price)]] });
    if (!yes) return;
    busy(b, async () => {
      const { data, error } = await supabase.rpc('cancel_exchange_order', { p_order: o.id });
      if (error) { toast(marketError(error).text, true); window.dispatchEvent(new Event('hashchange')); return; }
      toast(`Order cancelled. ${fq(data)} ${r?.name ?? ''} returned to your warehouse.`);
      window.dispatchEvent(new Event('hashchange'));
    });
  };
}
