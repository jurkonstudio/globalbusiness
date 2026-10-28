// Reads what the player is running right now and works out what needs attention.
// Everything is derived from real rows (buildings, production_jobs, recipes, inventory). Nothing is invented.
import { supabase } from './supabase.js';

export async function loadOps() {
  const bq = (cols) => supabase.from('buildings').select(cols).order('created_at');
  let b = await bq('id, level, abundance, slot, region_id, build_finish_at, upgrade_finish_at, upgrade_to, building_types(id, name, slug, build_seconds)');
  if (b.error) b = await bq('id, level, abundance, building_types(id, name, slug)');   // migrations 005/006 missing
  const [j, r, i] = await Promise.all([
    supabase.from('production_jobs').select('id, building_id, recipe_id, runs, capacity, finish_at').eq('collected', false),
    supabase.from('recipes').select('id, building_type_id, output_qty, duration_seconds, resources(name), recipe_inputs(qty, resource_id, resources(name))'),
    supabase.from('inventory').select('resource_id, quantity'),
  ]);
  const error = b.error || j.error || r.error || i.error;
  return {
    error: error ? error.message : null,
    buildings: b.data ?? [], jobs: j.data ?? [], recipes: r.data ?? [],
    stock: Object.fromEntries((i.data ?? []).map((x) => [x.resource_id, Number(x.quantity)])),
  };
}

// Which recipes can a building start right now? One run needs `qty x level` of each input (see start_production).
export function missingFor(recipe, level, stock) {
  return recipe.recipe_inputs
    .map((x) => ({ name: x.resources?.name ?? 'item', need: x.qty * level, have: stock[x.resource_id] ?? 0 }))
    .filter((x) => x.have < x.need);
}

// state: build | upgrade | ready | running | blocked | idle
export function describe(ops, now = Date.now()) {
  const jobOf = Object.fromEntries(ops.jobs.map((x) => [x.building_id, x]));
  return ops.buildings.map((bl) => {
    const t = bl.building_types, level = bl.level ?? 1, job = jobOf[bl.id];
    const base = { id: bl.id, name: t?.name ?? 'Building', level, typeId: t?.id, abundance: bl.abundance };
    if (bl.build_finish_at && new Date(bl.build_finish_at) > now) {
      const end = +new Date(bl.build_finish_at), len = (t?.build_seconds ?? 0) * 1000;
      return { ...base, state: 'build', end, start: len ? end - len : null };
    }
    if (bl.upgrade_finish_at) return { ...base, state: 'upgrade', end: +new Date(bl.upgrade_finish_at), start: null, to: bl.upgrade_to };
    if (job) {
      const rc = ops.recipes.find((x) => x.id === job.recipe_id), end = +new Date(job.finish_at);
      const out = rc?.resources?.name ?? 'goods';
      if (end <= now) return { ...base, state: 'ready', job: job.id, out };
      return { ...base, state: 'running', end, start: rc ? end - rc.duration_seconds * job.runs * 1000 : null, out };
    }
    const mine = ops.recipes.filter((x) => x.building_type_id === t?.id);
    if (!mine.length) return { ...base, state: 'passive' };   // this building type has no recipes
    const best = mine.map((x) => missingFor(x, level, ops.stock)).sort((a, b) => a.length - b.length)[0];
    return best.length ? { ...base, state: 'blocked', missing: best } : { ...base, state: 'idle' };
  });
}
