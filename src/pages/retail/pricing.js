import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { money2, qty } from '../../core/format.js';
import { EMOJI, perMinute, demand } from '../../components/retailCore.js';

export function render() {
  return shell('Retail', 'Pricing', `<div id="pr">${skeleton(3, 80)}</div>`);
}

const STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.9];

export async function mount() {
  const el = document.getElementById('pr');
  const { data, error } = await supabase.from('resources').select('id, slug, name, base_price, retail_ref').eq('retail_ok', true).order('name');
  if (!el) return;
  if (error) { el.innerHTML = errorBlock('Prices could not be loaded.'); return; }
  if (!data?.length) { el.innerHTML = stateBlock({ icon: 'store', title: 'No retail products yet', text: 'Run migration 013 in Supabase.' }); return; }
  const ratio = Number(state.economy?.npc_buy_ratio ?? 0.6);
  el.innerHTML = `<p class="muted" style="margin-top:0">Customers compare your price to the <b>reference price</b>. Lower sells faster, higher sells slower. Numbers below are for one store at level 1; multiply by your store level.</p>
    ${data.map((p) => {
      const ref = Number(p.retail_ref);
      return `<div class="bcard s-idle" style="margin-bottom:.75rem"><div class="hd"><h3>${EMOJI[p.slug] ?? '📦'} ${esc(p.name)}</h3></div>
        <dl class="sum"><div><dt>Reference price</dt><dd class="num">${money2(ref)}</dd></div>
          <div><dt>NPC buys at (Warehouse)</dt><dd class="num">${money2(Number(p.base_price) * ratio)}</dd></div></dl>
        <table class="tbl"><thead><tr><th>Price</th><th>Items / min</th><th>Income / min</th></tr></thead><tbody>
        ${STEPS.map((x) => { const pr = Math.round(ref * x * 100) / 100, r = perMinute(1, pr, ref);
          return `<tr><td>${money2(pr)} <small class="muted">(${Math.round(x * 100)}%)</small></td><td class="num">${qty(r)}</td><td class="num">${money2(r * pr)}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }).join('')}
    <p class="honest">Tip: the reference price earns the most per minute. Raise your price when stock is low, so it lasts longer; lower it when the warehouse is full. Selling to the NPC is instant but pays only ${Math.round(ratio * 100)}% of the base price, so a store earns much more.</p>`;
}
