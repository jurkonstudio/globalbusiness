import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { toast } from './toast.js';
import { ic } from '../config/icons.js';
import { mountMapIso } from './mapIso.js';
import { confirmDialog, busy, classifyError } from './ui.js';
import { esc } from '../core/escape.js';
import { missingFor } from '../core/ops.js';
import { qty } from '../core/format.js';
import { REGIONS, REGION, BONUS_LABEL, landFee } from '../config/regions.js';
import { loadMissions, claimable, openMissions } from './missions.js';

const ICON = { agriculture: '🌳', utility: '⚡', extraction: '⛏️', construction: '🧱', retail: '🛒' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const dur = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m` : `${s}s`;
const MAX_LEVEL = 6;
const upgradeCost = (bt, lvl) => Math.round(bt.build_cost * lvl * 0.6);
const upgradeSecs = (bt, lvl) => Math.max(bt.build_seconds ?? 0, 60) * lvl;

// The 3D scene mounts into #map-stage. `inline` = embedded in a normal page (Land Slots), no HUD.
export const landGridHtml = (inline = false) => `<div id="map-stage" class="map-stage${inline ? ' inline' : ''}">
    <div id="map-fallback" hidden></div>${inline ? '' : '<div class="map-hint" id="map-hint">Drag to pan · pinch to zoom · tap a plot to build, tap a building to run it</div>'}</div>
  ${inline ? '' : `<div class="hud rbar"><div class="rinfo" id="map-rinfo"></div><div class="rchips" id="map-chips"></div></div>
  <a class="hud idle" href="#/buildings/production" id="idle-box"></a>
  <div class="hud tools">
    <button class="tool" id="map-missions" aria-label="Missions">🎯<i class="badge" id="ms-badge" hidden></i></button>
    <button class="tool" id="map-collect" aria-label="Collect all" hidden>🧺<i class="badge" id="col-badge"></i></button>
    <button class="tool" id="map-reset" aria-label="World view">${ic('globe')}</button>
    <a class="fab" href="#/buildings/construction" aria-label="Build">${ic('build')}</a>
  </div>`}`;

function idleBox() {
  const el = document.getElementById('idle-box');
  if (!el) return;
  const { idle, nextIdle } = state.stats;
  const t = nextIdle ? nextIdle.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
  el.innerHTML = `Idle buildings: <b>${idle}</b><br>Next idle: <b>${t}</b>`;
}

// ---- Region bar (chips + one info line) ----
let curRegion = 'home';
function regionUI(id = curRegion) {
  curRegion = id;
  const chips = document.getElementById('map-chips'), info = document.getElementById('map-rinfo');
  if (!chips || !info) return;
  const lvl = state.company?.level ?? 0;
  chips.innerHTML = `<button class="chip${id === null ? ' on' : ''}" data-r="">🌍 World</button>` + REGIONS.map((r) =>
    `<button class="chip${r.id === id ? ' on' : ''}${lvl < r.unlock ? ' lock' : ''}" data-r="${r.id}">${lvl < r.unlock ? '🔒 ' : ''}${r.name}</button>`).join('');
  const r = REGION[id];
  info.innerHTML = !r ? 'World view · tap an island to visit it'
    : lvl < r.unlock ? `🔒 <b>${r.name}</b> unlocks at Level ${r.unlock} (you are Level ${lvl})`
    : `<b>${r.name}</b>${r.bonus ? ` · ${BONUS_LABEL[r.bonus]} +${r.pct}%` : ' · Headquarters'}${r.distance ? ` · land fee ${money(landFee(r))} · freight on harvest` : ' · no freight'}`;
}

// The 3D scene is created once and re-attached on every visit to the map (no WebGL restart, no re-download).
let kept = null, ctx = null, lastSig = '', lastAct = 0, welcomed = false, reload = () => {};

function onPick(region, slot) {
  if (!ctx) return;
  const r = REGION[region], lvl = state.company.level;
  if (lvl < r.unlock) { toast(`${r.name} unlocks at Level ${r.unlock}.`); return; }
  const x = ctx.bySlot[`${region}:${slot}`];
  if (x) return openBuilding(x);
  if (!state.company.tutorial_done) {
    if (region !== 'home') { toast('Finish the tutorial on Home Isle first.'); return; }
    if (ctx.hasOrchard && lvl < 1) { toast('Wait for your apples to grow, then collect them.'); return; }
    if (ctx.hasStore) { toast('Open Retail > Stores and put your apples on sale.'); return; }
  }
  choose(region, slot, ctx.types);
}

// Every piece of progress lives in Supabase (finish_at timestamps). The map only displays it.
async function fetchData() {
  await supabase.rpc('sync_progress');            // settle upgrades that finished while the player was away
  const cols = 'id, slot, level, region_id, build_finish_at, upgrade_finish_at, upgrade_to, building_types(id, slug, name, category, build_cost, build_seconds)';
  let b = await supabase.from('buildings').select(cols).not('slot', 'is', null);
  if (b.error) b = await supabase.from('buildings').select('id, slot, level, building_types(id, slug, name, category, build_cost)').not('slot', 'is', null);   // migrations 005/006 missing
  const [t, j, r, i] = await Promise.all([
    supabase.from('building_types').select('*').order('unlock_level').order('build_cost'),
    supabase.from('production_jobs').select('id, building_id, recipe_id, runs, finish_at').eq('collected', false),
    supabase.from('recipes').select('id, building_type_id, output_qty, duration_seconds, resources(name), recipe_inputs(qty, resource_id, resources(name))'),
    supabase.from('inventory').select('resource_id, quantity'),
  ]);
  return { b: b.data ?? [], t: t.data ?? [], j: j.data ?? [], recipes: r.data ?? [], stock: Object.fromEntries((i.data ?? []).map((x) => [x.resource_id, Number(x.quantity)])) };
}

// What the map shows on every building: build / upgrade / ready / running / idle / blocked / passive (stores, no recipe).
function statusOf(x, jobOf, recipes, stock) {
  const now = Date.now(), bt = x.building_types;
  if (x.build_finish_at && new Date(x.build_finish_at) > now)
    return { status: 'build', finishAt: x.build_finish_at, startAt: bt.build_seconds ? new Date(new Date(x.build_finish_at) - bt.build_seconds * 1000).toISOString() : null };
  if (x.upgrade_finish_at) return { status: 'upgrade', finishAt: x.upgrade_finish_at };
  const job = jobOf[x.id];
  if (job) return new Date(job.finish_at) <= now ? { status: 'ready' } : { status: 'running', finishAt: job.finish_at };
  if (bt.category === 'retail') return { status: 'passive' };
  const mine = recipes.filter((r) => r.building_type_id === bt.id);
  if (!mine.length) return { status: 'passive' };
  const best = Math.min(...mine.map((r) => missingFor(r, x.level ?? 1, stock).length));
  return { status: best ? 'blocked' : 'idle' };
}

export async function mountLandGrid() {
  const stage = document.getElementById('map-stage');
  if (!stage) return;
  const inline = stage.classList.contains('inline');
  idleBox(); regionUI();
  const dataP = fetchData();

  let map;
  if (!inline && kept) { if (stage !== kept.stage) stage.replaceWith(kept.stage); map = kept.map; }
  else {
    map = await mountMapIso(stage, { level: state.company.level, onPick, keepAlive: !inline,
      onRegion: (id) => regionUI(id), onTimerDone: () => reload() });
    if (map && !inline) kept = { stage, map };
  }
  reload = () => { if (document.getElementById('map-stage')) mountLandGrid(); };

  const { b, t, j, recipes, stock } = await dataP;
  const jobOf = Object.fromEntries(j.map((x) => [x.building_id, x]));
  const bySlot = Object.fromEntries(b.map((x) => [`${x.region_id ?? 'home'}:${x.slot}`, x]));
  ctx = { bySlot, types: t, jobOf, recipes, stock, jobs: j, hasOrchard: b.some((x) => x.building_types.slug === 'apple-orchard'),
          hasStore: b.some((x) => x.building_types.slug === 'grocery-store') };

  if (!map) return fallback2D(stage);                           // no WebGL / three.js blocked
  map.setLevel(state.company.level);
  const items = b.map((x) => ({
    region: x.region_id ?? 'home', slot: x.slot, level: x.level ?? 1, slug: x.building_types.slug, name: x.building_types.name,
    category: x.building_types.category, ...statusOf(x, jobOf, recipes, stock),
    flow: x.building_types.category === 'retail' ? !(x.build_finish_at && new Date(x.build_finish_at) > Date.now()) : !!jobOf[x.id],
  }));
  const sig = JSON.stringify(items);
  if (inline || sig !== lastSig) { map.setBuildings(items); if (!inline) lastSig = sig; }   // skip rebuild when nothing changed

  if (!inline) {
    regionUI(map.currentRegion());
    const reset = document.getElementById('map-reset'); if (reset) reset.onclick = () => map.showWorld();
    const chips = document.getElementById('map-chips');
    if (chips) chips.onclick = (e) => {
      const c = e.target.closest('[data-r]'); if (!c) return;
      c.dataset.r ? map.focus(c.dataset.r) : map.showWorld();
    };
    const ms = document.getElementById('map-missions'); if (ms) ms.onclick = () => openMissions(refreshBadge);
    refreshBadge(); collectBtn();
    setTimeout(() => document.getElementById('map-hint')?.classList.add('gone'), 5000);
    watchAway();
  }
  if (Date.now() - lastAct > 30000) {                           // shared world: how many companies are in each region
    lastAct = Date.now();
    supabase.rpc('region_activity').then(({ data }) => {
      if (data) map.setActivity(Object.fromEntries(data.map((x) => [x.region_id, { companies: Number(x.companies), buildings: Number(x.buildings) }])));
    });
  }
}

// "Collect all": one tap harvests every finished production run.
function collectBtn() {
  const btn = document.getElementById('map-collect'); if (!btn || !ctx) return;
  const ready = ctx.jobs.filter((x) => new Date(x.finish_at) <= Date.now());
  btn.hidden = !ready.length; document.getElementById('col-badge').textContent = ready.length;
  btn.onclick = () => busy(btn, async () => {
    let total = 0, n = 0;
    for (const x of ready) { const { data, error } = await supabase.rpc('collect_production', { p_job: x.id }); if (error) { toast(classifyError(error).text, true); break; } total += Number(data) || 0; n++; }
    if (n) toast(`Collected ${n} run${n > 1 ? 's' : ''} (${qty(total)} items)`);
    window.dispatchEvent(new Event('hashchange'));
  });
}

async function refreshBadge() {
  const el = document.getElementById('ms-badge');
  if (!el) return;
  const list = await loadMissions();
  const n = state.company?.tutorial_done ? claimable(list) : 0;
  el.hidden = !n; el.textContent = n;
  if (!list) document.getElementById('map-missions')?.remove();   // migration 005 missing
}

// ---- "While you were away" ----
let hiddenAt = 0, watching = false;
async function welcome() {
  const { data } = await supabase.rpc('welcome_back');
  if (!data || data.away_seconds < 120 || !(data.built || data.upgraded || data.ready || Number(data.sold) > 0)) return;
  const rows = [
    data.built ? `🔨 ${data.built} building${data.built > 1 ? 's' : ''} finished construction` : '',
    data.upgraded ? `⬆️ ${data.upgraded} upgrade${data.upgraded > 1 ? 's' : ''} completed` : '',
    data.ready ? `🍎 ${data.ready} production run${data.ready > 1 ? 's' : ''} ready to collect` : '',
    Number(data.sold) > 0 ? `🛒 Your stores sold ${Number(data.sold)} item${Number(data.sold) > 1 ? 's' : ''} for ${money(Number(data.revenue))}` : '',
  ].filter(Boolean);
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box"><h3>Welcome back!</h3>
    <p class="muted">While you were away (${dur(data.away_seconds)}):</p>
    <ul class="list">${rows.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${data.ready ? '<a class="btn" href="#/buildings/production" id="wb-go">Collect now</a>' : ''}
    <button class="btn-ghost" id="no">Continue</button></div>`;
  document.body.appendChild(m);
  m.onclick = (e) => { if (e.target === m || e.target.id === 'no' || e.target.closest('a')) m.remove(); };
  reload();
}
function watchAway() {
  if (!welcomed) { welcomed = true; welcome(); }
  if (watching) return;
  watching = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 120000) { welcome(); }
    hiddenAt = 0;
  });
}

// Plain grid used only when WebGL is unavailable (home island + region tabs).
let fbRegion = 'home';
function fallback2D(stage) {
  const el = document.getElementById('map-fallback');
  el.hidden = false;
  const lvl = state.company.level;
  const draw = () => {
    const r = REGION[fbRegion];
    el.innerHTML = `<div class="fb-tabs">${REGIONS.map((x) => `<button class="chip${x.id === fbRegion ? ' on' : ''}${lvl < x.unlock ? ' lock' : ''}" data-region="${x.id}">${x.name}</button>`).join('')}</div>` +
      Array.from({ length: r.slots }, (_, i) => {
        const x = ctx.bySlot[`${r.id}:${i}`];
        return x ? `<button class="map-slot used" data-slot="${i}">${ICON[x.building_types.category] ?? '🏭'}</button>`
                 : `<button class="map-slot" data-slot="${i}" aria-label="Empty plot">+</button>`;
      }).join('');
  };
  draw();
  el.onclick = (e) => {
    const tab = e.target.closest('[data-region]'); if (tab) { fbRegion = tab.dataset.region; draw(); return; }
    const s = e.target.closest('[data-slot]'); if (s) onPick(fbRegion, Number(s.dataset.slot));
  };
}

// ---- Sheets ----
const statusLine = (x) => {
  if (x.build_finish_at && new Date(x.build_finish_at) > Date.now()) return `🔨 Under construction · ready ${new Date(x.build_finish_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  if (x.upgrade_finish_at) return `⬆️ Upgrading to LVL ${x.upgrade_to} · ready ${new Date(x.upgrade_finish_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  return '';
};

const demolishValue = (bt, lvl) => { let sum = Number(bt.build_cost); for (let l = 1; l < lvl; l++) sum += upgradeCost(bt, l); return Math.round(sum * 0.4); };

// Building sheet: everything you do with a building, straight from the map.
//   produce (start / collect) -> upgrade -> demolish
function openBuilding(x) {
  const bt = x.building_types, lvl = x.level ?? 1, status = statusLine(x), upBusy = !!status;
  const job = ctx.jobOf[x.id], jobDone = job && new Date(job.finish_at) <= Date.now(), jobRun = job && !jobDone;
  const retail = bt.category === 'retail', recipes = ctx.recipes.filter((r) => r.building_type_id === bt.id);
  const cost = upgradeCost(bt, lvl), secs = upgradeSecs(bt, lvl), refund = demolishValue(bt, lvl);
  const canStart = !upBusy && !job && !retail && recipes.length;
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box"><h3>${esc(bt.name)} · LVL ${lvl}</h3>
    <p class="muted">${esc(REGION[x.region_id ?? 'home'].name)}${status ? ' · ' + esc(status) : ''}</p>
    ${jobDone ? `<button class="btn" id="col">Collect ${esc(recipes.find((r) => r.id === job.recipe_id)?.resources?.name ?? 'goods')}</button>` : ''}
    ${jobRun ? `<p class="ps-run">🏭 Producing <b>${esc(recipes.find((r) => r.id === job.recipe_id)?.resources?.name ?? 'goods')}</b>, ready ${new Date(job.finish_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>` : ''}
    ${canStart ? `<div class="ps-prod"><div class="fld"><label for="ps-r">Recipe</label><select id="ps-r">${recipes.map((r) => `<option value="${r.id}">${esc(r.resources?.name)}</option>`).join('')}</select></div>
      <div class="fld"><label for="ps-n">Runs (1 to 20)</label><input id="ps-n" type="number" inputmode="numeric" min="1" max="20" step="1" value="1" /></div>
      <div class="flow" id="ps-flow"></div><p class="why" id="ps-why" hidden></p>
      <button class="btn" id="start">Start production</button></div>` : ''}
    ${retail && !upBusy ? '<a class="btn" href="#/retail/stores">Open store</a>' : ''}
    <p class="muted">${retail ? 'Sales speed' : 'Capacity'} ×${lvl}${lvl < MAX_LEVEL ? ` → ×${lvl + 1} after upgrade` : ''}</p>
    ${lvl >= MAX_LEVEL ? '<p class="muted">Maximum level reached.</p>'
      : upBusy ? '' : job ? '<p class="muted">Collect or finish production before upgrading.</p>'
      : `<button class="btn-ghost" id="up">Upgrade to LVL ${lvl + 1} · ${money(cost)} · ${dur(secs)}</button>`}
    <button class="btn-ghost ps-danger" id="del" ${upBusy || job || !state.company.tutorial_done ? 'disabled' : ''}>Demolish · refund about ${money(refund)}</button>
    ${!state.company.tutorial_done ? '<p class="muted">Demolishing unlocks after the tutorial.</p>' : job ? '<p class="muted">Collect the finished goods first to demolish.</p>' : ''}
    <button class="btn-ghost" id="no">Close</button></div>`;
  document.body.appendChild(m);
  const done = (msg) => { m.remove(); toast(msg); window.dispatchEvent(new Event('hashchange')); };

  const box = m.querySelector('.ps-prod');
  if (box) {
    const paint = () => {
      const rc = recipes.find((r) => r.id === Number(m.querySelector('#ps-r').value)), raw = Number(m.querySelector('#ps-n').value), runs = Math.floor(raw);
      const valid = Number.isInteger(raw) && runs >= 1 && runs <= 20, r = valid ? runs : 1;
      const ins = rc.recipe_inputs.map((i) => ({ name: i.resources?.name, need: i.qty * lvl * r, have: ctx.stock[i.resource_id] ?? 0 }));
      const short = ins.filter((i) => i.have < i.need);
      m.querySelector('#ps-flow').innerHTML = (ins.length ? ins.map((i) => `<span class="res${i.have < i.need ? ' short' : ''}">${qty(i.need)} ${esc(i.name)} <small>(have ${qty(i.have)})</small></span>`).join('') : '<span class="res">No inputs</span>')
        + `<span class="arrow">→</span><span class="res">${dur(rc.duration_seconds * r)}</span><span class="arrow">→</span><span class="res"><b>${qty(rc.output_qty * lvl * r)} ${esc(rc.resources?.name)}</b></span>`;
      const why = m.querySelector('#ps-why'), reason = !valid ? 'Enter a whole number of runs from 1 to 20.' : short.length ? `Not enough ${short.map((i) => i.name).join(', ')}. Buy or produce it first.` : '';
      why.hidden = !reason; why.textContent = reason; m.querySelector('#start').disabled = !!reason;
    };
    paint(); box.addEventListener('input', paint);
  }

  m.onclick = async (e) => {
    const id = e.target.id;
    if (e.target === m || id === 'no' || e.target.closest('a')) return m.remove();
    const btn = e.target.closest('button'); if (!btn) return;
    if (id === 'col') busy(btn, async () => {
      const { data, error } = await supabase.rpc('collect_production', { p_job: job.id });
      if (error) return toast(classifyError(error).text, true);
      done(`Collected ${qty(data)}`);
    });
    else if (id === 'start') busy(btn, async () => {
      const { data, error } = await supabase.rpc('start_production', { p_building: x.id, p_recipe: Number(m.querySelector('#ps-r').value), p_runs: Math.floor(Number(m.querySelector('#ps-n').value)) || 1 });
      if (error) return toast(classifyError(error).text, true);
      done(`Production started. Ready ${new Date(data).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`);
    });
    else if (id === 'up') busy(btn, async () => {
      const { error } = await supabase.rpc('upgrade_building', { p_building: x.id });
      if (error) return toast(classifyError(error).text, true);
      done('Upgrade started. It will finish even if you leave.');
    });
    else if (id === 'del') {
      const ok = await confirmDialog({ title: `Demolish ${bt.name}?`, rows: [['Level', String(lvl)], ['Refund', money(refund)], ['Land fee', 'not refunded']],
        note: 'The plot becomes free again. This cannot be undone.', confirmLabel: 'Demolish', danger: true });
      if (!ok) return;
      const { data, error } = await supabase.rpc('demolish_building', { p_building: x.id });
      if (error) return toast(/does not exist|function/i.test(error.message) ? 'Demolish is not installed yet. Run migration 014 in Supabase.' : classifyError(error).text, true);
      done(`Demolished. Refunded ${money(data)}.`);
    }
  };
}

const CAT_LABEL = { agriculture: '🌾 Farm', retail: '🛒 Retail', utility: '⚡ Utility', extraction: '⛏️ Mining', construction: '🧱 Industry' };
const CAT_ORDER = ['agriculture', 'retail', 'utility', 'extraction', 'construction'];
const TYPE_EMOJI = { 'apple-orchard': '🍎', plantation: '🌾', 'water-reservoir': '💧', 'power-plant': '⚡', mine: '⛏️', quarry: '🪨', 'brick-factory': '🏭', 'grocery-store': '🛒' };

// Build sheet: category tabs (Farm, Retail, ...) and one card per building. During the tutorial only the next
// building is offered: the orchard first, then the Grocery Store after the first harvest.
function choose(region, slot, types) {
  const tutorial = !state.company.tutorial_done, r = REGION[region], lvl = state.company.level;
  const orchardDone = tutorial && lvl >= 1;
  const list = tutorial ? types.filter((x) => x.slug === (orchardDone ? 'grocery-store' : 'apple-orchard')) : types;
  if (!list.length) { toast('The Grocery Store is not installed yet. Run migration 013 in Supabase.', true); return; }
  const cats = CAT_ORDER.filter((c) => list.some((x) => x.category === c));
  for (const x of list) if (!cats.includes(x.category)) cats.push(x.category);
  let cat = cats[0], pick = null;
  const costOf = (x) => Number(x.build_cost) + landFee(r);
  const m = document.createElement('div');
  m.className = 'modal sheet';
  m.innerHTML = `<div class="card stack modal-box"><h3>${r.name} · plot ${slot + 1}</h3>
    ${cats.length > 1 ? '<div class="bs-tabs" id="bs-tabs"></div>' : ''}
    <div class="bs-list" id="bs-list"></div>
    <p class="muted" id="bs-note"></p>
    <button class="btn" id="go"></button>
    <button class="btn-ghost" id="no">Cancel</button></div>`;
  document.body.appendChild(m);
  const $ = (q) => m.querySelector(q);
  function paint() {
    const tabs = $('#bs-tabs');
    if (tabs) tabs.innerHTML = cats.map((c) => `<button class="bs-tab${c === cat ? ' on' : ''}" data-cat="${c}">${CAT_LABEL[c] ?? c}</button>`).join('');
    const items = list.filter((x) => x.category === cat);
    if (!items.some((x) => x.slug === pick)) pick = (items.find((x) => x.unlock_level <= lvl) ?? items[0])?.slug;
    $('#bs-list').innerHTML = items.map((x) => {
      const locked = !tutorial && lvl < x.unlock_level;
      return `<button class="bs-card${x.slug === pick ? ' on' : ''}" data-pick="${x.slug}" ${locked ? 'disabled' : ''}>
        <span class="em">${TYPE_EMOJI[x.slug] ?? '🏭'}</span>
        <span><b>${x.name}</b><small>${locked ? `🔒 Unlocks at Level ${x.unlock_level}` : x.description ?? ''}</small></span>
        <span class="px">${money(costOf(x))}${x.build_seconds ? `<small>${dur(x.build_seconds)}</small>` : ''}</span></button>`;
    }).join('');
    const x = list.find((y) => y.slug === pick);
    $('#bs-note').textContent = tutorial
      ? (orchardDone ? 'Your store sells apples to customers while you play, and even while you are away. It takes about a minute to build.'
        : 'Planting uses 1 Seeds and 2 Water from your warehouse and starts growing apples.')
      : `Construction runs on the server, so it finishes even if you close the game.${r.distance ? ` Includes a ${money(landFee(r))} land fee.` : ''}`;
    const go = $('#go');
    go.textContent = tutorial && !orchardDone ? 'Plant apples' : x ? `Build ${x.name}` : 'Build';
    go.disabled = !x || (!tutorial && lvl < x.unlock_level);
  }
  paint();
  m.addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat]'); if (t) { cat = t.dataset.cat; paint(); return; }
    const c = e.target.closest('[data-pick]'); if (c && !c.disabled) { pick = c.dataset.pick; paint(); }
  });
  $('#no').onclick = () => m.remove();
  $('#go').onclick = async (e) => {
    e.target.disabled = true;
    const { error } = tutorial && !orchardDone
      ? await supabase.rpc('plant_apples', { p_slot: slot })
      : await supabase.rpc('build_building', { p_type_slug: pick, p_slot: slot, p_region: region });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    m.remove();
    toast(tutorial && !orchardDone ? 'Apples planted!' : 'Construction started!');
    window.dispatchEvent(new Event('hashchange'));
  };
}
