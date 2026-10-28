import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { statusChip, skeleton, errorBlock, stateBlock } from '../../components/ui.js';
import { money, duration } from '../../core/format.js';

export function render() {
  return shell('Buildings', 'Construction', `
    <p class="muted" style="margin-top:0">Pick a building here, then place it on an empty plot of the map. Other islands add a land fee per plot.</p>
    <div id="list">${skeleton(3, 120)}</div>`);
}

export async function mount() {
  const list = document.getElementById('list');
  const { data, error } = await supabase.from('building_types').select('*').order('unlock_level').order('build_cost');
  if (!list) return;
  if (error) { list.innerHTML = errorBlock('Building types could not be loaded.'); return; }
  if (!data?.length) { list.innerHTML = stateBlock({ icon: 'build', title: 'No buildings found', text: 'The game data is not installed. Run the SQL migrations.' }); return; }
  const c = state.company;
  list.innerHTML = `<div class="bgrid">${data.map((b) => {
    const locked = c.level < b.unlock_level, short = Number(b.build_cost) - Number(c.cash);
    const chip = locked ? statusChip(`Unlocks at level ${b.unlock_level}`, 'lock')
      : short > 0 ? statusChip(`Need ${money(short)} more`, 'warn') : statusChip('Available', 'ok');
    return `<article class="bcard ${locked ? 's-idle' : short > 0 ? 's-run' : 's-ready'}">
      <div class="hd"><div><h3>${esc(b.name)}</h3><span class="muted" style="margin:0;font-size:.8rem;text-transform:capitalize">${esc(b.category)}</span></div>${chip}</div>
      ${b.description ? `<p class="muted" style="margin:0">${esc(b.description)}</p>` : ''}
      <dl class="sum"><div><dt>Cost</dt><dd class="num">${money(b.build_cost)}</dd></div>
        ${b.build_seconds ? `<div><dt>Build time</dt><dd class="num">${duration(b.build_seconds)}</dd></div>` : ''}
        <div><dt>Requires</dt><dd>Level ${b.unlock_level}</dd></div></dl>
      ${locked ? '' : '<a class="btn" href="#/map/world">Place on map</a>'}</article>`;
  }).join('')}</div>
  <p class="honest">Your cash: ${money(c.cash)}. Costs are the base price on Home Isle.</p>`;
}
