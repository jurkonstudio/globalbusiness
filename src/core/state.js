import { supabase } from './supabase.js';

export const state = { company: null, economy: null, user: null };
export const isGuest = () => !!state.user?.is_anonymous;

export async function loadCompany() {
  const [c, e] = await Promise.all([
    supabase.from('companies').select('*').maybeSingle(),
    supabase.from('economy').select('*').maybeSingle(),
  ]);
  state.company = c.data;
  state.economy = e.data;
  return c.data;
}
