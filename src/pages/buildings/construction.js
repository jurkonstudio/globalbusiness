import { supabase } from '../../core/supabase.js';
import { state, isGuest } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { promptOnce } from '../../components/saveProgress.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US');

export function render() {
  return shell('Buildings', 'Construction', '<div id="list" class="grid">Loading…</div>');
}

export async function mount() {
  const list = document.getElementById('list');
  const { data, error } = await supabase.from('building_types').select('*')
    .order('unlock_level').order('build_cost');
  if (error || !data?.length) {
    list.innerHTML = '<div class="empty">No buildings found. Run migration 002 in Supabase.</div>';
    return;
  }
  const lvl = state.company.level;
  list.innerHTML = data.map((b) => `<div class="card">
    <h3>${b.category}</h3>
    <div class="stat" style="font-size:1.15rem">${b.name}</div>
    <p class="muted">${b.description ?? ''}</p>
    <p class="tag">${money(b.build_cost)}</p>
    ${lvl >= b.unlock_level
      ? `<button class="btn" data-slug="${b.slug}">Build</button>`
      : `<span class="muted">Unlocks at level ${b.unlock_level}</span>`}
  </div>`).join('');

  list.onclick = async (e) => {
    const slug = e.target.dataset.slug;
    if (!slug) return;
    e.target.disabled = true;
    const { error } = await supabase.rpc('build_building', { p_type_slug: slug });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    toast('Building constructed!');
    window.dispatchEvent(new Event('hashchange'));   // refresh cash and level
    if (isGuest()) promptOnce();                      // login screen in the middle of the game
  };
}
