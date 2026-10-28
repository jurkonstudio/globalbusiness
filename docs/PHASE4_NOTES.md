# Phase 4 notes: checkpoint A of "tahap 015" (Encyclopedia, recipes, price history, ranking, search)

## What is new
| Page | What it shows | Backend |
|---|---|---|
| Encyclopedia > Resources | every resource: prices (base, NPC buy/sell, store reference), what makes it, what uses it | none (reads existing tables) |
| Encyclopedia > Recipes | every recipe by building: inputs, output, time, rate per hour, value at base prices | none |
| Encyclopedia > Buildings | cost, build time, unlock level, plot type, upgrade table (levels 1 to 6), demolish refund, regions | none |
| Buildings > Recipes | the recipes of buildings you own, your stock against the needs, how many runs you can start | none |
| Marketplace > Price history | hourly open/high/low/close/units for one resource | `exchange_price_history()` from migration 019 |
| Ranking > Companies / Players | ranking by XP (then level, then older company). Players = saved accounts only | **migration 021** |
| Search > Companies | find a company by name: name, level, XP, finished buildings | **migration 021** |

New shared files: `src/components/gameData.js` (cached read of resources, recipes and building types),
`src/components/rankingList.js`, `src/core/rules.js` (display copy of the upgrade and refund formulas; the server stays the authority).

## Migration 021 (run once, after 019)
Adds two read-only functions, `ranking_companies(scope, limit)` and `search_companies(text)`. They return only name, level, XP and
the number of finished buildings. Cash, stock and owner ids are never returned. `anon` cannot call them.
It also closes direct calls to the trigger function `set_order_seller_name()` from migration 019 (the trigger keeps working).
Nothing is created or changed in any table.

**Do not run `020_parcels_draft.sql`.** It is a draft. 021 does not depend on it.

## Things to decide
1. Migration 019 lets `anon` call `exchange_price_history()` and `exchange_recent_trades()`, and the `trades` table is readable by everyone
   (`using (true)`), including buyer and seller company names. If that is not what you want, run:
   `revoke execute on function exchange_price_history(int, int), exchange_recent_trades(int, int) from anon;`
   and change the `trades` policy to `to authenticated`. The baseline check Q0 reports these two functions on purpose (row 20).
2. Migration 014 (demolish) must be installed for the Demolish button on the map. 021 prints whether it is.

## Still not built (still show the honest "not available yet" state)
Contracts, Executives, Research, Messages, Settings (profile, preferences), Finance > Loans, Warehouse > Storage upgrades,
Map > Regions and Land slots, Buildings > Upgrades, and the Menu pages (about, library, referral, creators club, achievements, notes, redeem code, realms).
Several of them need new tables and server functions, so each needs its own migration and testing.
