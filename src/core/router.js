import { MODULES } from '../config/modules.js';
import { locate } from '../config/layout.js';
import { supabase } from './supabase.js';
import { state, loadCompany } from './state.js';
import { renderTopbar, clearTopbar } from '../components/topbar.js';
import { renderBottomNav, renderSubbar, renderDrawer, closeDrawer, clearChrome } from '../components/nav.js';
import { renderTutorial, mountTutorial } from '../components/tutorial.js';
import { checkSavePrompt } from '../components/saveProgress.js';

const app = () => document.getElementById('app');
let guestPromise;

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
  const [, moduleId = 'map', subId] = location.hash.split('/');
  closeDrawer();

  if (moduleId === 'auth') {
    clearTopbar();
    clearChrome();
    document.body.dataset.view = 'auth';
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
  renderDrawer();
  checkSavePrompt();   // guests get a save-progress prompt at server-defined milestones

  // No company yet: the only reachable page is the "found your company" form.
  if (!state.company && !(moduleId === 'headquarters' && subId === 'overview')) {
    location.hash = '#/headquarters/overview';
    return;
  }

  const mod = MODULES.find((m) => m.id === moduleId) || MODULES.find((m) => m.id === 'map');
  const sub = mod.subs.find((s) => s.id === subId) || mod.subs[0];
  const where = locate(mod.id, sub.id);

  document.body.dataset.view = mod.id === 'map' && sub.id === 'world' ? 'map' : 'page';
  document.body.dataset.hub = where.hub ?? '';
  if (state.company) { renderBottomNav(where.hub); renderSubbar(where.hub, where.item); }
  else { clearChrome(); }

  const showTabs = where.tabs && !mod.hideTabs && mod.subs.length > 1;
  const tutorial = await renderTutorial();
  const page = await import(`../pages/${mod.id}/${sub.id}.js`);
  app().innerHTML = tutorial + (showTabs ? renderTabs(mod, sub.id) : '') + page.render();
  app().scrollTop = 0;
  mountTutorial();
  page.mount?.();
}
