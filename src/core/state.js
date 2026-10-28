import { supabase } from './supabase.js';

export const state = {
  company: null, economy: null, user: null,
  // Quick numbers for the top bar and the map's "Idle buildings" box
  stats: { total: 0, slotsUsed: 0, idle: 0, nextIdle: null, ready: 0 },
  unread: 0,   // chat badge (no messages table yet)
  alerts: 0,   // dot on the menu button: finished production waiting to be collected (no notifications table yet)
};
export const isGuest = () => !!state.user?.is_anonymous;

export async function loadCompany() {
  const [c, e, b, j] = await Promise.all([
    supabase.from('companies').select('*').maybeSingle(),
    supabase.from('economy').select('*').maybeSingle(),
    supabase.from('buildings').select('id, slot, build_finish_at, upgrade_finish_at, building_types(category)').then((r) => r.error ? supabase.from('buildings').select('id, slot') : r),
    supabase.from('production_jobs').select('building_id, finish_at').eq('collected', false),
  ]);
  state.company = c.data;
  state.economy = e.data;

  const buildings = b.data ?? [], now = Date.now();
  const running = (j.data ?? []).filter((x) => new Date(x.finish_at) > now)
    .sort((x, y) => new Date(x.finish_at) - new Date(y.finish_at));
  const busy = new Set((j.data ?? []).map((x) => x.building_id));   // running OR finished-but-not-collected: neither is idle
  const ready = (j.data ?? []).filter((x) => new Date(x.finish_at) <= now).length;
  state.stats = {
    total: buildings.length,
    slotsUsed: buildings.filter((x) => x.slot !== null).length,
    idle: buildings.filter((x) => x.building_types?.category !== 'retail' && !busy.has(x.id) && !(x.build_finish_at && new Date(x.build_finish_at) > now) && !x.upgrade_finish_at).length,
    nextIdle: running[0] ? new Date(running[0].finish_at) : null,
    ready,
  };
  state.alerts = ready;
  return c.data;
}
