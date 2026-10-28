// Retail rules mirrored from migration 013 (the server is the source of truth; this is only for previews).
export const EMOJI = { apples: '🍎', oranges: '🍊', grapes: '🍇', grain: '🌾' };
export const BASE_RATE = 4;        // units per minute per store level at the reference price
export const MAX_PRICE_X = 3;      // highest allowed price, as a multiple of the reference price

// 1.5 at or below half the reference price, 1.0 at the reference price, 0 at double.
export const demand = (price, ref) => (ref > 0 ? Math.max(0, Math.min(1.5, 2 - price / ref)) : 0);
export const perMinute = (level, price, ref) => Math.round(BASE_RATE * Math.max(level, 1) * demand(price, ref) * 10000) / 10000;
