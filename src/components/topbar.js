import { state, isGuest } from '../core/state.js';
import { openAuthPanel } from './authPanel.js';
import { ic } from '../config/icons.js';
import { toggleDrawer } from './nav.js';
import { esc } from '../core/escape.js';
import { money, gt } from '../core/format.js';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Level ring: the gold arc is the share of EXP earned toward the next level (pathLength=100 -> dasharray is a plain %).
const levelRing = (level, pct) => `<span class="lvl" role="img" aria-label="Level ${level}, ${pct}% to next level" style="--p:${pct}">
  <svg viewBox="0 0 28 28" aria-hidden="true"><circle class="trk" cx="14" cy="14" r="11.5" pathLength="100"/><circle class="bar" cx="14" cy="14" r="11.5" pathLength="100" stroke-dasharray="${pct} 100"/></svg>
  <b aria-hidden="true">${level}</b></span>`;

export function renderTopbar() {
  const el = document.getElementById('topbar');
  const c = state.company;
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
