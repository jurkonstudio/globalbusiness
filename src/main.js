import { route } from './core/router.js';
import { supabase } from './core/supabase.js';

window.addEventListener('hashchange', route);
route();

// Heartbeat: lets the server know when the player was last here, so it can report what finished while they were away.
setInterval(async () => {
  if (document.hidden) return;
  const { data } = await supabase.auth.getSession();
  if (data.session) supabase.rpc('touch_seen');
}, 60000);
