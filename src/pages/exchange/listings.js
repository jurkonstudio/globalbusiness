import { shell } from '../../components/shell.js';
import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { esc } from '../../core/escape.js';
import { toast } from '../../components/toast.js';
import { errorBlock, skeleton, busy, classifyError } from '../../components/ui.js';
import { money2, qty as fq } from '../../core/format.js';import { resIcon } from '../../components/resourceIcons.js';


// Market panel: a resource grid by category, then a per-resource order list with a buy bar.
// Layout only; icons are emoji and the rules stay on the server (buy_from_exchange).

const EMOJI = {
  power: '⚡', water: '💧', seeds: '🌱', apples: '🍎', oranges: '🍊', grapes: '🍇', grain: '🌾',
  minerals: '💎', clay: '🏺', limestone: '🪨', sand: '🏜️', bricks: '🧱', planks: '🪵',
  timber: '🌲', flour: '🥣', juice: '🧃', bread: '🍞', glass: '🪟', cement: '🏗️', steel: '🔩',
  furniture: '🪑', windows: '🪟', machinery: '⚙️',
};
const CAT_ORDER = ['agriculture', 'food', 'raw', 'material', 'construction', 'goods', 'utility'];
const CAT_LABEL = { agriculture: 'Agriculture', food: 'Food', raw: 'Raw materials', material: 'Materials',
  construction: 'Construction', goods: 'Goods', utility: 'Utility' };

const CSS = `<style>
.ex-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:12px}
.ex-tile{background:#d9dde2;border:0;border-radius:6px;padding:10px 2px;text-align:center;font-size:22px;cursor:pointer;min-width:0}
.ex-tile small{display:block;font-size:10px;color:#2b3440;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ex-cat{font-size:15px;color:#4a5560;margin:14px 0 6px}
.ex-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;width:100%;padding:10px 12px;background:#e4e8ec;border:0;margin-bottom:2px;text-align:left;cursor:pointer;font:inherit}
.ex-row.on{background:#b8d6ee}
.ex-row .me{font-size:11px;color:#1f6fb2;margin-left:6px}
.ex-head{display:flex;align-items:center;gap:8px;justify-content:space-between;margin-bottom:10px}
.ex-bar{position:sticky;bottom:0;display:flex;gap:8px;align-items:center;padding:10px;background:#fff;border-top:1px solid #d0d5db;margin-top:10px}
.ex-bar input{width:110px;padding:8px;font:inherit}
.ex-bar .btn-sell{background:#d43c3c;color:#fff;border:0;border-radius:6px;padding:10px 14px;font:inherit;cursor:pointer}
</style>`;

let view = 'grid', selRes = null, selOrder = null, data = null;
const lastPrice = {};

export function render() {
  return shell('Exchange', 'Listings', `<div id="ex">${skeleton(4, 88)}</div>`);
}

export async function mount() {
  await load();
}

async function load() {
  const el = document.getElementById('ex');
  if (!el) return;
  const [r, o] = await Promise.all([
    supabase.from('resources').select('id, slug, name, category').order('name'),
    supabase.from('market_orders').select('id, qty, price, seller_id, seller_name, resource_id').order('price', { ascending: true }).limit(500),
  ]);
  if (!el.isConnected) return;
  if (r.error || o.error) { el.innerHTML = errorBlock('The market could not be loaded.'); return; }
  data = { res: r.data ?? [], orders: o.data ?? [], mine: state.company?.id };
  let want = null; try { want = Number(sessionStorage.getItem('ex-focus')) || null; sessionStorage.removeItem('ex-focus'); } catch { /* ignore */ }
  if (want && data.res.some((x) => x.id === want)) { selRes = want; view = 'detail'; selOrder = ordersOf(want)[0]?.id ?? null; await loadLast(want); }
  if (selRes && !data.res.some((x) => x.id === selRes)) { selRes = null; view = 'grid'; }
  if (view === 'detail' && selRes) {
    const cheapest = ordersOf(selRes)[0];
    if (!selOrder || !data.orders.some((x) => x.id === selOrder)) selOrder = cheapest?.id ?? null;
  }
  draw();
}

const ordersOf = (rid) => data.orders.filter((x) => x.resource_id === rid);
const sortedRes = () => {
  const rank = (c) => { const i = CAT_ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return [...data.res].sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
};

async function loadLast(rid) {
  const { data: t } = await supabase.rpc('exchange_recent_trades', { p_resource: rid, p_limit: 1 });
  lastPrice[rid] = t?.[0]?.price ?? null;
}

function draw() {
  const el = document.getElementById('ex');
  if (!el || !data) return;
  el.innerHTML = CSS + (view === 'grid' ? gridHtml() : detailHtml());
  wire();
}

function gridHtml() {
  const groups = {};
  for (const r of sortedRes()) (groups[r.category] ??= []).push(r);
  return Object.keys(groups).sort((a, b) => CAT_ORDER.indexOf(a) - CAT_ORDER.indexOf(b)).map((cat) => {
    const tiles = groups[cat].map((r) => {
      const os = ordersOf(r.id);
      const low = os[0] ? money2(os[0].price) : '—';
      return `<button class="ex-tile" data-r="${r.id}" aria-label="${esc(r.name)}, lowest ask ${low}">${resIcon(r.slug, 30)}<small>${low}</small></button>`;
    }).join('');
    return `<div class="ex-cat">${esc(CAT_LABEL[cat] ?? cat)}</div><div class="ex-grid">${tiles}</div>`;
  }).join('') || '<p class="muted">No resources are listed yet.</p>';
}

function detailHtml() {
  const list = sortedRes();
  const r = list.find((x) => x.id === selRes);
  if (!r) { view = 'grid'; return gridHtml(); }
  const orders = ordersOf(r.id);
  const chosen = orders.find((o) => o.id === selOrder);
  const idx = list.indexOf(r);
  const prev = list[(idx - 1 + list.length) % list.length], next = list[(idx + 1) % list.length];
  const last = lastPrice[r.id] != null ? money2(lastPrice[r.id]) : '—';
  const rows = orders.map((o) => {
    const mine = o.seller_id === data.mine;
    return `<button class="ex-row ${o.id === selOrder ? 'on' : ''}" data-o="${esc(o.id)}">
      <span>${esc(o.seller_name || 'Unknown')}${mine ? '<span class="me">(you)</span>' : ''}</span>
      <span>${fq(o.qty)}</span><span><b>${money2(o.price)}</b></span></button>`;
  }).join('') || '<p class="muted">No one is selling this right now.</p>';
  const canBuy = chosen && chosen.seller_id !== data.mine;
  return `
    <div class="ex-head">
      <button class="ex-tile" style="width:auto;padding:6px 10px;font-size:14px" data-back>‹ Resources</button>
      <button class="ex-tile" style="width:auto;padding:4px 8px;font-size:16px" data-step="-1" aria-label="Previous resource">&lt;&lt;</button>
      <span style="font-size:20px;display:inline-flex;gap:6px;align-items:center">${resIcon(r.slug, 26)} <b>${esc(r.name)}</b></span>
      <button class="ex-tile" style="width:auto;padding:4px 8px;font-size:16px" data-step="1" aria-label="Next resource">&gt;&gt;</button>
    </div>
    <p class="muted" style="margin:0 0 8px">Last trade: <b>${last}</b> · ${orders.length} order${orders.length === 1 ? '' : 's'}</p>
    <div class="ex-row" style="background:transparent;cursor:default;font-size:12px;color:#5a6470;padding-bottom:0">
      <span>Company</span><span>Quantity</span><span>Price</span></div>
    ${rows}
    <div class="ex-bar">
      <input id="ex-qty" type="number" step="0.01" min="0.01" aria-label="Quantity to buy" value="${chosen ? Number(chosen.qty) : ''}" ${canBuy ? '' : 'disabled'}>
      <button class="btn" id="ex-buy" ${canBuy ? '' : 'disabled'} style="flex:1">${canBuy ? 'BUY ' + money2(chosen.price) : 'BUY'}</button>
      <button class="btn-sell" data-sell>Sell</button>
    </div>
    <p class="muted" style="font-size:12px;margin:6px 0 0">Limit buy orders are not available yet.</p>`;
}

function wire() {
  const el = document.getElementById('ex');
  el.onclick = async (e) => {
    const t = e.target.closest('[data-r],[data-o],[data-back],[data-step],[data-sell],#ex-buy');
    if (!t) return;
    if (t.dataset.r) { selRes = Number(t.dataset.r); view = 'detail'; selOrder = ordersOf(selRes)[0]?.id ?? null; await loadLast(selRes); return draw(); }
    if (t.hasAttribute('data-back')) { view = 'grid'; return draw(); }
    if (t.dataset.step) {
      const list = sortedRes(), i = list.findIndex((x) => x.id === selRes), n = list[(i + Number(t.dataset.step) + list.length) % list.length];
      selRes = n.id; selOrder = ordersOf(selRes)[0]?.id ?? null; await loadLast(selRes); return draw();
    }
    if (t.hasAttribute('data-sell')) { location.hash = '#/marketplace/sell'; return; }
    if (t.dataset.o) { selOrder = t.dataset.o; const o = data.orders.find((x) => x.id === selOrder); const q = document.getElementById('ex-qty'); if (q && o) q.value = Number(o.qty); return draw(); }
    if (t.id === 'ex-buy') {
      const q = Number(document.getElementById('ex-qty')?.value);
      busy(t, async () => {
        const { error } = await supabase.rpc('buy_from_exchange', { p_order: selOrder, p_qty: q });
        if (error) { toast(classifyError(error).text, true); return; }
        toast('Purchase complete.');
        await load();
        window.dispatchEvent(new Event('hashchange'));
      });
    }
  };
}
