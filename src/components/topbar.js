import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  el.innerHTML = `
    <span class="logo">Global Business</span>
    <span class="spacer"></span>
    ${c ? `<span class="chip">${c.name}</span>
           <span class="chip cash">Cash <b>${money(c.cash)}</b></span>
           <span class="chip">Lv <b>${c.level}</b></span>
           <span class="chip eco" title="Economy phase (placeholder)">Economy <b>Normal</b></span>` : ''}
    <button class="btn-ghost" id="logout">Log out</button>`;
  document.getElementById('logout').onclick = async () => {
    await supabase.auth.signOut();
    state.company = null;
    location.hash = '#/auth/login';
    location.reload();
  };
}

export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
}
