// Static game data (resources, recipes, building types) read once and reused by the Encyclopedia and the recipe browser.
// It is the SAME data the server uses to run production, so nothing here is invented.
// Cached for a few minutes: this data only changes when a migration runs.
import { supabase } from '../core/supabase.js';

let cache = null, at = 0, pending = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadGameData() {
  if (cache && Date.now() - at < TTL_MS) return cache;
  pending ??= (async () => {
    const [r, rc, bt] = await Promise.all([
      supabase.from('resources').select('*').order('name'),
      supabase.from('recipes').select('id, building_type_id, output_resource_id, output_qty, duration_seconds, recipe_inputs(resource_id, qty)'),
      supabase.from('building_types').select('*').order('unlock_level').order('name'),
    ]);
    const error = r.error || rc.error || bt.error || null;
    const out = { error, resources: r.data ?? [], recipes: rc.data ?? [], types: bt.data ?? [] };
    if (!error) { cache = out; at = Date.now(); }
    return out;
  })().finally(() => { pending = null; });
  return pending;
}

export const indexBy = (rows, key = 'id') => Object.fromEntries(rows.map((x) => [x[key], x]));

const CAT_LABEL = {
  agriculture: 'Agriculture', food: 'Food', raw: 'Raw materials', material: 'Materials', construction: 'Construction',
  goods: 'Goods', utility: 'Utility', extraction: 'Extraction', retail: 'Retail', manufacturing: 'Manufacturing', livestock: 'Livestock',
};
export const catLabel = (c) => CAT_LABEL[c] ?? (c ? c[0].toUpperCase() + c.slice(1) : 'Other');

// Output per hour for ONE run of a level-1 building, before abundance and region bonuses (see collect_production).
export const perHour = (rc) => (rc.duration_seconds > 0 ? (Number(rc.output_qty) * 3600) / rc.duration_seconds : 0);

// Value of a recipe at the resources' base prices. Only a reference: real prices come from the NPC and the market.
export function refValue(rc, resById) {
  const inputs = rc.recipe_inputs.reduce((s, i) => s + Number(i.qty) * Number(resById[i.resource_id]?.base_price ?? 0), 0);
  const output = Number(rc.output_qty) * Number(resById[rc.output_resource_id]?.base_price ?? 0);
  return { inputs, output };
}
