# Phase 3 notes: Retail + flat business board

## Run this in Supabase (SQL Editor), once
`supabase/migrations/013_retail_grocery.sql` (safe to re-run). It adds the Grocery Store, shelves (`store_listings`),
automatic customer sales, two new missions and the longer tutorial. The last query shows `ok` for each part.

## New early game
1. Buy Seeds + Water (Warehouse)  2. Plant apples  3. Harvest after 3 minutes (Level 1)
4. Build a Grocery Store (60 s, $2,000)  5. Retail > Stores: put apples on sale  6. First customer sale = tutorial done.
Stores keep selling while the player is offline (computed from timestamps, max 24 h per visit).

## Map
The 3D islands are replaced by one flat board (`src/components/map2d.js`). Every region is a district on the same board.
Tap a plot, pick a category tab (Farm, Retail, Utility, Mining, Industry), then Build. Supply lines run between each
building and the central Warehouse; animated dots mean it is producing or selling. `map3d.js` is no longer used and can be deleted.

## Balance knobs (all in 013)
`retail_rate_per_min` (4 items/min per store level), `retail_demand` (price curve), `resources.retail_ref` (base x 1.8),
grocery cost/time in `building_types`, tutorial bonus XP (25) in `retail_settle`.

## Not changed / worth knowing
- Retail income uses the real warehouse stock; NPC sell price is still 60% of base, so a store pays about 3x more.
- Remote districts still charge land fee and freight as before.
