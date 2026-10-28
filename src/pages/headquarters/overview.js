import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { mountGlobe } from '../../components/globe.js';
import { esc } from '../../core/escape.js';
import { ic } from '../../config/icons.js';
import { metric, statusChip, stateBlock, errorBlock, skeleton, progressBar, busy } from '../../components/ui.js';
import { fetchLedger, sumFlows, ledgerList } from '../../components/ledger.js';
import { loadOps, describe } from '../../core/ops.js';
import { money, money2, signed2, duration, clock } from '../../core/format.js';

export function render() {
  const c = state.company;

  if (!c) {
    return shell('Headquarters', 'Found your company', `
      <div class="card stack" style="max-width:420px">
        <div class="fld"><label for="company-name">Company name</label>
        <input id="company-name" placeholder="e.g. Nusantara Trading" maxlength="30" autocomplete="off" />
        <span class="hint">3 to 30 characters.</span></div>
        <button class="btn" id="create-company">Found company</button>
        <p class="msg" id="msg" role="alert"></p>
      </div>`);
  }

  const pct = Number(c.xp ?? 0) % 100;
  return shell('Headquarters', 'Overview', `<div class="dash">
    <section class="hero" aria-label="Company finances">
      <div><span class="mt-l">Cash on hand</span><div class="big">${money2(c.cash)}</div>
        <span class="mt-s">Spendable balance only. Goods and buildings are not included.</span></div>
      <div class="split">
        <div id="hero-flow">${metric({ label: 'Net cash flow, 24 h', value: '<span class="num">…</span>' })}</div>
        ${metric({ label: `Level ${c.level}`, value: `<span class="num">${pct}%</span>`, sub: 'progress to next level' })}
      </div>
    </section>

    <section aria-labelledby="h-att"><div class="sec-h"><h2 id="h-att">Needs attention</h2></div><div id="alerts">${skeleton(2, 58)}</div></section>

    <div class="dash-cols">
      <section aria-labelledby="h-ops"><div class="sec-h"><h2 id="h-ops">Operations</h2><a href="#/buildings/production">Production</a></div><div id="ops">${skeleton(3, 70)}</div></section>
      <div class="dash">
        <section aria-labelledby="h-fin"><div class="sec-h"><h2 id="h-fin">Last 24 hours</h2><a href="#/headquarters/statistics">Statistics</a></div>
          <div class="kpis" id="fin">${skeleton(1, 64)}</div>
          <p class="honest">Cash flow is not profit. Asset value and profit are not tracked by the game yet.</p></section>
        <section aria-labelledby="h-act"><div class="sec-h"><h2 id="h-act">Recent activity</h2><a href="#/banking/transactions">Cash ledger</a></div><div id="recent">${skeleton(3, 58)}</div></section>
      </div>
    </div>

    <details class="fold" id="co-fold"><summary>Company profile</summary>
      <div class="stack"><div class="fld"><label for="rename">Company name</label>
        <input id="rename" value="${esc(c.name)}" maxlength="30" autocomplete="off" /></div>
        <button class="btn" id="rename-go">Rename</button><p class="msg" id="rename-msg" role="alert"></p></div>
      <div class="globe small" id="globe" aria-label="Decorative globe"></div>
    </details>
  </div>`);
}

const STATE_UI = {
  build:   { chip: ['Building', 'info'],   verb: (o) => `Under construction` },
  upgrade: { chip: ['Upgrading', 'info'],  verb: (o) => `Upgrading to level ${o.to ?? '?'}` },
  running: { chip: ['Producing', 'warn'],  verb: (o) => `Producing ${esc(o.out)}` },
  ready:   { chip: ['Ready', 'ok'],        verb: (o) => `${esc(o.out)} ready to collect` },
  blocked: { chip: ['Blocked', 'bad'],     verb: () => 'Cannot start' },
  idle:    { chip: ['Idle', 'idle'],       verb: () => 'Waiting for orders' },
  passive: { chip: ['No recipes', 'idle'], verb: () => 'Has no production recipes' },
};
const ORDER = { ready: 0, blocked: 1, idle: 2, running: 3, upgrade: 4, build: 5, passive: 6 };

function opRow(o) {
  const ui = STATE_UI[o.state];
  const timed = o.end ? `<span class="tm cd" data-finish="${o.end}">${duration((o.end - Date.now()) / 1000)}</span>` : '';
  const prog = o.end && o.start ? `<div data-p="${o.start}:${o.end}">${progressBar(o.start, o.end)}</div>` : '';
  const why = o.state === 'blocked' ? `<small>Missing ${o.missing.slice(0, 3).map((m) => `${esc(m.name)} (${m.have} of ${m.need})`).join(', ')}</small>` : '';
  return `<li class="op"><div class="tx"><b>${esc(o.name)} <span class="muted" style="font-weight:500">LVL ${o.level}</span></b>
    <small>${ui.verb(o)}</small>${why}${prog}</div>${timed}${statusChip(...ui.chip)}</li>`;
}

function buildAlerts(list, ops) {
  const n = (s) => list.filter((x) => x.state === s);
  const out = [];
  if (!list.length) out.push({ tone: '', icon: 'build', t: 'You have no buildings yet', d: 'Place your first building on the map to start producing.', to: '#/map/world', go: 'Open map' });
  if (n('ready').length) out.push({ tone: 'ok', icon: 'check', t: `${n('ready').length} production run${n('ready').length > 1 ? 's' : ''} ready to collect`, d: n('ready').map((x) => x.out).slice(0, 3).join(', '), to: '#/buildings/production', go: 'Collect' });
  if (n('blocked').length) {
    const names = [...new Set(n('blocked').flatMap((x) => x.missing.map((m) => m.name)))];
    out.push({ tone: 'bad', icon: 'alert', t: `${n('blocked').length} building${n('blocked').length > 1 ? 's' : ''} cannot start production`, d: `Missing: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`, to: '#/warehouse/inventory', go: 'Restock' });
  }
  if (n('idle').length) out.push({ tone: '', icon: 'clock', t: `${n('idle').length} idle building${n('idle').length > 1 ? 's' : ''}`, d: 'Inputs are in stock. Start a production run.', to: '#/buildings/production', go: 'Start' });
  return out;
}

const alertRow = (a) => `<li class="alert ${a.tone}">${ic(a.icon)}<div class="tx"><b>${esc(a.t)}</b><small>${esc(a.d)}</small></div><a class="go" href="${a.to}">${a.go}</a></li>`;

async function fillData() {
  const [ops, day, recent] = await Promise.all([loadOps(), fetchLedger({ since: Date.now() - 864e5, limit: 1000 }), fetchLedger({ limit: 5 })]);
  const $ = (id) => document.getElementById(id);
  if (!$('ops')) return;   // the player left the page

  if (ops.error) {
    $('ops').innerHTML = errorBlock('Operations data could not be loaded.'); $('alerts').innerHTML = '';
  } else {
    const list = describe(ops).sort((a, b) => ORDER[a.state] - ORDER[b.state]);
    const alerts = buildAlerts(list, ops);
    $('alerts').innerHTML = alerts.length ? `<ul class="alerts">${alerts.map(alertRow).join('')}</ul>`
      : `<div class="state ok" role="status">${ic('check')}<b>Nothing needs your attention</b><p>All buildings are busy. The next one finishes soon.</p></div>`;
    $('ops').innerHTML = list.length ? `<ul class="ops">${list.map(opRow).join('')}</ul>`
      : stateBlock({ icon: 'build', title: 'No buildings yet', text: 'Buildings you place on the map will be listed here with their timers.', action: { href: '#/map/world', label: 'Open map' } });
  }

  if (day.error) {
    $('hero-flow').innerHTML = metric({ label: 'Net cash flow, 24 h', value: 'Unavailable', tone: 'dim' });
    $('fin').innerHTML = stateBlock({ icon: 'alert', title: 'Ledger unavailable', text: 'Cash flow could not be loaded.' });
  } else {
    const f = sumFlows(day.rows);
    $('hero-flow').innerHTML = metric({ label: 'Net cash flow, 24 h', value: `<span class="num">${signed2(f.net)}</span>`, tone: f.net < 0 ? 'neg' : f.net > 0 ? 'pos' : '', sub: day.capped ? 'partial: 1,000 entry limit' : '' });
    $('fin').className = 'kpis';
    $('fin').innerHTML = metric({ label: 'Money in', value: `<span class="num">${money(f.income)}</span>`, tone: 'pos' })
      + metric({ label: 'Money out', value: `<span class="num">${money(f.expense)}</span>`, tone: 'neg' });
  }
  $('recent').innerHTML = recent.error ? errorBlock('Recent activity could not be loaded.', false)
    : recent.rows.length ? ledgerList(recent.rows)
    : stateBlock({ icon: 'doc', title: 'No activity yet', text: 'Purchases, sales, construction and rewards show up here.', action: { href: '#/warehouse/inventory', label: 'Open warehouse' } });

  // One timer for every countdown on the page. When something finishes, reload the data (same hash = fresh data).
  const timer = setInterval(() => {
    const root = $('ops');
    if (!root?.isConnected) return clearInterval(timer);
    let done = false;
    root.querySelectorAll('.cd').forEach((c) => {
      const left = (Number(c.dataset.finish) - Date.now()) / 1000;
      if (left <= 0) done = true; else c.textContent = duration(left);
    });
    root.querySelectorAll('[data-p]').forEach((p) => { const [s, e] = p.dataset.p.split(':').map(Number); p.innerHTML = progressBar(s, e); });
    if (done) { clearInterval(timer); window.dispatchEvent(new Event('hashchange')); }
  }, 1000);
}

export function mount() {
  const btn = document.getElementById('create-company');
  if (btn) {
    btn.onclick = () => busy(btn, async () => {
      const name = document.getElementById('company-name').value.trim();
      const msg = document.getElementById('msg');
      if (name.length < 3) { msg.textContent = 'Name must be at least 3 characters.'; return; }
      const { error } = await supabase.rpc('create_company', { company_name: name });
      if (error) msg.textContent = error.message;
      else window.dispatchEvent(new Event('hashchange'));
    });
    return;
  }
  const rn = document.getElementById('rename-go');
  if (rn) rn.onclick = () => busy(rn, async () => {
    const { error } = await supabase.rpc('rename_company', { new_name: document.getElementById('rename').value });
    if (error) document.getElementById('rename-msg').textContent = error.message;
    else window.dispatchEvent(new Event('hashchange'));
  });
  // The globe is decoration: only start WebGL when the player opens the profile fold.
  const fold = document.getElementById('co-fold');
  if (fold) fold.addEventListener('toggle', () => {
    const g = document.getElementById('globe');
    if (fold.open && g && !g.firstChild) mountGlobe(g);
  });
  fillData();
}
