// Display copies of rules that the SERVER enforces. They exist only so the app can show costs before the player acts.
// If a number here ever disagrees with the server, the server is right and this file must be fixed.
//   upgrade cost / time : upgrade_cost() / upgrade_seconds() in migration 006 (also mirrored in components/landGrid.js)
//   max level           : upgrade_building() in migration 006
//   demolish refund     : demolish_value() in migration 014 (40% of build cost plus every upgrade paid)
export const MAX_LEVEL = 6;
export const upgradeCost = (bt, level) => Math.round(Number(bt.build_cost) * level * 0.6);
export const upgradeSecs = (bt, level) => Math.max(Number(bt.build_seconds) || 0, 60) * level;
export const demolishRefund = (bt, level) => {
  let paid = Number(bt.build_cost);
  for (let l = 1; l < level; l++) paid += upgradeCost(bt, l);
  return Math.round(paid * 0.4);
};
