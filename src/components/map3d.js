// 3D world map — session 2.
// New: archipelago of 5 regions (locked by level), sea lanes with sailing ships, live day/night,
// shared-world neighbour huts, region focus camera. Game logic stays in landGrid.js.
// Map timers exist only for: construction, upgrades, and the apple crop (kind = 'build' | 'upgrade' | 'crop').
// Uses three.js r128 (global THREE) with a hand-rolled orbit controller.
import { loadThree } from './globe.js';
import { REGIONS, REGION, ROUTES, BONUS_LABEL } from '../config/regions.js';

const PITCH = 1.1;                       // distance between plot centres
const COLORS = {
  grass: 0x8fbf5a, dirt: 0x8a6a4a, stone: 0x6d7378, plot: 0xdccba2, plotAlt: 0xd3c197, plotUsed: 0xb8a37c,
  water: 0x3fa7c4, waterNight: 0x12304f, brand: 0xe4572e, gold: 0xe0a526, teal: 0x1f9d8a, lock: 0x9aa5ab,
};
const HUT = [0xe4572e, 0x1f9d8a, 0xe0a526, 0x5b7fd6, 0xb06ab3, 0xd9d4c7];
const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function mountMap3D(stage, { level = 0, onPick, onRegion, onTimerDone, keepAlive = false } = {}) {
  try { await loadThree(); } catch { return null; }
  const THREE = window.THREE;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch { return null; }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;          // shadows are static; refreshed only when something changes
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let shadowFrames = 3;
  stage.prepend(renderer.domElement);
  const cv = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f2);
  scene.fog = new THREE.Fog(0xbfe3f2, 38, 110);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 170);

  // ---- Lights (driven by the day/night cycle) ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa77, 0.78);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 0.95);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 45 });
  scene.add(sun, sun.target);

  // ---- Materials / helpers (geometries are cached: many islands, few shapes) ----
  const mats = new Map(), geos = new Map();
  const mat = (c, extra = {}) => {
    const k = c + JSON.stringify(extra);
    if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color: c, ...extra }));
    return mats.get(k);
  };
  const geo = (k, f) => { if (!geos.has(k)) geos.set(k, f()); return geos.get(k); };
  const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => {
    const m = shadowed(new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(c)));
    m.position.set(x, y + h / 2, z); return m;
  };
  const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10) => {
    const m = shadowed(new THREE.Mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat(c)));
    m.position.set(x, y + h / 2, z); return m;
  };
  const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 8) => {
    const m = shadowed(new THREE.Mesh(geo(`n${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), mat(c)));
    m.position.set(x, y + h / 2, z); return m;
  };
  const ball = (r, c, x, y, z) => {
    const m = shadowed(new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 8, 6)), mat(c)));
    m.position.set(x, y, z); return m;
  };
  const tree = (x, z, s = 1, c = 0x4f9a4a) => {
    const g = new THREE.Group();
    g.add(cyl(0.05 * s, 0.07 * s, 0.25 * s, 0x7a5a3a));
    g.add(ball(0.2 * s, c, 0, 0.42 * s, 0));
    g.position.set(x, 0, z); return g;
  };
  const palm = (x, z, s = 1) => {
    const g = new THREE.Group();
    const t = cyl(0.04 * s, 0.06 * s, 0.6 * s, 0x9b7b52); t.rotation.z = 0.15; g.add(t);
    for (let i = 0; i < 5; i++) { const l = box(0.34 * s, 0.025, 0.09 * s, 0x3f9a4a, 0, 0.62 * s, 0); l.rotation.y = (i / 5) * Math.PI * 2; l.position.x = Math.cos(l.rotation.y) * 0.12 * s; l.position.z = -Math.sin(l.rotation.y) * 0.12 * s; g.add(l); }
    g.position.set(x, 0, z); return g;
  };
  const desatCache = new Map();
  const desat = (c) => {
    if (!desatCache.has(c)) desatCache.set(c, new THREE.Color(c).lerp(new THREE.Color(COLORS.lock), 0.65).getHex());
    return desatCache.get(c);
  };

  // Night lamps share one material whose opacity follows the dark.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0 });
  const lampBall = (x, y, z) => { const m = new THREE.Mesh(geo('lamp', () => new THREE.SphereGeometry(0.06, 8, 6)), lampMat); m.position.set(x, y, z); return m; };
  const lampPost = (x, z) => { const g = new THREE.Group(); g.add(cyl(0.015, 0.02, 0.5, 0x4a4f55, 0, 0, 0, 6), lampBall(0, 0.54, 0)); g.position.set(x, 0, z); return g; };

  // ---- Water, stars, moon, clouds ----
  const wGeo = new THREE.PlaneGeometry(150, 150, 38, 38);
  wGeo.rotateX(-Math.PI / 2);
  const wBase = Float32Array.from(wGeo.attributes.position.array);
  const waterMat = new THREE.MeshPhongMaterial({ color: COLORS.water, transparent: true, opacity: 0.92, flatShading: true, shininess: 60 });
  const water = new THREE.Mesh(wGeo, waterMat);
  water.position.y = -0.95; water.receiveShadow = true;
  scene.add(water);

  const rand = rng(42);
  const starPos = [];
  for (let i = 0; i < 220; i++) { const a = rand() * Math.PI * 2, e = 0.12 + rand() * 1.2; starPos.push(Math.cos(a) * Math.cos(e) * 95, Math.sin(e) * 95 + 4, Math.sin(a) * Math.cos(e) * 95); }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1e4, transparent: true, opacity: 0, fog: false }));
  moon.position.set(-55, 42, -60); scene.add(moon);

  const clouds = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 3; j++) g.add(ball(0.5 + rand() * 0.4, 0xffffff, j * 0.6 - 0.6, rand() * 0.2, rand() * 0.3));
    g.children.forEach((c) => { c.castShadow = false; c.material = mat(0xffffff, { transparent: true, opacity: 0.85 }); });
    g.position.set(-40 + i * 13, 8 + rand() * 3, -18 + rand() * 36);
    scene.add(g); clouds.push(g);
  }

  // ---- Islands ----
  const regs = {};                                   // id -> island record
  const pickables = [];
  const spinners = [];
  const labelLayer = document.createElement('div');
  labelLayer.className = 'bl-layer';
  stage.appendChild(labelLayer);

  const localPos = (reg, i) => new THREE.Vector3(((i % reg.r.cols) - (reg.r.cols - 1) / 2) * PITCH, 0, (Math.floor(i / reg.r.cols) - (reg.rows - 1) / 2) * PITCH);
  const worldPos = (reg, i) => localPos(reg, i).add(new THREE.Vector3(reg.r.x, 0, reg.r.z));
  const tileColor = (reg, i) => {
    if (reg.used.has(i)) return reg.locked ? desat(COLORS.plotUsed) : COLORS.plotUsed;
    const c = ((i % reg.r.cols) + Math.floor(i / reg.r.cols)) % 2 ? COLORS.plot : COLORS.plotAlt;
    return reg.locked ? desat(c) : c;
  };
  const ringPoint = (reg, rr) => {
    const { W, D } = reg, side = Math.floor(rr() * 4), t = rr();
    const mx = W / 2 + 0.25 + rr() * 0.25, mz = D / 2 + 0.25 + rr() * 0.25;
    return [side < 2 ? (t - 0.5) * (W + 1) : (side === 2 ? -mx : mx), side < 2 ? (side === 0 ? -mz : mz) : (t - 0.5) * (D + 1)];
  };

  function makeIsland(r, n) {
    const rows = Math.ceil(r.slots / r.cols), W = r.cols * PITCH, D = rows * PITCH;
    const g = new THREE.Group(); g.position.set(r.x, 0, r.z); scene.add(g);
    const reg = { r, g, W, D, rows, tiles: [], plus: [], ground: [], used: new Set(), locked: level < r.unlock, huts: new THREE.Group(), activity: null };
    g.add(reg.huts);

    const slab = (w, h, d, c, y) => {
      const m = box(w, h, d, c); m.position.y = y; m.castShadow = false;
      m.userData = { region: r.id, ground: true, base: c }; reg.ground.push(m); pickables.push(m); g.add(m);
    };
    slab(W + 1.4, 0.3, D + 1.4, r.id === 'home' ? COLORS.grass : r.tint, -0.15);
    slab(W + 1.1, 0.5, D + 1.1, COLORS.dirt, -0.55);
    slab(W + 0.5, 0.7, D + 0.5, COLORS.stone, -1.15);

    // Margin decoration (trees / rocks), themed per region
    const rr = rng(42 + n * 97);
    const count = r.id === 'home' ? 26 : 14;
    for (let i = 0; i < count; i++) {
      const [x, z] = ringPoint(reg, rr);
      if (r.id === 'sunspire' && rr() > 0.3) g.add(palm(x, z, 0.9 + rr() * 0.5));
      else if (rr() > 0.28) g.add(tree(x, z, 0.8 + rr() * 0.8, r.id === 'verdant' ? (rr() > 0.5 ? 0x3f9a4a : 0x58b04a) : (rr() > 0.5 ? 0x4f9a4a : 0x5fae55)));
      else { const rk = ball(0.12 + rr() * 0.1, 0x9aa0a6, x, -0.02, z); rk.scale.y = 0.7; g.add(rk); }
    }
    if (r.id === 'home') {                                    // company flag
      g.add(cyl(0.02, 0.02, 1.1, 0xd9d4c7, -W / 2 - 0.45, 0, D / 2 + 0.45, 6));
      g.add(box(0.36, 0.2, 0.02, COLORS.brand, -W / 2 - 0.27, 0.85, D / 2 + 0.45));
    }
    if (r.id === 'ironridge') {                               // peaks behind the plots
      [[-1.4, 1.6, 0.9], [0.3, 2.0, 1.1], [1.6, 1.4, 0.8]].forEach(([x, h, rad]) => {
        g.add(cone(rad, h, 0x7d7a74, x, 0, -D / 2 - 0.45, 7));
        g.add(cone(rad * 0.4, h * 0.3, 0xf2f4f5, x, h * 0.74, -D / 2 - 0.45, 7));
      });
    }
    if (r.id === 'meridian') {                                // dock, crane, containers
      g.add(box(1.8, 0.08, 0.4, 0x8a6a4a, W / 2 + 1.3, -0.1, 0));
      g.add(box(0.06, 0.9, 0.06, 0x6c7a86, W / 2 + 0.7, 0, -0.3), box(0.8, 0.06, 0.06, 0x6c7a86, W / 2 + 1.05, 0.9, -0.3));
      [0xe4572e, 0x1f9d8a, 0xe0a526].forEach((c, i) => g.add(box(0.26, 0.16, 0.16, c, W / 2 + 0.9 + i * 0.3, -0.02, 0.35)));
    }
    if (r.id === 'sunspire') {                                // wind turbine
      g.add(cyl(0.04, 0.07, 1.3, 0xe8edf0, W / 2 + 0.5, 0, -D / 2 - 0.4, 8));
      const rot = new THREE.Group(); rot.position.set(W / 2 + 0.5, 1.35, -D / 2 - 0.2);
      for (let i = 0; i < 3; i++) { const b = box(0.05, 0.55, 0.02, 0xf4f4f0, 0, 0, 0); b.position.y = 0.27; const p = new THREE.Group(); p.rotation.z = (i / 3) * Math.PI * 2; p.add(b); rot.add(p); }
      g.add(rot); spinners.push(rot);
    }
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => g.add(lampPost(sx * (W / 2 + 0.45), sz * (D / 2 + 0.45))));

    // Plots
    for (let i = 0; i < r.slots; i++) {
      const p = localPos(reg, i);
      const t = box(1, 0.1, 1, tileColor(reg, i));
      t.position.set(p.x, 0.05, p.z); t.userData = { slot: i, region: r.id }; t.castShadow = false;
      g.add(t); reg.tiles.push(t); pickables.push(t);
      const mark = new THREE.Group();
      mark.add(box(0.34, 0.03, 0.07, 0xffffff), box(0.07, 0.03, 0.34, 0xffffff));
      mark.position.set(p.x, 0.13, p.z);
      mark.children.forEach((c) => { c.material = mat(0xffffff, { transparent: true, opacity: 0.8 }); c.castShadow = false; });
      g.add(mark); reg.plus.push(mark);
    }

    // Floating island label (visible when zoomed out)
    reg.label = document.createElement('div');
    reg.label.className = 'rl';
    labelLayer.appendChild(reg.label);
    reg.pos = new THREE.Vector3(r.x, 2.6, r.z);
    regs[r.id] = reg;
    paintRegion(reg);
  }

  function paintRegion(reg) {
    reg.ground.forEach((m) => { m.material = mat(reg.locked ? desat(m.userData.base) : m.userData.base); });
    reg.tiles.forEach((t, i) => { t.material = mat(tileColor(reg, i)); });
    reg.plus.forEach((p, i) => { p.visible = !reg.used.has(i); });
    const r = reg.r, act = reg.activity;
    const sub = reg.locked ? `🔒 Unlocks at Level ${r.unlock}`
      : [r.bonus ? `${BONUS_LABEL[r.bonus]} +${r.pct}%` : 'Headquarters', act ? `${act.companies} ${act.companies === 1 ? 'company' : 'companies'}` : ''].filter(Boolean).join(' · ');
    reg.label.className = 'rl' + (reg.locked ? ' locked' : '');
    reg.label.innerHTML = `<b>${r.name}</b><small>${sub}</small>`;
  }

  REGIONS.forEach((r, n) => makeIsland(r, n));

  // Shared world: one small hut per company present in a region (up to 10), on the front shore.
  function setActivity(map) {
    for (const reg of Object.values(regs)) {
      reg.activity = map?.[reg.r.id] ?? null;
      reg.huts.clear();
      const n = Math.min(reg.activity?.companies ?? 0, 10);
      for (let i = 0; i < n; i++) {
        const x = -reg.W / 2 + 0.5 + (i % 8) * 0.75 + (i >= 8 ? 0.35 : 0), z = reg.D / 2 + 0.4 + (i >= 8 ? 0.3 : 0);
        const c = HUT[Math.abs(i * 5 + Math.round(reg.r.x)) % HUT.length];
        const h = new THREE.Group();
        h.add(box(0.28, 0.2, 0.26, 0xe9e2d0, 0, 0, 0), cone(0.26, 0.18, c, 0, 0.2, 0, 4));
        h.children[1].rotation.y = Math.PI / 4;
        h.position.set(x, 0, z); reg.huts.add(h);
      }
      paintRegion(reg);
    }
    shadowFrames = 3;
  }

  // Frame around the selected plot
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, 0.16, 1.06)),
    new THREE.LineBasicMaterial({ color: COLORS.brand }));
  frame.visible = false; scene.add(frame);

  // ---- Sea lanes + ships ----
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const ships = [];
  const dummy = new THREE.Object3D();
  const dashGeo = new THREE.BoxGeometry(0.34, 0.02, 0.09);
  const radius = (r) => (Math.max(r.cols, Math.ceil(r.slots / r.cols)) * PITCH) / 2 + 1.2;
  const makeShip = () => {
    const g = new THREE.Group();
    g.add(box(0.55, 0.12, 0.2, 0x8a5a3a), box(0.14, 0.12, 0.14, 0xf1ece0, -0.12, 0.12), box(0.025, 0.4, 0.2, 0xffffff, 0.08, 0.12), lampBall(0.2, 0.3, 0));
    g.scale.setScalar(1.25);
    return g;
  };
  function buildRoutes() {
    routeGroup.clear(); ships.length = 0;
    const lists = { on: [], off: [] };
    ROUTES.forEach(([a, b], idx) => {
      const A = REGION[a], B = REGION[b], on = level >= A.unlock && level >= B.unlock;
      const va = new THREE.Vector3(A.x, -0.8, A.z), vb = new THREE.Vector3(B.x, -0.8, B.z);
      const len = va.distanceTo(vb), perp = new THREE.Vector3(-(vb.z - va.z), 0, vb.x - va.x).normalize();
      const mid = va.clone().add(vb).multiplyScalar(0.5).addScaledVector(perp, (idx % 2 ? 1 : -1) * (idx > 3 ? 4.5 : 2.5));
      const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
      const lo = radius(A) / len, hi = 1 - radius(B) / len, n = Math.max(6, Math.floor(len * (hi - lo) / 0.9));
      for (let k = 0; k <= n; k++) {
        const t = lo + (hi - lo) * k / n, p = curve.getPoint(t), tg = curve.getTangent(t);
        dummy.position.copy(p); dummy.rotation.set(0, Math.atan2(-tg.z, tg.x), 0); dummy.updateMatrix();
        lists[on ? 'on' : 'off'].push(dummy.matrix.clone());
      }
      if (on) [0, 1].forEach((s) => { const mesh = makeShip(); routeGroup.add(mesh); ships.push({ curve, lo, hi, len, mesh, t: lo + (hi - lo) * (s ? 0.6 : 0.1), dir: s ? -1 : 1 }); });
    });
    [['on', 0xffffff, 0.85], ['off', 0x8895a0, 0.45]].forEach(([k, color, opacity]) => {
      if (!lists[k].length) return;
      const im = new THREE.InstancedMesh(dashGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity }), lists[k].length);
      lists[k].forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true; routeGroup.add(im);
    });
  }
  buildRoutes();

  // ---- Buildings (procedural, by slug; category as fallback) ----
  const MODELS = {
    'apple-orchard': (g) => { [[-.22, -.22], [.22, -.22], [-.22, .22], [.22, .22]].forEach(([x, z]) => {
      g.add(tree(x, z, 1.05, 0x3f8f45)); [[.1, .5], [-.1, .38]].forEach(([dx, dy]) => g.add(ball(0.04, 0xd63a2f, x + dx, dy + 0.05, z + 0.1))); }); },
    plantation: (g) => { for (let r = 0; r < 4; r++) g.add(box(0.8, 0.14, 0.1, r % 2 ? 0x6fb04a : 0x86c157, 0, 0.1, -0.3 + r * 0.2)); g.add(box(0.26, 0.26, 0.22, 0xc28a4e, 0.3, 0.1, 0.32)); },
    'water-reservoir': (g) => { g.add(cyl(0.3, 0.3, 0.5, 0x9bb7c6, 0, 0.1, 0, 16)); g.add(cyl(0.26, 0.26, 0.04, 0x4aa3d8, 0, 0.6, 0, 16)); g.add(cyl(0.04, 0.04, 0.3, 0x6c7a86, 0.38, 0.1, 0.3)); },
    'power-plant': (g) => { g.add(box(0.72, 0.4, 0.55, 0xc9ccd1, 0, 0.1, 0.1)); g.add(cyl(0.07, 0.09, 0.62, 0x7b8590, -0.22, 0.1, -0.2)); g.add(cyl(0.07, 0.09, 0.5, 0x7b8590, 0.02, 0.1, -0.2));
      g.add(box(0.2, 0.2, 0.03, COLORS.gold, 0.2, 0.2, 0.39)); },
    mine: (g) => { const m = shadowed(new THREE.Mesh(geo('mine', () => new THREE.ConeGeometry(0.46, 0.5, 8)), mat(0x7a6a5a))); m.position.y = 0.35; g.add(m);
      g.add(box(0.24, 0.22, 0.1, 0x241c16, 0, 0.1, 0.34)); g.add(box(0.04, 0.3, 0.04, 0x8a6a3a, -0.15, 0.1, 0.38), box(0.04, 0.3, 0.04, 0x8a6a3a, 0.15, 0.1, 0.38), box(0.38, 0.04, 0.05, 0x8a6a3a, 0, 0.38, 0.38)); },
    quarry: (g) => { g.add(box(0.85, 0.12, 0.85, 0xa9a39a, 0, 0.1)); g.add(box(0.65, 0.14, 0.65, 0xb8b2a9, 0.05, 0.22)); g.add(box(0.42, 0.14, 0.42, 0xc7c1b8, 0.1, 0.36)); g.add(box(0.14, 0.14, 0.14, 0x8c867d, -0.3, 0.1, 0.3)); },
    'brick-factory': (g) => { g.add(box(0.8, 0.42, 0.56, 0xb5533c, 0, 0.1, 0.1)); g.add(box(0.84, 0.08, 0.6, 0x5b3a30, 0, 0.52, 0.1));
      g.add(cyl(0.07, 0.09, 0.7, 0x7a3b2b, 0.28, 0.1, -0.24)); for (let i = 0; i < 3; i++) g.add(box(0.14, 0.08, 0.08, 0xcc6a4f, -0.3 + i * 0.16, 0.1, 0.42)); },
  };
  const SITE = (g) => {                      // scaffold shown while a building is under construction
    g.add(box(0.8, 0.06, 0.8, 0x9a8466, 0, 0.1));
    [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]].forEach(([x, z]) => g.add(box(0.04, 0.5, 0.04, 0xc99a3d, x, 0.14, z)));
    g.add(box(0.64, 0.04, 0.04, 0xc99a3d, 0, 0.6, -0.3), box(0.64, 0.04, 0.04, 0xc99a3d, 0, 0.6, 0.3));
    g.add(box(0.2, 0.14, 0.2, 0xb8b2a9, 0.05, 0.16, 0.0));
    g.add(box(0.05, 0.7, 0.05, 0xe0a526, 0.38, 0.1, -0.38), box(0.5, 0.05, 0.05, 0xe0a526, 0.15, 0.78, -0.38));
  };
  const FALLBACK = { agriculture: 'apple-orchard', utility: 'power-plant', extraction: 'mine', construction: 'brick-factory' };
  const buildings = new Map();   // "region:slot" -> { group, arrow, label, timer, finish, ... }

  function buildModel(b) {
    const g = new THREE.Group();
    if (b.kind === 'build') { SITE(g); return g; }
    (MODELS[b.slug] ?? MODELS[FALLBACK[b.category]] ?? ((gg) => gg.add(box(0.6, 0.4, 0.5, 0xd8d2c4, 0, 0.1)))).call(null, g);
    for (let l = 0; l < Math.min(b.level ?? 1, 6); l++) g.add(box(0.08, 0.06, 0.08, COLORS.gold, -0.4 + l * 0.12, 0.1, 0.46));   // level pips
    g.add(lampBall(-0.42, 0.5, -0.4));
    return g;
  }

  function setBuildings(list) {
    for (const v of buildings.values()) { v.group.parent?.remove(v.group); scene.remove(v.arrow); v.label.remove(); }
    buildings.clear();
    for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.region === undefined || pickables[i].isGroup) pickables.splice(i, 1);
    for (const reg of Object.values(regs)) reg.used.clear();
    for (const b of list) {
      const reg = regs[b.region ?? 'home']; if (!reg || b.slot >= reg.r.slots) continue;
      const p = localPos(reg, b.slot), g = buildModel(b);
      g.position.set(p.x, 0, p.z); g.scale.setScalar(0.001);
      g.userData = { slot: b.slot, region: reg.r.id };
      g.traverse((o) => { if (o.isMesh) o.userData = { slot: b.slot, region: reg.r.id }; });
      reg.g.add(g); pickables.push(g); reg.used.add(b.slot);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), mat(COLORS.teal));
      arrow.rotation.x = Math.PI; arrow.visible = false; scene.add(arrow);
      const label = document.createElement('div');
      label.className = 'bl';
      label.innerHTML = `<span class="bl-timer" hidden></span><span class="bl-label">${b.name}<small>LVL ${b.level ?? 1}</small></span>`;
      labelLayer.appendChild(label);
      const wp = worldPos(reg, b.slot);
      arrow.position.set(wp.x, 1.35, wp.z);
      buildings.set(`${reg.r.id}:${b.slot}`, { group: g, arrow, label, timer: label.firstChild, finish: b.finishAt ? new Date(b.finishAt) : null, kind: b.kind ?? null, born: performance.now(), pos: new THREE.Vector3(wp.x, 1.25, wp.z), x: wp.x, z: wp.z });
    }
    Object.values(regs).forEach(paintRegion);
    shadowFrames = 45;                            // covers the pop-in animation
    tickTimers();
  }

  const fmt = (s) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  const ICON = { build: '🔨', upgrade: '⬆️', crop: '🍎' };
  function tickTimers() {
    for (const v of buildings.values()) {
      if (!v.finish || !v.kind) { v.timer.hidden = true; v.ready = false; continue; }   // no timer for anything else
      const left = Math.ceil((v.finish - Date.now()) / 1000);
      if (left <= 0 && v.kind !== 'crop') {                                          // construction / upgrade finished
        v.timer.hidden = true; v.ready = false;
        if (!v.done) { v.done = true; onTimerDone?.(); }
        continue;
      }
      v.timer.hidden = false; v.ready = left <= 0;
      v.timer.textContent = v.ready ? 'Ready' : `${ICON[v.kind]} ${fmt(left)}`;
      v.timer.classList.toggle('ready', v.ready);
    }
  }
  const timerId = setInterval(() => { if (stage.isConnected) tickTimers(); else if (!keepAlive) clearInterval(timerId); }, 1000);

  // ---- Level changes (unlock regions) ----
  function setLevel(l) {
    if (l === level) return;
    level = l;
    for (const reg of Object.values(regs)) { reg.locked = level < reg.r.unlock; paintRegion(reg); }
    buildRoutes(); shadowFrames = 3;
  }

  // ---- Day / night ----
  let goalX = 0, goalE = 1, nowX = 0, nowE = 1, lastHour = -1, lastShadow = '';
  function readClock() {
    const d = new Date();
    const hour = d.getHours() + d.getMinutes() / 60;      // day/night follows the device clock
    if (Math.abs(hour - lastHour) < 0.01) return;
    lastHour = hour;
    const a = ((hour - 6) / 12) * Math.PI;      // 6h = sunrise, 18h = sunset
    goalX = Math.cos(a); goalE = Math.sin(a);
  }
  const tmp = new THREE.Color(), cDay = new THREE.Color(0xbfe3f2), cDusk = new THREE.Color(0xf0a982), cNight = new THREE.Color(0x0a1330);
  const wDay = new THREE.Color(COLORS.water), wNight = new THREE.Color(COLORS.waterNight);
  const sunDay = new THREE.Color(0xfff0d2), sunNight = new THREE.Color(0x8fa4ff);
  function applyLight(k) {
    nowX += (goalX - nowX) * k; nowE += (goalE - nowE) * k;
    const day = clamp((nowE + 0.15) / 0.45, 0, 1), dusk = clamp(1 - Math.abs(nowE) / 0.35, 0, 1) * 0.55;
    tmp.copy(cNight).lerp(cDay, day).lerp(cDusk, dusk);
    scene.background.copy(tmp); scene.fog.color.copy(tmp);
    hemi.intensity = 0.28 + 0.52 * day;
    sun.intensity = 0.14 + 0.84 * day;
    sun.color.copy(sunNight).lerp(sunDay, day);
    waterMat.color.copy(wNight).lerp(wDay, day);
    const dark = 1 - clamp(day * 1.6, 0, 1);
    lampMat.opacity = dark; stars.material.opacity = clamp(dark * 1.2 - 0.1, 0, 1); moon.material.opacity = dark;
    sun.position.set(cam.tx + nowX * 11, 3 + Math.max(nowE, 0.12) * 11, cam.tz + 6);
    sun.target.position.set(cam.tx, 0, cam.tz);
    const sig = [nowX, nowE, cam.tx / 1.5, cam.tz / 1.5].map((v) => Math.round(v * 20)).join();
    if (sig !== lastShadow) { lastShadow = sig; shadowFrames = Math.max(shadowFrames, 2); }
  }

  // ---- Camera controller (orbit + pinch + pan) ----
  const cam = { theta: 0.65, phi: 1.0, dist: 15, tx: 0, tz: 0 };
  const goal = { ...cam };
  const WORLD = { theta: 0.5, phi: 0.95, dist: 40, tx: 0, tz: 0 };
  const lim = () => { goal.phi = clamp(goal.phi, 0.35, 1.3); goal.dist = clamp(goal.dist, 6, 46); goal.tx = clamp(goal.tx, -24, 24); goal.tz = clamp(goal.tz, -18, 18); };
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

  // ---- Region focus ----
  const nearest = () => {
    let best = null, bd = 1e9;
    for (const r of REGIONS) { const d = Math.hypot(goal.tx - r.x, goal.tz - r.z); if (d < bd) { bd = d; best = r; } }
    return bd < 8 ? best.id : null;
  };
  const currentRegion = () => (goal.dist > 22 ? null : nearest());
  function focus(id) {
    const r = REGION[id]; if (!r) return;
    goal.tx = r.x; goal.tz = r.z; goal.dist = id === 'home' ? 15 : 12; goal.phi = 1.0; lim();
  }
  const showWorld = () => { Object.assign(goal, WORLD); lim(); select(null); };

  // ---- Picking ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function select(sel) {
    frame.visible = !!sel;
    if (sel) { const p = worldPos(regs[sel.region], sel.slot); frame.position.set(p.x, 0.1, p.z); }
  }
  function pick(cx, cy) {
    const r = cv.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(pickables, true)) {
      let o = hit.object;
      while (o && o.userData.region === undefined) o = o.parent;
      if (!o) continue;
      const rid = o.userData.region;
      if (o.userData.slot === undefined || rid !== currentRegion()) { select(null); focus(rid); return; }   // first tap flies to the island
      select({ region: rid, slot: o.userData.slot }); onPick?.(rid, o.userData.slot); return;
    }
    select(null);
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

  readClock(); nowX = goalX; nowE = goalE;
  let last = performance.now(), frameNo = 0, lastRegion = '?', clockAt = 0;
  const v3 = new THREE.Vector3();
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

    if (now - clockAt > 4000) { clockAt = now; readClock(); }
    applyLight(1 - Math.pow(0.2, dt));

    const cr = currentRegion();
    if (cr !== lastRegion) { lastRegion = cr; if (cr === null) select(null); onRegion?.(cr); }

    const t = now / 1000;
    if (frameNo % 2 === 0) {                                  // waves at half rate; flat shading needs no normals
      const pa = wGeo.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, Math.sin(wBase[i * 3] * 0.35 + t * 0.9) * 0.05 + Math.cos(wBase[i * 3 + 2] * 0.3 + t * 0.7) * 0.05);
      pa.needsUpdate = true;
    }
    clouds.forEach((c, i) => { c.position.x += dt * (0.25 + i * 0.05); if (c.position.x > 48) c.position.x = -48; });
    spinners.forEach((s) => { s.rotation.z += dt * 1.6; });
    for (const s of ships) {
      s.t += s.dir * dt * 1.1 / s.len;
      if (s.t > s.hi) { s.t = s.hi; s.dir = -1; } else if (s.t < s.lo) { s.t = s.lo; s.dir = 1; }
      const p = s.curve.getPoint(s.t), tg = s.curve.getTangent(s.t);
      s.mesh.position.set(p.x, -0.88 + Math.sin(t * 2 + s.lo * 9) * 0.03, p.z);
      s.mesh.rotation.y = Math.atan2(-tg.z * s.dir, tg.x * s.dir);
    }
    for (const reg of Object.values(regs)) reg.plus.forEach((p, i) => { if (p.visible) p.position.y = 0.13 + Math.sin(t * 2 + i) * 0.015; });
    if (frame.visible) frame.material.color.setHex(Math.sin(t * 6) > 0 ? COLORS.brand : COLORS.gold);

    const hw = stage.clientWidth / 2, hh = stage.clientHeight / 2, close = cam.dist < 22, far = cam.dist > 17;
    for (const v of buildings.values()) {
      const age = Math.min((now - v.born) / 450, 1);                         // pop-in
      v.group.scale.setScalar(age < 1 ? 1 - Math.pow(1 - age, 3) * (1 + 0.4 * Math.sin(age * 9)) + 0.001 : 1);
      v.arrow.visible = !!v.ready && v.kind === 'crop' && close;
      if (v.ready) v.arrow.position.y = 1.2 + Math.sin(t * 4) * 0.08;
      v3.copy(v.pos).project(camera);
      const hide = v3.z > 1 || !close;
      v.label.style.display = hide ? 'none' : '';
      if (!hide) v.label.style.transform = `translate(${(v3.x * hw + hw).toFixed(1)}px,${(-v3.y * hh + hh).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (const reg of Object.values(regs)) {
      v3.copy(reg.pos).project(camera);
      const hide = v3.z > 1 || !far;
      reg.label.style.display = hide ? 'none' : '';
      if (!hide) reg.label.style.transform = `translate(${(v3.x * hw + hw).toFixed(1)}px,${(-v3.y * hh + hh).toFixed(1)}px) translate(-50%,-100%)`;
    }
    if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }
    renderer.render(scene, camera);
    requestAnimationFrame(frameLoop);
  }
  focus('home'); Object.assign(cam, goal);
  requestAnimationFrame(frameLoop);

  return {
    setBuildings, setActivity, setLevel, focus, showWorld, currentRegion,
    clearSelection: () => select(null),
    resetView: showWorld,
    zoom: (f) => { goal.dist *= f; lim(); },
  };
}
