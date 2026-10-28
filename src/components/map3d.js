// Real 3D map (WebGL, three.js r128 from cdnjs, same loader as globe.js). Same API as mapIso.js
// (setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView), so landGrid.js decides WHAT to show
// and this file decides HOW. Returns null when WebGL / three.js is unavailable (landGrid then falls back to mapIso.js).
//   drag = rotate · pinch / wheel = zoom · tap an island (world view) = fly there · tap plot or building = onPick
import { REGIONS, REGION, PLOT_KINDS, plotKind } from '../config/regions.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const PS = 2.6;   // plot pitch in world units
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

  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#7fbfe3'); g.addColorStop(1, '#e3f3ef'); x.fillStyle = g; x.fillRect(0, 0, 4, 256); scene.background = new T.CanvasTexture(c); }
  scene.fog = new T.Fog(0xcfe8ee, 90, 260);
  const camera = new T.PerspectiveCamera(45, 1, 0.5, 400);
  scene.add(new T.HemisphereLight(0xdff3ff, 0x7b8a78, 0.75));
  const sun = new T.DirectionalLight(0xfff1d6, 0.95); sun.position.set(-22, 38, 16); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 130 }); sun.shadow.bias = -0.0006; scene.add(sun);
  const TEXDIR = new URL('../assets/textures/', import.meta.url).href, loader = new T.TextureLoader(), texCache = {};
  const tex = (name, rx, ry) => { const k = name + rx + ry; if (!texCache[k]) { const t = loader.load(TEXDIR + name + '.png', () => { dirty = true; }); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; texCache[k] = t; } return texCache[k]; };
  const sea = new T.Mesh(new T.PlaneGeometry(600, 600), new T.MeshStandardMaterial({ map: tex('water', 40, 40), color: 0x6fb9d8, roughness: 0.35 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -0.7; sea.receiveShadow = true; scene.add(sea);

  // ---- islands: asphalt roads with yellow centre lines, stone rim, earth sides, lamp posts, one pad per plot ----
  const pickables = [], islands = {}, iconTex = {};
  const emoji = (k) => iconTex[k] ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '40px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(PLOT_KINDS[k].icon, 32, 34); return new T.CanvasTexture(c); })();
  function roadTexture(r, W, H) {
    const K = 40, c = document.createElement('canvas'); c.width = Math.round(W * K); c.height = Math.round(H * K); const x = c.getContext('2d');
    x.fillStyle = '#3b4047'; x.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; x.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); }
    x.strokeStyle = '#d9b73a'; x.lineWidth = 3; x.setLineDash([16, 14]);
    for (let k = 1; k < r.cols; k++) { x.beginPath(); x.moveTo((0.8 + k * PS) * K, 0.8 * K); x.lineTo((0.8 + k * PS) * K, c.height - 0.8 * K); x.stroke(); }
    for (let k = 1; k < rowsOf(r); k++) { x.beginPath(); x.moveTo(0.8 * K, (0.8 + k * PS) * K); x.lineTo(c.width - 0.8 * K, (0.8 + k * PS) * K); x.stroke(); }
    x.setLineDash([]); x.strokeStyle = '#cfc9bb'; x.lineWidth = 0.5 * K; x.strokeRect(0.25 * K, 0.25 * K, c.width - 0.5 * K, c.height - 0.5 * K);
    return new T.CanvasTexture(c);
  }
  const padMat = {
    farm: new T.MeshStandardMaterial({ map: tex('grass', 2, 2), color: 0xb7e08a, roughness: 1 }),
    shop: new T.MeshStandardMaterial({ map: tex('paving', 2, 2), color: 0xf3e3c3, roughness: 0.9 }),
    industry: new T.MeshStandardMaterial({ map: tex('concrete', 2, 2), color: 0xd0d3d6, roughness: 0.9 }),
  };
  const poleG = new T.CylinderGeometry(0.04, 0.05, 1, 6), bulbG = new T.SphereGeometry(0.1, 8, 6), poleM = new T.MeshStandardMaterial({ color: 0x2b3138 }), bulbM = new T.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xffd96a, emissiveIntensity: 0.8 });
  for (const r of REGIONS) {
    const rows = rowsOf(r), W = r.cols * PS + 1.6, H = rows * PS + 1.6;
    const side = new T.MeshStandardMaterial({ map: tex('earth', Math.max(2, W / 3), 0.5), roughness: 1 });
    const slab = new T.Mesh(new T.BoxGeometry(W, 0.8, H), side); slab.position.set(r.x, -0.4, r.z); slab.receiveShadow = true; slab.userData = { island: r.id }; scene.add(slab); pickables.push(slab);
    const topM = new T.MeshStandardMaterial({ map: roadTexture(r, W, H), roughness: 0.95 });
    const top = new T.Mesh(new T.PlaneGeometry(W, H), topM); top.rotation.x = -Math.PI / 2; top.position.set(r.x, 0.01, r.z); top.receiveShadow = true; top.userData = { island: r.id }; scene.add(top); pickables.push(top);
    slab.userData.mats = [side, topM]; islands[r.id] = slab;
    for (let k = 1; k < r.cols; k++) for (let j = 1; j < rows; j++) {
      const lx = r.x + (k - r.cols / 2) * PS, lz = r.z + (j - rows / 2) * PS, pole = new T.Mesh(poleG, poleM), bulb = new T.Mesh(bulbG, bulbM);
      pole.position.set(lx + 0.12, 0.5, lz + 0.12); bulb.position.set(lx + 0.12, 1.05, lz + 0.12); scene.add(pole, bulb);
    }
    for (let s = 0; s < r.slots; s++) {
      const k = plotKind(r.id, s), [px, pz] = plotPos(r, s);
      const pad = new T.Mesh(new T.BoxGeometry(2.0, 0.12, 2.0), padMat[k]); pad.position.set(px, 0.07, pz); pad.receiveShadow = true; pad.userData = { region: r.id, slot: s }; scene.add(pad); pickables.push(pad);
      const ic = new T.Sprite(new T.SpriteMaterial({ map: emoji(k), transparent: true, depthWrite: false })); ic.scale.set(0.9, 0.9, 1); ic.position.set(px, 0.6, pz); ic.userData = pad.userData; scene.add(ic); pickables.push(ic);
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

  // ---- buildings: facades with windows, roofs, shadows, fences, trees, solar panels, chimneys, construction sites ----
  const bGroup = new T.Group(); scene.add(bGroup); let labels = [];
  const G = {}, MT = {}, FT = {};
  const geo = (k, f) => (G[k] ??= f());
  const std = (c, o = {}) => (MT[c + JSON.stringify(o)] ??= new T.MeshStandardMaterial({ color: c, roughness: 0.85, ...o }));
  const BOX = () => geo('box', () => new T.BoxGeometry(1, 1, 1));
  function put(g, geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) { const m = new T.Mesh(geometry, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.x = rx; m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }
  const bx = (g, mat, x, y, z, w, h, d, rx) => put(g, BOX(), mat, x, y, z, w, h, d, rx);
  function facadeMat(base, rows, cols) {
    const k = `${base}|${rows}|${cols}`; if (FT[k]) return FT[k];
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#' + base.toString(16).padStart(6, '0'); x.fillRect(0, 0, 128, 128);
    const cw = 128 / cols, rh = 128 / rows;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const lit = (r * 7 + q * 3) % 5 === 0;
      x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(q * cw + cw * 0.2, r * rh + rh * 0.22, cw * 0.6, rh * 0.52);
      x.fillStyle = lit ? '#ffe9a8' : '#8fc7e4'; x.fillRect(q * cw + cw * 0.24, r * rh + rh * 0.27, cw * 0.52, rh * 0.42);
    }
    return (FT[k] = new T.MeshStandardMaterial({ map: new T.CanvasTexture(c), roughness: 0.8 }));
  }
  function block(g, w, h, d, base, roof = 0x5a6068, x = 0, z = 0) {
    const f = facadeMat(base, Math.max(1, Math.round(h / 0.8)), Math.max(1, Math.round(Math.max(w, d) / 0.7)));
    const m = put(g, BOX(), [f, f, std(roof), std(0x222222), f, f], x, h / 2, z, w, h, d);
    bx(g, std(0x4a4f56), x, h + 0.05, z, w + 0.12, 0.1, d + 0.12); return m;
  }
  function tree(g, x, z, s = 1, fruit = false) {
    put(g, geo('trunk', () => new T.CylinderGeometry(0.06, 0.09, 0.5, 6)), std(0x6b4a2b), x, 0.25 * s, z, s, s, s);
    const crown = geo('crown', () => new T.SphereGeometry(0.4, 10, 8));
    put(g, crown, std(fruit ? 0x3f9a45 : 0x4f9f49), x, 0.75 * s, z, s, s, s); put(g, crown, std(0x5cb355), x, 1.1 * s, z, s * 0.72, s * 0.72, s * 0.72);
    if (fruit) for (let i = 0; i < 4; i++) { const a = i * 1.6 + x; put(g, geo('fruit', () => new T.SphereGeometry(0.07, 6, 5)), std(0xd43c3c), x + Math.cos(a) * 0.3 * s, (0.7 + (i % 2) * 0.3) * s, z + Math.sin(a) * 0.3 * s); }
  }
  function fence(g, w, d) {
    const m = std(0xf4f1ea);
    for (const [sx, sz, lw, ld] of [[0, d / 2, w, 0.05], [0, -d / 2, w, 0.05], [w / 2, 0, 0.05, d], [-w / 2, 0, 0.05, d]]) { bx(g, m, sx, 0.3, sz, lw, 0.05, ld); bx(g, m, sx, 0.15, sz, lw, 0.04, ld); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, m, sx * w / 2, 0.2, sz * d / 2, 0.08, 0.4, 0.08);
  }
  function panels(g, w, d, y) { const m = std(0x1f3b66, { metalness: 0.4, roughness: 0.35 }); for (const px of [-0.25, 0.25]) for (const pz of [-0.25, 0.25]) bx(g, m, px * w, y, pz * d, w * 0.38, 0.04, d * 0.38, -0.25); }
  const chimney = (g, x, y, z, h) => { put(g, geo('chim', () => new T.CylinderGeometry(0.16, 0.22, 1, 10)), std(0x8a8f94), x, y + h / 2, z, 1, h, 1); put(g, geo('chimtop', () => new T.CylinderGeometry(0.17, 0.17, 0.08, 10)), std(0xd43c3c), x, y + h, z); };
  const rock = (g, x, z, s) => put(g, geo('rock', () => new T.DodecahedronGeometry(0.3)), std(0x8f857a), x, 0.15 * s, z, s, s * 0.7, s);

  function makeBuilding(it) {
    const r = REGION[it.region], cells = it.cells.map((s) => [s % r.cols, Math.floor(s / r.cols)]);
    const c0 = Math.min(...cells.map((c) => c[0])), c1 = Math.max(...cells.map((c) => c[0])), r0 = Math.min(...cells.map((c) => c[1])), r1 = Math.max(...cells.map((c) => c[1])), rr = rowsOf(r);
    const w = (c1 - c0 + 1) * PS - 0.9, d = (r1 - r0 + 1) * PS - 0.9;
    const cx = r.x + ((c0 + c1) / 2 - (r.cols - 1) / 2) * PS, cz = r.z + ((r0 + r1) / 2 - (rr - 1) / 2) * PS;
    const g = new T.Group(); g.position.set(cx, 0.13, cz);
    const s = it.slug, lv = it.level, h = (HT[s] ?? 1.4) * (0.85 + lv * 0.12);
    if (it.status === 'build') {                                  // construction site
      bx(g, std(0xd9d2c3), 0, 0.15, 0, w, 0.3, d); bx(g, std(0xcfc8b8, { transparent: true, opacity: 0.55 }), 0, h * 0.25, 0, w * 0.96, h * 0.5, d * 0.96);
      const fr = new T.LineSegments(new T.EdgesGeometry(BOX()), new T.LineBasicMaterial({ color: 0xe8862a })); fr.position.y = h / 2; fr.scale.set(w, h, d); g.add(fr);
      put(g, geo('mast', () => new T.CylinderGeometry(0.05, 0.05, 1, 6)), std(0xe0a526), w * 0.4, h * 0.75 + 0.2, d * 0.4, 1, h * 1.5, 1); bx(g, std(0xe0a526), w * 0.15, h * 1.5 + 0.2, d * 0.4, w * 0.5, 0.08, 0.08);
    } else if (s === 'apple-orchard' || s === 'plantation') {
      fence(g, w, d);
      if (s === 'apple-orchard') {
        const spots = [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3], [0, 0], [-0.3, 0], [0.3, 0]].slice(0, Math.min(7, 3 + lv));
        spots.forEach(([x, z], i) => tree(g, x * w, z * d, 0.9 + (i % 3) * 0.12, true));
        if (lv >= 2) { bx(g, std(0x9fd8ee, { transparent: true, opacity: 0.35, roughness: 0.2 }), w * 0.2, 0.35, d * 0.2, w * 0.4, 0.6, d * 0.35); }
      } else {
        for (let i = 0; i < 5; i++) bx(g, std(i % 2 ? 0xc9b04a : 0x7bb85a), 0, 0.12, (i - 2) * d * 0.17, w * 0.8, 0.22, d * 0.1);
        block(g, w * 0.3, 0.9, d * 0.25, 0xb5533c, 0x6a3b30, -w * 0.3, d * 0.3);
      }
    } else if (s === 'grocery-store') {
      block(g, w * 0.88, h, d * 0.72, 0xf2e0c0, 0x6a3b30, 0, -d * 0.12);
      for (let i = 0; i < 6; i++) bx(g, std(i % 2 ? 0xffffff : 0xd43c3c), (i - 2.5) * w * 0.15, h * 0.62, d * 0.34, w * 0.15, 0.06, d * 0.2, 0.3);
      bx(g, std(0xd43c3c), -w * 0.33, h + 0.45, -d * 0.12, 0.5, 0.7, 0.14); bx(g, std(0xffffff), -w * 0.33, h + 0.45, -d * 0.04, 0.3, 0.3, 0.04);
      for (const x of [-0.25, 0.25]) { bx(g, std(0x8a5a33), x * w, 0.2, d * 0.42, 0.4, 0.3, 0.3); bx(g, std(0xd43c3c), x * w, 0.5, d * 0.42, 0.46, 0.05, 0.36); }
      if (lv >= 2) panels(g, w * 0.7, d * 0.5, h + 0.2);
    } else if (s === 'water-reservoir') {
      block(g, w * 0.7, h * 0.6, d * 0.45, 0xdfe6ea, 0x5a6068, 0, -d * 0.25);
      for (const x of [-0.25, 0.25]) { put(g, geo('tank', () => new T.CylinderGeometry(0.34, 0.34, 1, 16)), std(0x3f8fd6), x * w, h * 0.5, d * 0.2, 1, h, 1); put(g, geo('tanklid', () => new T.CylinderGeometry(0.36, 0.36, 0.08, 16)), std(0xdfe6ea), x * w, h + 0.04, d * 0.2); }
      put(g, geo('pool', () => new T.CylinderGeometry(0.3, 0.3, 0.06, 16)), std(0x7cc3ee, { transparent: true, opacity: 0.8, roughness: 0.2 }), 0, 0.05, d * 0.4);
    } else if (s === 'power-plant') {
      block(g, w * 0.85, h * 0.55, d * 0.7, 0xcfd2d6, 0x5a6068, 0, d * 0.1); panels(g, w * 0.8, d * 0.6, h * 0.55 + 0.15);
      chimney(g, -w * 0.25, 0, -d * 0.3, h); chimney(g, w * 0.25, 0, -d * 0.3, h * 0.85);
    } else if (s === 'mine' || s === 'quarry') {
      block(g, w * 0.4, 0.8, d * 0.35, 0xb9b2a6, 0x6f665c, -w * 0.25, -d * 0.3);
      [[0.2, 0.1, 1.2], [0.35, -0.2, 0.8], [-0.1, 0.3, 1], [0.1, -0.35, 0.7], [-0.3, 0.2, 0.9]].forEach(([x, z, k]) => rock(g, x * w, z * d, k));
      bx(g, std(0x2b3138), w * 0.1, 0.25, d * 0.05, w * 0.6, 0.12, 0.2, -0.2);
    } else if (s === 'brick-factory') {
      block(g, w * 0.85, h * 0.6, d * 0.65, 0xb5533c, 0x4a4f56, 0, 0); chimney(g, w * 0.3, h * 0.6, -d * 0.1, h * 0.6);
      for (const [x, z] of [[-0.3, 0.38], [-0.1, 0.38], [0.1, 0.38]]) bx(g, std(0xd9803a), x * w, 0.15, z * d, 0.35, 0.3, 0.25);
    } else block(g, w * 0.8, h, d * 0.8, 0xc9ccd0);
    if (lv >= 3 && it.status !== 'build') block(g, w * 0.28, h * 0.5, d * 0.28, 0xe3e0d8, 0x5a6068, w * 0.4, d * 0.4);   // annex from LVL 3
    if (lv >= 4 && it.status !== 'build') { bx(g, std(0xe0a526), 0.2, h + 1.1, 0, 0.5, 0.3, 0.04); put(g, geo('pole', () => new T.CylinderGeometry(0.02, 0.02, 1, 5)), std(0x777777), 0, h + 0.7, 0, 1, 0.8, 1); }
    const sp = label(); sp.position.set(0, h + 2.1, 0); g.add(sp);
    g.traverse((m) => { if (m.isMesh || m.isSprite) m.userData = { ...m.userData, region: it.region, slot: it.slot }; });
    const st0 = statusOf(it, Date.now()); sp.userData.it = it; sp.userData.draw(it, st0); sp.userData.last = st0.kind + st0.text; labels.push(sp);
    g.traverse((m) => { if (m.isMesh || m.isSprite) pickables.push(m); });
    return g;
  }
  function setBuildings(items) {
    for (const o of [...bGroup.children]) { o.traverse((m) => { const i = pickables.indexOf(m); if (i >= 0) pickables.splice(i, 1); if (m.isSprite) { m.material.map?.dispose(); m.material.dispose(); } }); bGroup.remove(o); }   // geometries and materials are shared, only label textures are freed
    labels = []; items.forEach((it) => { it.done = false; bGroup.add(makeBuilding(it)); }); dirty = true;
  }

  // ---- camera ----
  const target = new T.Vector3(), cam = { th: 0.7, ph: 0.95, r: 40 };
  let vw = 1, vh = 1, dirty = true, anim = null, lastRegion;
  const aspect = () => Math.min(vw / vh, 1.3);
  const isleR = () => Math.min(40, Math.max(16, 10.5 / (0.414 * aspect())));
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
  function setLevel(lv) { for (const r of REGIONS) for (const m of islands[r.id].userData.mats) m.color.setHex(lv < r.unlock ? 0x8a8f94 : 0xffffff); dirty = true; }
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
