import { shell } from '../../components/shell.js';
import { supabase } from '../../core/supabase.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { npcBuyPrice, npcSellPrice } from '../../components/market.js';
import { money2, qty as fq, dateTime } from '../../core/format.js';

// The numbers behind Exchange > Price Charts: one row per hour that had at least one trade, newest first.
// Data comes from exchange_price_history() (migration 019). Trades before that migration are not included.
const RANGES = [['24', 'Last 24 hours'], ['168', 'Last 7 days'], ['720', 'Last 30 days']];
let resource = null, hours = 168;

export function render() {
  return shell('Marketplace', 'Price history', `<div class="stack">
    <div class="row" style="gap:.6rem;flex-wrap:wrap">
      <div class="fld" style="flex:1;min-width:140px"><label for="ph-res">Resource</label><select id="ph-res"></select></div>
      <div class="fld" style="flex:1;min-width:140px"><label for="ph-range">Period</label>
        <select id="ph-range">${RANGES.map(([v, l]) => `<option value="${v}"${Number(v) === hours ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
    <div id="ph-body">${skeleton(4, 52)}</div>
    <p class="honest">Prices are what players paid on the Exchange, per unit. NPC prices are shown for comparison and are not trades.
      For a chart of the same data open <a class="tag" href="#/exchange/price-charts">Price Charts</a>.</p></div>`);
}

export async function mount() {
  const body = document.getElementById('ph-body');
  const { data: res, error } = await supabase.from('resources').select('id, slug, name, base_price, npc_sells').order('name');
  if (!body?.isConnected) return;
  if (error || !res?.length) { body.innerHTML = errorBlock('Resources could not be loaded.'); return; }
  if (!res.some((r) => r.id === resource)) resource = res[0].id;
  const sel = document.getElementById('ph-res');
  sel.innerHTML = res.map((r) => `<option value="${r.id}"${r.id === resource ? ' selected' : ''}>${esc(r.name)}</option>`).join('');

  const draw = async () => {
    body.innerHTML = skeleton(4, 52);
    const r = res.find((x) => x.id === resource);
    const { data, error: e } = await supabase.rpc('exchange_price_history', { p_resource: resource, p_hours: hours });
    if (!body.isConnected) return;
    if (e) {
      body.innerHTML = errorBlock(/exchange_price_history|schema cache|could not find/i.test(e.message)
        ? 'Price history is not installed in this database yet. Run migration 019 in Supabase.' : 'Price history could not be loaded.');
      return;
    }
    const ref = `<dl class="sum"><div><dt>NPC sells at</dt><dd class="num">${npcSellPrice(r) ? money2(npcSellPrice(r)) : 'Not sold by the NPC'}</dd></div>
      <div><dt>NPC buys at</dt><dd class="num">${money2(npcBuyPrice(r))}</dd></div></dl>`;
    if (!data?.length) {
      body.innerHTML = ref + stateBlock({ icon: 'chart', title: `No ${r.name} trades in this period`, text: 'Prices appear here after players trade this resource. You can list some yourself.', action: { href: '#/marketplace/sell', label: 'Sell something' } });
      return;
    }
    const rows = [...data].reverse();
    const vol = data.reduce((s, d) => s + Number(d.volume), 0), n = data.reduce((s, d) => s + Number(d.trades), 0);
    body.innerHTML = `${ref}<dl class="sum"><div><dt>Trades</dt><dd class="num">${n}</dd></div><div><dt>Units traded</dt><dd class="num">${fq(vol)}</dd></div></dl>
      <div class="scroll-x"><table class="tbl"><caption class="muted" style="text-align:left">${esc(r.name)}: price per unit by hour</caption>
        <thead><tr><th scope="col">Hour</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th><th scope="col">Units</th></tr></thead>
        <tbody>${rows.map((d) => `<tr><td>${dateTime(d.bucket)}</td><td class="num">${money2(d.open)}</td><td class="num">${money2(d.high)}</td>
          <td class="num">${money2(d.low)}</td><td class="num">${money2(d.close)}</td><td class="num">${fq(d.volume)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  sel.onchange = () => { resource = Number(sel.value); draw(); };
  document.getElementById('ph-range').onchange = (e) => { hours = Number(e.target.value); draw(); };
  draw();
}
