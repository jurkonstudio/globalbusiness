import { TABS, HUBS, DRAWER } from '../config/layout.js';
import { ic } from '../config/icons.js';
import { state, isGuest } from '../core/state.js';
import { supabase } from '../core/supabase.js';
import { openSaveProgress } from './saveProgress.js';

export function renderBottomNav(hub) {
  document.getElementById('nav').innerHTML = TABS.map((t) => `
    <a href="${t.to}" class="${t.id === hub ? 'active' : ''}" aria-label="${t.title}"${t.id === hub ? ' aria-current="page"' : ''}>
      <span class="ico">${ic(t.icon)}${t.id === 'chat' && state.unread ? `<i class="badge">${state.unread}</i>` : ''}</span>
      <span class="lbl">${t.title}</span></a>`).join('');
}

// Chip row under the top card. Empty for areas without sub-pages (e.g. Map).
export function renderSubbar(hub, active) {
  // The world map is full-bleed: no chip row above it.
  const items = document.body.dataset.view === 'map' ? [] : (HUBS[hub]?.items ?? []);
  document.getElementById('subbar').innerHTML = items.map((it, i) =>
    `<a href="${it.to}" class="chip ${i === active ? 'active' : ''}"${i === active ? ' aria-current="page"' : ''}>${ic(it.icon)}<span>${it.title}</span></a>`).join('');
  document.getElementById('subbar').querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

export function renderDrawer() {
  const el = document.getElementById('drawer');
  el.innerHTML = `<div class="drawer-panel" role="dialog" aria-label="Menu">
    <div class="dp-head"><b>Global Business</b><small>Menu</small></div>
    <div class="dp-grid">${DRAWER.map((d) => `<a class="d-item" href="${d.to}"><span class="g">${ic(d.icon)}</span>${d.title}</a>`).join('')}</div>
    ${isGuest() ? '<button class="d-item hot" data-act="save">Save game · Create account / Log in</button>' : ''}
    <button class="d-item out" data-act="logout">Log out</button></div>`;
  el.onclick = async (e) => {
    const act = e.target.dataset.act;
    if (e.target === el) return closeDrawer();
    if (act === 'save') { closeDrawer(); openSaveProgress(); }
    if (act === 'logout') {
      if (isGuest() && !confirm('You are a guest. Logging out will lose this company. Log out anyway?')) return;
      await supabase.auth.signOut();
      state.company = null;
      location.hash = '#/auth/login';
      location.reload();
    }
  };
}

const syncExpanded = () => document.getElementById('open-drawer')?.setAttribute('aria-expanded', String(document.body.classList.contains('drawer-open')));
export const toggleDrawer = () => { document.body.classList.toggle('drawer-open'); syncExpanded(); };
export const closeDrawer = () => { document.body.classList.remove('drawer-open'); syncExpanded(); };
export function clearChrome() {
  for (const id of ['nav', 'subbar', 'drawer']) document.getElementById(id).innerHTML = '';
  closeDrawer();
}
