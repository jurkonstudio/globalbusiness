import { state } from '../core/state.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const xp = Number(c?.xp ?? 0), pct = xp % 100;
  el.innerHTML = `
    <button class="hamb" id="open-drawer" aria-label="Menu">${ic('menu')}</button>
    ${c ? `<a class="avatar" href="#/headquarters/overview" aria-label="Company">${c.name.charAt(0).toUpperCase()}</a>
      <a class="mini-chat" href="#/messages/inbox" aria-label="Messages">${ic('bubble')}</a>` : ''}
    <span class="spacer"></span>
    ${c ? `
    <a class="bell" href="#/headquarters/notifications" aria-label="Notifications">${ic('bell')}<b>${state.alerts}</b></a>
    <div class="pills">
      <a class="pill cash" href="#/banking/account">${money(c.cash)}</a>
      <div class="pill-row">
        <a class="pill lvl" href="#/headquarters/statistics">${ic('star')}<b>${c.level}</b></a>
        <a class="pill xp" href="#/headquarters/statistics" style="--p:${pct}%"><span>${xp} (${pct}%)</span></a>
      </div>
    </div>
    <button class="emblem" id="open-economy" aria-label="Economy">${ic('globe')}</button>` : ''}`;
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
