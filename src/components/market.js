// Small helpers shared by the three Market pages. All rules mirror the server (list_on_exchange / buy_from_exchange);
// the server stays the authority, these only give the player instant, readable feedback.
import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { classifyError } from './ui.js';

export const twoDecimals = (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
export const cents = (n) => Math.round(n * 100) / 100;

export async function fetchResources() {
  const { data, error } = await supabase.from('resources').select('id, slug, name, category, base_price, npc_sells').order('name');
  return { data: data ?? [], error };
}
export const npcBuyPrice = (r) => cents(Number(r.base_price) * Number(state.economy?.npc_buy_ratio ?? 0.6));
export const npcSellPrice = (r) => (r.npc_sells ? cents(Number(r.base_price) * Number(state.economy?.npc_markup ?? 1.5)) : null);

// Turn a raw RPC error into text for the player. `order` errors mean the listing changed under them.
export function marketError(err) {
  const c = classifyError(err);
  if (/order not found/i.test(err?.message ?? '')) return { ...c, kind: 'gone', text: 'This order is no longer available. It was bought or cancelled by someone else.' };
  return c;
}
