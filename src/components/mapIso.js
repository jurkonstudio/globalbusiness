// Isometric business map. Replaces the flat board of map2d.js and keeps the same API
// (setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView), so landGrid.js only decides
// WHAT to show and this file decides HOW.
//
// Look: every district is a cream-rimmed island slab on the sea, the Warehouse sits in the middle and every
// building is wired to it by a supply line, so the chain farm -> warehouse -> store stays visible
// (that is the Global Business idea). Buildings are drawn procedurally on a 2D canvas, no image files:
//   * level      -> taller body, more trees/tanks/towers, gold pennant from level 4
//   * status     -> pill above the building: Collect / Start / timer / Needs inputs
//   * supply line-> animated dashes while a building is producing, a truck drives the trunk road
//   * tap        -> building (production, upgrade, demolish sheet) or empty plot (build sheet)
import { REGIONS, REGION, PLOT_KINDS, plotKind, parcelKey } from '../config/regions.js';

const HW = 36, HH = 18;          // half tile: 2:1 isometric
const SLAB = 14;                 // island thickness in px
const LIP = 0.5;                 // slab margin around the plots, in tiles
const TAU = Math.PI * 2;
const INK = '#0d1b2a', INK2 = '#15283d', CARD = '#fffdf8', BRAND = '#e4572e', TEAL = '#1f9d8a', GOLD = '#e0a526';
const LINE = 'rgba(13,27,42,.38)';
const FONT = '"Barlow Condensed","Arial Narrow",system-ui,sans-serif';   // same family as the UI (theme.css)

// ---------- World layout (tile units). The Warehouse is the hub, each island hangs on a trunk road ----------
const HUB = { x: 0, y: 0, w: 4, h: 4, cx: 2, cy: 2 };
const LAY = {
  home:      { ox: 7,  oy: 0,   line: ['y', 2],   path: [[6.5, 2], [4, 2], [2, 2]] },
  verdant:   { ox: -7, oy: 0.5, line: ['y', 2],   path: [[-2.5, 2], [0, 2], [2, 2]] },
  ironridge: { ox: 0,  oy: -7,  line: ['x', 2],   path: [[2, -3.5], [2, 0], [2, 2]] },
  meridian:  { ox: 7,  oy: 7,   line: ['y', 8.5], path: [[6.5, 8.5], [2, 8.5], [2, 4], [2, 2]] },
  sunspire:  { ox: 0,  oy: 11,  line: ['x', 2],   path: [[2, 10.5], [2, 4], [2, 2]] },
};
const ROADS = [[[4.5, 2], [6.5, 2]], [[-0.5, 2], [-2.5, 2]], [[2, -0.5], [2, -3.5]], [[2, 4.5], [2, 10.5]], [[2, 8.5], [6.5, 8.5]]];
for (const r of REGIONS) {
  const l = LAY[r.id], rows = Math.ceil(r.slots / r.cols);
  Object.assign(l, { id: r.id, cols: r.cols, rows, x0: l.ox - LIP, y0: l.oy - LIP, x1: l.ox + r.cols + LIP, y1: l.oy + rows + LIP, cx: l.ox + r.cols / 2, cy: l.oy + rows / 2 });
}
const HUB_SLAB = { x0: -LIP, y0: -LIP, x1: HUB.w + LIP, y1: HUB.h + LIP };

// ---------- Look-up tables ----------
const HT = { 'apple-orchard': 34, plantation: 32, 'water-reservoir': 34, 'power-plant': 60, mine: 40, quarry: 34, 'brick-factory': 58, 'grocery-store': 34 };
const CAT = { agriculture: '#58b153', retail: '#e0902f', utility: '#e0b528', extraction: '#8f857a', construction: '#c0634a' };
const SHORT = { 'apple-orchard': 'Orchard', plantation: 'Plantation', 'water-reservoir': 'Water', 'power-plant': 'Power', mine: 'Mine', quarry: 'Quarry', 'brick-factory': 'Bricks', 'grocery-store': 'Grocery' };
const BONUS = { agriculture: 'Farms', extraction: 'Mines', construction: 'Factories', utility: 'Utilities' };
const money = (n) => '$' + Number(n).toLocaleString('en-US');
const clockText = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };

// ---------- Colour helpers ----------
const mixCache = new Map();
const rgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((x) => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function mix(a, b, k) {
  const key = a + b + k; let v = mixCache.get(key); if (v) return v;
  const A = rgb(a), B = rgb(b);
  v = '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * k).toString(16).padStart(2, '0')).join('');
  mixCache.set(key, v); return v;
}
const shade = (col, k) => (k < 1 ? mix(col, '#000000', 1 - k) : mix(col, '#ffffff', k - 1));
const mk = (base) => ({ top: shade(base, 1.16), l: base, r: shade(base, 0.74) });
const hex6 = (n) => '#' + n.toString(16).padStart(6, '0');

// ---------- Drawing primitives (all in world px; `c` is the current context) ----------
let c = null;
const P = (x, y, z = 0) => [(x - y) * HW, (x + y) * HH - z];
function poly(pts, fill, stroke, lw = 1) {
  c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
}
const diamond = (x0, y0, x1, y1, z, fill, stroke, lw) => poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)], fill, stroke, lw);
function box(x0, y0, x1, y1, z0, z1, f, line = LINE) {
  poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)], f.r, line, 0.8);
  poly([P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)], f.l, line, 0.8);
  poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], f.top, line, 0.8);
}
function wall(axis, k, a0, a1, z0, z1, fill, stroke) {
  const q = axis === 'x' ? [P(k, a0, z0), P(k, a1, z0), P(k, a1, z1), P(k, a0, z1)] : [P(a0, k, z0), P(a1, k, z0), P(a1, k, z1), P(a0, k, z1)];
  poly(q, fill, stroke, 0.7);
}
const circle = (x, y, r, fill) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); };
function cyl(cx, cy, r, z0, z1, base, noTop) {
  const [sx, sy0] = P(cx, cy, z0), [, sy1] = P(cx, cy, z1), rx = r * HW * 1.414, ry = r * HH * 1.414;
  const g = c.createLinearGradient(sx - rx, 0, sx + rx, 0);
  g.addColorStop(0, shade(base, 1.2)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, 0.66));
  c.beginPath(); c.moveTo(sx - rx, sy1); c.lineTo(sx - rx, sy0); c.ellipse(sx, sy0, rx, ry, 0, Math.PI, 0, true);
  c.lineTo(sx + rx, sy1); c.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI, true); c.closePath();
  c.fillStyle = g; c.fill(); c.strokeStyle = LINE; c.lineWidth = 0.8; c.stroke();
  if (!noTop) { c.beginPath(); c.ellipse(sx, sy1, rx, ry, 0, 0, TAU); c.fillStyle = shade(base, 1.22); c.fill(); c.stroke(); }
}
function tower(cx, cy, rb, rt, z1, base) {          // hyperbolic cooling tower
  const [sx, sy0] = P(cx, cy, 0), [, sy1] = P(cx, cy, z1);
  const bx = rb * HW * 1.414, by = rb * HH * 1.414, tx = rt * HW * 1.414, ty = rt * HH * 1.414, my = (sy0 + sy1) / 2;
  const g = c.createLinearGradient(sx - bx, 0, sx + bx, 0);
  g.addColorStop(0, shade(base, 1.18)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, 0.64));
  c.beginPath(); c.moveTo(sx - bx, sy0); c.quadraticCurveTo(sx - tx * 0.72, my, sx - tx, sy1);
  c.ellipse(sx, sy1, tx, ty, 0, Math.PI, TAU); c.quadraticCurveTo(sx + tx * 0.72, my, sx + bx, sy0);
  c.ellipse(sx, sy0, bx, by, 0, 0, Math.PI); c.closePath();
  c.fillStyle = g; c.fill(); c.strokeStyle = LINE; c.lineWidth = 0.8; c.stroke();
  c.beginPath(); c.ellipse(sx, sy1, tx, ty, 0, 0, TAU); c.fillStyle = '#35414f'; c.fill(); c.stroke();
}
function puffs(x, y, z, t, n, spread = 1) {
  const [sx, sy] = P(x, y, z);
  for (let i = 0; i < n; i++) {
    const ph = (t * 0.22 + i / n) % 1;
    c.globalAlpha = 0.6 * (1 - ph);
    circle(sx + (5 + ph * 12) * spread + Math.sin(t + i * 2) * 2, sy - ph * 42, 4 + ph * 9, '#ffffff');
  }
  c.globalAlpha = 1;
}
function tree(x, y, s, fruit, glow) {
  const [sx, sy] = P(x, y, 0);
  c.fillStyle = 'rgba(13,27,42,.16)'; c.beginPath(); c.ellipse(sx + 2, sy + 1, 10 * s, 5 * s, 0, 0, TAU); c.fill();
  c.fillStyle = '#7a5a3a'; c.fillRect(sx - 1.7 * s, sy - 11 * s, 3.4 * s, 11 * s);
  circle(sx - 4.5 * s, sy - 16 * s, 8 * s, '#3f8f43'); circle(sx + 4.5 * s, sy - 15 * s, 8 * s, '#3f8f43');
  circle(sx, sy - 21 * s, 10 * s, '#58b153'); circle(sx - 3 * s, sy - 24 * s, 5 * s, '#7fcf6f');
  if (fruit) for (const [dx, dy] of [[-5, -19], [4, -24], [7, -17], [-1, -15], [-8, -23]]) circle(sx + dx * s, sy + dy * s, (glow ? 2.9 : 2.2) * s, glow ? '#ff5a36' : BRAND);
}
const pad = (o, fill = '#e6e1d0') => diamond(o.gx + 0.12, o.gy + 0.12, o.gx + 0.88, o.gy + 0.88, 0, fill, 'rgba(13,27,42,.2)', 1);

// ---------- Textures: seamless PNGs in src/assets/textures (made by tools/gen-textures.py) ----------
// Images are shared by every map instance. A pattern is only used once its image has loaded;
// until then (or if a file is missing) the flat colours below are drawn, so the map never breaks.
const TEX_SIZE = 256;                                  // px per tile in the texture files
const texURL = (name) => new URL(`../assets/textures/${name}.png`, import.meta.url).href;
const ZONE_TEX = { farm: 'grass', shop: 'paving', industry: 'concrete' };

// ---------- Plot zones: farm / shop / industry ----------
const ZONE = {
  farm:     { a: '#a5d46f', b: '#93c75c', edge: '#4f8f3c' },
  shop:     { a: '#efe3c8', b: '#e6d6b2', edge: '#c27a22' },
  industry: { a: '#d5d9dc', b: '#c7ccd0', edge: '#6b7782' },
};
function zoneIcon(kind, gx, gy) {                       // small sign drawn on an EMPTY plot
  if (kind === 'farm') {
    for (let i = 0; i < 4; i++) { const y = gy + 0.3 + i * 0.14; diamond(gx + 0.16, y, gx + 0.84, y + 0.07, 0, i % 2 ? '#8d6b45' : '#a67c52'); }
    for (const [u, v] of [[0.32, 0.34], [0.52, 0.5], [0.7, 0.66]]) {
      const [sx, sy] = P(gx + u, gy + v, 0); c.strokeStyle = '#2f7d32'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 7); c.stroke();
      c.fillStyle = '#58b153'; c.beginPath(); c.ellipse(sx - 3, sy - 7, 3.2, 1.6, -0.6, 0, TAU); c.ellipse(sx + 3, sy - 8, 3.2, 1.6, 0.6, 0, TAU); c.fill();
    }
  } else if (kind === 'shop') {
    box(gx + 0.3, gy + 0.3, gx + 0.7, gy + 0.6, 0, 7, mk('#f2ead8'));
    for (let i = 0; i < 4; i++) { const a = gx + 0.26 + 0.12 * i; poly([P(a, gy + 0.6, 12), P(a + 0.12, gy + 0.6, 12), P(a + 0.12, gy + 0.72, 7), P(a, gy + 0.72, 7)], i % 2 ? CARD : BRAND, LINE, 0.5); }
  } else {
    const [sx, sy] = P(gx + 0.5, gy + 0.5, 0);
    c.strokeStyle = '#6b7782'; c.lineWidth = 2.2; c.beginPath(); c.ellipse(sx, sy - 3, 6, 3.4, 0, 0, TAU); c.stroke();
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; c.beginPath(); c.moveTo(sx + Math.cos(a) * 6, sy - 3 + Math.sin(a) * 3.4); c.lineTo(sx + Math.cos(a) * 9, sy - 3 + Math.sin(a) * 5); c.stroke(); }
  }
}

// ---------- Buildings ----------
function dOrchard(o) {
  const { gx, gy } = o;
  diamond(gx + 0.12, gy + 0.12, gx + 0.88, gy + 0.88, 0, '#78b658', '#4f8f3c', 1);
  diamond(gx + 0.18, gy + 0.18, gx + 0.82, gy + 0.82, 0, '#8bc767');
  const n = [2, 3, 4, 5, 7, 9][Math.min(5, o.level - 1)], s = n <= 3 ? 1 : n <= 5 ? 0.92 : 0.8;
  const sl = [[.35, .35], [.65, .65], [.65, .35], [.35, .65], [.5, .5], [.5, .14], [.5, .86], [.14, .5], [.86, .5]].slice(0, n).sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
  for (const [u, v] of sl) tree(gx + u, gy + v, s, true, o.status === 'ready');
}
function dPlantation(o) {
  const { gx, gy, hf } = o;
  diamond(gx + 0.12, gy + 0.12, gx + 0.88, gy + 0.88, 0, '#cdb67f', '#9a8556', 1);
  for (let i = 0; i < 5; i++) { const y = gy + 0.44 + i * 0.09; diamond(gx + 0.1, y, gx + 0.92, y + 0.06, 0, i % 2 ? '#6fb14f' : '#9bd06a'); }
  const f = mk('#d9d2bd'); box(gx + 0.12, gy + 0.1, gx + 0.5, gy + 0.4, 0, 18 * hf, { ...f, top: '#c4483a' });
  wall('y', gy + 0.4, gx + 0.2, gx + 0.38, 0, 11 * hf, '#7a3b2a');
  if (o.level >= 3) { cyl(gx + 0.75, gy + 0.24, 0.13, 0, 30 * hf, '#cfd5da'); const [sx, sy] = P(gx + 0.75, gy + 0.24, 30 * hf); circle(sx, sy - 2, 5, '#aeb8bf'); }
}
function dWater(o, t) {
  const { gx, gy, hf } = o;
  pad(o, '#d3dde2');
  diamond(gx + 0.1, gy + 0.42, gx + 0.9, gy + 0.92, 0, '#4fb3e0', '#2b86b5', 1);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2;
  for (let i = 0; i < 2; i++) { const [sx, sy] = P(gx + 0.45 + i * 0.25, gy + 0.62 + i * 0.1, 0); const w = Math.sin(t * 2 + i * 2) * 2; c.beginPath(); c.moveTo(sx - 6, sy + w); c.quadraticCurveTo(sx, sy - 3 + w, sx + 6, sy + w); c.stroke(); }
  box(gx + 0.12, gy + 0.1, gx + 0.38, gy + 0.32, 0, 11, mk('#8fa3b3'));
  if (o.level >= 3) cyl(gx + 0.34, gy + 0.22, 0.12, 0, 22 * hf, '#e9eef2');
  cyl(gx + 0.66, gy + 0.3, 0.17, 0, 28 * hf, '#e9eef2');
  cyl(gx + 0.66, gy + 0.3, 0.17, 9 * hf, 15 * hf, '#3f9bd4', true);
  const [sx, sy] = P(gx + 0.66, gy + 0.3, 28 * hf);
  c.fillStyle = '#3f9bd4'; c.beginPath(); c.moveTo(sx, sy - 7); c.quadraticCurveTo(sx + 6, sy, sx, sy + 3); c.quadraticCurveTo(sx - 6, sy, sx, sy - 7); c.fill();
}
function dPower(o, t) {
  const { gx, gy, hf } = o;
  pad(o, '#d9dee2');
  box(gx + 0.12, gy + 0.62, gx + 0.88, gy + 0.9, 0, 13, mk('#7d93a8'));
  wall('y', gy + 0.9, gx + 0.2, gx + 0.8, 3, 8, '#cfe8f5');
  cyl(gx + 0.84, gy + 0.18, 0.05, 0, 54 * hf, '#e8e2d6');
  cyl(gx + 0.84, gy + 0.18, 0.052, 40 * hf, 46 * hf, '#e4572e', true);
  tower(gx + 0.28, gy + 0.36, 0.2, 0.14, 40 * hf, '#dfe4e8');
  tower(gx + 0.64, gy + 0.3, 0.2, 0.14, 40 * hf, '#dfe4e8');
  puffs(gx + 0.28, gy + 0.36, 40 * hf, t, 3); puffs(gx + 0.64, gy + 0.3, 40 * hf, t + 0.4, 3);
  const [sx, sy] = P(gx + 0.5, gy + 0.9, 7);
  c.fillStyle = GOLD; c.beginPath(); c.moveTo(sx + 2, sy - 6); c.lineTo(sx - 4, sy + 1); c.lineTo(sx, sy + 1); c.lineTo(sx - 2, sy + 7); c.lineTo(sx + 5, sy - 1); c.lineTo(sx + 1, sy - 1); c.closePath(); c.fill();
}
function dMine(o) {
  const { gx, gy, hf } = o, cx = gx + 0.46, cy = gy + 0.5, N = 9, H = 36 * hf;
  pad(o, '#d6d0c3');
  const peak = P(cx - 0.04, cy - 0.04, H), faces = [];
  for (let i = 0; i < N; i++) { const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU, am = (a0 + a1) / 2; faces.push({ a0, a1, k: Math.sin(am) + Math.cos(am) }); }
  faces.sort((a, b) => a.k - b.k);
  for (const f of faces) {
    const R = 0.4, p0 = P(cx + Math.cos(f.a0) * R, cy + Math.sin(f.a0) * R, 0), p1 = P(cx + Math.cos(f.a1) * R, cy + Math.sin(f.a1) * R, 0);
    const lit = 0.78 + 0.22 * (Math.sin((f.a0 + f.a1) / 2) - Math.cos((f.a0 + f.a1) / 2)) * 0.5;
    poly([p0, p1, peak], shade('#9b948a', lit + 0.06), 'rgba(13,27,42,.25)', 0.7);
  }
  const [ax, ay] = P(gx + 0.5, gy + 0.86, 0);
  c.fillStyle = '#17191e'; c.beginPath(); c.moveTo(ax - 9, ay); c.lineTo(ax - 9, ay - 9); c.quadraticCurveTo(ax, ay - 20, ax + 9, ay - 9); c.lineTo(ax + 9, ay); c.closePath(); c.fill();
  c.strokeStyle = '#8a5a34'; c.lineWidth = 2; c.stroke();
  const [hx, hy] = P(gx + 0.82, gy + 0.24, 0);
  c.strokeStyle = '#3e4650'; c.lineWidth = 1.6; c.beginPath();
  c.moveTo(hx - 6, hy); c.lineTo(hx - 2, hy - 30 * hf); c.moveTo(hx + 6, hy); c.lineTo(hx + 2, hy - 30 * hf);
  c.moveTo(hx - 5, hy - 8); c.lineTo(hx + 4, hy - 20); c.moveTo(hx + 5, hy - 8); c.lineTo(hx - 4, hy - 20); c.stroke();
  c.beginPath(); c.arc(hx, hy - 30 * hf - 3, 5, 0, TAU); c.strokeStyle = BRAND; c.stroke();
}
function dQuarry(o) {
  const { gx, gy, hf } = o;
  pad(o, '#d9d0b9');
  const steps = [[0.08, 0, '#e2d2a8'], [0.22, -5, '#c9b283'], [0.36, -10, '#ab9467']];
  steps.forEach(([d, z, col], i) => {
    diamond(gx + d, gy + d, gx + 1 - d, gy + 1 - d, z, col, 'rgba(13,27,42,.22)', 0.8);
    if (i) { const a = P(gx + d, gy + 1 - d, z), b = P(gx + d, gy + d, z), e = P(gx + 1 - d, gy + d, z); poly([a, b, [b[0], b[1] + 5], [a[0], a[1] + 5]], shade(col, 0.82)); poly([b, e, [e[0], e[1] + 5], [b[0], b[1] + 5]], shade(col, 0.7)); }
  });
  box(gx + 0.7, gy + 0.62, gx + 0.9, gy + 0.82, 0, 7 + 2 * hf, mk('#aeb4ba'));
  box(gx + 0.12, gy + 0.72, gx + 0.3, gy + 0.9, 0, 5, mk('#c3c8cc'));
  const [mx, my] = P(gx + 0.84, gy + 0.18, 0), top = 30 * hf;
  c.strokeStyle = '#f0b429'; c.lineWidth = 3; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my - top); c.lineTo(mx - 26, my - top + 13); c.stroke();
  c.strokeStyle = INK2; c.lineWidth = 1; c.beginPath(); c.moveTo(mx - 26, my - top + 13); c.lineTo(mx - 26, my - top + 26); c.stroke();
}
function dBrick(o, t) {
  const { gx, gy, hf } = o;
  pad(o, '#e0d7cb');
  const f = mk('#b5532f'); box(gx + 0.1, gy + 0.34, gx + 0.9, gy + 0.9, 0, 20 * hf, f);
  for (let k = 0; k < 3; k++) {
    const x0 = gx + 0.12 + k * 0.25, x1 = x0 + 0.2;
    poly([P(x1, gy + 0.34, 20 * hf), P(x1, gy + 0.9, 20 * hf), P(x1, gy + 0.9, 20 * hf + 8), P(x1, gy + 0.34, 20 * hf)], shade('#b5532f', 0.7), LINE, 0.7);
    poly([P(x0, gy + 0.9, 20 * hf), P(x1, gy + 0.9, 20 * hf), P(x1, gy + 0.9, 20 * hf + 8)], '#9ad0e8', LINE, 0.7);
  }
  wall('y', gy + 0.9, gx + 0.2, gx + 0.8, 0, 10, '#4a2b20');
  cyl(gx + 0.78, gy + 0.2, 0.07, 0, 52 * hf, '#a8623f');
  puffs(gx + 0.78, gy + 0.2, 52 * hf, t, 3, 0.8);
  for (let i = 0; i < 2; i++) box(gx + 0.12 + i * 0.16, gy + 0.08, gx + 0.26 + i * 0.16, gy + 0.24, 0, 6, mk('#d9772e'));
}
function dGrocery(o) {
  const { gx, gy, hf } = o, H = 24 * hf, x0 = gx + 0.14, x1 = gx + 0.86, y0 = gy + 0.14, y1 = gy + 0.7;
  pad(o, '#e9e4d3');
  box(x0, y0, x1, y1, 0, H, mk('#f2ead8'));
  wall('x', x1, y0 + 0.1, y0 + 0.28, 6, H - 6, '#9ad0e8'); wall('x', x1, y0 + 0.36, y0 + 0.54, 6, H - 6, '#9ad0e8');
  for (let i = 0; i < 4; i++) { const a = x0 + (x1 - x0) * (i / 4), b = x0 + (x1 - x0) * ((i + 1) / 4); poly([P(a, y1, H - 7), P(b, y1, H - 7), P(b, y1 + 0.2, H - 14), P(a, y1 + 0.2, H - 14)], i % 2 ? CARD : BRAND, LINE, 0.6); }
  wall('y', y1, x0 + 0.1, x0 + 0.5, 0, H - 9, '#bfe3f2');
  box(x0 + 0.1, y0 + 0.06, x1 - 0.1, y0 + 0.14, H, H + 7, mk(TEAL));
  box(gx + 0.12, gy + 0.78, gx + 0.3, gy + 0.94, 0, 5, mk('#58b153')); box(gx + 0.34, gy + 0.8, gx + 0.5, gy + 0.94, 0, 5, mk('#e0902f'));
}
function dGeneric(o) { pad(o); box(o.gx + 0.16, o.gy + 0.16, o.gx + 0.84, o.gy + 0.84, 0, 22 * o.hf, mk('#aeb4ba')); }
const DRAW = { 'apple-orchard': dOrchard, plantation: dPlantation, 'water-reservoir': dWater, 'power-plant': dPower, mine: dMine, quarry: dQuarry, 'brick-factory': dBrick, 'grocery-store': dGrocery };

function scaffold(o, prog, ghost, t) {
  const x0 = o.gx + 0.1, x1 = o.gx + 0.9, y0 = o.gy + 0.1, y1 = o.gy + 0.9, H = ghost ? o.H + 8 : 38;
  if (!ghost) {
    diamond(o.gx + 0.12, o.gy + 0.12, o.gx + 0.88, o.gy + 0.88, 0, '#e2dccb', 'rgba(13,27,42,.25)', 1);
    box(x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08, 0, Math.max(3, prog * (H - 8)), mk('#d8c9a5'));
  }
  c.strokeStyle = '#d99a14'; c.lineWidth = 1.5; c.lineJoin = 'round';
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  c.beginPath();
  for (const [x, y] of corners) { const a = P(x, y, 0), b = P(x, y, H); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
  for (const h of [H * 0.35, H * 0.7, H]) { corners.forEach(([x, y], i) => { const a = P(x, y, h), n = corners[(i + 1) % 4], b = P(n[0], n[1], h); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }); }
  let a = P(x0, y1, 0), b = P(x1, y1, H); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
  a = P(x1, y0, 0); b = P(x1, y1, H); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
  c.stroke();
  const [mx, my] = P(x0, y0, 0), top = H + 22, ang = ghost ? 0.7 : t * 0.5;
  c.strokeStyle = INK2; c.lineWidth = 2.2; c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my - top); c.stroke();
  const jx = Math.cos(ang) * 0.8, jy = Math.sin(ang) * 0.8, e = P(x0 + jx, y0 + jy, top), e2 = P(x0 - jx * 0.3, y0 - jy * 0.3, top);
  c.strokeStyle = '#f0b429'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(e2[0], e2[1]); c.lineTo(e[0], e[1]); c.stroke();
  c.strokeStyle = INK2; c.lineWidth = 0.8; c.beginPath(); c.moveTo(e[0], e[1]); c.lineTo(e[0], e[1] + 14); c.stroke();
}
function flag(o) {
  const [sx, sy] = P(o.gx + 0.88, o.gy + 0.12, o.H - 2);
  c.strokeStyle = INK2; c.lineWidth = 1.3; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx, sy - 16); c.stroke();
  c.fillStyle = GOLD; c.beginPath(); c.moveTo(sx, sy - 16); c.lineTo(sx + 10, sy - 13); c.lineTo(sx, sy - 9); c.closePath(); c.fill();
}
function contactShadow(o) {
  const [sx, sy] = P(o.gx + 0.5, o.gy + 0.5, 0), rx = (o.status === 'build' ? 26 : 30) * o.hf;
  c.save(); c.translate(sx + 3, sy + 1); c.scale(1, 0.5);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, 'rgba(13,27,42,.36)'); g.addColorStop(0.6, 'rgba(13,27,42,.14)'); g.addColorStop(1, 'rgba(13,27,42,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, TAU); c.fill(); c.restore();
}
function drawBuilding(o, t) {
  if (o.status === 'build') { scaffold(o, o.progress, false, t); return; }
  (DRAW[o.slug] ?? dGeneric)(o, t);
  if (o.status === 'upgrade') scaffold(o, 1, true, t);
  if (o.level >= 4) flag(o);
}

// ---------- Ships and trucks (cosmetic life on the map) ----------
function drawShip(s, t) {
  const bob = Math.sin(t * 1.4 + s.ph) * 1.4, x = s.x, y = s.y, L = s.dir === 'x' ? [1.7, 0.5] : [0.5, 1.7];
  const hull = mk('#233a54'), w = s.dir === 'x' ? 0 : 1;
  box(x - L[0] / 2, y - L[1] / 2, x + L[0] / 2, y + L[1] / 2, -3 + bob, 5 + bob, hull);
  const strip = shade(BRAND, 1);
  wall(s.dir === 'x' ? 'y' : 'x', s.dir === 'x' ? y + L[1] / 2 : x + L[0] / 2, s.dir === 'x' ? x - L[0] / 2 : y - L[1] / 2, s.dir === 'x' ? x + L[0] / 2 : y + L[1] / 2, 0 + bob, 2 + bob, strip);
  const cols = ['#1f9d8a', '#e4572e', '#e0a526', '#4f8fd0'];
  for (let i = 0; i < 3; i++) {
    const u = (i - 1) * 0.46 - (s.dir === 'x' ? 0.12 : 0.12);
    if (s.dir === 'x') box(x + u - 0.2, y - 0.17, x + u + 0.2, y + 0.17, 5 + bob, 12 + bob, mk(cols[(i + s.ph | 0) % 4]));
    else box(x - 0.17, y + u - 0.2, x + 0.17, y + u + 0.2, 5 + bob, 12 + bob, mk(cols[(i + s.ph | 0) % 4]));
  }
  if (s.dir === 'x') box(x + 0.62, y - 0.2, x + 0.8, y + 0.2, 5 + bob, 17 + bob, mk('#f4efe3')); else box(x - 0.2, y + 0.62, x + 0.2, y + 0.8, 5 + bob, 17 + bob, mk('#f4efe3'));
}
function drawTruck(k) {
  const [x, y, ax] = k, bw = 0.2, bl = 0.46;
  const dims = ax === 'x' ? [x - bl / 2, y - bw / 2, x + bl / 2, y + bw / 2] : [x - bw / 2, y - bl / 2, x + bw / 2, y + bl / 2];
  box(...dims, 1, 8, mk('#e8edf0'));
  if (ax === 'x') box(x + bl / 2 - 0.12, y - bw / 2, x + bl / 2 + 0.02, y + bw / 2, 1, 9, mk(BRAND)); else box(x - bw / 2, y + bl / 2 - 0.12, x + bw / 2, y + bl / 2 + 0.02, 1, 9, mk(BRAND));
}
function pointOnPath(pts, u) {
  const segs = []; let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(d); total += d; }
  let d = u * total;
  for (let i = 0; i < segs.length; i++) {
    if (d <= segs[i]) { const f = d / segs[i], a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? 'x' : 'y']; }
    d -= segs[i];
  }
  return [...pts[pts.length - 1], 'x'];
}

// ---------- The map ----------
export async function mountMapIso(stage, { level = 0, onPick, onRegion, onTimerDone, onHub } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.className = 'iso-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Isometric map of your islands. Use the island chips and the Buildings tab for lists.');
  stage.prepend(canvas);

  let vw = 360, vh = 640, dpr = 1, lvl = level, dirty = true, items = [], objs = [], lastRegion, flash = null, anim = null;
  const cam = { x: 0, y: 0, z: 0.5 };
  const activity = {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // world bounds (screen px) from every slab, plus room for building heights
  const slabs = [...REGIONS.map((r) => LAY[r.id]), { ...HUB_SLAB }];
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (const s of slabs) for (const [x, y] of [[s.x0, s.y0], [s.x1, s.y0], [s.x1, s.y1], [s.x0, s.y1]]) {
    const p = P(x, y, 0); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1] - 70); maxY = Math.max(maxY, p[1] + SLAB + 60);
  }
  minX -= 90; maxX += 90;
  const bw = maxX - minX, bh = maxY - minY, bcx = (minX + maxX) / 2, bcy = (minY + maxY) / 2;
  let fit = 0.3;

  const seaWaves = Array.from({ length: 90 }, (_, i) => { const r1 = Math.sin(i * 12.9898) * 43758.5453, r2 = Math.sin(i * 78.233) * 12345.678; return { x: minX + (r1 - Math.floor(r1)) * bw, y: minY + (r2 - Math.floor(r2)) * bh, ph: i }; });
  // Patterns are per canvas (createPattern is bound to the context). Their transform maps the texture onto the
  // isometric ground, so grain runs along the tiles instead of sliding across them.
  const pats = {};
  function pat(name) {
    if (pats[name] !== undefined) return pats[name];
    pats[name] = null;
    const img = new Image();
    img.onload = () => {
      const p = ctx.createPattern(img, 'repeat');
      if (p && p.setTransform) p.setTransform(new DOMMatrix([HW / TEX_SIZE, HH / TEX_SIZE, -HW / TEX_SIZE, HH / TEX_SIZE, 0, 0]));
      pats[name] = p || null; dirty = true;
    };
    img.onerror = () => { pats[name] = null; };
    img.src = texURL(name);
    return null;
  }
  const ships = [{ x: -14, y: 16.5, dir: 'x', ph: 0, v: 0.55, a: -14, b: 20 }, { x: -4.5, y: 6, dir: 'y', ph: 2, v: 0.4, a: 5, b: 17 }];

  // ---------- sizing / camera ----------
  function resize() {
    vw = stage.clientWidth || 360; vh = stage.clientHeight || 640; dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    fit = Math.max(0.16, Math.min(vw / bw, vh / (bh * 0.8), 1));
    cam.z = Math.max(fit, cam.z); clamp(); dirty = true;
  }
  function clamp() {
    cam.z = Math.max(fit, Math.min(2.4, cam.z));
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.y = Math.max(minY, Math.min(maxY, cam.y));
  }
  const toWorld = (sx, sy) => [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y];
  function zoomAt(sx, sy, nz) {
    const [wx, wy] = toWorld(sx, sy); cam.z = Math.max(fit, Math.min(2.4, nz));
    cam.x = wx - (sx - vw / 2) / cam.z; cam.y = wy - (sy - vh / 2) / cam.z; clamp(); dirty = true;
  }
  function flyTo(x, y, z, ms = 600) {
    anim = { f: { ...cam }, t: { x, y, z: Math.max(fit, Math.min(2.4, z)) }, t0: performance.now(), ms: reduce ? 1 : ms };
  }
  const islandPoint = (id) => { const l = LAY[id]; const p = P(l.cx, l.cy, 0); return p; };
  function focus(id) {
    const l = LAY[id]; if (!l) return;
    const [px, py] = islandPoint(id), W = (l.cols + l.rows + 4 * LIP) * HW + 28;
    const z = Math.max(fit, Math.min(1.5, vw / W));
    flyTo(px, py + (vh * 0.08) / z, z);
  }
  function showWorld() { flyTo(bcx, bcy + (vh * 0.04) / fit, fit); }
  function nearest() {
    let best = null, d = 1e18;
    for (const r of REGIONS) { const [px, py] = islandPoint(r.id), dd = (px - cam.x) ** 2 + (py - cam.y) ** 2; if (dd < d) { d = dd; best = r.id; } }
    return best;
  }
  const currentRegion = () => (cam.z < Math.max(fit * 1.3, 0.5) ? null : nearest());
  let settle; const emitSoon = () => { clearTimeout(settle); settle = setTimeout(() => { const cr = currentRegion(); if (cr !== lastRegion) { lastRegion = cr; onRegion?.(cr); } }, 140); };

  // ---------- data ----------
  function setBuildings(list) {
    items = list; objs = [];
    for (const b of list) {
      const l = LAY[b.region ?? 'home'], r = REGION[b.region ?? 'home']; if (!l || b.slot >= r.slots) continue;
      // A whole-parcel building spans all its cells (b.cells) and is centred on them.
      const cells = b.cells?.length ? b.cells : [b.slot], cols = cells.map((s) => s % r.cols);
      const minC = Math.min(...cols), w = Math.max(...cols) - minC + 1, row = Math.floor(b.slot / r.cols);
      const ax = l.ox + minC, gx = ax + w / 2 - 0.5, gy = l.oy + row;
      const lv = Math.max(1, b.level ?? 1), hf = 1 + (lv - 1) * 0.15, H = (HT[b.slug] ?? 30) * hf;
      const retail = b.category === 'retail', [axis, v] = l.line, bx = gx + 0.5, by = gy + 0.5;
      const first = axis === 'y' ? [bx, v] : [v, by];
      let route = [[bx, by], first, ...l.path]; if (retail) route = route.slice().reverse();
      const finish = b.finishAt ? new Date(b.finishAt).getTime() : 0, start = b.startAt ? new Date(b.startAt).getTime() : 0;
      objs.push({ ...b, region: b.region ?? 'home', ax, aw: w, gx, gy, level: lv, hf, H, route, retail, finish, start, key: gx + gy + 1, done: false, progress: 0 });
    }
    objs.sort((a, b) => a.key - b.key);
    dirty = true;
  }
  const setActivity = (m) => { Object.assign(activity, m); dirty = true; };
  const setLevel = (l) => { lvl = l; dirty = true; };

  // ---------- drawing ----------
  const island = (l, r, locked) => {
    const A = P(l.x0, l.y0), B = P(l.x1, l.y0), C = P(l.x1, l.y1), D = P(l.x0, l.y1);
    poly([[A[0], A[1] + SLAB + 12], [B[0], B[1] + SLAB + 12], [C[0], C[1] + SLAB + 12], [D[0], D[1] + SLAB + 12]], 'rgba(20,70,90,.18)');
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 7; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(D[0], D[1] + SLAB + 3); c.lineTo(C[0], C[1] + SLAB + 3); c.lineTo(B[0], B[1] + SLAB + 3); c.stroke();
    poly([D, C, [C[0], C[1] + SLAB], [D[0], D[1] + SLAB]], '#d8c9a3', LINE, 0.8);
    poly([B, C, [C[0], C[1] + SLAB], [B[0], B[1] + SLAB]], '#b9a77c', LINE, 0.8);
    poly([A, B, C, D], CARD, LINE, 0.8);
    // City grid: asphalt everywhere, one paved block per plot (one building each), yellow lane lines between blocks
    const ix0 = l.x0 + 0.14, iy0 = l.y0 + 0.14, ix1 = l.x1 - 0.14, iy1 = l.y1 - 0.14;
    diamond(ix0, iy0, ix1, iy1, 0, locked ? '#8d959d' : (pat('asphalt') ?? '#3b4656'));
    if (!locked) {
      // Lanes run only along parcel edges: sub-plots of one parcel share a block, parcels are separated by lanes.
      c.strokeStyle = '#e7c35a'; c.lineWidth = 1.4; c.setLineDash([6, 7]); c.beginPath();
      for (let i = 0; i < r.slots; i++) {
        const col = i % r.cols, row = Math.floor(i / r.cols), key = parcelKey(r.id, i);
        if (col > 0 && parcelKey(r.id, i - 1) !== key) { const a = P(l.ox + col, l.oy + row), b = P(l.ox + col, l.oy + row + 1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
        if (row > 0 && parcelKey(r.id, i - r.cols) !== key) { const a = P(l.ox + col, l.oy + row), b = P(l.ox + col + 1, l.oy + row); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      }
      c.stroke(); c.setLineDash([]);
    }
    for (let i = 0; i < l.cols * l.rows; i++) {
      const gx = l.ox + (i % r.cols), gy = l.oy + Math.floor(i / r.cols), kind = i < r.slots ? plotKind(r.id, i) : 'industry', z = ZONE[kind];
      diamond(gx + 0.1, gy + 0.1, gx + 0.9, gy + 0.9, 0, locked ? '#b4bbc1' : '#c9c8c0', 'rgba(13,27,42,.28)', 0.8);
      diamond(gx + 0.17, gy + 0.17, gx + 0.83, gy + 0.83, 0, locked ? '#aab2b8' : (pat(ZONE_TEX[kind]) ?? z.a));
    }
  };
  function roadSeg(a, b) {
    const w = 0.36, horiz = a[1] === b[1], x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    const dims = horiz ? [x0, a[1] - w, x1, a[1] + w] : [a[0] - w, y0, a[0] + w, y1];
    box(...dims, -6, 0.6, { top: pat('asphalt') ?? '#3b4656', l: '#9a9a8c', r: '#7c7c70' });
    c.strokeStyle = '#e7c35a'; c.lineWidth = 1.6; c.setLineDash([7, 8]); c.beginPath();
    const p0 = horiz ? P(x0, a[1], 0.6) : P(a[0], y0, 0.6), p1 = horiz ? P(x1, a[1], 0.6) : P(a[0], y1, 0.6);
    c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.stroke(); c.setLineDash([]);
  }
  function hubPlate() {
    const s = HUB_SLAB, A = P(s.x0, s.y0), B = P(s.x1, s.y0), C = P(s.x1, s.y1), D = P(s.x0, s.y1);
    poly([[A[0], A[1] + SLAB + 12], [B[0], B[1] + SLAB + 12], [C[0], C[1] + SLAB + 12], [D[0], D[1] + SLAB + 12]], 'rgba(20,70,90,.18)');
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 7; c.beginPath(); c.moveTo(D[0], D[1] + SLAB + 3); c.lineTo(C[0], C[1] + SLAB + 3); c.lineTo(B[0], B[1] + SLAB + 3); c.stroke();
    poly([D, C, [C[0], C[1] + SLAB], [D[0], D[1] + SLAB]], '#9fb0bd', LINE, 0.8);
    poly([B, C, [C[0], C[1] + SLAB], [B[0], B[1] + SLAB]], '#7d8fa0', LINE, 0.8);
    poly([A, B, C, D], CARD, LINE, 0.8);
    diamond(s.x0 + 0.14, s.y0 + 0.14, s.x1 - 0.14, s.y1 - 0.14, 0, pat('paving') ?? '#dfe6eb');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) diamond(i, j, i + 1, j + 1, 0, '#d2dbe2');
  }
  function drawHub() {
    box(1, 1, 3, 3, 0, 44, { top: INK2, l: '#fffdf8', r: '#dcd4c0' });
    wall('y', 3, 1.05, 2.95, 30, 38, BRAND);
    for (let i = 0; i < 3; i++) { const a = 1.2 + i * 0.6; wall('y', 3, a, a + 0.45, 0, 20, '#243449'); for (let k = 1; k < 5; k++) wall('y', 3, a, a + 0.45, k * 4, k * 4 + 0.6, 'rgba(255,255,255,.18)'); }
    wall('x', 3, 1.2, 2.8, 36, 41, 'rgba(255,255,255,.1)');
    box(3.25, 1.2, 3.75, 1.7, 0, 7, mk('#d9772e')); box(3.3, 1.9, 3.7, 2.3, 0, 5, mk('#58b153'));
    box(1.1, 3.3, 1.55, 3.7, 0, 5, mk('#e0a526')); box(1.7, 3.35, 2.1, 3.7, 0, 8, mk('#4f8fd0'));
  }

  function render(ts) {
    const t = reduce ? 0 : ts / 1000, now = Date.now();
    canvas.style.cursor = 'grab';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, '#7fb0bd'); g.addColorStop(1, '#93bdb4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (vw / 2 - cam.x * cam.z) * dpr, (vh / 2 - cam.y * cam.z) * dpr);
    c = ctx;

    // sea: iso grid + sparkles
    const wl = toWorld(0, 0), wr = toWorld(vw, vh);
    const wp = pat('water');
    if (wp) { c.globalAlpha = 0.55; c.fillStyle = wp; c.fillRect(wl[0], wl[1], wr[0] - wl[0], wr[1] - wl[1]); c.globalAlpha = 1; }
    const gmin = [(wl[0] / HW + wl[1] / HH) / 2, (wl[1] / HH - wl[0] / HW) / 2];
    c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 1 / cam.z * 1.1; c.beginPath();
    const corners = [toWorld(0, 0), toWorld(vw, 0), toWorld(0, vh), toWorld(vw, vh)].map((p) => [(p[0] / HW + p[1] / HH) / 2, (p[1] / HH - p[0] / HW) / 2]);
    const gx0 = Math.floor(Math.min(...corners.map((p) => p[0])) / 2) * 2, gx1 = Math.ceil(Math.max(...corners.map((p) => p[0])) / 2) * 2;
    const gy0 = Math.floor(Math.min(...corners.map((p) => p[1])) / 2) * 2, gy1 = Math.ceil(Math.max(...corners.map((p) => p[1])) / 2) * 2;
    for (let x = gx0; x <= gx1; x += 2) { const a = P(x, gy0), b = P(x, gy1); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    for (let y = gy0; y <= gy1; y += 2) { const a = P(gx0, y), b = P(gx1, y); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke(); void gmin;
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.4;
    for (const w of seaWaves) { if (w.x < wl[0] - 20 || w.x > wr[0] + 20 || w.y < wl[1] - 20 || w.y > wr[1] + 20) continue; const a = 0.5 + 0.5 * Math.sin(t * 1.3 + w.ph); c.globalAlpha = 0.25 + 0.4 * a; c.beginPath(); c.moveTo(w.x - 7, w.y); c.quadraticCurveTo(w.x, w.y - 3, w.x + 7, w.y); c.stroke(); }
    c.globalAlpha = 1;

    // islands, hub plate, roads
    hubPlate();
    for (const r of REGIONS) island(LAY[r.id], r, lvl < r.unlock);
    for (const [a, b] of ROADS) roadSeg(a, b);

    // supply lines (under the buildings)
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const o of objs) {
      if (lvl < REGION[o.region].unlock) continue;
      const col = CAT[o.category] ?? '#b9b29c', pts = o.route.map((p) => P(p[0], p[1], 0.8));
      c.setLineDash([]); c.globalAlpha = 0.28; c.strokeStyle = col; c.lineWidth = 2.4;
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      if (o.flow && o.status !== 'build') {
        c.globalAlpha = 1; c.lineWidth = 4.2; c.setLineDash([2, 12]); c.lineDashOffset = -t * 20;
        c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.stroke();
      }
    }
    c.setLineDash([]); c.globalAlpha = 1;

    // empty plots
    for (const r of REGIONS) {
      if (lvl < r.unlock) continue;
      const l = LAY[r.id], taken = new Set(objs.filter((o) => o.region === r.id).flatMap((o) => o.cells?.length ? o.cells : [o.slot]));
      for (let i = 0; i < r.slots; i++) {
        if (taken.has(i)) continue;
        const gx = l.ox + (i % r.cols), gy = l.oy + Math.floor(i / r.cols);
        const kind = plotKind(r.id, i), z = ZONE[kind];
        diamond(gx + 0.1, gy + 0.1, gx + 0.9, gy + 0.9, 0, 'rgba(255,255,255,.35)');
        c.setLineDash([5, 4]); diamond(gx + 0.1, gy + 0.1, gx + 0.9, gy + 0.9, 0, null, z.edge, 1.5); c.setLineDash([]);
        zoneIcon(kind, gx, gy);
        const [sx, sy] = P(gx + 0.86, gy + 0.14, 0); circle(sx, sy - 4, 5.5, z.edge);
        c.strokeStyle = '#fff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(sx - 3, sy - 4); c.lineTo(sx + 3, sy - 4); c.moveTo(sx, sy - 7); c.lineTo(sx, sy - 1); c.stroke();
      }
    }
    // locked wash
    for (const r of REGIONS) if (lvl < r.unlock) { const l = LAY[r.id]; diamond(l.x0, l.y0, l.x1, l.y1, 0, 'rgba(110,120,130,.34)'); }

    // contact shadows on the ground (soft, offset to the lower right, light comes from the upper left)
    for (const o of objs) if (lvl >= REGION[o.region].unlock) contactShadow(o);

    // depth sorted things
    const things = [];
    for (const o of objs) {
      if (o.status === 'build' && o.finish) { const span = Math.max(1, o.finish - (o.start || o.finish - 60000)); o.progress = Math.max(0.08, Math.min(1, 1 - (o.finish - now) / span)); }
      things.push({ key: o.key, run: () => drawBuilding(o, t), o });
    }
    things.push({ key: 4, run: drawHub });
    for (const s of ships) {
      const span = s.b - s.a, p = (((t * s.v) % span) + span) % span + s.a;
      const pos = s.dir === 'x' ? { ...s, x: p } : { ...s, y: p };
      things.push({ key: pos.x + pos.y, run: () => drawShip(pos, t) });
    }
    for (const r of REGIONS) {
      if (lvl < r.unlock || !objs.some((o) => o.region === r.id && o.flow && o.status !== 'build')) continue;
      const pts = LAY[r.id].path, u = reduce ? 0.5 : (t * 0.06 + r.slots * 0.13) % 1, k = pointOnPath(pts, u);
      if (u < 0.97) things.push({ key: k[0] + k[1], run: () => drawTruck(k) });
    }
    things.sort((a, b) => a.key - b.key);
    for (const th of things) th.run();

    if (flash && flash.until > now) {
      c.globalAlpha = (flash.until - now) / 320; diamond(flash.gx, flash.gy, flash.gx + 1, flash.gy + 1, 0.5, 'rgba(255,255,255,.45)', '#ffffff', 2.4); c.globalAlpha = 1;
    } else flash = null;

    // ---- overlay in screen px: plaques, level chips, status pills ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = (wx, wy) => [(wx - cam.x) * cam.z + vw / 2, (wy - cam.y) * cam.z + vh / 2];
    const world = cam.z < Math.max(fit * 1.3, 0.5);
    for (const r of REGIONS) {
      const l = LAY[r.id], locked = lvl < r.unlock, a = activity[r.id], [px, py] = r.id === 'ironridge' ? P(l.x1 + 1.1, l.cy, 0) : P(l.cx, l.y1 + 0.7, 0), [sx, sy] = S(px, py + SLAB);
      const info = locked ? `Level ${r.unlock}` : [r.bonus ? `${BONUS[r.bonus]} +${r.pct}%` : 'Headquarters', r.distance ? `fee ${money(r.distance * 500)}` : '', a ? `${a.companies} co.` : ''].filter(Boolean).join(' · ');
      plaque(sx, sy, (locked ? '🔒 ' : '') + r.name, cam.z >= 0.4 || !world ? info : '', locked);
    }
    { const [px, py] = P(HUB.cx, HUB.h + LIP + 0.6, 0), [sx, sy] = S(px, py + SLAB); plaque(sx, sy, '📦 Warehouse', cam.z >= 0.4 ? 'all goods pass here' : '', false, true); }
    if (cam.z >= 1.5) for (const r of REGIONS) {
      if (lvl < r.unlock) continue;
      const l = LAY[r.id], taken = new Set(objs.filter((o) => o.region === r.id).flatMap((o) => o.cells?.length ? o.cells : [o.slot]));
      for (let i = 0; i < r.slots; i++) {
        if (taken.has(i)) continue;
        const kind = plotKind(r.id, i), [sx, sy] = S(...P(l.ox + (i % r.cols) + 0.5, l.oy + Math.floor(i / r.cols) + 0.5, 0));
        if (sx < -60 || sx > vw + 60 || sy < -40 || sy > vh + 40) continue;
        lightChip(sx, sy + 30, PLOT_KINDS[kind].short.toUpperCase(), 9);
      }
    }
    if (cam.z >= 0.45) for (const o of objs) {
      if (lvl < REGION[o.region].unlock) continue;
      const [sx, sy] = S(...P(o.gx + 0.5, o.gy + 0.5, o.H + 6));
      if (sx < -80 || sx > vw + 80 || sy < -60 || sy > vh + 60) continue;
      let st = o.status;
      if ((st === 'running' || st === 'build' || st === 'upgrade') && o.finish && o.finish <= now) { if (!o.done) { o.done = true; onTimerDone?.(); } st = st === 'running' ? 'ready' : 'done'; }
      const bounce = reduce ? 0 : Math.sin(t * 4 + o.gx * 1.7 + o.gy) * 2;
      let label = null, glyph = '', bg = '#fff', fg = INK, timed = false;
      if (st === 'ready') { label = '✓ Collect'; glyph = '✓'; bg = TEAL; fg = '#fff'; }
      else if (st === 'running') { label = clockText(o.finish - now); bg = GOLD; timed = true; }
      else if (st === 'build') { label = '🔨 ' + clockText(o.finish - now); bg = GOLD; timed = true; }
      else if (st === 'upgrade') { label = '⬆ ' + clockText(o.finish - now); bg = GOLD; timed = true; }
      else if (st === 'idle') { label = '▶ Start'; glyph = '▶'; bg = BRAND; fg = '#fff'; }
      else if (st === 'blocked') { label = 'Needs inputs'; glyph = '!'; bg = '#fff'; }
      const compact = cam.z < 1.3;
      let y = sy;
      if (!compact) { y = lightChip(sx, y, `LVL ${o.level}`, 10) - 1; y = lightChip(sx, y, (SHORT[o.slug] ?? o.name).toUpperCase(), 11.5) - 3; }
      else if (cam.z >= 0.7) { const [bx, by] = S(...P(o.gx + 0.86, o.gy + 0.86, 0)); levelDot(bx, by - 2, o.level); }
      if (label) {
        if (cam.z < 0.6) { ctx.beginPath(); ctx.arc(sx, y - 6 + bounce, 5, 0, TAU); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
        else if (compact && !timed) badge(sx, y - 10 + bounce, glyph, bg, fg);
        else chipStatus(sx, y + bounce, label, bg, fg);
      }
    }
  }

  // overlay helpers (screen px)
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function plaque(sx, sy, title, info, locked, hub) {
    ctx.font = `700 13px ${FONT}`; const tw = ctx.measureText(title).width;
    ctx.font = `500 10.5px ${FONT}`; const iw = info ? ctx.measureText(info).width : 0;
    const w = Math.max(tw, iw) + 22, h = info ? 38 : 24, x = sx - w / 2, y = sy - 2;
    ctx.save(); ctx.shadowColor = 'rgba(13,27,42,.28)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    rr(x, y, w, h, 10); ctx.fillStyle = locked ? 'rgba(76,86,96,.94)' : hub ? INK : 'rgba(13,27,42,.9)'; ctx.fill(); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = `700 13px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(title, sx, y + (info ? 13 : 12.5));
    if (info) { ctx.fillStyle = locked ? '#d3d9de' : GOLD; ctx.font = `500 10.5px ${FONT}`; ctx.fillText(info, sx, y + 28); }
  }
  function chip(sx, sy, text) {
    ctx.font = `700 10.5px ${FONT}`; const w = ctx.measureText(text).width + 14, h = 17, x = sx - w / 2, y = sy - h;
    rr(x, y, w, h, 8.5); ctx.fillStyle = 'rgba(13,27,42,.88)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, sx, y + h / 2 + 0.5);
    return y;
  }
  function lightChip(sx, sy, text, size) {
    ctx.font = `600 ${size}px ${FONT}`; const w = ctx.measureText(text).width + 12, h = size + 8, x = sx - w / 2, y = sy - h;
    rr(x, y, w, h, 5); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, sx, y + h / 2 + 0.5);
    return y;
  }
  function levelDot(sx, sy, n) {
    ctx.beginPath(); ctx.arc(sx, sy, 8, 0, TAU); ctx.fillStyle = GOLD; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = `700 10px ${FONT}`; ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(n), sx, sy + 0.5);
  }
  function badge(sx, sy, glyph, bg, fg) {
    ctx.save(); ctx.shadowColor = 'rgba(13,27,42,.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, TAU); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(sx, sy, 10, 0, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = `700 11px ${FONT}`; ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(glyph, sx, sy + 0.5);
  }
  function chipStatus(sx, sy, text, bg, fg) {
    ctx.font = `700 11px ${FONT}`; const w = ctx.measureText(text).width + 16, h = 20, x = sx - w / 2, y = sy - h;
    ctx.save(); ctx.shadowColor = 'rgba(13,27,42,.25)'; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    rr(x, y, w, h, 10); ctx.fillStyle = bg; ctx.fill(); ctx.restore();
    rr(x, y, w, h, 10); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, sx, y + h / 2 + 0.5);
  }

  // ---------- picking ----------
  const inHull = (pts, x, y) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
  function pick(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    if (inHull([P(1, 3), P(3, 3), P(3, 1), P(3, 1, 44), P(1, 1, 44), P(1, 3, 44)], wx, wy)) return { hub: true };
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i], x0 = o.ax + 0.08, x1 = o.ax + o.aw - 0.08, y0 = o.gy + 0.08, y1 = o.gy + 0.92, h = o.H + 6;
      if (inHull([P(x0, y1), P(x1, y1), P(x1, y0), P(x1, y0, h), P(x0, y0, h), P(x0, y1, h)], wx, wy)) return { o };
    }
    const gx = (wx / HW + wy / HH) / 2, gy = (wy / HH - wx / HW) / 2;
    for (const r of REGIONS) {
      const l = LAY[r.id], col = Math.floor(gx - l.ox), row = Math.floor(gy - l.oy), slot = row * l.cols + col;
      if (col >= 0 && col < l.cols && row >= 0 && row < l.rows && slot < r.slots) return { region: r.id, slot, gx: l.ox + col, gy: l.oy + row };
    }
    for (const r of REGIONS) { const l = LAY[r.id]; if (gx >= l.x0 && gx <= l.x1 && gy >= l.y0 && gy <= l.y1) return { island: r.id }; }
    return null;
  }
  function tap(sx, sy) {
    const hit = pick(sx, sy); if (!hit) return;
    if (hit.hub) { if (onHub) onHub(); else location.hash = '#/warehouse/inventory'; return; }
    const world = cam.z < Math.max(fit * 1.3, 0.5), id = hit.island ?? hit.region ?? hit.o?.region;
    if (world && id) { focus(id); return; }
    if (hit.island) return;
    if (hit.o) { flash = { gx: hit.o.gx, gy: hit.o.gy, until: Date.now() + 320 }; onPick?.(hit.o.region, hit.o.slot); }
    else { flash = { gx: hit.gx, gy: hit.gy, until: Date.now() + 320 }; onPick?.(hit.region, hit.slot); }
    dirty = true;
  }

  // ---------- input ----------
  const ptrs = new Map(); let drag = null, pinch = null;
  const rel = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const dist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); };
  const mid = () => { const [a, b] = [...ptrs.values()]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, rel(e)); anim = null;
    if (ptrs.size === 1) { const [x, y] = rel(e); drag = { x, y, cx: cam.x, cy: cam.y, moved: false, t: performance.now() }; }
    else if (ptrs.size === 2) { if (drag) drag.moved = true; pinch = { d: dist(), z: cam.z }; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, rel(e));
    if (pinch && ptrs.size === 2) { const m = mid(); zoomAt(m[0], m[1], pinch.z * dist() / pinch.d); emitSoon(); return; }
    if (drag && ptrs.size === 1) {
      const [x, y] = rel(e), dx = x - drag.x, dy = y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
      if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clamp(); dirty = true; emitSoon(); }
    }
  });
  const up = (e) => {
    const was = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
    if (!was) return;
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0 && drag) { const [x, y] = rel(e); if (!drag.moved && e.type === 'pointerup' && performance.now() - drag.t < 700) tap(x, y); drag = null; emitSoon(); }
    else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p[0], y: p[1], cx: cam.x, cy: cam.y, moved: true, t: 0 }; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = rel(e); zoomAt(x, y, cam.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); emitSoon(); anim = null; }, { passive: false });

  // ---------- loop ----------
  let raf = 0, last = 0;
  const ease = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!stage.isConnected || document.hidden) return;
    if (anim) { const k = Math.min(1, (performance.now() - anim.t0) / anim.ms), e = ease(k); cam.x = anim.f.x + (anim.t.x - anim.f.x) * e; cam.y = anim.f.y + (anim.t.y - anim.f.y) * e; cam.z = anim.f.z + (anim.t.z - anim.f.z) * e; clamp(); dirty = true; if (k >= 1) { anim = null; emitSoon(); } }
    if (!dirty && ts - last < (reduce ? 1000 : 41)) return;
    if (ts - last < 16) return;
    last = ts; dirty = false; render(ts);
  }
  const ro = new ResizeObserver(() => resize()); ro.observe(stage);
  stage.addEventListener('m2-dispose', () => { cancelAnimationFrame(raf); ro.disconnect(); });
  resize();
  cam.z = fit; cam.x = bcx; cam.y = bcy;
  raf = requestAnimationFrame(loop);
  requestAnimationFrame(() => { resize(); const [px, py] = islandPoint('home'); const W = (LAY.home.cols + LAY.home.rows + 4 * LIP) * HW + 28, z = Math.max(fit, Math.min(1.5, vw / W)); cam.z = z; cam.x = px; cam.y = py + (vh * 0.08) / z; clamp(); dirty = true; setTimeout(() => { const cr = currentRegion(); lastRegion = cr; onRegion?.(cr); }, 150); });

  return { setBuildings, setActivity, setLevel, focus, showWorld, currentRegion, resetView: showWorld };
}
