// Archipelago layout (mirrors the `regions` table in migration 005; the server enforces unlock levels).
// x / z = island centre in the 3D world, cols = plots per row.
export const REGIONS = [
  { id: 'home',      name: 'Home Isle',     unlock: 0, slots: 24, cols: 6, x: 0,   z: 0,   distance: 0, bonus: null,           pct: 0,  tint: 0x8fbf5a },
  { id: 'verdant',   name: 'Verdant Coast', unlock: 2, slots: 12, cols: 4, x: -15, z: -7,  distance: 2, bonus: 'agriculture',  pct: 15, tint: 0x6fc15a },
  { id: 'ironridge', name: 'Iron Ridge',    unlock: 3, slots: 12, cols: 4, x: 14,  z: -10, distance: 3, bonus: 'extraction',   pct: 15, tint: 0x9a9388 },
  { id: 'meridian',  name: 'Port Meridian', unlock: 4, slots: 12, cols: 4, x: 13,  z: 11,  distance: 3, bonus: 'construction', pct: 15, tint: 0xc9a36b },
  { id: 'sunspire',  name: 'Sunspire Atoll',unlock: 5, slots: 12, cols: 4, x: -13, z: 11,  distance: 4, bonus: 'utility',      pct: 15, tint: 0xe3c65f },
];
export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

// Sea lanes between islands (hub and spoke from Home Isle, plus two cross lanes).
export const ROUTES = [
  ['home', 'verdant'], ['home', 'ironridge'], ['home', 'meridian'], ['home', 'sunspire'],
  ['verdant', 'sunspire'], ['ironridge', 'meridian'],
];

export const BONUS_LABEL = { agriculture: 'Farms', extraction: 'Mines', construction: 'Factories', utility: 'Utilities' };
export const landFee = (r) => r.distance * 500;

// ---- Plot zones (Sim Companies style: every plot has ONE job and holds exactly ONE building) ----
//   farm     -> one farm (agriculture building)
//   shop     -> one retail building (Grocery Store, upgradable)
//   industry -> utilities, mines, factories
// Mirrors plot_kind() in migration 015; the server enforces it. Home Isle: rows 1-2 farms, row 3 shops, row 4 industry.
export const PLOT_KINDS = {
  farm:     { label: 'Farm plot',     short: 'Farm',     icon: '🌾', cats: ['agriculture'],                         hint: 'One farm per plot. It grows agriculture goods.' },
  shop:     { label: 'Shop plot',     short: 'Shop',     icon: '🛒', cats: ['retail'],                              hint: 'One retail building per plot. Upgrade it to sell faster.' },
  industry: { label: 'Industry plot', short: 'Industry', icon: '🏭', cats: ['utility', 'extraction', 'construction'], hint: 'Utilities, mines and factories.' },
};
const HOME_ROWS = ['farm', 'farm', 'shop', 'industry'];
export function plotKind(regionId, slot) {
  const r = REGION[regionId] ?? REGION.home;
  if (r.id === 'home') return HOME_ROWS[Math.floor(slot / r.cols)] ?? 'industry';
  return r.id === 'verdant' ? 'farm' : 'industry';
}
export const plotAllows = (kind, category) => PLOT_KINDS[kind].cats.includes(category);
export function plotCounts(regionId) {
  const out = { farm: 0, shop: 0, industry: 0 };
  for (let i = 0; i < REGION[regionId].slots; i++) out[plotKind(regionId, i)]++;
  return out;
}
