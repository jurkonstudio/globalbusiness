import { supabase } from '../core/supabase.js';
import { state, isGuest } from '../core/state.js';
import { toast } from './toast.js';
import { promptOnce } from './saveProgress.js';

const SLOTS = 24;
const ICON = { agriculture: '🌳', utility: '⚡', extraction: '⛏️', construction: '🧱' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');

export const landGridHtml = () => '<div class="map-grid" id="land">Loading…</div>';

export async function mountLandGrid() {
  const el = document.getElementById('land');
  if (!el) return;
  const [b, t] = await Promise.all([
    supabase.from('buildings').select('slot, building_types(slug, name, category)').not('slot', 'is', null),
    supabase.from('building_types').select('*').order('unlock_level').order('build_cost'),
  ]);
  const bySlot = Object.fromEntries((b.data ?? []).map((x) => [x.slot, x.building_types]));
  const hasOrchard = Object.values(bySlot).some((x) => x.slug === 'apple-orchard');
  el.innerHTML = Array.from({ length: SLOTS }, (_, i) => bySlot[i]
    ? `<div class="map-slot used" title="${bySlot[i].name}">${ICON[bySlot[i].category] ?? '🏭'}</div>`
    : `<div class="map-slot" data-slot="${i}" title="Empty slot">+</div>`).join('');
  el.onclick = (e) => {
    const s = e.target.closest('[data-slot]');
    if (!s) return;
    if (!state.company.tutorial_done && hasOrchard) { toast('Wait for your apples to grow first.'); return; }
    choose(Number(s.dataset.slot), t.data ?? []);
  };
}

function choose(slot, types) {
  const tutorial = !state.company.tutorial_done;
  const avail = tutorial
    ? types.filter((x) => x.slug === 'apple-orchard')
    : types.filter((x) => x.unlock_level <= state.company.level);
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card stack modal-box"><h3>Land slot ${slot + 1}</h3>
    <select id="bt">${avail.map((x) => `<option value="${x.slug}">${x.name} · ${money(x.build_cost)}</option>`).join('')}</select>
    <p class="muted">${tutorial ? 'Planting uses 1 Seeds and 2 Water from your warehouse and starts growing apples.' : 'Place a building on this slot.'}</p>
    <button class="btn" id="go">${tutorial ? 'Plant apples' : 'Build'}</button>
    <button class="btn-ghost" id="no">Cancel</button></div>`;
  document.body.appendChild(m);
  m.querySelector('#no').onclick = () => m.remove();
  m.querySelector('#go').onclick = async (e) => {
    e.target.disabled = true;
    const { error } = tutorial
      ? await supabase.rpc('plant_apples', { p_slot: slot })
      : await supabase.rpc('build_building', { p_type_slug: m.querySelector('#bt').value, p_slot: slot });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    m.remove();
    toast(tutorial ? 'Apples planted!' : 'Building constructed!');
    window.dispatchEvent(new Event('hashchange'));
    if (isGuest()) promptOnce();   // login screen in the middle of the game
  };
}
