import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { toast } from '../../components/toast.js';

const EMOJI = { power: '⚡', water: '💧', seeds: '🌱', apples: '🍎', oranges: '🍊', grapes: '🍇', grain: '🌾',
  minerals: '💎', clay: '🏺', limestone: '🪨', sand: '🏜️', bricks: '🧱', planks: '🪵' };
const ORDER = ['agriculture', 'food', 'raw', 'construction', 'utility'];
const compact = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : String(n);
const price = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let showAll = false;

export function render() {
  return '<div class="wh" id="inv">Loading…</div>';
}

export async function mount() {
  const el = document.getElementById('inv');
  const [r, i] = await Promise.all([
    supabase.from('resources').select('*').order('name'),
    supabase.from('inventory').select('resource_id, quantity'),
  ]);
  if (r.error || !r.data?.length) { el.textContent = 'No resources found. Run migration 002.'; return; }
  const stock = Object.fromEntries((i.data ?? []).map((x) => [x.resource_id, Number(x.quantity)]));
  const mk = Number(state.economy?.npc_markup ?? 1.5);
  const priceOf = (x) => x.npc_sells ? x.base_price * mk : Number(x.base_price);

  const groups = {};
  for (const x of r.data) (groups[x.category] ??= []).push(x);
  const cats = Object.keys(groups).sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);

  const draw = () => {
    el.className = 'wh' + (showAll ? ' all' : '');
    el.innerHTML = cats.map((c, n) => `<section class="wh-sec">
      <div class="wh-head"><h2>${c}</h2>${n === 0 ? `<button id="toggle">${showAll ? 'Show less' : 'Show all'}</button>` : ''}</div>
      <div class="wh-row">${groups[c].map((x) => `<button class="tile" data-id="${x.id}">
        <span class="ico">${EMOJI[x.slug] ?? '📦'}</span><span class="pr">${price(priceOf(x))}</span>
        <span class="qt">${compact(stock[x.id] ?? 0)}</span><span class="nm">${x.name}</span></button>`).join('')}</div>
      <div class="swipe" hidden><span>SWIPE</span></div></section>`).join('');
    el.querySelectorAll('.wh-sec').forEach((sec) => {
      const row = sec.querySelector('.wh-row'), hint = sec.querySelector('.swipe');
      const upd = () => { hint.hidden = showAll || row.scrollWidth <= row.clientWidth + 4 || row.scrollLeft > 8; };
      row.onscroll = upd; upd();
    });
  };
  draw();

  el.onclick = (e) => {
    if (e.target.id === 'toggle') { showAll = !showAll; return draw(); }
    const t = e.target.closest('.tile');
    if (t) sheet(r.data.find((x) => x.id === Number(t.dataset.id)), stock, priceOf);
  };
}

function sheet(x, stock, priceOf) {
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box"><h3>${x.name}</h3>
    <p class="muted">In stock: <b>${(stock[x.id] ?? 0).toLocaleString()}</b> · ${price(priceOf(x))} each</p>
    ${x.npc_sells ? `<div class="row"><input type="number" min="1" value="10" id="qty" style="width:100px" />
      <button class="btn" id="buy">Buy</button></div>` : '<p class="muted">Not sold by the NPC. Produce it or trade it on the Exchange.</p>'}
    <button class="btn-ghost" id="no">Close</button></div>`;
  document.body.appendChild(m);
  m.onclick = async (e) => {
    if (e.target === m || e.target.id === 'no') return m.remove();
    if (e.target.id !== 'buy') return;
    e.target.disabled = true;
    const { data, error } = await supabase.rpc('buy_from_npc', { p_resource: x.id, p_qty: Number(m.querySelector('#qty').value) });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    m.remove();
    toast(`Bought for $${data}`);
    window.dispatchEvent(new Event('hashchange'));
  };
}
