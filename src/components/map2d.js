// Flat "business board" map (replaces the 3D islands). One wide board, every region is a district on it, and every
// building is wired to the central Warehouse by a supply line, so the chain farm -> warehouse -> store is visible.
// Same API as map3d.js (setBuildings, setActivity, setLevel, focus, showWorld, currentRegion), so landGrid.js
// only decides WHAT to show; this file decides HOW.
import { REGIONS, REGION } from '../config/regions.js';

const U = 64;                                   // one tile, in board pixels
const GAP = 5;                                  // gutter inside a tile cell
const BOARD = { w: 18, h: 13.4 };               // board size in tiles
// Top-left tile (column, row) of every district on the board.
const POS = { home: { c: 6, r: 8 }, verdant: { c: 1, r: 1 }, ironridge: { c: 13, r: 1 }, sunspire: { c: 1, r: 8 }, meridian: { c: 13, r: 8 } };
const HUB = { x: 8, y: 4.4, w: 2, h: 1.2 };     // Warehouse, centre-top: every supply line starts or ends here
const HUB_C = { x: (HUB.x + HUB.w / 2) * U, y: (HUB.y + HUB.h / 2) * U };

const ICON = { 'apple-orchard': '🍎', plantation: '🌾', 'water-reservoir': '💧', 'power-plant': '⚡', mine: '⛏️', quarry: '🪨',
  'brick-factory': '🏭', 'grocery-store': '🛒' };
const CAT_ICON = { agriculture: '🌳', utility: '⚡', extraction: '⛏️', construction: '🧱', retail: '🛒' };
const SHORT = { 'apple-orchard': 'Orchard', plantation: 'Plantation', 'water-reservoir': 'Water', 'power-plant': 'Power', mine: 'Mine',
  quarry: 'Quarry', 'brick-factory': 'Bricks', 'grocery-store': 'Grocery' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const clockText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };

export async function mountMap2D(stage, { level = 0, onPick, onRegion, onTimerDone } = {}) {
  let lvl = level, scale = 1, fit = 0.5, lastRegion = undefined;
  const scroller = document.createElement('div');
  scroller.className = 'm2-scroll';
  scroller.innerHTML = `<div class="m2-sizer"><div class="m2-board" style="width:${BOARD.w * U}px;height:${BOARD.h * U}px"></div></div>`;
  stage.prepend(scroller);
  const sizer = scroller.firstElementChild, board = sizer.firstElementChild;

  // ---- Static layer: districts, empty plots, warehouse ----
  const zoneEl = {};
  let html = `<svg class="m2-lines" width="${BOARD.w * U}" height="${BOARD.h * U}" aria-hidden="true"></svg>`;
  for (const r of REGIONS) {
    const p = POS[r.id], rows = Math.ceil(r.slots / r.cols);
    const x = p.c * U - 14, y = (p.r - 0.8) * U, w = r.cols * U + 28, h = rows * U + 0.8 * U + 14;
    html += `<section class="m2-zone" data-z="${r.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--tint:#${r.tint.toString(16).padStart(6, '0')}">
      <header><b>${r.name}</b><small data-info></small></header></section>`;
    for (let i = 0; i < r.slots; i++) {
      const cx = p.c + (i % r.cols), cy = p.r + Math.floor(i / r.cols);
      html += `<button class="m2-tile empty" data-r="${r.id}" data-s="${i}" aria-label="${r.name}, empty plot ${i + 1}" style="left:${cx * U + GAP / 2}px;top:${cy * U + GAP / 2}px;width:${U - GAP}px;height:${U - GAP}px"><span>+</span></button>`;
    }
  }
  html += `<a class="m2-hub" href="#/warehouse/inventory" style="left:${HUB.x * U}px;top:${HUB.y * U}px;width:${HUB.w * U}px;height:${HUB.h * U}px" aria-label="Warehouse">
    <span class="m2-ico">📦</span><b>Warehouse</b><small>all goods pass here</small></a>`;
  board.innerHTML = html;
  const svg = board.querySelector('.m2-lines');
  for (const r of REGIONS) zoneEl[r.id] = board.querySelector(`.m2-zone[data-z="${r.id}"]`);

  // ---- Zoom / scroll ----
  const view = () => ({ w: scroller.clientWidth || 360, h: scroller.clientHeight || 640 });
  function applyScale(s, cx, cy) {                                     // cx, cy = board point that stays under the same screen point
    const old = scale; scale = Math.max(fit, Math.min(1.5, s));
    board.style.transform = `scale(${scale})`;
    sizer.style.width = BOARD.w * U * scale + 'px'; sizer.style.height = BOARD.h * U * scale + 'px';
    if (cx !== undefined) { scroller.scrollLeft += cx * (scale - old); scroller.scrollTop += cy * (scale - old); }
  }
  function computeFit() { const v = view(); fit = Math.min(v.w / (BOARD.w * U), v.h / (BOARD.h * U)); fit = Math.max(0.2, Math.min(fit, 1)); }
  const zoneCentre = (id) => { const r = REGION[id], p = POS[id]; return { x: (p.c + r.cols / 2) * U, y: (p.r + Math.ceil(r.slots / r.cols) / 2) * U }; };
  function nearest() {
    const v = view(), cx = (scroller.scrollLeft + v.w / 2) / scale, cy = (scroller.scrollTop + v.h / 2.4) / scale;
    let best = null, d = Infinity;
    for (const r of REGIONS) { const c = zoneCentre(r.id), dd = (c.x - cx) ** 2 + (c.y - cy) ** 2; if (dd < d) { d = dd; best = r.id; } }
    return best;
  }
  const currentRegion = () => (scale < Math.max(fit * 1.25, 0.6) ? null : nearest());
  function focus(id) {
    const c = zoneCentre(id), v = view();
    applyScale(Math.min(1, Math.max(fit, v.w / ((REGION[id].cols + 1.5) * U))));
    scroller.scrollTo({ left: c.x * scale - v.w / 2, top: c.y * scale - v.h / 2.4, behavior: 'smooth' });
  }
  function showWorld() { applyScale(fit); scroller.scrollTo({ left: 0, top: 0, behavior: 'smooth' }); }
  const emitRegion = () => { const cr = currentRegion(); if (cr !== lastRegion) { lastRegion = cr; onRegion?.(cr); } };
  let sc; scroller.addEventListener('scroll', () => { clearTimeout(sc); sc = setTimeout(emitRegion, 120); }, { passive: true });

  // Pinch to zoom (two fingers). One finger scrolls natively.
  let pinch = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  scroller.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = { d: dist(e.touches), s: scale }; }, { passive: true });
  scroller.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 2 || !pinch) return;
    e.preventDefault();
    const b = scroller.getBoundingClientRect(), t = e.touches;
    const mx = (t[0].clientX + t[1].clientX) / 2 - b.left, my = (t[0].clientY + t[1].clientY) / 2 - b.top;
    applyScale(pinch.s * dist(t) / pinch.d, (scroller.scrollLeft + mx) / scale, (scroller.scrollTop + my) / scale);
  }, { passive: false });
  scroller.addEventListener('touchend', () => { pinch = null; emitRegion(); }, { passive: true });
  scroller.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const b = scroller.getBoundingClientRect();
    applyScale(scale * (e.deltaY < 0 ? 1.1 : 0.9), (scroller.scrollLeft + e.clientX - b.left) / scale, (scroller.scrollTop + e.clientY - b.top) / scale);
  }, { passive: false });

  // ---- Taps ----
  board.addEventListener('click', (e) => {
    const t = e.target.closest('.m2-tile');
    if (t) onPick?.(t.dataset.r, Number(t.dataset.s));
  });

  // ---- Buildings and supply lines ----
  let live = [];   // { el, finish, kind, key, done }
  function setBuildings(list) {
    board.querySelectorAll('.m2-tile.bld').forEach((n) => n.remove());
    svg.innerHTML = '';
    live = [];
    for (const b of list) {
      const r = REGION[b.region ?? 'home'], p = POS[r.id]; if (!r || b.slot >= r.slots) continue;
      const cx = p.c + (b.slot % r.cols), cy = p.r + Math.floor(b.slot / r.cols);
      const px = cx * U + U / 2, py = cy * U + U / 2;
      // supply line: production -> warehouse, warehouse -> store (shape: along the row, then along the column)
      const retail = b.category === 'retail', building = b.kind === 'build';
      const a = retail ? HUB_C : { x: px, y: py }, z = retail ? { x: px, y: py } : HUB_C;
      const via = retail ? { x: z.x, y: a.y } : { x: a.x, y: z.y };
      svg.insertAdjacentHTML('beforeend', `<path class="m2-line cat-${b.category}${b.flow && !building ? ' flow' : ''}" d="M${a.x} ${a.y} L${via.x} ${via.y} L${z.x} ${z.y}"/>`);
      const el = document.createElement('button');
      el.className = `m2-tile bld cat-${b.category}${building ? ' site' : ''}`;
      el.dataset.r = r.id; el.dataset.s = b.slot;
      el.style.cssText = `left:${cx * U + GAP / 2}px;top:${cy * U + GAP / 2}px;width:${U - GAP}px;height:${U - GAP}px`;
      el.setAttribute('aria-label', `${b.name}, level ${b.level}${building ? ', under construction' : ''}`);
      el.innerHTML = `<span class="m2-ico">${building ? '🚧' : ICON[b.slug] ?? CAT_ICON[b.category] ?? '🏭'}</span>
        <span class="m2-nm">${SHORT[b.slug] ?? b.name}</span><span class="m2-lv">L${b.level}</span>${b.kind ? '<i class="m2-tm"></i>' : ''}`;
      board.appendChild(el);
      if (b.kind) live.push({ el: el.querySelector('.m2-tm'), tile: el, finish: new Date(b.finishAt).getTime(), kind: b.kind, key: `${r.id}:${b.slot}:${b.kind}`, done: false });
    }
    tick();
  }
  function tick() {
    const now = Date.now();
    for (const t of live) {
      const left = t.finish - now;
      const label = t.kind === 'crop' ? '🌱 ' : t.kind === 'upgrade' ? '⬆ ' : '';
      if (left <= 0) { t.el.textContent = t.kind === 'crop' ? 'Ready' : 'Done'; t.el.classList.add('ready'); if (!t.done) { t.done = true; onTimerDone?.(); } }
      else t.el.textContent = label + clockText(left);
    }
  }
  const timerId = setInterval(() => { if (!stage.isConnected && !stage.__keep) return; tick(); }, 1000);
  stage.addEventListener('m2-dispose', () => clearInterval(timerId));

  // ---- District headers: lock state and shared-world activity ----
  const activity = {};
  function paintZones() {
    for (const r of REGIONS) {
      const z = zoneEl[r.id], locked = lvl < r.unlock;
      z.classList.toggle('locked', locked);
      const a = activity[r.id];
      z.querySelector('[data-info]').textContent = locked ? `🔒 Level ${r.unlock}`
        : [r.bonus ? `${{ agriculture: 'Farms', extraction: 'Mines', construction: 'Factories', utility: 'Utilities' }[r.bonus]} +${r.pct}%` : 'Headquarters',
          r.distance ? `fee ${money(r.distance * 500)}` : '', a ? `👥 ${a.companies}` : ''].filter(Boolean).join(' · ');
    }
  }
  const setLevel = (l) => { lvl = l; paintZones(); };
  const setActivity = (m) => { Object.assign(activity, m); paintZones(); };
  paintZones();

  // ---- Start: home district in view ----
  computeFit();
  applyScale(Math.min(1, Math.max(fit, (view().w) / ((REGION.home.cols + 1.5) * U))));
  requestAnimationFrame(() => { computeFit(); applyScale(scale); focus('home'); setTimeout(emitRegion, 450); });
  new ResizeObserver(() => { computeFit(); applyScale(scale); }).observe(stage);

  return { setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView: showWorld };
}
