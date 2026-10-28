import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { loadGameData, indexBy, catLabel, perHour, refValue } from '../../components/gameData.js';
import { resIcon } from '../../components/resourceIcons.js';
import { money2, qty as fq, duration } from '../../core/format.js';

let query = '';

export function render() {
  return shell('Encyclopedia', 'Recipes', `<div class="stack">
    <div class="fld"><label for="rc-q">Search</label>
      <input id="rc-q" type="search" placeholder="Product, ingredient or building" autocomplete="off" value="${esc(query)}" /></div>
    <div id="rc-list">${skeleton(4, 120)}</div>
    <p class="honest">Rates are for a level 1 building and one run. A higher building level multiplies inputs and output together
      (capacity). Mines and quarries also scale with abundance, and a matching region adds its bonus to the output. Values use base prices and
      are only a guide: what you earn depends on the prices you actually buy and sell at.</p></div>`);
}

export async function mount() {
  const list = document.getElementById('rc-list');
  const data = await loadGameData();
  if (!list?.isConnected) return;
  if (data.error) { list.innerHTML = errorBlock('The game data could not be loaded. Check your connection.'); return; }
  const resById = indexBy(data.resources);
  if (!data.recipes.length) { list.innerHTML = stateBlock({ icon: 'doc', title: 'No recipes found', text: 'Run migration 002 in Supabase to install the game data.' }); return; }

  const line = (rc) => {
    const out = resById[rc.output_resource_id];
    const val = refValue(rc, resById);
    return `<li class="card"><div class="row" style="gap:.6rem">${resIcon(out?.slug, 36)}
      <div style="flex:1;min-width:0"><b>${esc(out?.name ?? 'Item')} × ${fq(rc.output_qty)}</b>
        <div class="muted" style="margin:0">${duration(rc.duration_seconds)} per run · ${fq(perHour(rc))} per hour</div></div></div>
      <div class="row" style="gap:.4rem;margin-top:.5rem">${rc.recipe_inputs.length
        ? rc.recipe_inputs.map((i) => `<span class="tag">${fq(i.qty)} × ${esc(resById[i.resource_id]?.name ?? 'Item')}</span>`).join('')
        : '<span class="muted" style="margin:0">No ingredients</span>'}</div>
      <p class="muted">Inputs ${money2(val.inputs)} → output ${money2(val.output)} at base prices</p></li>`;
  };

  const draw = () => {
    const q = query.trim().toLowerCase();
    const groups = data.types.map((t) => ({
      t, rows: data.recipes.filter((rc) => rc.building_type_id === t.id).filter((rc) => {
        if (!q) return true;
        const names = [t.name, resById[rc.output_resource_id]?.name, ...rc.recipe_inputs.map((i) => resById[i.resource_id]?.name)];
        return names.some((n) => String(n ?? '').toLowerCase().includes(q));
      }),
    })).filter((g) => g.rows.length);
    list.innerHTML = groups.length ? `<div class="stack">${groups.map((g) => `<section aria-label="${esc(g.t.name)}">
      <div class="sec-h"><h2>${esc(g.t.name)}</h2><span class="muted" style="margin:0">${esc(catLabel(g.t.category))} · ${g.t.unlock_level > 0 ? `level ${g.t.unlock_level}` : "from the start"}</span></div>
      <ul class="stack" style="list-style:none;padding:0;margin:0">${g.rows.map(line).join('')}</ul></section>`).join('')}</div>`
      : stateBlock({ icon: 'search', title: 'No recipe matches', text: 'Try another product, ingredient or building name.' });
  };
  draw();
  document.getElementById('rc-q').oninput = (e) => { query = e.target.value; draw(); };
}
