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
