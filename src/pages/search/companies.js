import { supabase } from '../../core/supabase.js';
import { shell } from '../../components/shell.js';

export function render() {
  return shell('Search', 'Companies', `<div class="stack">
    <input id="q" placeholder="Company name" autocomplete="off" />
    <div id="res" class="stack"></div>
    <p class="muted">Public company profiles are not enabled yet, so only your own company can match.</p></div>`);
}

export function mount() {
  const q = document.getElementById('q'), res = document.getElementById('res');
  let t;
  q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const v = q.value.trim();
      if (v.length < 2) { res.innerHTML = ''; return; }
      const { data } = await supabase.from('companies').select('name, level').ilike('name', `%${v}%`).limit(20);
      res.innerHTML = (data ?? []).map((c) => `<div class="card row"><b>${c.name}</b><span class="muted">Level ${c.level}</span></div>`).join('')
        || '<div class="empty">No companies found.</div>';
    }, 250);
  };
}
