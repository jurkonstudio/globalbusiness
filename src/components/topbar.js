import { supabase } from '../core/supabase.js';
import { state, isGuest } from '../core/state.js';
import { openSaveProgress } from './saveProgress.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const phase = state.economy?.phase || 'normal';
  el.innerHTML = `
    <span class="logo">Global Business</span>
    <span class="spacer"></span>
    ${c ? `<span class="chip">${c.name}</span>
           <span class="chip cash">Cash <b>${money(c.cash)}</b></span>
           <span class="chip">Lv <b>${c.level}</b></span>
           <span class="chip eco">Economy <b>${cap(phase)}</b></span>` : ''}
    ${isGuest() ? '<button class="chip guest" id="save-progress">Guest · Save progress</button>' : ''}
    <button class="btn-ghost" id="logout">Log out</button>`;
  document.getElementById('save-progress')?.addEventListener('click', openSaveProgress);
  document.getElementById('logout').onclick = async () => {
    if (isGuest() && !confirm('You are a guest. Logging out will lose this company. Log out anyway?')) return;
    await supabase.auth.signOut();
    state.company = null;
    location.hash = '#/auth/login';
    location.reload();
  };
}

export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
}
