import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money, gt } from '../core/format.js';

// SVG Koin Emas
const COIN_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fbbf24" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-3-9h4.5a2.5 2.5 0 0 1 0 5H9m0 0h5" stroke="#78350f" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;

// SVG Bintang
const STAR_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" fill="#fff" style="margin-right:3px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

// SVG Berlian 3D Premium
const GEM_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" style="margin-right:4px;"><path d="M12 2L2 9l10 13 10-13L12 2z" fill="#38bdf8"/><path d="M12 2L2 9h20L12 2z" fill="#7dd3fc"/><path d="M12 2v20l10-13L12 2z" fill="#0284c7"/></svg>`;

// Level ring: the gold arc is the share of EXP earned toward the next level (pathLength=100 -> dasharray is a plain %).
const levelRing = (level, pct) => `<span class="lvl" role="img" aria-label="Level ${level}, ${pct}% to next level" style="--p:${pct}">
  <svg viewBox="0 0 28 28" aria-hidden="true"><circle class="trk" cx="14" cy="14" r="11.5" pathLength="100"/><circle class="bar" cx="14" cy="14" r="11.5" pathLength="100" stroke-dasharray="${pct} 100"/></svg>
  <b aria-hidden="true">${level}</b></span>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
<<<<<<< HEAD
  const nexus = Number(c?.nexus ?? 0);
=======
  const xp = Number(c?.xp ?? 0), pct = Math.max(0, Math.min(99, Math.floor(xp % 100)));
  const phase = state.economy?.phase || 'normal';
  const name = esc(c?.name ?? '');
  el.innerHTML = `
    <button class="hamb" id="open-drawer" aria-label="Menu${state.alerts ? ', ' + state.alerts + ' production ready' : ''}" aria-expanded="false" aria-controls="drawer">${ic('menu')}${state.alerts ? '<i class="dot"></i>' : ''}</button>
    ${c ? `<a class="brand" href="#/headquarters/overview" aria-label="Headquarters, ${name}"><span class="mono" aria-hidden="true">${esc(c.name.charAt(0).toUpperCase())}</span></a>
      <button class="phase" id="open-economy" data-p="${phase}" aria-label="Economy phase: ${cap(phase)}"><i></i></button>
      <div class="wallet">
        <a class="cash" href="#/banking/account" aria-label="Cash ${money(c.cash)}. Open account">${ic('coin')}<b>${money(c.cash)}</b></a>
        <div class="gtrow">
          <span class="gt" aria-label="${gt(c.gt)} Global Token">${ic('gt')}<b>${gt(c.gt)}</b></span>
          ${levelRing(Number(c.level ?? 0), pct)}
        </div>
      </div>` : '<span class="brand"></span>'}
    ${isGuest() ? `<button class="acct" id="open-auth" aria-label="Save your game">${ic('exec')}</button>` : ''}`;
  document.getElementById('open-auth')?.addEventListener('click', () => openAuthPanel('signup'));
  document.getElementById('open-drawer').onclick = toggleDrawer;
  document.getElementById('open-economy')?.addEventListener('click', openEconomy);
}
>>>>>>> 17bddfe (Header ikon-saja, tambah GT dan cincin level EXP)

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
