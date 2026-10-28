import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money } from '../core/format.js';

// SVG Koin Emas
const COIN_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fbbf24" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-3-9h4.5a2.5 2.5 0 0 1 0 5H9m0 0h5" stroke="#78350f" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

// SVG Bintang
const STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" style="margin-right:3px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

// SVG Berlian 3D Premium
const GEM_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" style="margin-right:4px;"><path d="M12 2L2 9l10 13 10-13L12 2z" fill="#38bdf8"/><path d="M12 2L2 9h20L12 2z" fill="#7dd3fc"/><path d="M12 2v20l10-13L12 2z" fill="#0284c7"/></svg>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const nexus = Number(c?.nexus ?? 0);

  if (!c) {
    el.innerHTML = `<button class="hud-menu" id="open-drawer">${ic('menu')}</button>`;
    document.getElementById('open-drawer').onclick = toggleDrawer;
    return;
  }

  el.innerHTML = `
    <div class="hud-left">
      <button class="hud-menu" id="open-drawer" aria-label="Menu">${ic('menu')}</button>
      <a class="hud-profile" href="#/headquarters/overview" title="${esc(c.name)}">
        ${esc(c.name.charAt(0).toUpperCase())}
      </a>
    </div>

    <div class="hud-right">
      <a class="hud-stat cash" href="#/banking/account" title="Cash">
        ${COIN_SVG} <span>${money(c.cash)}</span>
      </a>
      <div class="hud-stat level" title="Level ${c.level}">
        ${STAR_SVG} <span>${c.level}</span>
      </div>
      <div class="hud-stat premium" title="Nexus">
        ${GEM_SVG} <span>${money(nexus)}</span>
      </div>
    </div>
  `;
  
  document.getElementById('open-drawer').onclick = toggleDrawer;
  
  if (isGuest() && !document.getElementById('floating-save-btn')) {
    const saveBtn = document.createElement('button');
    saveBtn.id = 'floating-save-btn';
    saveBtn.className = 'gb-save-fab';
    saveBtn.innerHTML = ic('exec');
    saveBtn.onclick = () => openAuthPanel('signup');
    document.body.appendChild(saveBtn);
  }
}

export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
  document.getElementById('floating-save-btn')?.remove();
}
