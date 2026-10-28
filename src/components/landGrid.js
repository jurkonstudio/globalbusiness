import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';
import { ic } from '../config/icons.js';
import { mountMap3D } from './map3d.js';

const SLOTS = 24, COLS = 6;
const ICON = { agriculture: '🌳', utility: '⚡', extraction: '⛏️', construction: '🧱' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');

// The 3D scene mounts into #map-stage. `inline` = embedded in a normal page (Land Slots), no HUD.
export const landGridHtml = (inline = false) => `<div id="map-stage" class="map-stage${inline ? ' inline' : ''}">
    <div id="map-fallback" hidden></div>${inline ? '' : '<div class="map-hint" id="map-hint">Drag to rotate · pinch to zoom · tap a plot</div>'}</div>
  ${inline ? '' : `<a class="hud idle" href="#/buildings/production" id="idle-box"></a>
  <div class="hud tools">
    <button class="tool" id="map-reset" aria-label="Reset view">${ic('globe')}</button>
    <a class="fab" href="#/buildings/construction" aria-label="Build">${ic('build')}</a>
  </div>`}`;

function idleBox() {
  const el = document.getElementById('idle-box');
  if (!el) return;
  const { idle, nextIdle } = state.stats;
  const t = nextIdle ? nextIdle.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
  el.innerHTML = `Idle buildings: <b>${idle}</b><br>Next idle: <b>${t}</b>`;
}

// The 3D scene is created once and re-attached on every visit to the map (no WebGL restart, no re-download).
let kept = null, ctx = null, lastSig = '';

function onPick(slot) {
  if (!ctx) return;
  const x = ctx.bySlot[slot];
  if (x) return openBuilding(x);
  if (!state.company.tutorial_done && ctx.hasOrchard) { toast('Wait for your apples to grow first.'); return; }
  choose(slot, ctx.types);
}

export async function mountLandGrid() {
  const stage = document.getElementById('map-stage');
  if (!stage) return;
  const inline = stage.classList.contains('inline');
  idleBox();
  const dataP = Promise.all([
    supabase.from('buildings').select('id, slot, level, building_types(slug, name, category)').not('slot', 'is', null),
    supabase.from('building_types').select('*').order('unlock_level').order('build_cost'),
    supabase.from('production_jobs').select('building_id, finish_at').eq('collected', false),
  ]);

  let map;
  if (!inline && kept) { stage.replaceWith(kept.stage); map = kept.map; }
  else {
    map = await mountMap3D(stage, { slots: SLOTS, cols: COLS, onPick, keepAlive: !inline });
    if (map && !inline) kept = { stage, map };
  }

  const [b, t, j] = await dataP;
  const bySlot = Object.fromEntries((b.data ?? []).map((x) => [x.slot, x]));
  const jobOf = Object.fromEntries((j.data ?? []).map((x) => [x.building_id, x]));
  ctx = { bySlot, types: t.data ?? [], hasOrchard: Object.values(bySlot).some((x) => x.building_types.slug === 'apple-orchard') };

  if (!map) return fallback2D(stage, ctx, jobOf, onPick);      // no WebGL / three.js blocked
  const items = Object.values(bySlot).map((x) => ({
    slot: x.slot, level: x.level ?? 1, slug: x.building_types.slug, name: x.building_types.name,
    category: x.building_types.category, finishAt: jobOf[x.id]?.finish_at ?? null,
  }));
  const sig = JSON.stringify(items);
  if (inline || sig !== lastSig) { map.setBuildings(items); if (!inline) lastSig = sig; }   // skip rebuild when nothing changed
  document.getElementById('map-reset')?.addEventListener('click', () => map.resetView());
  setTimeout(() => document.getElementById('map-hint')?.classList.add('gone'), 5000);
}

// Plain grid used only when WebGL is unavailable.
function fallback2D(stage, ctx, jobOf, onPick) {
  const el = document.getElementById('map-fallback');
  el.hidden = false;
  el.innerHTML = Array.from({ length: SLOTS }, (_, i) => {
    const x = ctx.bySlot[i];
    return x ? `<button class="map-slot used" data-slot="${i}">${ICON[x.building_types.category] ?? '🏭'}</button>`
             : `<button class="map-slot" data-slot="${i}" aria-label="Empty plot">+</button>`;
  }).join('');
  el.onclick = (e) => { const s = e.target.closest('[data-slot]'); if (s) onPick(Number(s.dataset.slot)); };
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
  };
}
