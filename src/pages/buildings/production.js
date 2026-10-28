import { supabase } from '../../core/supabase.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';

const fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
  : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

export function render() {
  return shell('Buildings', 'Production', '<div id="prod" class="grid">Loading…</div>');
}

export async function mount() {
  const el = document.getElementById('prod');
  const [b, r, j] = await Promise.all([
    supabase.from('buildings').select('id, level, abundance, build_finish_at, upgrade_finish_at, upgrade_to, building_types(id, name)').order('created_at').then((r) => r.error ? supabase.from('buildings').select('id, abundance, building_types(id, name)').order('created_at') : r),
    supabase.from('recipes').select('id, building_type_id, output_qty, duration_seconds, resources(name), recipe_inputs(qty, resources(name))'),
    supabase.from('production_jobs').select('*').eq('collected', false),
  ]);
  const buildings = b.data ?? [], recipes = r.data ?? [], jobs = j.data ?? [];
  if (!buildings.length) {
    el.innerHTML = '<div class="empty">No buildings yet. <a href="#/buildings/construction">Build one</a>.</div>';
    return;
  }

  el.innerHTML = buildings.map((bl) => {
    const t = bl.building_types;
    const job = jobs.find((x) => x.building_id === bl.id);
    if (bl.build_finish_at && new Date(bl.build_finish_at) > Date.now())
      return `<div class="card"><h3>${t.name}</h3><p>🔨 Under construction</p><p class="tag cd" data-finish="${bl.build_finish_at}"></p></div>`;
    if (bl.upgrade_finish_at)
      return `<div class="card"><h3>${t.name}</h3><p>⬆️ Upgrading to LVL ${bl.upgrade_to}</p><p class="tag cd" data-finish="${bl.upgrade_finish_at}"></p></div>`;
    const lvl = bl.level ?? 1;
    const head = `<h3>${t.name} · LVL ${lvl}${bl.abundance ? ` · abundance ${bl.abundance}%` : ''}</h3>`;
    if (job) {
      const rc = recipes.find((x) => x.id === job.recipe_id);
      const done = new Date(job.finish_at) <= new Date();
      return `<div class="card">${head}
        <p>Producing <b>${rc?.resources?.name}</b> × ${job.runs * (job.capacity ?? 1)}</p>
        ${done ? `<button class="btn" data-collect="${job.id}">Collect</button>`
               : `<p class="tag cd" data-finish="${job.finish_at}"></p>`}</div>`;
    }
    const opts = recipes.filter((x) => x.building_type_id === t.id).map((x) => {
      const needs = x.recipe_inputs.map((i) => `${i.qty * lvl} ${i.resources.name}`).join(', ') || 'nothing';
      return `<option value="${x.id}">${x.resources.name} ×${x.output_qty * lvl} · ${fmt(x.duration_seconds)} · needs ${needs}</option>`;
    }).join('');
    return `<div class="card stack" data-b="${bl.id}">${head}
      <select>${opts}</select>
      <div class="row"><input type="number" min="1" max="20" value="1" style="width:80px" />
      <button class="btn" data-start="${bl.id}">Start</button></div></div>`;
  }).join('');

  el.onclick = async (e) => {
    const start = e.target.dataset.start, collect = e.target.dataset.collect;
    if (!start && !collect) return;
    e.target.disabled = true;
    let res;
    if (start) {
      const box = e.target.closest('[data-b]');
      res = await supabase.rpc('start_production', {
        p_building: start,
        p_recipe: Number(box.querySelector('select').value),
        p_runs: Number(box.querySelector('input').value) || 1,
      });
    } else {
      res = await supabase.rpc('collect_production', { p_job: collect });
    }
    if (res.error) { toast(res.error.message, true); e.target.disabled = false; return; }
    toast(start ? 'Production started' : `Collected ${res.data}`);
    window.dispatchEvent(new Event('hashchange'));
  };

  const timer = setInterval(() => {
    if (!el.isConnected) return clearInterval(timer);
    let finished = false;
    el.querySelectorAll('.cd').forEach((c) => {
      const left = Math.ceil((new Date(c.dataset.finish) - Date.now()) / 1000);
      if (left <= 0) finished = true; else c.textContent = 'Ready in ' + fmt(left);
    });
    if (finished) { clearInterval(timer); window.dispatchEvent(new Event('hashchange')); }
  }, 1000);
}
