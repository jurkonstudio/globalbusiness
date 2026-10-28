import { MODULES } from '../config/modules.js';
import { locate, TABS, HUBS } from '../config/layout.js';
import { supabase } from './supabase.js';
import { state, loadCompany } from './state.js';
import { renderTopbar, clearTopbar } from '../components/topbar.js';
import { renderBottomNav, renderSubbar, renderDrawer, closeDrawer, clearChrome } from '../components/nav.js';
import { renderTutorial, mountTutorial } from '../components/tutorial.js';
import { checkSavePrompt } from '../components/saveProgress.js';
import { errorBlock } from '../components/ui.js';

const app = () => document.getElementById('app');
const FRESH_MS = 20000;          // company/economy/tutorial data is reused for this long between page switches
let guestPromise, guestError = null, navId = 0, lastHash = null, lastLoad = 0, lastUser = null;
let tut = { at: 0, html: '' };
const keys = { top: '', drawer: '', nav: '', sub: '' };   // chrome is only re-rendered when its inputs change

function renderTabs(mod, sub) {
  return `<nav class="tabs" aria-label="${mod.title} pages">${mod.subs.map((s) =>
    `<a href="#/${mod.id}/${s.id}" class="${s.id === sub ? 'active' : ''}"${s.id === sub ? ' aria-current="page"' : ''}>${s.title}</a>`).join('')}</nav>`;
}

// New visitors become guests automatically and go straight into the game.
async function ensureSession() {
  let { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  guestPromise ??= supabase.auth.signInAnonymously().finally(() => { guestPromise = null; });
  const { error } = await guestPromise;
  if (error) {
    guestError = error.message;
    console.error('Guest sign-in failed: ' + error.message + ' (Supabase: Authentication > Sign In / Providers > enable "Allow anonymous sign-ins")');
    return null;
  }
  ({ data } = await supabase.auth.getSession());
  return data.session;
}

async function autoCompany() {
  for (let i = 0; i < 3; i++) {
    const name = 'Company ' + String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    const { error } = await supabase.rpc('create_company', { company_name: name });
    if (!error) return true;
    if (!/duplicate|unique/i.test(error.message)) return false;   // a name clash retries; anything else stops
  }
  return false;
}

const topKey = () => JSON.stringify([state.company?.name, state.company?.cash, state.company?.level, state.company?.xp, state.company?.gt,
  state.economy?.phase, state.alerts, !!state.user?.is_anonymous]);

function paintChrome(where) {
  const tk = topKey();
  if (tk !== keys.top) { keys.top = tk; renderTopbar(); }
  const dk = String(!!state.user?.is_anonymous);
  if (dk !== keys.drawer) { keys.drawer = dk; renderDrawer(); }
  if (state.company) {
    const nk = where.hub + '|' + state.unread;
    if (nk !== keys.nav) { keys.nav = nk; renderBottomNav(where.hub); }
    const sk = where.hub + '|' + where.item + '|' + document.body.dataset.view;
    if (sk !== keys.sub) { keys.sub = sk; renderSubbar(where.hub, where.item); }
  } else if (keys.nav || keys.sub) {
    keys.nav = keys.sub = '';
    document.getElementById('nav').innerHTML = ''; document.getElementById('subbar').innerHTML = '';
  }
}

async function tutorialHtml(force) {
  if (!force && tut.html !== null && Date.now() - tut.at < FRESH_MS) return tut.html;
  tut = { at: Date.now(), html: await renderTutorial() };
  return tut.html;
}

export async function route() {
  const id = ++navId;
  const stale = () => id !== navId;            // a newer tap superseded this navigation
  const forced = location.hash === lastHash;   // same hash = a page asked for fresh data (after build, buy, collect...)
  lastHash = location.hash;
  const [, moduleId = 'map', subId] = location.hash.split('/');
  closeDrawer();

  if (moduleId === 'auth') {
    clearTopbar(); clearChrome();
    keys.top = keys.drawer = keys.nav = keys.sub = ''; lastLoad = 0; lastUser = null;
    document.body.dataset.view = 'auth';
    const page = await import(`../pages/auth/${subId || 'login'}.js`);
    if (stale()) return;
    app().innerHTML = page.render();
    page.mount?.();
    return;
  }

  const session = await ensureSession();
  if (stale()) return;
  if (!session) {
    window.__gbNotice = guestError ? 'Guest play is unavailable right now. Log in or create an account to play.' : '';
    window.__gbError = guestError || '';
    location.hash = '#/auth/login';
    return;
  }
  state.user = session.user;

  // Fetch company data only when needed; otherwise render instantly from cache and refresh quietly.
  const userChanged = lastUser !== session.user.id;
  lastUser = session.user.id;
  const age = Date.now() - lastLoad;
  if (forced || userChanged || !state.company || !lastLoad) {
    await loadCompany(); lastLoad = Date.now();
    if (stale()) return;
  } else if (age > FRESH_MS) {
    lastLoad = Date.now();
    loadCompany().then(() => { if (!stale()) paintChrome(where); });
  }

  // Safety net when the database trigger (migration 004) is missing: create a default company right away.
  if (!state.company) {
    await autoCompany();
    if (stale()) return;
    await loadCompany(); lastLoad = Date.now();
    if (stale()) return;
  }

  // Still no company (RPC failed): the only reachable page is the "found your company" form.
  if (!state.company && !(moduleId === 'headquarters' && subId === 'overview')) {
    location.hash = '#/headquarters/overview';
    return;
  }

  const mod = MODULES.find((m) => m.id === moduleId) || MODULES.find((m) => m.id === 'map');
  const sub = mod.subs.find((s) => s.id === subId) || mod.subs[0];
  const where = locate(mod.id, sub.id);

  document.body.dataset.view = mod.id === 'map' && sub.id === 'world' ? 'map' : 'page';
  document.body.dataset.hub = where.hub ?? '';
  paintChrome(where);
  checkSavePrompt();   // throttled; guests get the save-progress prompt at server-defined milestones

  const isWorld = mod.id === 'map' && sub.id === 'world';
  const showTabs = where.tabs && !mod.hideTabs && !isWorld && mod.subs.length > 1;
  document.title = `${sub.title} · ${mod.title} · Global Business`;
  const [tutorial, page] = await Promise.all([
    tutorialHtml(forced || userChanged),
    import(`../pages/${mod.id}/${sub.id}.js`).catch(() => null),
  ]);
  if (stale()) return;
  let html;
  try {
    html = page ? tutorial + (showTabs ? renderTabs(mod, sub.id) : '') + page.render()
      : `<div class="page">${errorBlock('Check your connection and try again.')}</div>`;
  } catch (err) {
    console.error(err);
    html = `<div class="page">${errorBlock('Something went wrong while drawing this page.')}</div>`;
  }
  app().innerHTML = html;
  app().scrollTop = 0;
  mountTutorial();
  page?.mount?.();
  idlePrefetch();
}

// ---- Prefetch page modules so tab switches never wait on the network ----
const warmed = new Set();
function warm(hash) {
  const [, m, s] = hash.split('/');
  const mod = MODULES.find((x) => x.id === m);
  const sub = mod && (mod.subs.find((x) => x.id === s) || mod.subs[0]);
  if (!sub || warmed.has(`${mod.id}/${sub.id}`)) return;
  warmed.add(`${mod.id}/${sub.id}`);
  import(`../pages/${mod.id}/${sub.id}.js`).catch(() => warmed.delete(`${mod.id}/${sub.id}`));
}
let idleDone = false;
function idlePrefetch() {
  if (idleDone) return;
  idleDone = true;
  const run = () => {
    TABS.forEach((t) => warm(t.to));
    Object.values(HUBS).forEach((h) => h.items.forEach((it) => warm(it.to)));
  };
  (window.requestIdleCallback || ((f) => setTimeout(f, 1500)))(run);
}
// Start loading the target page as soon as a finger touches a link.
document.addEventListener('pointerdown', (e) => {
  const a = e.target.closest?.('a[href^="#/"]');
  if (a) warm(a.getAttribute('href'));
}, { passive: true });

// "Try again" buttons rendered by errorBlock() re-run the current route.
document.addEventListener('click', (e) => { if (e.target.closest?.('[data-retry]')) route(); });
