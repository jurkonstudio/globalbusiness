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
