import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const xp = Number(c?.xp ?? 0), pct = xp % 100;
  const phase = state.economy?.phase || 'normal';
  el.innerHTML = `
    <button class="hamb" id="open-drawer" aria-label="Menu">${ic('menu')}${state.alerts ? '<i class="dot"></i>' : ''}</button>
    ${c ? `<a class="brand" href="#/headquarters/overview" aria-label="Company">
        <span class="mono">${c.name.charAt(0).toUpperCase()}</span>
        <span class="who"><b>${c.name}</b><small>Level ${c.level} · ${pct}% to next</small></span></a>
      <button class="phase" id="open-economy" data-p="${phase}" aria-label="Economy"><i></i><span>${cap(phase)}</span></button>
      <a class="cash" href="#/banking/account"><small>Cash</small><b>${money(c.cash)}</b></a>
      <span class="xp" style="--p:${pct}%"></span>` : '<span class="brand"></span>'}
    ${isGuest() ? `<button class="acct" id="open-auth" aria-label="Save your game">${ic('exec')}<span>Save game</span></button>` : ''}`;
  document.getElementById('open-auth')?.addEventListener('click', () => openAuthPanel('signup'));
  document.getElementById('open-drawer').onclick = toggleDrawer;
  document.getElementById('open-economy')?.addEventListener('click', openEconomy);
}

function openEconomy() {
  const e = state.economy;
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="card stack modal-box"><h3>Economy</h3>
    <div class="stat">${cap(e?.phase || 'normal')}</div>
    <p class="muted">NPC prices are ${Number(e?.npc_markup ?? 1.5)}× base price.</p>
    <button class="btn" id="eco-close">Close</button></div>`;
  document.body.appendChild(m);
  m.onclick = (ev) => { if (ev.target === m || ev.target.id === 'eco-close') m.remove(); };
}

export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
}
