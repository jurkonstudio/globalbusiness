import { MODULES } from '../config/modules.js';
import { ICONS } from '../config/icons.js';
import { supabase } from './supabase.js';
import { state, loadCompany } from './state.js';
import { renderTopbar, clearTopbar } from '../components/topbar.js';
import { renderTutorial, mountTutorial } from '../components/tutorial.js';

const app = () => document.getElementById('app');
let guestPromise;

function renderNav(current) {
  document.getElementById('nav').innerHTML = MODULES.map((m) =>
    `<a href="#/${m.id}/${m.subs[0].id}" class="${m.id === current ? 'active' : ''}">
       <span class="ico">${ICONS[m.id] || '•'}</span>${m.title}</a>`).join('');
}

function renderTabs(mod, sub) {
  return `<div class="tabs">${mod.subs.map((s) =>
    `<a href="#/${mod.id}/${s.id}" class="${s.id === sub ? 'active' : ''}">${s.title}</a>`).join('')}</div>`;
}

// New visitors become guests automatically and go straight into the tutorial.
async function ensureSession() {
  let { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  guestPromise ??= supabase.auth.signInAnonymously().finally(() => { guestPromise = null; });
  const { error } = await guestPromise;
  if (error) return null;
  ({ data } = await supabase.auth.getSession());
  return data.session;
}

export async function route() {
  const [, moduleId = 'headquarters', subId] = location.hash.split('/');

  if (moduleId === 'auth') {
    clearTopbar();
    document.getElementById('nav').innerHTML = '';
    const page = await import(`../pages/auth/${subId || 'login'}.js`);
    app().innerHTML = page.render();
    page.mount?.();
    return;
  }

  const session = await ensureSession();
  if (!session) { location.hash = '#/auth/login'; return; }
  state.user = session.user;

  await loadCompany();
  renderTopbar();

  if (!state.company && !(moduleId === 'headquarters' && subId === 'overview')) {
    location.hash = '#/headquarters/overview';
    return;
  }

  const mod = MODULES.find((m) => m.id === moduleId) || MODULES[0];
  const sub = mod.subs.find((s) => s.id === subId) || mod.subs[0];
  renderNav(mod.id);
  document.querySelector('#nav a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  const tutorial = await renderTutorial();
  const page = await import(`../pages/${mod.id}/${sub.id}.js`);
  app().innerHTML = tutorial + renderTabs(mod, sub.id) + page.render();
  mountTutorial();
  page.mount?.();
}
