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
  if (!c) return el.innerHTML = '<div class="top-empty"></div>';

  const xp = Number(c.xp ?? 0);
  const level = Number(c.level ?? 0);
  const pct = xp % 100; // Persentase menuju level berikutnya
  const phase = state.economy?.phase || 'normal';
  const name = esc(c.name ?? '');
  const nexusBal = Number(c.nexus ?? 0);

  el.innerHTML = `
    <div class="top-row">
      <button class="hamb" id="open-drawer" aria-label="Menu${state.alerts ? ', ' + state.alerts + ' production ready' : ''}" aria-expanded="false" aria-controls="drawer">
        ${ic('menu')}${state.alerts ? '<i class="dot"></i>' : ''}
      </button>
      
      <a class="brand" href="#/headquarters/overview" aria-label="Headquarters, ${name}">
        <span class="mono" aria-hidden="true">${esc(c.name.charAt(0).toUpperCase())}</span>
        <span class="who">
          <b>${name}</b>
          <div class="brand-sub">
            <span class="lvl-badge">LVL ${level}</span>
            <button class="phase-chip" id="open-economy" data-p="${phase}" aria-label="Economy phase: ${cap(phase)}">
              <i></i><span>${cap(phase)}</span>
            </button>
          </div>
        </span>
      </a>

      <div class="currencies">
        <a class="cur-box cash" href="#/banking/account" aria-label="Cash ${money(c.cash)}. Open account">
          <small>Cash</small>
          <b>${money(c.cash)}</b>
        </a>
        <div class="cur-box nexus" aria-label="Nexus ${money(nexusBal)}">
          <small>Nexus</small>
          <b>${money(nexusBal)}</b>
        </div>
      </div>
    </div>
    
    <div class="xp-track" aria-hidden="true">
      <div class="xp-fill" style="width:${pct}%"></div>
    </div>
    
    ${isGuest() ? `<button class="floating-save" id="open-auth" aria-label="Save your game">${ic('exec')}<span>Save Game</span></button>` : ''}
  `;

  document.getElementById('open-auth')?.addEventListener('click', () => openAuthPanel('signup'));
  document.getElementById('open-drawer').onclick = toggleDrawer;
  document.getElementById('open-economy')?.addEventListener('click', openEconomy);
}

// (Biarkan fungsi openEconomy() dan clearTopbar() persis seperti aslinya di bawah sini)
function openEconomy() {
  // ... Kode asli kamu ...
}
export function clearTopbar() {
  document.getElementById('topbar').innerHTML = '';
}
