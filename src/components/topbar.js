import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money } from '../core/format.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// SVG Berlian untuk Nexus
const GEM_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="vertical-align:-2px; margin-right:2px;"><path d="M12 2L2 9l10 13 10-13L12 2zm0 2.5l6.5 5.5H5.5L12 4.5zM5.5 11h5v8l-5-8zm8 0h5l-5 8v-8z"/></svg>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const xp = Number(c?.xp ?? 0), pct = xp % 100;
  const phase = state.economy?.phase || 'normal';
  const name = esc(c?.name ?? '');
  const nexus = Number(c?.nexus ?? 0);

  el.innerHTML = `
    <button class="hamb" id="open-drawer" aria-label="Menu${state.alerts ? ', ' + state.alerts + ' production ready' : ''}" aria-expanded="false" aria-controls="drawer">${ic('menu')}${state.alerts ? '<i class="dot"></i>' : ''}</button>
    ${c ? `<a class="brand" href="#/headquarters/overview" aria-label="Headquarters, ${name}">
        <span class="mono" aria-hidden="true">${esc(c.name.charAt(0).toUpperCase())}</span>
        <span class="who">
          <b>${name}</b>
          <div class="brand-sub">
            <span class="lvl-badge">LVL ${c.level}</span>
            <span class="xp-text">${pct}% to next</span>
          </div>
        </span></a>
      <button class="phase" id="open-economy" data-p="${phase}" aria-label="Economy phase: ${cap(phase)}"><i></i><span>${cap(phase)}</span></button>
      
      <div class="cur-stack">
        <a class="cur-box cash" href="#/banking/account" aria-label="Cash ${money(c.cash)}. Open account">
          <small>Cash</small><b>${money(c.cash)}</b>
        </a>
        <div class="cur-box nexus" aria-label="Nexus ${nexus}">
          <small>Nexus</small><b>${GEM_SVG} ${money(nexus)}</b>
        </div>
      </div>
      
      <span class="xp" style="--p:${pct}%" aria-hidden="true"></span>` : '<span class="brand"></span>'}
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
    <p class="muted">NPC sells at ${Number(e?.npc_markup ?? 1.5)}× base price and buys back at ${Number(e?.npc_buy_ratio ?? 0.6)}× base price.</p>
    <button class="btn" id="eco-close">Close</button></div>`;
  document.body.appendChild(m);
  m.onclick = (ev) => { if (ev.target === m || ev.target.id === 'eco-close') m.remove(); };
}

export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
}
