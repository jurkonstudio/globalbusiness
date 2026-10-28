import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US');

export function render() {
  return shell('Buildings', 'Construction', `
    <p class="muted">Buildings are placed on land slots. <a href="#/map/world" class="tag">Open the map</a> and tap an empty slot.</p>
    <div id="list" class="grid">Loading…</div>`);
}

export async function mount() {
  const list = document.getElementById('list');
  const { data, error } = await supabase.from('building_types').select('*')
    .order('unlock_level').order('build_cost');
  if (error || !data?.length) { list.textContent = 'No buildings found. Run the SQL migrations.'; return; }
  list.innerHTML = data.map((b) => `<div class="card">
    <h3>${b.category}</h3><div class="stat" style="font-size:1.15rem">${b.name}</div>
    <p class="muted">${b.description ?? ''}</p><p class="tag">${money(b.build_cost)}</p>
    ${state.company.level >= b.unlock_level ? '' : `<span class="muted">Unlocks at level ${b.unlock_level}</span>`}</div>`).join('');
}
