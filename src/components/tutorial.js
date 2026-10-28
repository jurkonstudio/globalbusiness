import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';

let timer;

export async function renderTutorial() {
  const c = state.company;
  if (c?.tutorial_done) return '';
  let seeds = 0, water = 0, orchard = false, job = null;
  if (c) {
    const [inv, bl, jb] = await Promise.all([
      supabase.from('inventory').select('quantity, resources(slug)'),
      supabase.from('buildings').select('id, building_types(slug)'),
      supabase.from('production_jobs').select('*').eq('collected', false).limit(1),
    ]);
    for (const x of inv.data ?? []) {
      if (x.resources?.slug === 'seeds') seeds = Number(x.quantity);
      if (x.resources?.slug === 'water') water = Number(x.quantity);
    }
    orchard = (bl.data ?? []).some((b) => b.building_types?.slug === 'apple-orchard');
    job = jb.data?.[0] ?? null;
  }
  const steps = [
    { t: 'Found your company', done: !!c, href: '#/headquarters/overview' },
    { t: 'Buy Seeds from the NPC (Warehouse)', done: seeds >= 1 || orchard, href: '#/warehouse/inventory' },
    { t: 'Buy at least 2 Water (Warehouse)', done: water >= 2 || orchard, href: '#/warehouse/inventory' },
    { t: 'Plant apples on a Map slot', done: orchard, href: '#/map/world' },
    { t: 'Wait for the harvest, then collect it', done: false },
  ];
  const active = steps.findIndex((s) => !s.done);
  let action = '';
  if (active < 4) action = `<a class="btn" href="${steps[active].href}">Go</a>`;
  else if (job && new Date(job.finish_at) <= new Date()) action = `<button class="btn" id="tut-collect" data-job="${job.id}">Collect apples</button>`;
  else if (job) action = `<p class="tag" id="tut-cd" data-finish="${job.finish_at}"></p>`;

  return `<div class="card tutorial"><h3>Tutorial · Step ${active + 1} of 5 · reach Level 1</h3>
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
    toast(`Harvested ${data} apples. You reached Level 1!`);
    window.dispatchEvent(new Event('hashchange'));
  };
  const cd = document.getElementById('tut-cd');
  if (!cd) return;
  const tick = () => {
    if (!cd.isConnected) return clearInterval(timer);
    const left = Math.ceil((new Date(cd.dataset.finish) - Date.now()) / 1000);
    if (left <= 0) { clearInterval(timer); window.dispatchEvent(new Event('hashchange')); return; }
    cd.textContent = `Apples ready in ${Math.floor(left / 60)}m ${String(left % 60).padStart(2, '0')}s`;
  };
  tick();
  timer = setInterval(tick, 1000);
}
