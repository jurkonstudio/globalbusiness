import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { loadGameData, indexBy, catLabel } from '../../components/gameData.js';
import { REGIONS, BONUS_LABEL, PLOT_KINDS, landFee } from '../../config/regions.js';
import { MAX_LEVEL, upgradeCost, upgradeSecs, demolishRefund } from '../../core/rules.js';
import { money, qty as fq, duration } from '../../core/format.js';

const open = new Set();

export function render() {
  return shell('Encyclopedia', 'Buildings', `<div class="stack"><div id="bi-list">${skeleton(4, 64)}</div>
    <div class="sec-h"><h2>Regions</h2></div><div id="bi-regions"></div>
    <p class="honest">Costs shown here are the ones the server charges. Region bonuses raise the output of one building category.
      The land fee is added to the build cost of every building in that region, and goods made away from Home Isle pay a freight fee that grows with distance. Demolishing refunds 40% of everything you paid for the building.</p></div>`);
}

export async function mount() {
  const list = document.getElementById('bi-list');
  const data = await loadGameData();
  if (!list?.isConnected) return;
  if (data.error) { list.innerHTML = errorBlock('The game data could not be loaded. Check your connection.'); return; }
  if (!data.types.length) { list.innerHTML = stateBlock({ icon: 'build', title: 'No buildings found', text: 'Run migration 002 in Supabase to install the game data.' }); return; }
  const resById = indexBy(data.resources);
  const plotOf = (cat) => Object.values(PLOT_KINDS).find((k) => k.cats.includes(cat));

  list.innerHTML = `<div class="stack">${data.types.map((t) => {
    const recs = data.recipes.filter((rc) => rc.building_type_id === t.id);
    const plot = plotOf(t.category);
    const levels = Array.from({ length: MAX_LEVEL - 1 }, (_, i) => i + 1);
    return `<details class="card fold" data-id="${t.id}"${open.has(t.id) ? ' open' : ''}>
      <summary><span style="flex:1;min-width:0"><b>${esc(t.name)}</b>
        <span class="muted" style="margin:0 0 0 .5rem">${esc(catLabel(t.category))}</span></span>
        <span class="num">${money(t.build_cost)}</span></summary>
      ${t.description ? `<p class="muted" style="margin-top:0">${esc(t.description)}</p>` : ''}
      <dl class="sum">
        <div><dt>Build cost</dt><dd class="num">${money(t.build_cost)}</dd></div>
        <div><dt>Build time</dt><dd class="num">${Number(t.build_seconds) > 0 ? duration(t.build_seconds) : 'Instant'}</dd></div>
        <div><dt>Unlocks at company level</dt><dd class="num">${t.unlock_level > 0 ? t.unlock_level : "From the start"}</dd></div>
        <div><dt>Plot type</dt><dd>${plot ? esc(plot.label) : 'Any plot'}</dd></div>
        ${t.has_abundance ? '<div><dt>Output depends on</dt><dd>Deposit abundance</dd></div>' : ''}
        <div><dt>Refund if demolished (level 1)</dt><dd class="num">${money(demolishRefund(t, 1))}</dd></div>
      </dl>
      <div class="scroll-x"><table class="tbl"><caption class="muted" style="text-align:left">Upgrades (maximum level ${MAX_LEVEL})</caption>
        <thead><tr><th scope="col">Upgrade</th><th scope="col">Cost</th><th scope="col">Time</th></tr></thead>
        <tbody>${levels.map((l) => `<tr><td>${l} → ${l + 1}</td><td class="num">${money(upgradeCost(t, l))}</td><td class="num">${duration(upgradeSecs(t, l))}</td></tr>`).join('')}</tbody></table></div>
      <div><b>Makes</b>${recs.length ? `<ul class="list">${recs.map((rc) => `<li>${esc(resById[rc.output_resource_id]?.name ?? 'Item')} × ${fq(rc.output_qty)} per ${duration(rc.duration_seconds)}</li>`).join('')}</ul>`
        : '<p class="muted">This building does not produce goods.</p>'}</div>
    </details>`;
  }).join('')}</div>`;
  list.addEventListener('toggle', (e) => {
    const d = e.target; if (!d?.dataset?.id) return;
    d.open ? open.add(Number(d.dataset.id)) : open.delete(Number(d.dataset.id));
  }, true);

  document.getElementById('bi-regions').innerHTML = `<div class="scroll-x"><table class="tbl">
    <thead><tr><th scope="col">Region</th><th scope="col">Level</th><th scope="col">Plots</th><th scope="col">Land fee</th><th scope="col">Bonus</th></tr></thead>
    <tbody>${REGIONS.map((r) => `<tr><th scope="row" style="text-align:left;text-transform:none;letter-spacing:0;font-size:inherit;color:inherit">${esc(r.name)}</th>
      <td class="num">${r.unlock || '–'}</td><td class="num">${r.slots}</td><td class="num">${landFee(r) ? money(landFee(r)) : 'Free'}</td>
      <td>${r.bonus ? `${esc(BONUS_LABEL[r.bonus] ?? r.bonus)} +${r.pct}%` : 'None'}</td></tr>`).join('')}</tbody></table></div>`;
}
