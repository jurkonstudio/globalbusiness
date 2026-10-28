import { supabase } from '../core/supabase.js';
import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';

// Same panel as the top-bar button, opened on the "Create account" tab.
export const openSaveProgress = () => openAuthPanel('signup');

// Called on every page load. The server decides when a guest has reached a milestone
// (see should_prompt_save in supabase/migrations/004_guest_flow.sql) and counts each prompt.
export async function checkSavePrompt() {
  if (!state.company || !isGuest() || document.getElementById('auth-panel')) return;
  const { data } = await supabase.rpc('should_prompt_save');
  if (!data) return;
  await supabase.rpc('mark_save_prompted');
  openAuthPanel('signup', "Nice progress! Create an account so you don't lose your company.");
}
