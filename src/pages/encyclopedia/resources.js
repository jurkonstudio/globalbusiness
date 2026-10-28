import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock, statusChip } from '../../components/ui.js';
import { loadGameData, indexBy, catLabel } from '../../components/gameData.js';
import { npcBuyPrice, npcSellPrice } from '../../components/market.js';
import { resIcon } from '../../components/resourceIcons.js';
import { money2, qty as fq, duration } from '../../core/format.js';

let query = '', cat = '';
const open = new Set();   // resources whose details are expanded, kept across redraws

export function render() {
  return shell('Encyclopedia', 'Resources', `<div class="stack">
    <div class="fld"><label for="en-q">Search</label>
      <input id="en-q" type="search" placeholder="Name or category" autocomplete="off" value="${esc(query)}" /></div>
    <div class="rchips" id="en-cats" role="group" aria-label="Category"></div>
    <div id="en-list">${skeleton(5, 56)}</div>
    <p class="honest">Prices are reference values. The NPC prices follow the current economy phase; player prices are on the Exchange.</p></div>`);
}

export async function mount() {
  const list = document.getElementById('en-list');
  const data = await loadGameData();
  if (!list?.isConnected) return;
  if (data.error) { list.innerHTML = errorBlock('The game data could not be loaded. Check your connection.'); return; }
  if (!data.resources.length) { list.innerHTML = stateBlock({ icon: 'doc', title: 'No resources found', text: 'The game data is not installed. Run migration 002 in Supabase.' }); return; }

  const typeById = indexBy(data.types), resById = indexBy(data.resources);
  const cats = [...new Set(data.resources.map((r) => r.category))].sort((a, b) => catLabel(a).localeCompare(catLabel(b)));
  if (cat && !cats.includes(cat)) cat = '';

  const chips = document.getElementById('en-cats');
  const drawChips = () => {
    chips.innerHTML = [['', 'All'], ...cats.map((c) => [c, catLabel(c)])]
      .map(([v, l]) => `<button type="button" class="chip${v === cat ? ' on' : ''}" data-cat="${esc(v)}" aria-pressed="${v === cat}">${esc(l)}</button>`).join('');
  };

  const madeBy = (r) => data.recipes.filter((x) => x.output_resource_id === r.id);
  const usedIn = (r) => data.recipes.filter((x) => x.recipe_inputs.some((i) => i.resource_id === r.id));

  const row = (r) => {
    const sell = npcSellPrice(r), buy = npcBuyPrice(r);
    const made = madeBy(r), used = usedIn(r);
    return `<details class="card fold" data-id="${r.id}"${open.has(r.id) ? ' open' : ''}>
      <summary><span class="row" style="gap:.6rem;flex:1;min-width:0">${resIcon(r.slug, 32)}<b>${esc(r.name)}</b>
        <span class="muted" style="margin:0">${esc(catLabel(r.category))}</span></span>
        <span class="num">${money2(r.base_price)}</span></summary>
      <dl class="sum">
        <div><dt>Base price</dt><dd class="num">${money2(r.base_price)}</dd></div>
        <div><dt>NPC sells to you at</dt><dd class="num">${sell ? money2(sell) : 'Not sold by the NPC'}</dd></div>
        <div><dt>NPC buys from you at</dt><dd class="num">${money2(buy)}</dd></div>
        ${r.retail_ok ? `<div><dt>Store reference price</dt><dd class="num">${money2(r.retail_ref)}</dd></div>` : ''}
        ${Number(r.transport) !== 1 ? `<div><dt>Freight weight</dt><dd class="num">×${fq(r.transport)}</dd></div>` : ''}
      </dl>
      <div class="stack">
        <div><b>Made by</b>${made.length ? `<ul class="list">${made.map((x) => `<li>${esc(typeById[x.building_type_id]?.name ?? 'Building')}: ${fq(x.output_qty)} per run, ${duration(x.duration_seconds)}</li>`).join('')}</ul>`
          : '<p class="muted">No building makes this yet. Buy it from the NPC or the Exchange.</p>'}</div>
        <div><b>Used in</b>${used.length ? `<ul class="list">${used.map((x) => `<li>${esc(resById[x.output_resource_id]?.name ?? 'Item')} <span class="muted">(needs ${fq(x.recipe_inputs.find((i) => i.resource_id === r.id).qty)} per run)</span></li>`).join('')}</ul>`
          : '<p class="muted">No recipe uses this yet.</p>'}</div>
        <div class="row">${r.npc_sells ? statusChip('NPC sells', 'info') : ''}${r.retail_ok ? statusChip('Sells in stores', 'ok') : ''}
          <a class="tag" href="#/encyclopedia/recipes-info">All recipes</a></div>
      </div></details>`;
  };

  const draw = () => {
    const q = query.trim().toLowerCase();
    const rows = data.resources.filter((r) => (!cat || r.category === cat)
      && (!q || r.name.toLowerCase().includes(q) || catLabel(r.category).toLowerCase().includes(q)));
    list.innerHTML = rows.length ? `<div class="stack">${rows.map(row).join('')}</div>`
      : stateBlock({ icon: 'search', title: 'No resource matches', text: 'Try another name or pick "All" categories.' });
  };

  drawChips(); draw();
  document.getElementById('en-q').oninput = (e) => { query = e.target.value; draw(); };
  chips.onclick = (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; drawChips(); draw(); };
  list.addEventListener('toggle', (e) => {
    const d = e.target; if (!d?.dataset?.id) return;
    d.open ? open.add(Number(d.dataset.id)) : open.delete(Number(d.dataset.id));
  }, true);
}
