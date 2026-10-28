import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money } from '../core/format.js';

// Ikon Bintang untuk Level (mirip Sim Companies)
const STAR_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" style="margin-right:2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
// Ikon Premium (Nexus) - Bunga/Berlian
const NEXUS_ICON = `<svg viewBox="0 0 24 24" width="26" height="26" fill="#0f83db" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));"><path d="M12 2L2 9l10 13 10-13L12 2zm0 2.5l6.5 5.5H5.5L12 4.5zM5.5 11h5v8l-5-8zm8 0h5l-5 8v-8z"/></svg>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const xp = Number(c?.xp ?? 0), pct = xp % 100;
  const nexus = Number(c?.nexus ?? 0);

  if (!c) {
    el.innerHTML = `<button class="hamb" id="open-drawer">${ic('menu')}</button>`;
  } else {
    el.innerHTML = `
      <div class="hud-left">
        <button class="hamb" id="open-drawer" aria-label="Menu">${ic('menu')}</button>
        <a class="hud-avatar" href="#/headquarters/overview" aria-label="Headquarters">
          ${esc(c.name.charAt(0).toUpperCase())}
        </a>
      </div>

      <div class="hud-right">
        <!-- Uang Cash (Pil Hijau) -->
        <a class="pill cash" href="#/banking/account" aria-label="Cash">
          ${money(c.cash)}
        </a>

        <!-- Level (Pil Biru) -->
        <div class="pill level" aria-label="Level">
          ${STAR_SVG} ${c.level}
        </div>

        <!-- XP (Pil Ungu) -->
        <div class="pill xp" aria-label="XP Progress">
          ${pct}%
        </div>

        <!-- Premium Currency (Nexus) -->
        <div class="nexus-wrap" aria-label="Nexus">
          ${NEXUS_ICON}
          <span class="nexus-badge">${money(nexus)}</span>
        </div>
      </div>
    `;
  }
  
  document.getElementById('open-drawer').onclick = toggleDrawer;
  
  // Tombol Save Game disembunyikan ke dalam menu drawer agar header tetap bersih
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
