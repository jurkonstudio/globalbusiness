# UI design ("Atlas")

Original visual identity, deliberately different from the reference game.

- **Top:** floating command card (monogram, company, level + XP line, economy phase chip, cash). No avatar/bell/pill cluster.
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
