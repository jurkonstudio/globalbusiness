import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { statusChip, stateBlock, errorBlock, skeleton, openDialog, busy } from '../../components/ui.js';
import { fetchResources, twoDecimals, cents, marketError, npcSellPrice } from '../../components/market.js';
import { money2, qty as fq, timeAgo } from '../../core/format.js';

let pick = '';

export function render() {
  return shell('Market', 'Buy', `<div class="fld" style="margin-bottom:.75rem"><label for="mf">Resource</label><select id="mf"><option value="">All resources</option></select></div>
    <div id="orders">${skeleton(3, 110)}</div>`);
}

export async function mount() {
  const el = document.getElementById('orders');
  const [res, ord] = await Promise.all([fetchResources(),
    supabase.from('market_orders').select('id, seller_id, resource_id, qty, price, created_at').order('price').order('created_at').limit(200)]);
  if (!el) return;
  if (res.error || ord.error) { el.innerHTML = errorBlock('The market could not be loaded. If this is a new database, run migration 002 and 008.'); return; }
  const byId = Object.fromEntries(res.data.map((r) => [r.id, r]));
  const me = state.company.id;
  const sel = document.getElementById('mf');
  const used = [...new Set(ord.data.map((o) => o.resource_id))].map((id) => byId[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML += used.map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  if (used.some((r) => String(r.id) === pick)) sel.value = pick; else pick = '';

  const draw = () => {
    const rows = ord.data.filter((o) => !pick || String(o.resource_id) === pick);
    if (!rows.length) { el.innerHTML = stateBlock({ icon: 'buy', title: pick ? 'No orders for this resource' : 'The market is empty', text: 'Other companies have not listed anything here yet. You can list your own stock.', action: { href: '#/marketplace/sell', label: 'Sell something' } }); return; }
    el.innerHTML = `<div class="stack">${rows.map((o) => {
      const r = byId[o.resource_id], mine = o.seller_id === me, npc = r && npcSellPrice(r);
      return `<article class="order"><div class="top"><div><b>${esc(r?.name ?? 'Unknown')}</b><div class="meta"><span>${fq(o.qty)} available</span><span>${timeAgo(o.created_at)}</span>
        ${npc ? `<span>NPC sells at ${money2(npc)}</span>` : ''}</div></div><div class="px">${money2(o.price)}<small style="display:block;font:500 .72rem var(--font-body);color:#5b6672">per unit</small></div></div>
        ${mine ? statusChip('Your order', 'info') : `<button class="btn" data-buy="${o.id}">Buy</button>`}</article>`;
    }).join('')}</div><p class="honest">Orders are sorted by lowest price. Totals are fixed by the server when you confirm.</p>`;
  };
  sel.onchange = () => { pick = sel.value; draw(); };
  draw();

  el.onclick = (e) => {
    const id = e.target.closest('[data-buy]')?.dataset.buy;
    if (id) openBuy(ord.data.find((o) => o.id === id), byId[ord.data.find((o) => o.id === id).resource_id]);
  };
}

function openBuy(o, r) {
  const cash = Number(state.company.cash), max = Number(o.qty), px = Number(o.price);
  const d = openDialog({ title: `Buy ${r?.name ?? ''}`, sheet: true, body: `<h3>Buy ${esc(r?.name ?? '')}</h3>
    <div class="fld"><label for="bq">Quantity (up to ${fq(max)})</label>
      <input id="bq" type="number" inputmode="decimal" min="0.01" max="${max}" step="0.01" value="${Math.min(max, 10)}" />
      <span class="err" id="be" role="alert"></span></div>
    <dl class="sum"><div><dt>Price per unit</dt><dd class="num">${money2(px)}</dd></div><div><dt>Total</dt><dd class="num" id="bt"></dd></div>
      <div><dt>Cash now</dt><dd class="num">${money2(cash)}</dd></div><div class="tot"><dt>Cash after</dt><dd class="num" id="ba"></dd></div></dl>
    <div class="row end"><button class="btn-ghost" id="bc">Cancel</button><button class="btn" id="bg">Confirm purchase</button></div>` });
  const $ = (s) => d.box.querySelector(s);
  const refresh = () => {
    const n = Number($('#bq').value), total = cents(n * px);
    const err = !(n >= 0.01) ? 'Enter at least 0.01.' : !twoDecimals(n) ? 'Use at most 2 decimals.' : n > max ? `Only ${fq(max)} available.` : total > cash ? `Not enough cash. You are short by ${money2(total - cash)}.` : '';
    $('#be').textContent = err; $('#bq').setAttribute('aria-invalid', String(!!err));
    $('#bt').textContent = err && !(n >= 0.01) ? '-' : money2(total); $('#ba').textContent = err && !(n >= 0.01) ? '-' : money2(cash - total);
    $('#bg').disabled = !!err;
  };
  d.box.addEventListener('input', refresh); refresh();
  $('#bc').onclick = d.close;
  $('#bg').onclick = (e) => busy(e.currentTarget, async () => {
    const n = Number($('#bq').value);
    const { data, error } = await supabase.rpc('buy_from_exchange', { p_order: o.id, p_qty: n });
    if (error) {
      const c = marketError(error); toast(c.text, true);
      if (c.kind === 'gone') { d.close(); window.dispatchEvent(new Event('hashchange')); }
      return;
    }
    d.close(); toast(`Bought ${fq(n)} ${r?.name ?? ''} for ${money2(data)}`); window.dispatchEvent(new Event('hashchange'));
  });
}
