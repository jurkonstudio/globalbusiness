import { shell } from '../../components/shell.js';
import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { esc } from '../../core/escape.js';
import { toast } from '../../components/toast.js';
import { statusChip, skeleton, errorBlock, stateBlock, busy, classifyError } from '../../components/ui.js';
import { money2, qty as fq } from '../../core/format.js';

export function render() {
  return shell('Exchange', 'Listings', `<div id="listings">${skeleton(4, 88)}</div>`);
}

export async function mount() {
  await load();
}

async function load() {
  const el = document.getElementById('listings');
  if (!el) return;
  const { data, error } = await supabase
    .from('market_orders')
    .select('id, qty, price, seller_id, seller_name, resources(slug, name)')
    .order('price', { ascending: true })
    .limit(200);
  if (!el.isConnected) return;
  if (error) { el.innerHTML = errorBlock('Listings could not be loaded.'); return; }
  if (!data?.length) {
    el.innerHTML = stateBlock({ icon: 'exchange', title: 'No listings yet', text: 'Players have not put anything up for sale.' });
    return;
  }
  const mine = state.company?.id;
  el.innerHTML = data.map((o) => {
    const own = o.seller_id === mine;
    return `<div class="bcard">
      <div class="hd"><h3>${esc(o.resources?.name ?? '?')}</h3>${own ? statusChip('Your order', 'info') : ''}</div>
      <div class="muted">Seller: ${esc(o.seller_name || 'Unknown')}</div>
      <div>${fq(o.qty)} available at <b>${money2(o.price)}</b> each</div>
      ${own ? '' : `<form class="row" data-order="${esc(o.id)}" style="gap:8px;margin-top:8px">
        <input name="q" type="number" step="0.01" min="0.01" max="${Number(o.qty)}" value="${Number(o.qty)}" aria-label="Quantity to buy" required>
        <button class="btn" type="submit">Buy</button></form>`}
    </div>`;
  }).join('');

  el.onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    const q = Number(new FormData(form).get('q'));
    busy(btn, async () => {
      const { error: err } = await supabase.rpc('buy_from_exchange', { p_order: form.dataset.order, p_qty: q });
      if (err) { toast(classifyError(err).text, true); return; }
      toast('Purchase complete.');
      await load();
    });
  };
}
