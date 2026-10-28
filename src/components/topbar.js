import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money } from '../core/format.js';

// Ikon Bintang (untuk Level)
const STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" style="margin-right:3px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
// Ikon Bunga/Berlian (untuk Nexus - mirip Sim Companies)
const PREMIUM_SVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="#0f83db" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,0.4));"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/><circle cx="12" cy="12" r="2" fill="#fff"/></svg>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
  const xp = Number(c?.xp ?? 0), pct = xp % 100;
  const nexus = Number(c?.nexus ?? 0);

  if (!c) {
    el.innerHTML = `<button class="hamb" id="open-drawer">${ic('menu')}</button>`;
    document.getElementById('open-drawer').onclick = toggleDrawer;
    return;
  }

  // Struktur persis seperti Sim Companies: Kiri (Menu+Avatar) - Spacer - Kanan (Pil-pil)
  el.innerHTML = `
    <div class="hud-left">
      <button class="hamb" id="open-drawer" aria-label="Menu">${ic('menu')}</button>
      <a class="hud-avatar" href="#/headquarters/overview">
        ${esc(c.name.charAt(0).toUpperCase())}
      </a>
    </div>

    <div class="hud-spacer"></div>

    <div class="hud-right">
      <!-- 1. Cash (Hijau) -->
      <a class="sc-pill cash" href="#/banking/account">
        ${money(c.cash)}
      </a>

      <!-- 2. Level (Biru) -->
      <div class="sc-pill level">
        ${STAR_SVG} ${c.level}
      </div>

      <!-- 3. XP (Ungu) -->
      <div class="sc-pill xp">
        ${pct}%
      </div>

      <!-- 4. Premium Currency (Ikon Biru + Badge) -->
      <div class="sc-premium" aria-label="Nexus">
        ${PREMIUM_SVG}
        <span class="premium-badge">${money(nexus)}</span>
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
