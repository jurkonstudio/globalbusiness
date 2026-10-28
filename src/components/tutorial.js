import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';

let timer;

// Tutorial (8 steps): found company, buy Seeds, buy Water, plant apples, harvest (Level 1),
// build a Grocery Store, put apples on sale, make the first sale (the server then sets tutorial_done).
export async function renderTutorial() {
  const c = state.company;
  if (c?.tutorial_done) return '';
  let seeds = 0, water = 0, orchard = false, job = null, store = null, listing = false, storeType = true;
  if (c) {
    const bq = (cols) => supabase.from('buildings').select(cols);
    const [inv, bl0, jb, ls, bt] = await Promise.all([
      supabase.from('inventory').select('quantity, resources(slug)'),
      bq('id, build_finish_at, building_types(slug)'),
      supabase.from('production_jobs').select('*').eq('collected', false).limit(1),
      supabase.from('store_listings').select('building_id').limit(1),
      supabase.from('building_types').select('id').eq('slug', 'grocery-store').maybeSingle(),
    ]);
    const bl = bl0.error ? await bq('id, building_types(slug)') : bl0;
    for (const x of inv.data ?? []) {
      if (x.resources?.slug === 'seeds') seeds = Number(x.quantity);
      if (x.resources?.slug === 'water') water = Number(x.quantity);
    }
    orchard = (bl.data ?? []).some((b) => b.building_types?.slug === 'apple-orchard');
    store = (bl.data ?? []).find((b) => b.building_types?.slug === 'grocery-store') ?? null;
    job = jb.data?.[0] ?? null;
    listing = (ls.data?.length ?? 0) > 0;
    storeType = !!bt.data;   // false = migration 013 has not been run yet
  }
  const harvested = (c?.level ?? 0) >= 1 || (orchard && !job);
  const storeBuilt = !!store;
  const steps = [
    { t: 'Found your company', done: !!c, href: '#/headquarters/overview' },
    { t: 'Buy Seeds from the NPC (Warehouse)', done: seeds >= 1 || orchard, href: '#/warehouse/inventory' },
    { t: 'Buy at least 2 Water (Warehouse)', done: water >= 2 || orchard, href: '#/warehouse/inventory' },
    { t: 'Plant apples on a Map plot', done: orchard, href: '#/map/world' },
    { t: 'Wait for the harvest, then collect it', done: harvested },
    { t: 'Build a Grocery Store on a Map plot', done: storeBuilt, href: '#/map/world' },
    { t: 'Put apples on sale (tap your store on the Map)', done: listing, href: '#/map/world' },
    { t: 'Make your first sale', done: false, href: '#/map/world' },
  ];
  const active = steps.findIndex((s) => !s.done);
  let action = '';
  if (active === 4) {
    if (job && new Date(job.finish_at) <= new Date()) action = `<button class="btn" id="tut-collect" data-job="${job.id}">Collect apples</button>`;
    else if (job) action = `<p class="tag" id="tut-cd" data-finish="${job.finish_at}" data-label="Apples ready in"></p>`;
  } else if (active === 5 && store?.build_finish_at && new Date(store.build_finish_at) > new Date()) {
    action = `<p class="tag" id="tut-cd" data-finish="${store.build_finish_at}" data-label="Store ready in"></p>`;
  } else if (active === 5 && !storeType) {
    action = '<p class="tag">The Grocery Store is not installed yet. Run migration 013 in Supabase.</p>';
  } else if (active === 7) {
    action = `<a class="btn" href="#/retail/stores">Open store</a><p class="tag">Customers buy automatically. Come back in a minute.</p>`;
  } else if (steps[active]?.href) {
    action = `<a class="btn" href="${steps[active].href}">Go</a>`;
  }

  return `<div class="card tutorial"><h3>Tutorial · Step ${active + 1} of ${steps.length}</h3>
    <ul class="steps">${steps.map((s, i) =>
      `<li class="${s.done ? 'done' : i === active ? 'active' : ''}">${s.t}</li>`).join('')}</ul>
    ${action}</div>`;
}

export function mountTutorial() {
  clearInterval(timer);
  const btn = document.getElementById('tut-collect');
  if (btn) btn.onclick = async () => {
    btn.disabled = true;
    const { data, error } = await supabase.rpc('collect_production', { p_job: btn.dataset.job });
    if (error) { toast(error.message, true); btn.disabled = false; return; }
    toast(`Harvested ${data} apples. Level 1! Now build a Grocery Store.`);
    window.dispatchEvent(new Event('hashchange'));
  };
  const cd = document.getElementById('tut-cd');
  if (!cd) return;
  const tick = () => {
    if (!cd.isConnected) return clearInterval(timer);
    const left = Math.ceil((new Date(cd.dataset.finish) - Date.now()) / 1000);
    if (left <= 0) { clearInterval(timer); window.dispatchEvent(new Event('hashchange')); return; }
    cd.textContent = `${cd.dataset.label} ${Math.floor(left / 60)}m ${String(left % 60).padStart(2, '0')}s`;
  };
  tick();
  timer = setInterval(tick, 1000);
}
