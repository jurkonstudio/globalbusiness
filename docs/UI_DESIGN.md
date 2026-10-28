# UI design ("Atlas")

Original visual identity, deliberately different from the reference game.

- **Top:** icon-only header, no text labels: menu, company monogram, economy-phase dot, then a wallet stack on the right (row 1 cash, row 2 Global Token (GT) + level ring). The ring's gold arc is EXP progress toward the next level (`xp % 100`), the number inside is the level. GT comes from `companies.gt` (migration 016, read-only for players).
- **Sub-nav:** scrollable labelled chips under the card (was a trapezoid icon bar above the tabs).
- **Bottom:** floating pill dock; only the active tab shows its label.
- **Menu:** left side panel with a 2-column card grid (was a full-width dropdown list).
- **Palette:** paper `#f3eee4`, ink `#0d1b2a`, coral `#e4572e`, teal `#1f9d8a`, gold `#e0a526`.
- **Type:** Space Grotesk (headings) + DM Sans (body).
- **Surfaces:** rounded 14px cards on warm paper, sheets with 24px radius, tactile buttons.

# 3D map (session 1)

`src/components/map3d.js` builds the island with three.js r128 (no extra control files).
Camera: one-finger rotate, pinch zoom, two-finger pan, wheel zoom. Tap a plot to select it
(opens the existing build / building sheet in `landGrid.js`). Buildings are procedural low-poly
models per slug; timers and "Ready" markers are projected as HTML labels.
Falls back to a plain 2D grid if WebGL is unavailable.

# 3D map (session 2)

`map3d.js` renders five islands. Tap an island (or a region chip) to fly there; tap a plot to build.
Locked islands are greyed with a lock tag. Dashed sea lanes link islands; ships sail the unlocked ones.
Lighting follows the device clock (dawn, day, dusk, night with lamps and stars); there is no manual time control.
Floating timers appear only on construction sites, upgrading buildings, and apple orchards.

# Phase 2 (polish and gameplay interface)

Shared building blocks (all new code uses them; older pages keep working):
- `src/core/format.js`: one source for money, quantities, durations, dates. Headline cash shows cents; aggregates show whole dollars.
- `src/components/ui.js`: `statusChip` (icon + text, never colour alone), `metric`, `stateBlock`, `errorBlock`, `skeleton`, `progressBar` (real timestamps only), `busy` (blocks double taps), `classifyError` (network / validation / transaction), `openDialog`, `confirmDialog`, and `initModalA11y` (gives every existing modal dialog semantics, Escape and focus handling).
- `src/components/ledger.js`: the cash ledger view shared by Warehouse, Finance, Statistics and the dashboard.
- `src/components/market.js`: client-side mirrors of the server's market rules, for instant feedback only.
- `src/core/ops.js`: reads buildings, jobs, recipes and stock, and derives each building's state (build, upgrade, ready, running, blocked, idle, passive).
- `src/styles/polish.css`: loaded last. Fixes the `.chip`/`.badge` collisions between main.css and game.css.

Rules the UI follows:
- Cash is never mixed with asset value; cash flow is never called profit; no trend is drawn without history.
- Stock status: "Low" means less than one production run needs at any building you own; "Empty" means zero. Only shown for resources your buildings consume.
- Toasts appear at the top so they never cover the dock or sheet buttons.
- Navigation: Map hub now lists Map + Buildings; Company hub lists Overview, Statistics, Finance, Executives, Retail, Ranking, Alerts; the bottom tab "Exchange" is labelled "Market".

# Visual refresh v2 (realistic assets and comfort)

Goal: the game should look like a real place to run a business, and be comfortable to look at for long sessions.

- **Assets** (`src/assets/`), all original and generated, so the project stays MIT-clean:
  - `textures/*.png`: seamless 256 px tiles. `grass` (farm plots), `paving` (shop plots, warehouse plaza), `concrete` (industry plots), `asphalt` (city grid and roads), `soil`, `earth` (cliff strata), `water` (sea), `paper-grain` (UI background, overlay blend).
  - `icons/app-icon.svg`: favicon and home-screen icon.
  - Regenerate with `python3 tools/gen-textures.py` (needs Pillow and numpy). Edit the palettes in the script, not the PNGs.
- **Map** (`components/mapIso.js`): ground, roads and the sea use the textures as canvas patterns, transformed onto the isometric grid so grain follows the tiles. Buildings get a soft contact shadow so they sit on the ground. Every texture falls back to the old flat colour until its image loads, or if the file is missing.
- **UI** (`styles/theme.css`, loaded last): warmer sea-mist paper surfaces, layered elevation tokens (`--e1` to `--e3`), tactile buttons with a clear pressed state, frosted-glass HUD panels so the island shows through, calmer tables, dimmed and blurred modals, and reduced-motion support. Page code is unchanged; the look comes from tokens and selectors.
- **Rules kept:** 44 px touch targets, visible focus, AA text contrast, status never by colour alone.

# Map quick actions

Tapping one of your buildings on the map opens a compact panel at the bottom of the map (`components/mapQuick.js`), not a modal.
It shows the building's status (under construction, upgrading, producing, ready, missing inputs) and the actions that apply right now:
Collect, Produce 1 run (default recipe), Upgrade, and Details. Details opens the full sheet (more runs, recipe choice, store shelves, demolish).
The panel calls the same RPCs as the full sheet (`collect_production`, `start_production`, `upgrade_building`), so server rules and costs do not change.
While it is open, the map HUD (region bar, idle box, tool buttons) steps aside. Tapping an empty plot still opens the build sheet.
