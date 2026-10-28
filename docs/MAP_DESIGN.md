# Map Design: Global Business

Status: **draft for review**. Nothing here is built yet. Open questions are at the end.

## Goal

Replace the grid of small land slots with larger parcels, one building per parcel, so the map reads as a city of
working businesses. The style draws on the layout ideas of Sim Companies (large parcels, labels above buildings,
idle summary), but every visual asset, icon, sprite and colour is our own. We do not copy their art, logo or layout.

## What we take as ideas (not assets)

- Large parcels separated by roads, one building per parcel.
- Labels above each building: name, level, and the current output or time left.
- A small status panel: how many buildings are idle and when the next one goes idle.
- Zones by function (farm, shop, industry), already defined in `supabase/migrations/015_plot_zones.sql`.

## Parcel model (proposal)

| Item | Current | Proposed |
| --- | --- | --- |
| Unit of land | Slot, 1 building each | Parcel, 1 building each, several slots of land |
| Home Isle | 24 slots (6 columns) | 6 parcels, each with its own zone kind |
| Farm parcel | 1 orchard or plantation | 1 farm building with internal sub-plots (fields, pens) |
| Zone kinds | farm, shop, industry | unchanged |

Each farm parcel has a fixed number of sub-plots. A sub-plot holds one crop or one livestock group. Sub-plots
are the unit that production and upgrades attach to. Final counts are open (see questions).

## Labels above buildings

- Name and level, e.g. `Apple Orchard · L1`.
- One line of state: `15h 44m` when producing, `Idle` when stopped, `Needs seeds` when blocked.
- Output rate in our own unit set, e.g. `1.5 / min`. Do not reuse their symbols.
- Labels hide when zoomed out, to keep the map readable on a phone.

## Idle summary panel

- Shows count of idle buildings and the next time one stops.
- Tapping the panel opens the list of idle buildings.
- Sits at the bottom-left, above the bottom navigation.

## Visual identity

- Palette comes from `src/styles/theme.css`: slate surfaces, one green call-to-action colour, tinted status pills.
- Buildings are drawn in our own isometric style. Keep one light direction (top-left), like the resource icons.
- Terrain uses the existing textures in `src/assets/textures/` and the same top-left light.
- The app logo and monogram stay ours. No borrowed marks.

## Prototype (first step)

One farm parcel on Home Isle:

1. Draw one farm building with two sub-plots (one crop, one livestock pen).
2. Show the label above it with the states from the list above.
3. Check on a phone (16px gutter, no horizontal scroll) and in both themes.
4. Decide with the result whether to convert all of Home Isle.

## Data changes (later, not in the prototype)

- New migration: parcel size and sub-plot count per building type.
- `build_building()` keeps the same zone rules, but targets a parcel, not a slot.
- Existing buildings are mapped to the parcel that contains their old slot.
- New resources for livestock (for example live animals, milk, eggs) need migration rows, recipes and icons.

## Decisions (final)

1. **Parcels:** Home Isle has 6 parcels. 2 farm parcels (6 sub-plots each), 2 shop (3 each), 2 industry (3 each). This totals 24 sub-plots, which matches the old 24 slots. A parcel is either split into sub-plots or used whole for one large building. This creates the opportunity cost players choose between.
2. **One product per sub-plot.** No mixing of crops and animals inside one sub-plot.
3. **Livestock is its own building type** (for example `cow-farm`, `chicken-coop`) with its own inputs (feed, water, power). It is not a sub-plot of a regular farm. Assumption: livestock buildings may be placed on farm parcels; confirm when recipes are designed.
4. **Labels show time left by default.** Output rate appears only in the detail sheet opened by tapping a building.

Database: one-to-many, parcel to buildings, through `parcel_id` and `sub_plot_index`. The draft is `supabase/migrations/020_parcels_draft.sql`. Other islands keep the slot model until their parcel layout is decided.
