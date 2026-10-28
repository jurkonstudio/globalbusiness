// Real 3D map (WebGL, three.js r128 from cdnjs, same loader as globe.js). Same API as mapIso.js
// (setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView), so landGrid.js decides WHAT to show
// and this file decides HOW. Returns null when WebGL / three.js is unavailable (landGrid then falls back to mapIso.js).
//   drag = rotate · pinch / wheel = zoom · tap an island (world view) = fly there · tap plot or building = onPick
import { REGIONS, REGION, PLOT_KINDS, plotKind } from '../config/regions.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const PS = 2.2;   // plot pitch in world units
const CAT = { agriculture: 0x58b153, livestock: 0xc9a36b, retail: 0xe0902f, utility: 0x3f8fd6, extraction: 0x8f857a, construction: 0xc0634a };
const HT = { 'apple-orchard': 0.6, plantation: 0.5, 'water-reservoir': 1.4, 'power-plant': 2.4, mine: 1.2, quarry: 0.9, 'brick-factory': 2.0, 'grocery-store': 1.3 };
const TILE = { farm: 0x9ccf6a, shop: 0xf3cf8e, industry: 0xb5b9be };
const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };

let loading = null;
const loadThree = () => window.THREE ? Promise.resolve() : (loading ??= new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = THREE_URL; s.onload = res; s.onerror = () => { loading = null; rej(new Error('three.js blocked')); }; document.head.appendChild(s);
}));

const rowsOf = (r) => Math.ceil(r.slots / r.cols);
const plotPos = (r, slot) => [r.x + ((slot % r.cols) - (r.cols - 1) / 2) * PS, r.z + (Math.floor(slot / r.cols) - (rowsOf(r) - 1) / 2) * PS];

export async function mountMap3d(stage, { level = 0, onPick, onRegion, onTimerDone, onHub } = {}) {
  mountMap3d.why = '';
  try { await loadThree(); } catch { mountMap3d.why = 'three.js could not be downloaded from cdnjs.cloudflare.com (blocked or offline)'; return null; }
  const T = window.THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true }); } catch { mountMap3d.why = 'this browser has WebGL turned off or unsupported'; return null; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const canvas = renderer.domElement; stage.prepend(canvas);

  const scene = new T.Scene(); scene.background = new T.Color(0xbfe3f2);
  const camera = new T.PerspectiveCamera(45, 1, 0.5, 400);
  scene.add(new T.HemisphereLight(0xffffff, 0x8aa0a8, 0.85));
  const sun = new T.DirectionalLight(0xffffff, 0.7); sun.position.set(-20, 40, 15); scene.add(sun);
  const sea = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshLambertMaterial({ color: 0x5bb3d6 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.6; scene.add(sea);

  // ---- islands + empty plots (built once) ----
  const pickables = [], islands = {}, lbl = (c) => c;
  const iconTex = {};
  const emoji = (k) => iconTex[k] ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(PLOT_KINDS[k].icon, 32, 34); return new T.CanvasTexture(c); })();
  for (const r of REGIONS) {
    const rows = rowsOf(r), slab = new T.Mesh(new T.BoxGeometry(r.cols * PS + 1.6, 0.8, rows * PS + 1.6), new T.MeshLambertMaterial({ color: r.tint }));
    slab.position.set(r.x, -0.4, r.z); slab.userData = { island: r.id }; scene.add(slab); pickables.push(slab); islands[r.id] = slab;
    for (let s = 0; s < r.slots; s++) {
      const k = plotKind(r.id, s), [px, pz] = plotPos(r, s);
      const tile = new T.Mesh(new T.BoxGeometry(PS * 0.92, 0.12, PS * 0.92), new T.MeshLambertMaterial({ color: TILE[k] }));
      tile.position.set(px, 0.06, pz); tile.userData = { region: r.id, slot: s }; scene.add(tile); pickables.push(tile);
      const ic = new T.Sprite(new T.SpriteMaterial({ map: emoji(k), transparent: true, depthWrite: false })); ic.scale.set(0.9, 0.9, 1); ic.position.set(px, 0.5, pz); ic.userData = tile.userData; scene.add(ic); pickables.push(ic);
    }
  }

  // ---- label sprite, Sim Companies style: white translucent boxes ----
  //   building / upgrade / production running -> one pill with an icon and the countdown (plus a thin progress bar when known)
  //   everything else                         -> NAME box + LVL box, and a small status tag (Collect / Needs inputs / Tap to start)
  const ICON = { 'apple-orchard': '🍎', plantation: '🌾', 'water-reservoir': '💧', 'power-plant': '⚡', mine: '⛏️', quarry: '🪨', 'brick-factory': '🧱', 'grocery-store': '🛒' };
  const TAG = { ok: ['#1f9d5a', '#fff'], warn: ['#e0a526', '#0d1b2a'], bad: ['#d43c3c', '#fff'] };
  const FONT = '"Barlow Condensed","Arial Narrow",sans-serif';
  function label() {
    const c = document.createElement('canvas'); c.width = 320; c.height = 160; const x = c.getContext('2d'), tex = new T.CanvasTexture(c);
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(5.2, 2.6, 1); sp.renderOrder = 5;
    const box = (cx, y, w, h, fill = 'rgba(255,255,255,.9)') => { x.fillStyle = fill; x.beginPath(); x.roundRect ? x.roundRect(cx - w / 2, y, w, h, 10) : x.rect(cx - w / 2, y, w, h); x.fill(); };
    const text = (t, cx, cy, size, fill = '#2b3138') => { x.font = `700 ${size}px ${FONT}`; x.fillStyle = fill; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, cx, cy); return x.measureText(t).width; };
    sp.userData.draw = (it, st) => {
      x.clearRect(0, 0, 320, 160);
      if (st.kind === 'timer') {                       // the timer pill sits in the middle of the canvas
        const w = Math.max(150, 62 + (x.font = `700 40px ${FONT}`, x.measureText(st.text).width)), top = 52;
        box(160, top, w, 56); text(st.icon, 160 - w / 2 + 30, top + 30, 32); text(st.text, 160 + 22, top + 30, 40);
        if (st.pct != null) { x.fillStyle = 'rgba(43,49,56,.18)'; x.fillRect(160 - w / 2 + 12, top + 47, w - 24, 5); x.fillStyle = '#58b153'; x.fillRect(160 - w / 2 + 12, top + 47, (w - 24) * st.pct, 5); }
        tex.needsUpdate = true; return;
      }
      const nm = it.name.toUpperCase(), nw = Math.min(300, 28 + (x.font = `600 30px ${FONT}`, x.measureText(nm).width));
      box(150, 6, nw, 40); text(nm, 150, 27, 30);
      box(185, 50, 92, 38); text(`LVL ${it.level}`, 185, 70, 28);
      if (st.text) { const [bg, fg] = TAG[st.tone] ?? TAG.warn, w = 36 + (x.font = `700 28px ${FONT}`, x.measureText(st.text).width); box(160, 98, w, 38, bg); text(st.text, 160, 118, 28, fg); }
      tex.needsUpdate = true;
    };
    return sp;
  }
  const statusOf = (it, now) => {
    const left = it.finishAt ? new Date(it.finishAt) - now : 0, total = it.startAt ? new Date(it.finishAt) - new Date(it.startAt) : 0;
    const pct = total > 0 ? Math.min(1, Math.max(0, 1 - left / total)) : null;
    switch (it.status) {
      case 'ready': return { kind: 'tag', text: '✔ Collect', tone: 'ok' };
      case 'running': return left > 0 ? { kind: 'timer', icon: ICON[it.slug] ?? '🏭', text: clock(left), pct } : { kind: 'tag', text: '✔ Collect', tone: 'ok' };
      case 'build': return left > 0 ? { kind: 'timer', icon: '🔨', text: clock(left), pct } : { kind: 'tag', text: 'Done', tone: 'ok' };
      case 'upgrade': return left > 0 ? { kind: 'timer', icon: '⬆️', text: clock(left), pct } : { kind: 'tag', text: 'Done', tone: 'ok' };
      case 'blocked': return { kind: 'tag', text: 'Needs inputs', tone: 'bad' };
      case 'idle': return { kind: 'tag', text: 'Tap to start', tone: 'warn' };
      default: return { kind: 'tag', text: '' };
    }
  };

  // ---- buildings ----
  const bGroup = new T.Group(); scene.add(bGroup); let labels = [];
  const M = (c) => new T.MeshLambertMaterial({ color: c });
  const part = (geo, c, x, y, z) => { const m = new T.Mesh(geo, M(c)); m.position.set(x, y, z); return m; };
  function makeBuilding(it) {
    const r = REGION[it.region], cells = it.cells.map((s) => [s % r.cols, Math.floor(s / r.cols)]);
    const c0 = Math.min(...cells.map((c) => c[0])), c1 = Math.max(...cells.map((c) => c[0])), r0 = Math.min(...cells.map((c) => c[1])), r1 = Math.max(...cells.map((c) => c[1]));
    const w = (c1 - c0 + 1) * PS * 0.78, d = (r1 - r0 + 1) * PS * 0.78, rr = rowsOf(r);
    const cx = r.x + ((c0 + c1) / 2 - (r.cols - 1) / 2) * PS, cz = r.z + ((r0 + r1) / 2 - (rr - 1) / 2) * PS;
    const g = new T.Group(); g.position.set(cx, 0.12, cz);
    const col = CAT[it.category] ?? 0xaeb4ba, h = (HT[it.slug] ?? 1.4) * (0.85 + it.level * 0.12), under = it.status === 'build';
    g.add(part(new T.BoxGeometry(w, h, d), under ? 0xd8d2c4 : col, 0, h / 2, 0));
    const s = it.slug;
    if (s === 'apple-orchard' || s === 'plantation') for (const [x, z] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) { g.add(part(new T.CylinderGeometry(.07, .09, .5, 6), 0x6b4a2b, x * w, h + .2, z * d)); g.add(part(new T.SphereGeometry(.34, 10, 8), s === 'apple-orchard' ? 0x3f9a45 : 0xc9b04a, x * w, h + .65, z * d)); }
    else if (s === 'grocery-store') { g.add(part(new T.BoxGeometry(w * 1.05, .12, d * .3), 0xfff3dc, 0, h * .72, d * .5)); g.add(part(new T.BoxGeometry(w * .5, .12, d * .3), 0xd43c3c, 0, h * .73, d * .5)); }
    else if (s === 'water-reservoir') g.add(part(new T.CylinderGeometry(w * .36, w * .36, .5, 16), 0x8ecdf0, 0, h + .1, 0));
    else if (s === 'power-plant' || s === 'brick-factory') for (const x of [-.22, .22]) g.add(part(new T.CylinderGeometry(.16, .22, 1.1, 10), 0x8a8f94, x * w, h + .5, 0));
    else if (s === 'mine' || s === 'quarry') g.add(part(new T.ConeGeometry(w * .3, .8, 6), 0x6f665c, 0, h + .35, 0));
    if (it.level >= 4) g.add(part(new T.BoxGeometry(.5, .08, .3), 0xe0a526, 0, h + (s === 'power-plant' ? 1.4 : 1.1), 0));
    const sp = label(); sp.position.set(0, h + 2.2, 0); g.add(sp);
    g.traverse((m) => { if (m.isMesh || m.isSprite) m.userData = { ...m.userData, region: it.region, slot: it.slot }; });
    const st0 = statusOf(it, Date.now()); sp.userData.it = it; sp.userData.draw(it, st0); sp.userData.last = st0.kind + st0.text; labels.push(sp);
    g.traverse((m) => { if (m.isMesh || m.isSprite) pickables.push(m); });
    return g;
  }
  function setBuildings(items) {
    for (const o of [...bGroup.children]) { o.traverse((m) => { const i = pickables.indexOf(m); if (i >= 0) pickables.splice(i, 1); m.geometry?.dispose(); m.material?.map?.dispose(); m.material?.dispose(); }); bGroup.remove(o); }
    labels = []; items.forEach((it) => { it.done = false; bGroup.add(makeBuilding(it)); }); dirty = true;
  }

  // ---- camera ----
  const target = new T.Vector3(), cam = { th: 0.7, ph: 0.95, r: 40 };
  let vw = 1, vh = 1, dirty = true, anim = null, lastRegion;
  const aspect = () => Math.min(vw / vh, 1.3);
  const isleR = () => Math.min(40, Math.max(16, 9 / (0.414 * aspect())));
  const worldR = () => Math.min(120, Math.max(45, 22 / (0.414 * aspect())));
  const isWorld = () => cam.r > isleR() * 1.5;
  const place = () => { const s = Math.sin(cam.ph); camera.position.set(target.x + cam.r * s * Math.sin(cam.th), target.y + cam.r * Math.cos(cam.ph), target.z + cam.r * s * Math.cos(cam.th)); camera.lookAt(target); };
  function currentRegion() {
    if (isWorld()) return null;
    let best = null, bd = 1e9; for (const r of REGIONS) { const d = Math.hypot(target.x - r.x, target.z - r.z); if (d < bd) { bd = d; best = r.id; } }
    return bd < 9 ? best : null;
  }
  const emit = () => { const cr = currentRegion(); if (cr !== lastRegion) { lastRegion = cr; onRegion?.(cr); } };
  function fly(x, z, r, ph) { anim = { t0: performance.now(), ms: 650, f: { x: target.x, z: target.z, r: cam.r, ph: cam.ph }, t: { x, z, r, ph } }; }
  const focus = (id) => { const r = REGION[id]; if (r) fly(r.x, r.z, isleR(), 0.95); };
  const showWorld = () => fly(0, 0, worldR(), 0.95);
  function setLevel(lv) { for (const r of REGIONS) islands[r.id].material.color.setHex(lv < r.unlock ? 0x8a8f94 : r.tint); dirty = true; }
  const setActivity = () => {};

  function resize() { const b = stage.getBoundingClientRect(); if (!b.width || !b.height) return; vw = b.width; vh = b.height; renderer.setSize(vw, vh, false); camera.aspect = vw / vh; camera.updateProjectionMatrix(); dirty = true; }

  // ---- input ----
  const ray = new T.Raycaster(), ptrs = new Map(); let drag = null, pinch = null;
  const rel = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  function tap(sx, sy) {
    ray.setFromCamera(new T.Vector2((sx / vw) * 2 - 1, -(sy / vh) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, false)[0]; if (!hit) return;
    const u = hit.object.userData, id = u.island ?? u.region;
    if (isWorld() && id) return focus(id);
    if (u.island) return;
    onPick?.(u.region, u.slot);
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e)); anim = null;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, moved: false, t: performance.now() };
    else if (ptrs.size === 2) { if (drag) drag.moved = true; const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), r: cam.r }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, rel(e));
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; cam.r = Math.min(worldR() * 1.1, Math.max(7, pinch.r * pinch.d / Math.hypot(a[0] - b[0], a[1] - b[1]))); dirty = true; return; }
    if (!drag || ptrs.size !== 1) return;
    const cur = rel(e), dx = cur[0] - prev[0], dy = cur[1] - prev[1];
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 7) drag.moved = true;
    if (drag.moved) { cam.th -= dx * 0.008; cam.ph = Math.min(1.35, Math.max(0.35, cam.ph - dy * 0.006)); dirty = true; }
  });
  const up = (e) => {
    if (!ptrs.delete(e.pointerId)) return; if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0 && drag) { const [x, y] = rel(e); if (!drag.moved && e.type === 'pointerup' && performance.now() - drag.t < 700) tap(x, y); drag = null; emit(); }
    else if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, moved: true, t: 0 };
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); anim = null; cam.r = Math.min(worldR() * 1.1, Math.max(7, cam.r * Math.exp(e.deltaY * 0.0012))); dirty = true; emit(); }, { passive: false });

  // ---- loop ----
  let raf = 0, lastTick = 0;
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!stage.isConnected || document.hidden) return;
    if (anim) { const k = Math.min(1, (performance.now() - anim.t0) / anim.ms), e = k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2, { f, t } = anim;
      target.set(f.x + (t.x - f.x) * e, 0, f.z + (t.z - f.z) * e); cam.r = f.r + (t.r - f.r) * e; cam.ph = f.ph + (t.ph - f.ph) * e; dirty = true; if (k >= 1) { anim = null; emit(); } }
    if (ts - lastTick > 1000) {       // once a second: refresh timers, notify when one finishes
      lastTick = ts; const now = Date.now();
      for (const sp of labels) { const it = sp.userData.it, st = statusOf(it, now), key = st.kind + st.text + (st.pct != null ? Math.round(st.pct * 100) : '');
        if (it.finishAt && !it.done && new Date(it.finishAt) <= now) { it.done = true; onTimerDone?.(); }
        if (key !== sp.userData.last) { sp.userData.last = key; sp.userData.draw(it, st); dirty = true; } }
    }
    if (!dirty) return; dirty = false; place(); renderer.render(scene, camera);
  }
  const ro = new ResizeObserver(resize); ro.observe(stage);
  stage.addEventListener('m2-dispose', () => { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); });
  resize(); setLevel(level);
  const home = REGION.home; target.set(home.x, 0, home.z); cam.r = isleR(); place();
  raf = requestAnimationFrame(loop); setTimeout(() => { lastRegion = currentRegion(); onRegion?.(lastRegion); }, 150);
  return { setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView: showWorld };
}
