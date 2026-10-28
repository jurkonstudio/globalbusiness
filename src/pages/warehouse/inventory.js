import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { statusChip, skeleton, errorBlock, stateBlock, openDialog, busy, classifyError } from '../../components/ui.js';
import { loadOps } from '../../core/ops.js';
import { money2, compact, qty as fq } from '../../core/format.js';

const EMOJI = { power: '⚡', water: '💧', seeds: '🌱', apples: '🍎', oranges: '🍊', grapes: '🍇', grain: '🌾',
  minerals: '💎', clay: '🏺', limestone: '🪨', sand: '🏜️', bricks: '🧱', planks: '🪵' };
const ORDER = ['agriculture', 'food', 'raw', 'construction', 'utility'];
let showAll = false;

export function render() {
  return `<div class="wh" id="inv">${skeleton(4, 120)}</div>`;
}

// Stock status has one rule, shown to the player: a resource is "Low" when you have less than ONE production run
// needs at any building you own (level x recipe input). It only applies to resources your buildings actually consume.
function requirementMap(ops) {
  const req = {};
  for (const bl of ops.buildings) {
    const lvl = bl.level ?? 1;
    for (const rc of ops.recipes.filter((r) => r.building_type_id === bl.building_types?.id))
      for (const i of rc.recipe_inputs) req[i.resource_id] = Math.max(req[i.resource_id] ?? 0, i.qty * lvl);
  }
  return req;
}

export async function mount() {
  const el = document.getElementById('inv');
  const [r, i, ops] = await Promise.all([
    supabase.from('resources').select('*').order('name'),
    supabase.from('inventory').select('resource_id, quantity'),
    loadOps().catch(() => ({ buildings: [], recipes: [] })),
  ]);
  if (!el) return;
  if (r.error || i.error) { el.innerHTML = errorBlock('Your warehouse could not be loaded. Check your connection.'); return; }
  if (!r.data?.length) { el.innerHTML = stateBlock({ icon: 'warehouse', title: 'No resources found', text: 'The game data is not installed. Run migration 002 in Supabase.' }); return; }
  const stock = Object.fromEntries((i.data ?? []).map((x) => [x.resource_id, Number(x.quantity)]));
  const req = requirementMap(ops);
  const mk = Number(state.economy?.npc_markup ?? 1.5);
  const priceOf = (x) => x.npc_sells ? x.base_price * mk : Number(x.base_price);
  const status = (x) => {
    const have = stock[x.id] ?? 0, need = req[x.id];
    if (need === undefined) return null;
    return have <= 0 ? ['Empty', 'bad'] : have < need ? ['Low', 'warn'] : ['OK', 'ok'];
  };

  const groups = {};
  for (const x of r.data) (groups[x.category] ??= []).push(x);
  const cats = Object.keys(groups).sort((a, b) => (ORDER.indexOf(a) + 99) % 99 - (ORDER.indexOf(b) + 99) % 99);

  const draw = () => {
    el.className = 'wh' + (showAll ? ' all' : '');
    el.innerHTML = cats.map((c, n) => `<section class="wh-sec">
      <div class="wh-head"><h2>${esc(c)}</h2>${n === 0 ? `<button id="toggle" aria-pressed="${showAll}">${showAll ? 'Show less' : 'Show all'}</button>` : ''}</div>
      <div class="wh-row">${groups[c].map((x) => { const st = status(x); return `<button class="tile" data-id="${x.id}" aria-label="${esc(x.name)}, ${fq(stock[x.id] ?? 0)} in stock${st ? ', ' + st[0] : ''}">
        <span class="ico" aria-hidden="true">${EMOJI[x.slug] ?? '📦'}</span><span class="pr">${money2(priceOf(x))}</span>
        <span class="qt">${compact(stock[x.id] ?? 0)}</span>${st ? `<span class="stt">${statusChip(st[0], st[1])}</span>` : ''}<span class="nm">${esc(x.name)}</span></button>`; }).join('')}</div>
      <div class="swipe" hidden><span>SWIPE</span></div></section>`).join('')
      + '<p class="honest">Status applies to resources your buildings use. <b>Low</b> means less than one production run needs. <b>Empty</b> means zero. Prices are what the NPC charges.</p>';
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
  const have = stock[x.id] ?? 0;
  const cash = Number(state.company?.cash ?? 0);
  const ratio = Number(state.economy?.npc_buy_ratio ?? 0.6);
  const buyPx = priceOf(x), sellPx = Number(x.base_price) * ratio;
  const d = openDialog({ title: x.name, sheet: true, body: `<h3>${esc(x.name)}</h3>
    <dl class="sum"><div><dt>In stock</dt><dd class="num">${fq(have)}</dd></div><div><dt>Cash</dt><dd class="num">${money2(cash)}</dd></div></dl>
    ${x.npc_sells ? `<div class="stack"><b>Buy from NPC</b>
      <div class="fld"><label for="qty">Quantity (whole units)</label><input type="number" inputmode="numeric" min="1" step="1" value="10" id="qty" />
      <span class="hint">${money2(buyPx)} each</span><span class="err" id="qerr" role="alert"></span></div>
      <button class="btn" id="buy">Buy</button></div>` : '<p class="muted">The NPC does not sell this. Produce it or trade it on the Market.</p>'}
    <div class="stack"><b>Sell to NPC</b>
      <div class="fld"><label for="sqty">Quantity (up to ${fq(have)})</label><input type="number" inputmode="decimal" min="0.01" step="0.01" max="${have}" value="${have >= 1 ? Math.min(10, Math.floor(have)) : ''}" id="sqty" ${have <= 0 ? 'disabled' : ''} />
      <span class="hint">${money2(sellPx)} each. ${have <= 0 ? 'You have none to sell.' : ''}</span><span class="err" id="serr" role="alert"></span></div>
      <button class="btn" id="sell" ${have <= 0 ? 'disabled' : ''}>Sell</button></div>
    <button class="btn-ghost" id="no">Close</button>` });
  const $ = (s) => d.box.querySelector(s);

  // Live totals on the buttons, with the reason shown when an action is not possible.
  const refresh = () => {
    if (x.npc_sells) {
      const n = Number($('#qty').value), ok = Number.isInteger(n) && n >= 1, cost = Math.round(buyPx * n * 100) / 100;
      const err = !ok ? 'Enter a whole number, 1 or more.' : cost > cash ? `Not enough cash: this costs ${money2(cost)}.` : '';
      $('#qerr').textContent = err; $('#qty').setAttribute('aria-invalid', String(!!err));
      $('#buy').disabled = !!err; $('#buy').textContent = ok ? `Buy ${fq(n)} for ${money2(cost)}` : 'Buy';
    }
    if (have > 0) {
      const n = Number($('#sqty').value), ok = Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
      const rev = Math.round(sellPx * n * 100) / 100;
      const err = !(n > 0) ? 'Enter a quantity above 0.' : !ok ? 'Use at most 2 decimals.' : n > have ? `You only have ${fq(have)}.` : '';
      $('#serr').textContent = err; $('#sqty').setAttribute('aria-invalid', String(!!err));
      $('#sell').disabled = !!err; $('#sell').textContent = !err ? `Sell ${fq(n)} for ${money2(rev)}` : 'Sell';
    }
  };
  d.box.addEventListener('input', refresh); refresh();

  d.box.onclick = (e) => {
    if (e.target.id === 'no') return d.close();
    const buying = e.target.id === 'buy', selling = e.target.id === 'sell';
    if (!buying && !selling) return;
    const n = Number($(buying ? '#qty' : '#sqty').value);
    busy(e.target, async () => {
      const { data, error } = await supabase.rpc(buying ? 'buy_from_npc' : 'sell_to_npc', { p_resource: x.id, p_qty: n });
      if (error) { const c = classifyError(error); toast(c.text, true); return; }
      d.close();
      toast(buying ? `Bought ${fq(n)} ${x.name} for ${money2(data)}` : `Sold ${fq(n)} ${x.name} for ${money2(data)}`);
      window.dispatchEvent(new Event('hashchange'));
    });
  };
}
