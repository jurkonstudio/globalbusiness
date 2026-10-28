import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { statusChip, skeleton, errorBlock, stateBlock, busy, classifyError } from '../../components/ui.js';
import { money2, qty, duration, clock } from '../../core/format.js';
import { EMOJI, MAX_PRICE_X, perMinute, demand } from '../../components/retailCore.js';import { resIcon } from '../../components/resourceIcons.js';


export function render() {
  return shell('Retail', 'Stores', `<div id="rt">${skeleton(2, 180)}</div>`);
}

async function load() {
  const sync = await supabase.rpc('retail_sync');           // book the sales made since the last visit
  if (sync.error && /retail_sync/.test(sync.error.message)) return { missing: true };
  const [b, inv, res] = await Promise.all([
    supabase.from('buildings')
      .select('id, level, region_id, slot, build_finish_at, upgrade_finish_at, upgrade_to, building_types!inner(slug, name), store_listings(resource_id, price, sold_total, revenue_total, last_sold_at)')
      .eq('building_types.slug', 'grocery-store').order('created_at'),
    supabase.from('inventory').select('resource_id, quantity'),
    supabase.from('resources').select('id, slug, name, base_price, retail_ref').eq('retail_ok', true).order('name'),
  ]);
  const error = b.error || inv.error || res.error;
  return { error, sold: Number(sync.data?.sold ?? 0), revenue: Number(sync.data?.revenue ?? 0),
    stores: b.data ?? [], stock: Object.fromEntries((inv.data ?? []).map((x) => [x.resource_id, Number(x.quantity)])), products: res.data ?? [] };
}

export async function mount() {
  const el = document.getElementById('rt');
  let first = true, poll;

  async function draw() {
    const d = await load();
    if (!el?.isConnected) return clearInterval(poll);
    if (d.missing) { el.innerHTML = stateBlock({ icon: 'store', title: 'Retail is not installed yet', text: 'Run migration 013 in Supabase to enable Grocery Stores.' }); return; }
    if (d.error) { el.innerHTML = errorBlock('Your stores could not be loaded.'); return; }
    if (d.sold > 0) {
      if (!first) toast(`Customers bought ${qty(d.sold)} items for ${money2(d.revenue)}`);
      window.dispatchEvent(new Event('hashchange'));          // refresh cash in the top bar and the tutorial card
    }
    first = false;
    if (!d.stores.length) {
      el.innerHTML = stateBlock({ icon: 'store', title: 'You have no store yet',
        text: 'Build a Grocery Store on a free plot. It sells the fruit and grain from your warehouse to customers, even while you are away.',
        action: { href: state.company?.level >= 1 ? '#/map/world' : '#/buildings/construction', label: state.company?.level >= 1 ? 'Build on the map' : 'See buildings' } });
      return;
    }
    const keep = el.querySelector('input:focus')?.id;
    el.innerHTML = `<div class="bgrid">${d.stores.map((s, i) => storeCard(s, i, d)).join('')}</div>`
      + '<p class="honest">Each product on the shelf sells 4 items per minute per store level at the reference price. Lower prices sell faster, higher prices slower, and at double the reference price nobody buys. Stock comes from your warehouse; with no stock there are no sales. Sales are counted on the server, so the store keeps selling while you are away (up to 24 hours per visit).</p>';
    if (keep) el.querySelector('#' + keep)?.focus();
    wire(d);
  }

  function storeCard(s, i, d) {
    const lvl = s.level ?? 1, now = Date.now();
    const building = s.build_finish_at && new Date(s.build_finish_at) > now;
    const upgrading = !!s.upgrade_finish_at;
    const head = `<div class="hd"><h3>Grocery Store ${d.stores.length > 1 ? i + 1 : ''} <span class="muted" style="font-weight:500">LVL ${lvl}</span></h3>
      ${building ? statusChip('Under construction', 'info') : upgrading ? statusChip('Upgrading', 'info') : statusChip('Open', 'ok')}</div>`;
    if (building) {
      return `<div class="bcard s-build">${head}<div class="flow"><span>Opens at ${clock(s.build_finish_at)} (${duration((new Date(s.build_finish_at) - now) / 1000)} left).</span></div></div>`;
    }
    const lst = s.store_listings ?? [];
    const free = d.products.filter((p) => !lst.some((x) => x.resource_id === p.id));
    const rows = lst.map((x) => {
      const p = d.products.find((q) => q.id === x.resource_id); if (!p) return '';
      const ref = Number(p.retail_ref), price = Number(x.price), have = d.stock[p.id] ?? 0, rate = perMinute(lvl, price, ref);
      const out = have < 1;
      const perSec = rate / 60, nextMs = perSec > 0 ? new Date(x.last_sold_at).getTime() + 1000 / perSec : null;
      const lifeSec = perSec > 0 ? have / perSec : null;
      return `<div class="rt-row" data-s="${s.id}" data-r="${p.id}">
        <div class="rt-top"><b style="display:inline-flex;gap:6px;align-items:center">${resIcon(p.slug, 24)} ${esc(p.name)}</b>
          ${out ? statusChip('Out of stock', 'bad') : demand(price, ref) === 0 ? statusChip('Too expensive', 'warn') : statusChip(`≈ ${qty(rate)}/min`, 'ok')}</div>
        <div class="fld"><label for="p-${s.id}-${p.id}">Price (reference ${money2(ref)})</label>
          <input id="p-${s.id}-${p.id}" type="number" inputmode="decimal" min="0.01" max="${(ref * MAX_PRICE_X).toFixed(2)}" step="0.01" value="${price.toFixed(2)}" /></div>
        <dl class="sum"><div><dt>In warehouse</dt><dd class="num">${qty(have)}</dd></div>
          <div><dt>Sold so far</dt><dd class="num">${qty(x.sold_total)} · ${money2(x.revenue_total)}</dd></div></dl>
        ${!out && perSec > 0 ? `<p class="muted" style="margin:4px 0">Next sale in <b>${duration(Math.max(0, (nextMs - Date.now()) / 1000))}</b> · at this rate the stock lasts about <b>${duration(lifeSec)}</b></p>` : ''}
        ${out ? `<p class="why">${'⚠️'} <span>No ${esc(p.name)} in your warehouse. <a class="tag" href="#/buildings/production">Produce some</a> or <a class="tag" href="#/marketplace/buy">buy on the Market</a>.</span></p>` : ''}
        <div class="row end"><button class="btn-ghost" data-rm>Remove</button><button class="btn" data-save>Save price</button></div></div>`;
    }).join('');
    const add = free.length && lst.length < 4 ? `<div class="rt-add" data-s="${s.id}">
      <div class="fld"><label for="a-${s.id}">Add a product</label><select id="a-${s.id}">${free.map((p) => `<option value="${p.id}">${esc(p.name)} · ${qty(d.stock[p.id] ?? 0)} in stock</option>`).join('')}</select></div>
      <button class="btn" data-add>Put on sale</button></div>` : '';
    return `<div class="bcard ${lst.length ? 's-ready' : 's-idle'}">${head}
      ${lst.length ? '' : '<p class="muted" style="margin:0">The shelves are empty. Pick a product to start selling.</p>'}${rows}${add}</div>`;
  }

  function wire(d) {
    el.onclick = (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const row = btn.closest('[data-r]'), addBox = btn.closest('.rt-add');
      let rpc, args, okMsg;
      if (btn.hasAttribute('data-save') && row) {
        const price = Number(row.querySelector('input').value);
        rpc = 'set_store_listing'; args = { p_building: row.dataset.s, p_resource: Number(row.dataset.r), p_price: price }; okMsg = 'Price saved';
        const p = d.products.find((q) => q.id === Number(row.dataset.r)), max = Number(p.retail_ref) * MAX_PRICE_X;
        if (!(price > 0) || Math.abs(price * 100 - Math.round(price * 100)) > 1e-6) return toast('Enter a price above 0 with at most 2 decimals.', true);
        if (price > max) return toast(`The highest price for ${p.name} is ${money2(max)}.`, true);
      } else if (btn.hasAttribute('data-rm') && row) {
        rpc = 'remove_store_listing'; args = { p_building: row.dataset.s, p_resource: Number(row.dataset.r) }; okMsg = 'Removed from the shelf';
      } else if (btn.hasAttribute('data-add') && addBox) {
        const pid = Number(addBox.querySelector('select').value), p = d.products.find((q) => q.id === pid);
        rpc = 'set_store_listing'; args = { p_building: addBox.dataset.s, p_resource: pid, p_price: Number(p.retail_ref) }; okMsg = `${p.name} is on sale at ${money2(p.retail_ref)}`;
      } else return;
      busy(btn, async () => {
        const { error } = await supabase.rpc(rpc, args);
        if (error) { toast(classifyError(error).text, true); return; }
        toast(okMsg);
        await draw();
        window.dispatchEvent(new Event('hashchange'));
      });
    };
  }

  await draw();
  poll = setInterval(() => { if (!el.isConnected) return clearInterval(poll); if (!el.contains(document.activeElement) || document.activeElement.tagName === 'BODY') draw(); }, 20000);
}
