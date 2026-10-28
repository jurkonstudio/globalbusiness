// Realistic SVG icons for every resource (48x48 viewBox). They are built to look like photographed objects,
// not drawings:
// - material gradients with several stops (glossy fruit, brushed metal, wood, stone, glass, cloth),
// - fractal-noise texture filters for grain (wood, stone, soil, bark, cloth, paper),
// - a lighting filter that bevels every object from a top-left light and adds a soft sheen,
// - a blurred contact shadow on the ground. There is no ink outline.
// Each icon prefixes its gradient and filter ids with its slug, so many icons can share one page.
// Usage: resIcon('apples', 32) returns an inline <svg> string. Unknown slugs get a wooden crate.

const lin = (id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rad = (id, stops, cx = 0.35, cy = 0.3, r = 0.8) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;

// Shared filters: `lit` bevels edges and adds a sheen (light from top-left), `tex` mixes fractal noise into the
// material, `soft` blurs highlights so they read as reflections instead of paint.
const defs = (p, tex, gradients) => `<defs>${gradients}
  <filter id="${p}-lit" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="h"/>
    <feSpecularLighting in="h" surfaceScale="2.5" specularConstant=".7" specularExponent="20" lighting-color="#ffffff" result="sp">
      <feDistantLight azimuth="225" elevation="45"/>
    </feSpecularLighting>
    <feComposite in="sp" in2="SourceAlpha" operator="in" result="spc"/>
    <feComposite in="SourceGraphic" in2="spc" operator="arithmetic" k1="0" k2="1" k3=".45" k4="0" result="ws"/>
    <feDiffuseLighting in="h" surfaceScale="2.5" diffuseConstant="1" lighting-color="#ffffff" result="df">
      <feDistantLight azimuth="225" elevation="55"/>
    </feDiffuseLighting>
    <feComposite in="ws" in2="df" operator="arithmetic" k1="1.2" k2="0" k3="0" k4="0" result="sh"/>
    <feComposite in="sh" in2="SourceAlpha" operator="in"/>
  </filter>
  ${tex ? `<filter id="${p}-tex" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${tex.f}" numOctaves="3" seed="${tex.seed ?? 4}" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 ${tex.r ?? 0}  0 0 0 0 ${tex.g ?? 0}  0 0 0 0 ${tex.b ?? 0}  ${((tex.a ?? 1) * 0.6).toFixed(3)} 0 0 0 ${((tex.o ?? -0.3) * 0.7).toFixed(3)}" result="g"/>
    <feComposite in="g" in2="SourceAlpha" operator="in" result="gc"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="gc"/></feMerge>
  </filter>` : ''}
  <filter id="${p}-soft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1"/></filter>
</defs>`;

const shadow = (p, cy = 44, rx = 14) =>
  `<ellipse cx="24" cy="${cy}" rx="${rx}" ry="2.4" fill="#0d1b2a" opacity=".32" filter="url(#${p}-soft)"/>`;

// Assembles one icon: gradients, texture, shadow, then the lit body. `pre` sits outside the lit group (glows).
const build = (p, { g = '', tex = null, sh = [44, 14], pre = '', body }) =>
  `${defs(p, tex, g)}${pre}${shadow(p, sh[0], sh[1])}<g filter="url(#${p}-lit)">${body}</g>`;

const brick = (p, x, y, w) => {
  const d = 7, dy = -4.5, h = 9, edge = 'stroke="#3b1408" stroke-opacity=".35" stroke-width=".6"';
  return `<path d="M${x} ${y} H${x + w} V${y + h} H${x} Z" fill="url(#${p}-f)" ${edge}/>
    <path d="M${x} ${y} L${x + d} ${y + dy} H${x + w + d} L${x + w} ${y} Z" fill="url(#${p}-t)" ${edge}/>
    <path d="M${x + w} ${y} L${x + w + d} ${y + dy} V${y + h + dy} L${x + w} ${y + h} Z" fill="url(#${p}-s)" ${edge}/>`;
};

const ICONS = {
  power: (p) => build(p, {
    sh: [44, 11],
    pre: `<circle cx="24" cy="24" r="22" fill="url(#${p}-halo)"/>`,
    g: lin(`${p}-gold`, [[0, '#fff3bf'], [.32, '#f4c542'], [.55, '#b57a0e'], [.78, '#f8dc84'], [1, '#8a5a06']])
      + rad(`${p}-halo`, [[0, '#ffe58a', .55], [1, '#ffe58a', 0]], .5, .5, .5),
    body: `<path d="M29 3 L10.5 28 H21.5 L17 45 L37.5 18.5 H26.5 Z" fill="url(#${p}-gold)" stroke="#6b4606" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>
      <path d="M25.5 7.5 L14.5 22.5" stroke="#fffbe6" stroke-width="1.3" stroke-linecap="round" opacity=".8" filter="url(#${p}-soft)"/>`,
  }),

  water: (p) => build(p, {
    sh: [44, 14],
    g: rad(`${p}-w`, [[0, '#f2fffb'], [.22, '#86e6d6'], [.55, '#23a392'], [.85, '#0f6172'], [1, '#083c4a']], .38, .32, .85)
      + rad(`${p}-w2`, [[0, '#e8fffb'], [.5, '#5fd0c0'], [1, '#17806f']], .4, .35, .8),
    body: `<path d="M22 4.5 C22 4.5 9 20.5 9 30 a13 13 0 0 0 26 0 C35 20.5 22 4.5 22 4.5 Z" fill="url(#${p}-w)"/>
      <path d="M14.5 33 a9.5 9.5 0 0 0 6.5 4.2" fill="none" stroke="#e6fff9" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round"/>
      <ellipse cx="16" cy="26.5" rx="2.4" ry="5" fill="#fff" opacity=".85" transform="rotate(18 16 26.5)" filter="url(#${p}-soft)"/>
      <path d="M32 9 C32 9 27.5 14.5 27.5 18.5 a4.5 4.5 0 0 0 9 0 C36.5 14.5 32 9 32 9 Z" fill="url(#${p}-w2)"/>`,
  }),

  seeds: (p) => build(p, {
    sh: [46, 14],
    tex: { f: '0.85', r: .2, g: .1, b: .03, a: 1.1, o: -.35 },
    g: lin(`${p}-soil`, [[0, '#9b6a3f'], [.5, '#6e4426'], [1, '#3f2612']], 0, 0, 0, 1)
      + lin(`${p}-leaf`, [[0, '#e0fbc2'], [.45, '#78c85a'], [1, '#2c6e22']]),
    body: `<path d="M6.5 37.5 Q24 30.5 41.5 37.5 L41 42.5 Q40.5 45 38 45 H10 Q7.5 45 7 42.5 Z" fill="url(#${p}-soil)" filter="url(#${p}-tex)"/>
      <path d="M24 37 C24 31 24.5 26 24 21" fill="none" stroke="#4f9a35" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M24 24 C16 25 9.5 20 9 11.5 C17.5 11 24 16 24 24 Z" fill="url(#${p}-leaf)"/>
      <path d="M24.5 21 C32 21.5 38.5 16 39 8 C30.5 8 24.5 13 24.5 21 Z" fill="url(#${p}-leaf)"/>
      <path d="M24 24 C19 20 14.5 16 11 12.5 M24.5 21 C29 18 33.5 14 37.5 10" fill="none" stroke="#2a5e1e" stroke-opacity=".55" stroke-width=".9"/>`,
  }),

  apples: (p) => build(p, {
    sh: [44, 15],
    g: rad(`${p}-a`, [[0, '#ffc2ad'], [.22, '#f0604a'], [.6, '#c42c1a'], [.9, '#7a1409'], [1, '#4a0b05']], .36, .32, .9)
      + lin(`${p}-l`, [[0, '#c9f2a6'], [1, '#3b8a2e']]),
    body: `<path d="M24 14 C18 9 5.5 11.5 6.5 26.5 C7.5 39.5 15.5 45 24 42.5 C32.5 45 40.5 39.5 41.5 26.5 C42.5 11.5 30 9 24 14 Z" fill="url(#${p}-a)"/>
      <path d="M20.5 16 C22 17.5 26 17.5 27.5 16" fill="none" stroke="#5a0c05" stroke-opacity=".35" stroke-width="1"/>
      <path d="M24 14.5 C24 12 24.5 10 25 8.5" stroke="#4a2c14" stroke-width="1.9" fill="none" stroke-linecap="round"/>
      <path d="M25.5 10.5 C28.5 3.5 36 3.5 37 5.5 C34 10 29.5 11.5 25.5 10.5 Z" fill="url(#${p}-l)"/>
      <ellipse cx="14.5" cy="23" rx="3" ry="6" fill="#fff" opacity=".6" transform="rotate(-14 14.5 23)" filter="url(#${p}-soft)"/>
      <circle cx="19" cy="17.5" r="1" fill="#fff" opacity=".5"/>`,
  }),

  oranges: (p) => build(p, {
    sh: [44, 15],
    tex: { f: '0.9', r: .5, g: .22, b: 0, a: .9, o: -.22 },
    g: rad(`${p}-o`, [[0, '#ffe6b0'], [.3, '#ffa63d'], [.72, '#e26f12'], [1, '#8e3d08']], .36, .32, .9)
      + lin(`${p}-l`, [[0, '#c9f2a6'], [1, '#3b8a2e']]),
    body: `<circle cx="24" cy="26" r="16.5" fill="url(#${p}-o)" filter="url(#${p}-tex)"/>
      <path d="M24 10.5 V6.5" stroke="#4a2c14" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M25 8 C29 3.5 35.5 4 37 6 C33.5 10 28.5 10.5 25 8 Z" fill="url(#${p}-l)"/>
      <ellipse cx="16.5" cy="20.5" rx="3.2" ry="4.6" fill="#fff" opacity=".45" transform="rotate(-22 16.5 20.5)" filter="url(#${p}-soft)"/>`,
  }),

  grapes: (p) => {
    const pts = [[18, 15], [30, 15], [12, 23], [24, 23], [36, 23], [18, 31], [30, 31], [24, 39]];
    return build(p, {
      sh: [44, 14],
      g: rad(`${p}-g`, [[0, '#f3e6ff'], [.28, '#a870d4'], [.72, '#5a2b8c'], [1, '#22083c']], .34, .3, .9)
        + lin(`${p}-l`, [[0, '#c9f2a6'], [1, '#3b8a2e']]),
      body: `<path d="M24 10 C23.5 7 24 5 25.5 3.5" stroke="#5a3418" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M25 6 C29.5 1 36.5 2.5 37.5 5.5 C33.5 9 29 9 25 6 Z" fill="url(#${p}-l)"/>
        ${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.2" fill="url(#${p}-g)"/>
          <ellipse cx="${x - 1.8}" cy="${y - 2}" rx="1.3" ry="1" fill="#fff" opacity=".85" filter="url(#${p}-soft)"/>`).join('')}`,
    });
  },

  grain: (p) => {
    const kernel = (cx, cy, rot, rx = 2.5, ry = 5.4) =>
      `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${p}-k)" stroke="#6d4610" stroke-opacity=".35" stroke-width=".5" transform="rotate(${rot} ${cx} ${cy})"/>`;
    return build(p, {
      sh: [44, 9],
      g: lin(`${p}-k`, [[0, '#fff3c4'], [.4, '#eab552'], [.8, '#a06d1c'], [1, '#6d4610']]),
      body: `<path d="M22 6 L19 1.5 M26 6 L29 1.5" stroke="#c99a44" stroke-width="1" stroke-linecap="round"/>
        <path d="M24 46 V11" stroke="#b98a34" stroke-width="1.8" stroke-linecap="round"/>
        ${kernel(19.2, 13.5, -28)}${kernel(28.8, 13.5, 28)}
        ${kernel(19.2, 20.5, -28)}${kernel(28.8, 20.5, 28)}
        ${kernel(19.2, 27.5, -28)}${kernel(28.8, 27.5, 28)}
        ${kernel(24, 9.5, 0, 2.2, 4.8)}`,
    });
  },

  minerals: (p) => build(p, {
    sh: [45, 12],
    g: lin(`${p}-f1`, [[0, '#ffffff'], [1, '#8fd3f5']])
      + lin(`${p}-f2`, [[0, '#86cdf6'], [1, '#2c86c8']])
      + lin(`${p}-f3`, [[0, '#5eb0e8'], [1, '#1e5f9c']])
      + lin(`${p}-f4`, [[0, '#3a8fd0'], [1, '#0c3762']]),
    body: `<path d="M24 4 L8 18 L24 18 Z" fill="url(#${p}-f1)"/>
      <path d="M24 4 L40 18 L24 18 Z" fill="url(#${p}-f2)"/>
      <path d="M8 18 L24 44 L24 18 Z" fill="url(#${p}-f3)"/>
      <path d="M40 18 L24 44 L24 18 Z" fill="url(#${p}-f4)"/>
      <path d="M24 4 L16 11 L24 18 Z" fill="#ffffff" opacity=".2"/>
      <path d="M8 18 H40" stroke="#ffffff" stroke-opacity=".5" stroke-width=".8"/>
      <path d="M24 4 L40 18 L24 44 L8 18 Z" fill="none" stroke="#0a2a4a" stroke-opacity=".35" stroke-width=".6"/>`,
  }),

  clay: (p) => build(p, {
    sh: [44.5, 13],
    tex: { f: '0.7', r: .35, g: .16, b: .06, a: 1.2, o: -.35 },
    g: rad(`${p}-c`, [[0, '#f2a77b'], [.4, '#bc6a3b'], [.8, '#7a3c1b'], [1, '#4e2310']], .36, .3, .9)
      + lin(`${p}-r`, [[0, '#e49a6c'], [1, '#8c4a24']]),
    body: `<path d="M17 12 H31 C34 16 40 20 39.5 31 C39 41 33 44.5 24 44.5 C15 44.5 9 41 8.5 31 C8 20 14 16 17 12 Z" fill="url(#${p}-c)" filter="url(#${p}-tex)"/>
      <rect x="14" y="6.5" width="20" height="6" rx="2.2" fill="url(#${p}-r)" filter="url(#${p}-tex)"/>
      <path d="M9.5 27.5 Q24 32.5 38.5 27.5" fill="none" stroke="#f6d3ad" stroke-opacity=".35" stroke-width="1.4"/>
      <path d="M11.5 36 Q24 40 36.5 36" fill="none" stroke="#2a1205" stroke-opacity=".25" stroke-width="1"/>
      <path d="M14.5 21 C13.5 26 14 32 16.5 37" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".35" filter="url(#${p}-soft)"/>`,
  }),

  limestone: (p) => build(p, {
    sh: [43, 14],
    tex: { f: '0.6', r: .25, g: .25, b: .27, a: 1.3, o: -.42 },
    g: lin(`${p}-t`, [[0, '#ffffff'], [1, '#d5dce2']])
      + lin(`${p}-s`, [[0, '#b5bec6'], [1, '#6c7680']])
      + lin(`${p}-d`, [[0, '#9aa4ad'], [1, '#596269']]),
    body: `<path d="M6 38 L12 20 L22 12 L33 15 L41 33 L31 42 L13 42 Z" fill="url(#${p}-s)" filter="url(#${p}-tex)"/>
      <path d="M12 20 L22 12 L33 15 L24 22 Z" fill="url(#${p}-t)" filter="url(#${p}-tex)"/>
      <path d="M24 22 L33 15 L41 33 L31 42 L27 30 Z" fill="url(#${p}-d)"/>
      <path d="M22 12 L20 26 L15 36 M33 15 L30 24" fill="none" stroke="#3d454c" stroke-opacity=".45" stroke-width=".8"/>
      <circle cx="17" cy="30" r=".9" fill="#3d454c" opacity=".3"/><circle cx="36" cy="28" r=".8" fill="#3d454c" opacity=".3"/>`,
  }),

  sand: (p) => build(p, {
    sh: [42.5, 19],
    tex: { f: '0.9', r: .5, g: .35, b: .12, a: 1.6, o: -.6 },
    g: lin(`${p}-d`, [[0, '#fbeab4'], [.55, '#e2bf6e'], [1, '#a57c36']]),
    body: `<path d="M3 40 C10 24 22 20 30 26 C36 22 42 28 45 40 Z" fill="url(#${p}-d)" filter="url(#${p}-tex)"/>
      <path d="M10 34 C16 28 22 26 28 30" fill="none" stroke="#fff8e0" stroke-width="2" opacity=".55" stroke-linecap="round" filter="url(#${p}-soft)"/>
      ${[[9, 42], [38, 41.5], [43, 40], [15, 43], [33, 43.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#c99a4e"/>`).join('')}`,
  }),

  bricks: (p) => build(p, {
    sh: [43.5, 21],
    tex: { f: '0.8', r: .3, g: .12, b: .05, a: 1.1, o: -.3 },
    g: lin(`${p}-f`, [[0, '#eb8e6e'], [1, '#a6442b']])
      + lin(`${p}-t`, [[0, '#f8c3ad'], [1, '#dd7c5e']])
      + lin(`${p}-s`, [[0, '#b65232'], [1, '#7b2b19']]),
    body: `<g filter="url(#${p}-tex)">${brick(p, 2, 31, 18)}${brick(p, 23, 31, 18)}${brick(p, 12, 20, 18)}</g>`,
  }),

  planks: (p) => build(p, {
    sh: [42.5, 17],
    tex: { f: '0.03 0.7', r: .35, g: .18, b: .05, a: 1.3, o: -.45 },
    g: lin(`${p}-w`, [[0, '#f5d29a'], [.5, '#cc9155'], [1, '#8e5a2a']], 0, 0, 1, .25),
    body: [[7, 14], [19.5, 30], [32, 22]].map(([y, kx]) => `
        <rect x="5" y="${y}" width="38" height="9" rx="1" fill="url(#${p}-w)" filter="url(#${p}-tex)" stroke="#3b2008" stroke-opacity=".5" stroke-width=".6"/>
        <rect x="5" y="${y}" width="1.6" height="9" fill="#f6dcb0" opacity=".8"/>
        <ellipse cx="${kx}" cy="${y + 4.5}" rx="1.6" ry="1.1" fill="#5a3418" opacity=".7"/>`).join(''),
  }),

  timber: (p) => build(p, {
    sh: [44.5, 16],
    tex: { f: '0.9', r: .2, g: .1, b: .04, a: 1.3, o: -.4 },
    g: rad(`${p}-bark`, [[0, '#8b5a33'], [.7, '#4a2a12'], [1, '#2a1608']], .5, .5, .6)
      + rad(`${p}-sap`, [[0, '#f5dcaa'], [1, '#d7a86a']], .5, .5, .6)
      + rad(`${p}-heart`, [[0, '#d9a36a'], [.7, '#b07438'], [1, '#8a5226']], .5, .5, .6),
    body: `<circle cx="24" cy="24" r="20" fill="url(#${p}-bark)" filter="url(#${p}-tex)"/>
      <circle cx="24" cy="24" r="16" fill="url(#${p}-sap)"/>
      <circle cx="24" cy="24" r="12.5" fill="url(#${p}-heart)"/>
      ${[10, 7.5, 5, 2.8].map((r) => `<circle cx="24" cy="24" r="${r}" fill="none" stroke="#7a4a1f" stroke-opacity=".55" stroke-width=".8"/>`).join('')}
      <path d="M24 24 L35 19 M24 24 L14 29 M24 24 L29 36" stroke="#5a3418" stroke-opacity=".45" stroke-width=".7" fill="none"/>
      <circle cx="24" cy="24" r="1.6" fill="#3e2310"/>
      <path d="M9.5 19 A16 16 0 0 1 19 9" fill="none" stroke="#fff" stroke-width="1.6" opacity=".35" stroke-linecap="round" filter="url(#${p}-soft)"/>`,
  }),

  flour: (p) => build(p, {
    sh: [44.5, 15],
    tex: { f: '0.9', r: .45, g: .4, b: .3, a: .9, o: -.3 },
    g: lin(`${p}-s`, [[0, '#fffdf4'], [.55, '#ece2cb'], [1, '#b5a585']])
      + lin(`${p}-g`, [[0, '#f6efdc'], [1, '#cbbd9c']]),
    body: `<path d="M16 13 C13 20 9.5 33 9.5 40 C9.5 43 13 44.5 24 44.5 C35 44.5 38.5 43 38.5 40 C38.5 33 35 20 32 13 Z" fill="url(#${p}-s)" filter="url(#${p}-tex)"/>
      <path d="M13.5 13.5 C18 10 30 10 34.5 13.5 L32.5 18 C28 16 20 16 15.5 18 Z" fill="url(#${p}-g)" filter="url(#${p}-tex)"/>
      <path d="M24 19 C23 27 23 35 24.5 43 M17.5 20 C16 28 15.5 36 16.5 42 M30.5 20 C31.5 28 32.5 36 31.5 42" fill="none" stroke="#8a7a5c" stroke-opacity=".28" stroke-width="1"/>
      <rect x="16.5" y="25" width="15" height="9" rx="1" fill="#fbf7ea" stroke="#8a7a5c" stroke-opacity=".4" stroke-width=".5"/>
      <rect x="16.5" y="27.5" width="15" height="1.6" fill="#c8482a" opacity=".85"/>
      <path d="M19 31.5 H28" stroke="#6b5c40" stroke-opacity=".5" stroke-width=".8"/>
      <path d="M13 24 C12 30 12 36 13.5 41" stroke="#fff" stroke-width="1.6" opacity=".6" fill="none" filter="url(#${p}-soft)"/>`,
  }),

  juice: (p) => build(p, {
    sh: [44.5, 11],
    g: lin(`${p}-j`, [[0, '#ffd873'], [.45, '#f7a02a'], [1, '#c75d0c']])
      + lin(`${p}-glass`, [[0, '#ffffff'], [.5, '#eef8fb'], [1, '#c4dde6']], 0, 0, 1, 0),
    body: `<path d="M29.5 12.5 L33.5 3" stroke="#e4572e" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M29.5 12.5 L33.5 3" stroke="#fff" stroke-width="2.2" stroke-dasharray="1.6 2.2" opacity=".9"/>
      <path d="M12.5 12 L15 42.5 Q15.2 44 17 44 H31 Q32.8 44 33 42.5 L35.5 12 Z" fill="url(#${p}-glass)" fill-opacity=".5" stroke="#7aa6b5" stroke-opacity=".6" stroke-width=".6"/>
      <path d="M13.3 21 H34.7 L32.9 42.2 Q32.8 43.2 31.8 43.2 H16.2 Q15.2 43.2 15.1 42.2 Z" fill="url(#${p}-j)"/>
      <ellipse cx="24" cy="21" rx="10.7" ry="1.5" fill="#ffe9a8"/>
      <circle cx="20" cy="31" r=".9" fill="#fff" opacity=".5"/><circle cx="27" cy="36" r=".7" fill="#fff" opacity=".5"/><circle cx="23" cy="39" r=".6" fill="#fff" opacity=".5"/>
      <ellipse cx="24" cy="12" rx="11.5" ry="2" fill="#eef8fb" fill-opacity=".8" stroke="#7aa6b5" stroke-opacity=".6" stroke-width=".6"/>
      <rect x="16.2" y="24" width="1.6" height="15" rx=".8" fill="#fff" opacity=".6" filter="url(#${p}-soft)"/>
      <rect x="31" y="24" width=".9" height="14" fill="#fff" opacity=".35"/>`,
  }),

  bread: (p) => build(p, {
    sh: [41.5, 22],
    tex: { f: '0.75', r: .35, g: .18, b: .06, a: 1.2, o: -.35 },
    g: rad(`${p}-b`, [[0, '#ffdf98'], [.35, '#d8924a'], [.75, '#8c4a1a'], [1, '#4e2208']], .38, .3, .9),
    body: `<path d="M6 37 C4 24 13 13 24 13 C35 13 44 24 42 37 C41 40 38 41 36 41 H12 C10 41 7 40 6 37 Z" fill="url(#${p}-b)" filter="url(#${p}-tex)"/>
      <path d="M12.5 26 C16.5 19.5 22.5 19 25 21.5 C27.5 18.5 33 19 36 25" fill="none" stroke="#fff1cf" stroke-width="1.8" stroke-linecap="round" opacity=".55" filter="url(#${p}-soft)"/>
      <path d="M12 32 L16 28.5 M21 36 L25.5 31.5 M31 35 L35.5 31" stroke="#6b3412" stroke-opacity=".4" stroke-width="1" stroke-linecap="round" fill="none"/>
      ${[[15, 22], [32, 27], [27, 36], [9, 32], [38, 34]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".7" fill="#fff" opacity=".5"/>`).join('')}`,
  }),

  glass: (p) => build(p, {
    sh: [43.5, 16],
    g: lin(`${p}-g`, [[0, '#f7feff'], [.45, '#bfe7f5'], [1, '#5aa8c6']]),
    body: `<rect x="9" y="6" width="30" height="36" rx="1.5" fill="url(#${p}-g)" fill-opacity=".92" stroke="#2c6b82" stroke-opacity=".55" stroke-width=".7"/>
      <path d="M14.5 37 L26.5 7.5 H31.5 L19.5 37 Z" fill="#fff" opacity=".6" filter="url(#${p}-soft)"/>
      <path d="M22 40.5 L38.5 14 V19.5 L26 40.5 Z" fill="#fff" opacity=".3" filter="url(#${p}-soft)"/>
      <rect x="9" y="41.2" width="30" height="1.6" fill="#2f7189" opacity=".55"/>`,
  }),

  cement: (p) => build(p, {
    sh: [45.5, 16],
    tex: { f: '0.9', r: .3, g: .3, b: .32, a: 1.1, o: -.3 },
    g: lin(`${p}-b`, [[0, '#eef0f2'], [.5, '#c4c9ce'], [1, '#858c93']])
      + lin(`${p}-top`, [[0, '#fbfbfc'], [1, '#d9dde1']]),
    body: `<path d="M11 14 H37 L40.5 44 Q40.5 45.5 39 45.5 H9 Q7.5 45.5 7.5 44 Z" fill="url(#${p}-b)" filter="url(#${p}-tex)"/>
      <path d="M9.5 8.5 H38.5 L37 14 H11 Z" fill="url(#${p}-top)" stroke="#6c737a" stroke-opacity=".5" stroke-width=".6"/>
      <rect x="13.5" y="21" width="21" height="11" rx="1" fill="#fafbfc" fill-opacity=".92"/>
      <rect x="13.5" y="24" width="21" height="2.2" fill="#d4572d" opacity=".85"/>
      <path d="M17 28.5 H31 M17 30.8 H27" stroke="#4c545c" stroke-opacity=".5" stroke-width=".8"/>`,
  }),

  steel: (p) => build(p, {
    sh: [42, 14],
    tex: { f: '0.03 0.7', r: .3, g: .32, b: .35, a: .9, o: -.25 },
    g: lin(`${p}-m`, [[0, '#fbfdff'], [.28, '#b7c1ca'], [.52, '#6e7984'], [.75, '#c3ccd4'], [1, '#49525b']], 0, 0, 0, 1),
    body: `<path d="M6 8 H42 V15 H28 V33 H42 V40 H6 V33 H20 V15 H6 Z" fill="url(#${p}-m)" filter="url(#${p}-tex)" stroke="#2a3138" stroke-opacity=".5" stroke-width=".6"/>
      ${[[10.5, 11.5], [37.5, 11.5], [10.5, 36.5], [37.5, 36.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3" fill="#2a3138" opacity=".7"/><circle cx="${x - .4}" cy="${y - .4}" r=".5" fill="#fff" opacity=".5"/>`).join('')}
      <path d="M8 10.2 H20" stroke="#fff" stroke-width="1" opacity=".7" stroke-linecap="round" filter="url(#${p}-soft)"/>
      <path d="M30 18 V30" stroke="#fff" stroke-width="1" opacity=".5" filter="url(#${p}-soft)"/>`,
  }),

  furniture: (p) => build(p, {
    sh: [44, 15],
    tex: { f: '0.03 0.7', r: .25, g: .12, b: .04, a: 1.2, o: -.35 },
    g: lin(`${p}-w`, [[0, '#eaa772'], [.5, '#b06a35'], [1, '#6a3a16']], 0, 0, 1, 1)
      + lin(`${p}-s`, [[0, '#f2b880'], [.6, '#bf7a3e'], [1, '#7e4520']], 0, 0, 0, 1),
    body: `<path d="M13 6 H35 Q37 6 37 8 V26 H13 Z" fill="url(#${p}-w)" filter="url(#${p}-tex)"/>
      <path d="M17.5 10 V23 M24 10 V23 M30.5 10 V23" stroke="#4a2a10" stroke-opacity=".35" stroke-width="1"/>
      <path d="M8 24 Q8 22 10 22 H40 Q42 22 42 24 V30 H8 Z" fill="url(#${p}-s)" filter="url(#${p}-tex)"/>
      <path d="M12 30 V42 M36 30 V42" stroke="#4a2a10" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M11.2 30 V41.5 M35.2 30 V41.5" stroke="#d99a5e" stroke-width=".8" stroke-linecap="round" opacity=".6"/>`,
  }),

  windows: (p) => {
    const panes = [[11, 11, 11, 12], [26, 11, 11, 12], [11, 27, 11, 10], [26, 27, 11, 10]];
    return build(p, {
      sh: [45, 20],
      g: lin(`${p}-f`, [[0, '#fffcf4'], [1, '#c9bda4']])
        + lin(`${p}-g`, [[0, '#eefbff'], [.4, '#8fd0ee'], [1, '#2b6c99']], 0, 0, 1, 1),
      body: `<rect x="5" y="5" width="38" height="37" rx="2" fill="url(#${p}-f)" stroke="#6e6250" stroke-opacity=".4" stroke-width=".6"/>
        ${panes.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${p}-g)"/>
          <path d="M${x + 2} ${y + h - 1.5} L${x + 6} ${y + 1.5} H${x + 8} L${x + 3.5} ${y + h - 1.5} Z" fill="#fff" opacity=".55" filter="url(#${p}-soft)"/>`).join('')}
        <rect x="3" y="41.5" width="42" height="3.5" rx="1.2" fill="#b9ad93"/>`,
    });
  },

  machinery: (p) => build(p, {
    sh: [44, 14],
    tex: { f: '0.9', r: .25, g: .25, b: .25, a: .7, o: -.2 },
    g: rad(`${p}-m`, [[0, '#f4fbf9'], [.35, '#9fe0d1'], [.7, '#1f9d8a'], [1, '#0a4a40']], .36, .3, .9)
      + lin(`${p}-h`, [[0, '#fbfdfd'], [.5, '#9aa4ad'], [1, '#525c66']]),
    body: `${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="20.5" y="2" width="7" height="9" rx="1.5" fill="url(#${p}-m)" transform="rotate(${a} 24 24)"/>`).join('')}
      <circle cx="24" cy="24" r="15" fill="url(#${p}-m)" filter="url(#${p}-tex)"/>
      ${[[34, 24], [24, 34], [14, 24], [24, 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#0a3a33" opacity=".7"/>`).join('')}
      <circle cx="24" cy="24" r="6.5" fill="url(#${p}-h)" stroke="#2f3a42" stroke-opacity=".4" stroke-width=".6"/>
      <circle cx="24" cy="24" r="2.4" fill="#1f2a31"/>
      <path d="M13.5 18 Q17 12.5 22.5 11.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round" filter="url(#${p}-soft)"/>`,
  }),
};

// Wooden crate, used for unknown slugs.
const FALLBACK = (p) => build(p, {
  sh: [44, 16],
  tex: { f: '0.03 0.7', r: .25, g: .12, b: .04, a: 1.2, o: -.35 },
  g: lin(`${p}-w`, [[0, '#eab27a'], [.55, '#b57237'], [1, '#7a4620']])
    + lin(`${p}-t`, [[0, '#f6c894'], [1, '#c48a4e']]),
  body: `<path d="M8 16 H40 V42 H8 Z" fill="url(#${p}-w)" filter="url(#${p}-tex)"/>
    <path d="M8 16 L13 10 H45 L40 16 Z" fill="url(#${p}-t)"/>
    <path d="M40 16 L45 10 V36 L40 42 Z" fill="#8a5428"/>
    <path d="M8 25 H40 M8 34 H40" stroke="#3b1e08" stroke-opacity=".35" stroke-width=".8"/>
    <circle cx="12" cy="20.5" r=".9" fill="#3b1e08" opacity=".5"/><circle cx="36" cy="20.5" r=".9" fill="#3b1e08" opacity=".5"/>`,
});

export function resIcon(slug, size = 32) {
  const make = ICONS[slug] ?? FALLBACK;
  const body = make(`ic-${String(slug).replace(/[^a-z0-9]/gi, '')}`);
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const hasIcon = (slug) => slug in ICONS;
