import { supabase } from '../../core/supabase.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, skeleton, confirmDialog, busy } from '../../components/ui.js';
import { fetchResources, twoDecimals, cents, marketError, npcBuyPrice } from '../../components/market.js';
import { money2, qty as fq } from '../../core/format.js';

export function render() {
  return shell('Market', 'Sell', `<div id="sell">${skeleton(2, 90)}</div>`);
}

export async function mount() {
  const el = document.getElementById('sell');
  const [res, inv] = await Promise.all([fetchResources(), supabase.from('inventory').select('resource_id, quantity')]);
  if (!el) return;
  if (res.error || inv.error) { el.innerHTML = errorBlock('Your stock could not be loaded.'); return; }
  const byId = Object.fromEntries(res.data.map((r) => [r.id, r]));
  const have = (inv.data ?? []).map((x) => ({ r: byId[x.resource_id], q: Number(x.quantity) })).filter((x) => x.r && x.q >= 0.01).sort((a, b) => a.r.name.localeCompare(b.r.name));
  if (!have.length) { el.innerHTML = stateBlock({ icon: 'sell', title: 'You have nothing to sell', text: 'Produce or buy goods first. Stock listed on the market leaves your warehouse until it sells or you cancel.', action: { href: '#/buildings/production', label: 'Open production' } }); return; }

  el.innerHTML = `<form class="stack" id="sf" novalidate onsubmit="return false">
    <div class="fld"><label for="sr">Resource</label><select id="sr">${have.map((x) => `<option value="${x.r.id}">${esc(x.r.name)} (${fq(x.q)} in stock)</option>`).join('')}</select></div>
    <div class="fld"><label for="sq">Quantity</label><input id="sq" type="number" inputmode="decimal" min="0.01" step="0.01" value="1" /><span class="hint" id="sqh"></span><span class="err" id="sqe" role="alert"></span></div>
    <div class="fld"><label for="sp">Price per unit ($)</label><input id="sp" type="number" inputmode="decimal" min="0.01" max="1000000" step="0.01" /><span class="hint" id="sph"></span><span class="err" id="spe" role="alert"></span></div>
    <dl class="sum"><div class="tot"><dt>You would receive if all sells</dt><dd class="num" id="st">-</dd></div></dl>
    <button class="btn" id="sgo">Review listing</button></form>
    <p class="honest">Listed stock is removed from your warehouse right away. Buyers pay you in cash when they buy. You can cancel an order in My orders to get the remaining stock back.</p>`;
  const $ = (id) => document.getElementById(id);
  const cur = () => have.find((x) => String(x.r.id) === $('sr').value);

  const refresh = (changedResource) => {
    const x = cur(), npc = npcBuyPrice(x.r);
    if (changedResource) { $('sp').value = String(npc > 0 ? npc.toFixed(2) : ''); $('sq').max = String(x.q); }
    $('sqh').textContent = `Up to ${fq(x.q)}`;
    $('sph').textContent = `The NPC buys instantly at ${money2(npc)} each. List above that to earn more.`;
    const n = Number($('sq').value), p = Number($('sp').value);
    const qe = !(n >= 0.01) ? 'Enter at least 0.01.' : !twoDecimals(n) ? 'Use at most 2 decimals.' : n > x.q ? `You only have ${fq(x.q)}.` : '';
    const pe = !(p >= 0.01) ? 'Enter a price of at least $0.01.' : !twoDecimals(p) ? 'Use at most 2 decimals.' : p > 1000000 ? 'Maximum price is $1,000,000.' : '';
    $('sqe').textContent = qe; $('spe').textContent = pe;
    $('sq').setAttribute('aria-invalid', String(!!qe)); $('sp').setAttribute('aria-invalid', String(!!pe));
    $('st').textContent = qe || pe ? '-' : money2(cents(n * p));
    $('sgo').disabled = !!(qe || pe);
    return { x, n, p, npc, ok: !(qe || pe) };
  };
  $('sr').onchange = () => refresh(true);
  $('sf').addEventListener('input', () => refresh(false));
  refresh(true);

  $('sgo').onclick = async (e) => {
    const btn = e.currentTarget;   // currentTarget is cleared after the first await, so keep it now
    const { x, n, p, npc, ok } = refresh(false);
    if (!ok) return;
    const yes = await confirmDialog({ title: 'List on the market', confirmLabel: 'List for sale',
      rows: [['Resource', esc(x.r.name)], ['Quantity', fq(n)], ['Price per unit', money2(p)], ['Total if all sells', `<b>${money2(cents(n * p))}</b>`]],
      note: p < npc ? `The NPC would pay ${money2(npc)} each right now, which is more than your price.` : 'This stock leaves your warehouse until it sells or you cancel.' });
    if (!yes) return;
    busy(btn, async () => {
      const { error } = await supabase.rpc('list_on_exchange', { p_resource: x.r.id, p_qty: n, p_price: p });
      if (error) { toast(marketError(error).text, true); return; }
      toast(`Listed ${fq(n)} ${x.r.name} at ${money2(p)} each`);
      location.hash = '#/marketplace/my-orders';
    });
  };
}
