import { supabase } from '../core/supabase.js';
import { state, isGuest } from '../core/state.js';
import { toast } from './toast.js';
import { promptOnce } from './saveProgress.js';
import { ic } from '../config/icons.js';

const SLOTS = 24;
const ICON = { agriculture: '🌳', utility: '⚡', extraction: '⛏️', construction: '🧱' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');

const fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;

// Placeholder 2D stage. A 3D scene can mount into #map-stage later and reuse mountLandGrid's data.
export const landGridHtml = () => `<div id="map-stage"><div class="island"><div class="map-grid" id="land">Loading…</div></div></div>
  <a class="idle-box" href="#/buildings/production" id="idle-box"></a>
  <a class="fab" href="#/buildings/construction" aria-label="Build">${ic('build')}</a>`;

function idleBox() {
  const { idle, nextIdle } = state.stats;
  const t = nextIdle ? nextIdle.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
  document.getElementById('idle-box').innerHTML = `Idle buildings: ${idle}<br>Next idle: ${t}`;
}

export async function mountLandGrid() {
  const el = document.getElementById('land');
  if (!el) return;
  idleBox();
  const stage = document.getElementById('map-stage');
  stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
  const [b, t, j] = await Promise.all([
    supabase.from('buildings').select('id, slot, level, building_types(slug, name, category)').not('slot', 'is', null),
    supabase.from('building_types').select('*').order('unlock_level').order('build_cost'),
    supabase.from('production_jobs').select('building_id, finish_at').eq('collected', false),
  ]);
  const bySlot = Object.fromEntries((b.data ?? []).map((x) => [x.slot, x]));
  const jobOf = Object.fromEntries((j.data ?? []).map((x) => [x.building_id, x]));
  const hasOrchard = Object.values(bySlot).some((x) => x.building_types.slug === 'apple-orchard');
  el.innerHTML = Array.from({ length: SLOTS }, (_, i) => {
    const x = bySlot[i];
    if (!x) return `<button class="map-slot" data-slot="${i}" aria-label="Empty slot">+</button>`;
    const left = jobOf[x.id] ? Math.ceil((new Date(jobOf[x.id].finish_at) - Date.now()) / 1000) : 0;
    return `<button class="map-slot used" data-b="${i}">${ICON[x.building_types.category] ?? '🏭'}
      ${jobOf[x.id] ? `<span class="bl-timer">${left > 0 ? fmt(left) : 'Ready'}</span>` : ''}
      <span class="bl-label">${x.building_types.name}<small>LVL ${x.level ?? 1}</small></span></button>`;
  }).join('');
  el.onclick = (e) => {
    const used = e.target.closest('[data-b]');
    if (used) return openBuilding(bySlot[used.dataset.b]);
    const s = e.target.closest('[data-slot]');
    if (!s) return;
    if (!state.company.tutorial_done && hasOrchard) { toast('Wait for your apples to grow first.'); return; }
    choose(Number(s.dataset.slot), t.data ?? []);
  };
}

function openBuilding(x) {
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box"><h3>${x.building_types.name} · LVL ${x.level ?? 1}</h3>
    <a class="btn" href="#/buildings/production">Production</a>
    <a class="btn-ghost" style="text-align:center" href="#/buildings/upgrades">Upgrades</a>
    <button class="btn-ghost" id="no">Close</button></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m || e.target.id === 'no' || e.target.closest('a')) m.remove(); };
}

function choose(slot, types) {
  const tutorial = !state.company.tutorial_done;
  const avail = tutorial
    ? types.filter((x) => x.slug === 'apple-orchard')
    : types.filter((x) => x.unlock_level <= state.company.level);
  const m = document.createElement('div');
  m.className = 'modal sheet';
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
