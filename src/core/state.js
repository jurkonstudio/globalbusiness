import { supabase } from './supabase.js';

export const state = { company: null };

export async function loadCompany() {
  const { data } = await supabase.from('companies').select('*').maybeSingle();
  state.company = data;
  return data;
}
