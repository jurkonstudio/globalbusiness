import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money } from '../core/format.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  if (!c) return el.innerHTML = '<div style="height:60px"></div>';

  const xp = Number(c.xp ?? 0);
  const level = Number(c.level ?? 0);
  const pct = xp % 100;
  const phase = state.economy?.phase || 'normal';
  const name = esc(c.name ?? '');
  const nexusBal = Number(c.nexus ?? 0);

  // Struktur baru dibungkus dengan class .gb-header untuk isolasi CSS
  el.innerHTML = `
    <div class="gb-top-bar">
      <button class="hamb" id="open-drawer" aria-label="Menu${state.alerts ? ', ' + state.alerts + ' production ready' : ''}" aria-expanded="false" aria-controls="drawer">
        ${ic('menu')}${state.alerts ? '<i class="dot"></i>' : ''}
      </button>
      
      <a class="brand" href="#/headquarters/overview" aria-label="Headquarters, ${name}">
        <span class="mono" aria-hidden="true">${esc(c.name.charAt(0).toUpperCase())}</span>
        <span class="who">
          <b>${name}</b>
          <div class="brand-sub">
            <span class="lvl-badge">LVL ${level}</span>
            <button class="phase-chip" id="open-economy" data-p="${phase}">
              <i></i><span>${cap(phase)}</span>
            </button>
          </div>
        </span>
      </a>

      <div class="currencies">
        <a class="cur-box cash" href="#/banking/account">
          <small>Cash</small>
          <b>${money(c.cash)}</b>
        </a>
        <div class="cur-box nexus">
          <small>Nexus</small>
          <b>${money(nexusBal)}</b>
        </div>
      </div>
    </div>
    
    <div class="xp-track">
      <div class="xp-fill" style="width:${pct}%"></div>
    </div>
    
    ${isGuest() ? `<button class="gb-save-btn" id="open-auth">${ic('exec')}<span>Save Game</span></button>` : ''}
  `;

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
