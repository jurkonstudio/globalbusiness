// 3D island map — session 1.
// Scope: scene + island + 24 land plots + procedural low-poly buildings, orbit/pinch camera,
// tap-to-pick plots, floating labels/timers. Game logic stays in landGrid.js (data + modals).
// Uses three.js r128 (global THREE) with a hand-rolled orbit controller (no examples/ files needed).
import { loadThree } from './globe.js';

const PITCH = 1.1;                       // distance between plot centres
const COLORS = {
  grass: 0x8fbf5a, dirt: 0x8a6a4a, stone: 0x6d7378, plot: 0xdccba2, plotAlt: 0xd3c197, plotUsed: 0xb8a37c,
  water: 0x3fa7c4, brand: 0xe4572e, gold: 0xe0a526, teal: 0x1f9d8a,
};

// Deterministic pseudo-random so the island looks the same every visit.
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

export async function mountMap3D(stage, { slots = 24, cols = 6, onPick, keepAlive = false } = {}) {
  try { await loadThree(); } catch { return null; }
  const THREE = window.THREE;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  if (!renderer.getContext()) return null;

  const rows = Math.ceil(slots / cols);
  const W = cols * PITCH, D = rows * PITCH;
  const slotPos = (i) => new THREE.Vector3(((i % cols) - (cols - 1) / 2) * PITCH, 0, (Math.floor(i / cols) - (rows - 1) / 2) * PITCH);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;          // shadows are static; re-render them only while something changes
  let shadowFrames = 3;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  stage.prepend(renderer.domElement);
  const cv = renderer.domElement;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe9f1, 22, 60);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 0.78));
  const sun = new THREE.DirectionalLight(0xfff0d2, 0.95);
  sun.position.set(6, 11, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 30 });
  scene.add(sun);

  // ---- Materials / helpers ----
  const mats = new Map();
  const mat = (c, extra = {}) => {
    const k = c + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra }));
    return mats.get(k);
  };
  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
    const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)));
    m.position.set(x, y + h / 2, z); return m;
  };
  const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10) => {
    const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c)));
    m.position.set(x, y + h / 2, z); return m;
  };
  const ball = (r, c, x, y, z) => {
    const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat(c)));
    m.position.set(x, y, z); return m;
  };
  const tree = (x, z, s = 1, c = 0x4f9a4a) => {
    const g = new THREE.Group();
    g.add(cyl(0.05 * s, 0.07 * s, 0.25 * s, 0x7a5a3a));
    g.add(ball(0.2 * s, c, 0, 0.42 * s, 0));
    g.position.set(x, 0, z); return g;
  };

  // ---- Island (stepped slabs) ----
  const island = new THREE.Group();
  scene.add(island);
  const slab = (w, h, d, c, y) => { const m = box(w, h, d, c); m.position.y = y; m.castShadow = false; island.add(m); };
  slab(W + 1.4, 0.3, D + 1.4, COLORS.grass, -0.15);
  slab(W + 1.1, 0.5, D + 1.1, COLORS.dirt, -0.55);
  slab(W + 0.5, 0.7, D + 0.5, COLORS.stone, -1.15);

  // Decoration ring: trees and rocks on the grass margin
  const rand = rng(42);
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand() * 4), t = rand();
    const mx = W / 2 + 0.25 + rand() * 0.25, mz = D / 2 + 0.25 + rand() * 0.25;
    const x = side < 2 ? (t - 0.5) * (W + 1) : (side === 2 ? -mx : mx);
    const z = side < 2 ? (side === 0 ? -mz : mz) : (t - 0.5) * (D + 1);
    if (rand() > 0.28) island.add(tree(x, z, 0.8 + rand() * 0.8, rand() > 0.5 ? 0x4f9a4a : 0x5fae55));
    else { const r = ball(0.12 + rand() * 0.1, 0x9aa0a6, x, -0.02, z); r.scale.y = 0.7; island.add(r); }
  }

  // ---- Plots ----
  const tiles = [], plus = [], pickables = [];
  for (let i = 0; i < slots; i++) {
    const p = slotPos(i);
    const t = box(1, 0.1, 1, ((i % cols) + Math.floor(i / cols)) % 2 ? COLORS.plot : COLORS.plotAlt);
    t.position.set(p.x, 0.05, p.z);
    t.userData.slot = i; t.castShadow = false;
    scene.add(t); tiles.push(t); pickables.push(t);
    const mark = new THREE.Group();
    mark.add(box(0.34, 0.03, 0.07, 0xffffff), box(0.07, 0.03, 0.34, 0xffffff));
    mark.position.set(p.x, 0.13, p.z);
    mark.children.forEach((c) => { c.material = mat(0xffffff, { transparent: true, opacity: 0.8 }); c.castShadow = false; });
    scene.add(mark); plus.push(mark);
  }

  // Selection frame
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 0.16, 1.06)),
    new THREE.LineBasicMaterial({ color: COLORS.brand }));
  frame.visible = false; scene.add(frame);

  // ---- Water ----
  const wGeo = new THREE.PlaneGeometry(90, 90, 36, 36);
  wGeo.rotateX(-Math.PI / 2);
  const wBase = Float32Array.from(wGeo.attributes.position.array);
  const water = new THREE.Mesh(wGeo, new THREE.MeshPhongMaterial({ color: COLORS.water, transparent: true, opacity: 0.9, flatShading: true, shininess: 60 }));
  water.position.y = -0.95; water.receiveShadow = true;
  scene.add(water);

  // ---- Clouds ----
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 3; j++) g.add(ball(0.5 + rand() * 0.4, 0xffffff, j * 0.6 - 0.6, rand() * 0.2, rand() * 0.3));
    g.children.forEach((c) => { c.castShadow = false; c.material = mat(0xffffff, { transparent: true, opacity: 0.85 }); });
    g.position.set(-20 + i * 9, 7 + rand() * 2, -8 + rand() * 16);
    scene.add(g); clouds.push(g);
  }

  // ---- Buildings (procedural, by slug; category as fallback) ----
  const MODELS = {
    'apple-orchard': (g) => { [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]].forEach(([x, z]) => {
      g.add(tree(x, z, 1.05, 0x3f8f45)); [[.1, .5], [-.1, .38]].forEach(([dx, dy]) => g.add(ball(0.04, 0xd63a2f, x + dx, dy + 0.05, z + 0.1))); }); },
    plantation: (g) => { for (let r = 0; r < 4; r++) g.add(box(0.8, 0.14, 0.1, r % 2 ? 0x6fb04a : 0x86c157, 0, 0.1, -0.3 + r * 0.2)); g.add(box(0.26, 0.26, 0.22, 0xc28a4e, 0.3, 0.1, 0.32)); },
    'water-reservoir': (g) => { g.add(cyl(0.3, 0.3, 0.5, 0x9bb7c6, 0, 0.1, 0, 16)); g.add(cyl(0.26, 0.26, 0.04, 0x4aa3d8, 0, 0.6, 0, 16)); g.add(cyl(0.04, 0.04, 0.3, 0x6c7a86, 0.38, 0.1, 0.3)); },
    'power-plant': (g) => { g.add(box(0.72, 0.4, 0.55, 0xc9ccd1, 0, 0.1, 0.1)); g.add(cyl(0.07, 0.09, 0.62, 0x7b8590, -0.22, 0.1, -0.2)); g.add(cyl(0.07, 0.09, 0.5, 0x7b8590, 0.02, 0.1, -0.2));
      g.add(box(0.2, 0.2, 0.03, COLORS.gold, 0.2, 0.2, 0.39)); },
    mine: (g) => { const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.5, 8), mat(0x7a6a5a))); m.position.y = 0.35; g.add(m);
      g.add(box(0.24, 0.22, 0.1, 0x241c16, 0, 0.1, 0.34)); g.add(box(0.04, 0.3, 0.04, 0x8a6a3a, -0.15, 0.1, 0.38), box(0.04, 0.3, 0.04, 0x8a6a3a, 0.15, 0.1, 0.38), box(0.38, 0.04, 0.05, 0x8a6a3a, 0, 0.38, 0.38)); },
    quarry: (g) => { g.add(box(0.85, 0.12, 0.85, 0xa9a39a, 0, 0.1)); g.add(box(0.65, 0.14, 0.65, 0xb8b2a9, 0.05, 0.22)); g.add(box(0.42, 0.14, 0.42, 0xc7c1b8, 0.1, 0.36)); g.add(box(0.14, 0.14, 0.14, 0x8c867d, -0.3, 0.1, 0.3)); },
    'brick-factory': (g) => { g.add(box(0.8, 0.42, 0.56, 0xb5533c, 0, 0.1, 0.1)); const r = box(0.84, 0.08, 0.6, 0x5b3a30, 0, 0.52, 0.1); g.add(r);
      g.add(cyl(0.07, 0.09, 0.7, 0x7a3b2b, 0.28, 0.1, -0.24)); for (let i = 0; i < 3; i++) g.add(box(0.14, 0.08, 0.08, 0xcc6a4f, -0.3 + i * 0.16, 0.1, 0.42)); },
  };
  const FALLBACK = { agriculture: 'apple-orchard', utility: 'power-plant', extraction: 'mine', construction: 'brick-factory' };
  const buildings = new Map();   // slot -> { group, arrow, label, timer, finish }

  const labelLayer = document.createElement('div');
  labelLayer.className = 'bl-layer';
  stage.appendChild(labelLayer);

  function buildModel(b) {
    const g = new THREE.Group();
    (MODELS[b.slug] ?? MODELS[FALLBACK[b.category]] ?? ((gg) => gg.add(box(0.6, 0.4, 0.5, 0xd8d2c4, 0, 0.1)))).call(null, g);
    for (let l = 0; l < Math.min(b.level ?? 1, 6); l++) g.add(box(0.08, 0.06, 0.08, COLORS.gold, -0.4 + l * 0.12, 0.1, 0.46));   // level pips
    return g;
  }

  function setBuildings(list) {
    for (const v of buildings.values()) { scene.remove(v.group); v.label.remove(); }
    buildings.clear();
    pickables.length = tiles.length;          // drop old building groups from picking
    plus.forEach((p) => { p.visible = true; });
    tiles.forEach((t, i) => t.material = mat(((i % cols) + Math.floor(i / cols)) % 2 ? COLORS.plot : COLORS.plotAlt));
    for (const b of list) {
      const p = slotPos(b.slot), g = buildModel(b);
      g.position.set(p.x, 0, p.z);
      g.userData.slot = b.slot; g.scale.setScalar(0.001);
      g.traverse((o) => { if (o.isMesh) o.userData.slot = b.slot; });
      scene.add(g); pickables.push(g);
      tiles[b.slot].material = mat(COLORS.plotUsed);
      plus[b.slot].visible = false;
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat(COLORS.teal));
      arrow.rotation.x = Math.PI; arrow.visible = false; arrow.position.set(p.x, 1.35, p.z); scene.add(arrow);
      const label = document.createElement('div');
      label.className = 'bl';
      label.innerHTML = `<span class="bl-timer" hidden></span><span class="bl-label">${b.name}<small>LVL ${b.level ?? 1}</small></span>`;
      labelLayer.appendChild(label);
      buildings.set(b.slot, { group: g, arrow, label, timer: label.firstChild, finish: b.finishAt ? new Date(b.finishAt) : null, born: performance.now(), pos: new THREE.Vector3(p.x, 1.25, p.z) });
    }
    shadowFrames = 45;                            // covers the pop-in animation
    tickTimers();
  }

  const fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  function tickTimers() {
    for (const v of buildings.values()) {
      if (!v.finish) { v.timer.hidden = true; v.ready = false; continue; }
      const left = Math.ceil((v.finish - Date.now()) / 1000);
      v.timer.hidden = false; v.ready = left <= 0;
      v.timer.textContent = v.ready ? 'Ready' : fmt(left);
      v.timer.classList.toggle('ready', v.ready);
    }
  }
  const timerId = setInterval(() => { if (stage.isConnected) tickTimers(); else if (!keepAlive) clearInterval(timerId); }, 1000);

  // ---- Camera controller (orbit + pinch + pan) ----
  const cam = { theta: 0.65, phi: 1.0, dist: 13.5, tx: 0, tz: 0 };
  const goal = { ...cam };
  const HOME = { ...cam };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lim = () => { goal.phi = clamp(goal.phi, 0.35, 1.3); goal.dist = clamp(goal.dist, 6, 24); goal.tx = clamp(goal.tx, -W / 2, W / 2); goal.tz = clamp(goal.tz, -D / 2, D / 2); };
  const pts = new Map();
  let down = null, lastPinch = 0, lastMid = null;
  const dist2 = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };

  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (pts.size === 2) { lastPinch = dist2(); lastMid = mid(); if (down) down.moved = 99; }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      goal.theta -= dx * 0.008; goal.phi -= dy * 0.006;
    } else if (pts.size === 2) {
      const d = dist2(), m = mid();
      goal.dist *= lastPinch / d; lastPinch = d;
      const k = goal.dist * 0.0017, s = Math.sin(goal.theta), c = Math.cos(goal.theta);
      const mx = m.x - lastMid.x, my = m.y - lastMid.y; lastMid = m;
      goal.tx -= (mx * c + my * s) * k; goal.tz += (mx * s - my * c) * k;
    }
    lim();
  });
  const up = (e) => {
    const wasTap = down && pts.size === 1 && down.moved < 8 && performance.now() - down.t < 400;
    pts.delete(e.pointerId);
    if (wasTap) pick(e.clientX, e.clientY);
    if (!pts.size) down = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); down = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); goal.dist *= 1 + e.deltaY * 0.001; lim(); }, { passive: false });

  // ---- Picking ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let selected = -1;
  function select(i) {
    selected = i;
    frame.visible = i >= 0;
    if (i >= 0) { const p = slotPos(i); frame.position.set(p.x, 0.1, p.z); goal.tx = p.x * 0.6; goal.tz = p.z * 0.6; lim(); }
  }
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(pickables, true)) {
      let o = hit.object;
      while (o && o.userData.slot === undefined) o = o.parent;
      if (o) { select(o.userData.slot); onPick?.(o.userData.slot); return; }
    }
    select(-1);
  }

  // ---- Resize + loop ----
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 52 : 42;     // wider FOV on tall phone screens
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();

  let last = performance.now();
  const v3 = new THREE.Vector3();
  let frameNo = 0;
  function frameLoop(now) {
    if (!stage.isConnected) {
      if (keepAlive) { last = now; setTimeout(() => requestAnimationFrame(frameLoop), 300); return; }   // parked while another tab is shown
      clearInterval(timerId); ro.disconnect(); renderer.dispose(); renderer.forceContextLoss?.(); return;
    }
    frameNo++;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const k = 1 - Math.pow(0.0015, dt);                      // frame-rate independent damping
    for (const key of ['theta', 'phi', 'dist', 'tx', 'tz']) cam[key] += (goal[key] - cam[key]) * k;
    camera.position.set(
      cam.tx + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.dist * Math.cos(cam.phi),
      cam.tz + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(cam.tx, 0, cam.tz);

    const t = now / 1000;
    if (frameNo % 2 === 0) {                                  // waves at half rate; flat shading needs no normals
      const pa = wGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, Math.sin(wBase[i * 3] * 0.35 + t * 0.9) * 0.05 + Math.cos(wBase[i * 3 + 2] * 0.3 + t * 0.7) * 0.05);
      pa.needsUpdate = true;
    }
    clouds.forEach((c, i) => { c.position.x += dt * (0.25 + i * 0.05); if (c.position.x > 24) c.position.x = -24; });
    plus.forEach((p, i) => { p.position.y = 0.13 + Math.sin(t * 2 + i) * 0.015; });
    if (frame.visible) frame.material.color.setHex(Math.sin(t * 6) > 0 ? COLORS.brand : COLORS.gold);

    const hw = stage.clientWidth / 2, hh = stage.clientHeight / 2;
    for (const v of buildings.values()) {
      const age = Math.min((now - v.born) / 450, 1);                         // pop-in
      v.group.scale.setScalar(age < 1 ? 1 - Math.pow(1 - age, 3) * (1 + 0.4 * Math.sin(age * 9)) + 0.001 : 1);
      v.arrow.visible = !!v.ready;
      if (v.ready) v.arrow.position.y = 1.2 + Math.sin(t * 4) * 0.08;
      v3.copy(v.pos).project(camera);
      const hide = v3.z > 1;
      v.label.style.display = hide ? 'none' : '';
      if (!hide) v.label.style.transform = `translate(${(v3.x * hw + hw).toFixed(1)}px,${(-v3.y * hh + hh).toFixed(1)}px) translate(-50%,-100%)`;
    }
    if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }
    renderer.render(scene, camera);
    requestAnimationFrame(frameLoop);
  }
  requestAnimationFrame(frameLoop);

  return {
    setBuildings,
    clearSelection: () => select(-1),
    resetView: () => { Object.assign(goal, HOME); select(-1); },
    zoom: (f) => { goal.dist *= f; lim(); },
  };
}
