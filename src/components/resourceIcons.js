// Detailed flat-shaded SVG icons for every resource. Same light (top-left), same ink outline, same palette
// as docs/UI_DESIGN.md, so they sit inside the Atlas look. Each icon has its own gradient ids (prefixed by slug),
// so many icons can share one page safely.
// Usage: resIcon('apples', 32) returns an inline <svg> string. Unknown slugs get a neutral crate.
const INK = '#0d1b2a';
const LINE = `stroke="${INK}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"`;
const shadow = (cx = 24, cy = 44, rx = 15) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="2.8" fill="${INK}" opacity=".16"/>`;
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 1, y2 = 1) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rad = (id, stops, cx = 0.35, cy = 0.3, r = 0.8) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;

const ICONS = {
  power: (p) => `${shadow()}<defs>${rad(`${p}-glow`, [[0, '#ffe58a'], [1, '#ffe58a00']], 0.5, 0.5, 0.5)}${lin(`${p}-b`, [[0, '#ffe07a'], [0.5, '#e0a526'], [1, '#a86f0c']])}</defs>
    <circle cx="24" cy="24" r="22" fill="url(#${p}-glow)"/>
    <path d="M28 3 L11 27 H22 L18 45 L37 19 H26 Z" fill="url(#${p}-b)" ${LINE}/>
    <path d="M26 8 L16 23 H22" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`,

  water: (p) => `${shadow()}<defs>${rad(`${p}-d`, [[0, '#c9f5ec'], [0.35, '#3fc2ae'], [0.8, '#1f9d8a'], [1, '#0d5f54']], 0.35, 0.3, 0.9)}</defs>
    <path d="M22 5 C22 5 9 21 9 30 a13 13 0 0 0 26 0 C35 21 22 5 22 5 Z" fill="url(#${p}-d)" ${LINE}/>
    <ellipse cx="16" cy="28" rx="2.6" ry="4.5" fill="#fff" opacity=".7" transform="rotate(20 16 28)"/>
    <path d="M32 9 C32 9 27 15 27 19 a4 4 0 0 0 8 0 C35 15 32 9 32 9 Z" fill="#7fdccb" ${LINE} opacity=".9"/>`,

  seeds: (p) => `${shadow()}<defs>${lin(`${p}-leaf`, [[0, '#b8efa0'], [0.55, '#6fbf5a'], [1, '#3b7f2c']])}${lin(`${p}-soil`, [[0, '#a0653a'], [1, '#5c3a1f']], 0, 0, 0, 1)}</defs>
    <path d="M8 36 Q24 30 40 36 V42 Q40 44 38 44 H10 Q8 44 8 42Z" fill="url(#${p}-soil)" ${LINE}/>
    <path d="M24 36 V20" fill="none" stroke="#3b7f2c" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 24 C16 24 11 19 11 12 C18 12 24 17 24 24Z" fill="url(#${p}-leaf)" ${LINE}/>
    <path d="M24 22 C32 22 37 16 37 9 C30 9 24 15 24 22Z" fill="url(#${p}-leaf)" ${LINE}/>
    <path d="M24 24 C19 20 15 16 13 13 M24 22 C28 18 32 14 35 11" fill="none" stroke="#2c5e21" stroke-width="1" opacity=".5"/>`,

  apples: (p) => `${shadow()}<defs>${rad(`${p}-a`, [[0, '#ffb39a'], [0.3, '#ef6a4a'], [0.75, '#c23d22'], [1, '#7d2212']], 0.35, 0.3, 0.9)}${lin(`${p}-l`, [[0, '#b8efa0'], [1, '#3b7f2c']])}</defs>
    <path d="M24 13 C17 7 5 12 7 27 C9 40 17 45 24 42 C31 45 39 40 41 27 C43 12 31 7 24 13 Z" fill="url(#${p}-a)" ${LINE}/>
    <path d="M24 13 V8" stroke="#5a3418" stroke-width="2" stroke-linecap="round"/>
    <path d="M25 9 C28 2 35 3 36 5 C33 9 29 10 25 9 Z" fill="url(#${p}-l)" ${LINE}/>
    <ellipse cx="15" cy="23" rx="3.2" ry="5" fill="#fff" opacity=".45" transform="rotate(-15 15 23)"/>`,

  oranges: (p) => `${shadow()}<defs>${rad(`${p}-o`, [[0, '#ffd08a'], [0.35, '#f5a040'], [0.8, '#d9701a'], [1, '#8a3f0a']], 0.35, 0.3, 0.9)}${lin(`${p}-l`, [[0, '#b8efa0'], [1, '#3b7f2c']])}</defs>
    <circle cx="24" cy="26" r="16" fill="url(#${p}-o)" ${LINE}/>
    <g fill="#8a3f0a" opacity=".18"><circle cx="17" cy="20" r=".9"/><circle cx="30" cy="18" r=".9"/><circle cx="26" cy="31" r=".9"/><circle cx="16" cy="32" r=".9"/><circle cx="33" cy="28" r=".9"/><circle cx="22" cy="24" r=".9"/></g>
    <path d="M24 11 V7" stroke="#5a3418" stroke-width="2" stroke-linecap="round"/>
    <path d="M25 8 C29 3 35 4 36 6 C32 10 28 10 25 8 Z" fill="url(#${p}-l)" ${LINE}/>
    <ellipse cx="16" cy="21" rx="3" ry="4.5" fill="#fff" opacity=".4" transform="rotate(-20 16 21)"/>`,

  grapes: (p) => `${shadow()}<defs>${rad(`${p}-g`, [[0, '#e6d0f5'], [0.35, '#9b68c4'], [0.8, '#5b2f8a'], [1, '#2a1140']], 0.35, 0.3, 0.9)}${lin(`${p}-l`, [[0, '#b8efa0'], [1, '#3b7f2c']])}</defs>
    <path d="M24 13 V6" stroke="#5a3418" stroke-width="2" stroke-linecap="round"/>
    <path d="M25 7 C30 2 36 4 37 7 C33 10 29 10 25 7 Z" fill="url(#${p}-l)" ${LINE}/>
    ${[[16,22],[28,22],[22,30],[34,30],[16,38],[28,38],[22,46]].map(([x,y],i)=>`<circle cx="${x}" cy="${y-2}" r="5.2" fill="url(#${p}-g)" ${LINE}/><circle cx="${x-1.8}" cy="${y-4}" r="1.3" fill="#fff" opacity=".7"/>`).join('')}`,

  grain: (p) => `${shadow()}<defs>${lin(`${p}-s`, [[0, '#f5d27a'], [1, '#b8862a']], 0, 0, 1, 0)}${lin(`${p}-k`, [[0, '#ffe9a6'], [0.6, '#e0a526'], [1, '#9a6a14']])}</defs>
    <path d="M24 44 V9" stroke="url(#${p}-s)" stroke-width="2.4" stroke-linecap="round"/>
    ${[[24,22,-1],[24,30,1]].map(([x,y,d],i)=>`<path d="M24 ${y} C${24+d*-7} ${y-3} ${24+d*-9} ${y-9} ${24+d*-6} ${y-13} C${24+d*-1} ${y-8} ${24} ${y-4} 24 ${y} Z" fill="url(#${p}-k)" ${LINE}/>`).join('')}
    ${[[24,22,1],[24,30,-1]].map(([x,y,d])=>`<path d="M24 ${y} C${24+d*7} ${y-3} ${24+d*9} ${y-9} ${24+d*6} ${y-13} C${24+d*1} ${y-8} 24 ${y-4} 24 ${y} Z" fill="url(#${p}-k)" ${LINE}/>`).join('')}
    <path d="M24 9 C21 6 21 3 24 1 C27 3 27 6 24 9 Z" fill="url(#${p}-k)" ${LINE}/>`,

  minerals: (p) => `${shadow()}<defs>${lin(`${p}-a`, [[0, '#e6f7ff'], [1, '#7cc8f0']])}${lin(`${p}-b`, [[0, '#7cc8f0'], [1, '#2d7fc0']])}${lin(`${p}-c`, [[0, '#2d7fc0'], [1, '#17466f']])}</defs>
    <path d="M24 4 L38 17 L24 44 L10 17 Z" fill="url(#${p}-b)" ${LINE}/>
    <path d="M24 4 L38 17 H10 Z" fill="url(#${p}-a)" ${LINE}/>
    <path d="M10 17 L24 44 L18 17 Z" fill="url(#${p}-c)" opacity=".8"/>
    <path d="M24 4 L18 17 L24 44 L30 17 Z" fill="none" stroke="${INK}" stroke-width="1" opacity=".35"/>
    <path d="M20 10 L22 14" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`,

  clay: (p) => `${shadow()}<defs>${lin(`${p}-p`, [[0, '#e0925e'], [0.45, '#b5673a'], [1, '#6e3a1c']])}</defs>
    <path d="M17 9 H31 C33 15 40 19 39 31 C38 41 32 44 24 44 C16 44 10 41 9 31 C8 19 15 15 17 9 Z" fill="url(#${p}-p)" ${LINE}/>
    <path d="M14 9 H34 V12 H14 Z" fill="#c07445" ${LINE}/>
    <path d="M10 27 Q24 31 38 27" fill="none" stroke="#f3c79a" stroke-width="1.6" opacity=".7"/>
    <path d="M14 22 C13 27 14 33 16 37" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>`,

  limestone: (p) => `${shadow()}<defs>${lin(`${p}-t`, [[0, '#f4f6f8'], [1, '#c9d0d6']])}${lin(`${p}-s`, [[0, '#a7b0b8'], [1, '#6b747c']])}</defs>
    <path d="M6 38 L12 20 L22 12 L33 15 L41 33 L31 42 L13 42 Z" fill="url(#${p}-s)" ${LINE}/>
    <path d="M12 20 L22 12 L33 15 L24 22 Z" fill="url(#${p}-t)" ${LINE}/>
    <path d="M24 22 L33 15 L41 33 L31 42 L27 30 Z" fill="#8a939b" opacity=".6"/>
    <path d="M22 12 L20 26 L15 36" fill="none" stroke="${INK}" stroke-width="1" opacity=".35"/>`,

  sand: (p) => `${shadow()}<defs>${lin(`${p}-d`, [[0, '#f6e2a2'], [0.6, '#dcb762'], [1, '#a7823a']])}</defs>
    <path d="M3 40 C10 24 22 20 30 26 C36 22 42 28 45 40 Z" fill="url(#${p}-d)" ${LINE}/>
    <path d="M10 34 C16 28 22 26 28 30" fill="none" stroke="#fff" stroke-width="1.6" opacity=".5" stroke-linecap="round"/>
    <g fill="#a7823a" opacity=".5"><circle cx="14" cy="38" r=".9"/><circle cx="22" cy="36" r=".9"/><circle cx="32" cy="37" r=".9"/><circle cx="38" cy="35" r=".9"/><circle cx="18" cy="41" r=".9"/><circle cx="29" cy="41" r=".9"/></g>`,

  bricks: (p) => `${shadow()}<defs>${lin(`${p}-f`, [[0, '#e0785a'], [1, '#a8432a']])}${lin(`${p}-t`, [[0, '#f29a7e'], [1, '#c4583c']])}</defs>
    <path d="M4 22 L14 16 H44 L34 22 Z" fill="url(#${p}-t)" ${LINE}/>
    <path d="M4 22 V34 L14 28 V16 Z" fill="#8f3520" ${LINE}/>
    <path d="M4 22 L14 16 H34 V28 L4 34 Z" fill="url(#${p}-f)" ${LINE}/>
    <path d="M16 19 H14 M24 19 H22" stroke="#fff" stroke-width="1" opacity=".3"/>
    <path d="M4 22 L34 22 M14 16 V34 M4 28 L34 28" fill="none" stroke="#fcd7c8" stroke-width="1" opacity=".4"/>
    <path d="M24 28 L46 16 V30 L24 42 Z" fill="#8f3520" ${LINE}/>
    <path d="M34 22 L46 16 V30 L34 36 Z" fill="url(#${p}-f)" ${LINE}/>
    <path d="M24 28 L34 22 L46 16 M34 22 V36" fill="none" stroke="#fcd7c8" stroke-width="1" opacity=".35"/>`,

  planks: (p) => `${shadow()}<defs>${lin(`${p}-w`, [[0, '#f0c48a'], [0.5, '#c88d4e'], [1, '#8f5a2b']], 0, 0, 1, 0.2)}</defs>
    ${[8,20,32].map((y,i)=>`<rect x="5" y="${y}" width="38" height="9" rx="1.5" fill="url(#${p}-w)" ${LINE}/>
      <path d="M8 ${y+3} H40 M10 ${y+6} H34" stroke="#6b3d17" stroke-width=".8" opacity=".35"/>
      <circle cx="10" cy="${y+4.5}" r="1" fill="#5a3418" opacity=".6"/><circle cx="38" cy="${y+4.5}" r="1" fill="#5a3418" opacity=".6"/>`).join('')}`,

  timber: (p) => `${shadow()}<defs>${rad(`${p}-c`, [[0, '#e8c48a'], [0.6, '#c89a5b'], [1, '#9a6a3a']], 0.5, 0.5, 0.5)}${lin(`${p}-b`, [[0, '#8a5a34'], [0.5, '#5a3418'], [1, '#2f1b0b']])}</defs>
    <circle cx="24" cy="24" r="19" fill="url(#${p}-b)" ${LINE}/>
    <circle cx="24" cy="24" r="14" fill="url(#${p}-c)" ${LINE}/>
    <circle cx="24" cy="24" r="10" fill="none" stroke="#8a5a34" stroke-width="1" opacity=".7"/>
    <circle cx="24" cy="24" r="6" fill="none" stroke="#8a5a34" stroke-width="1" opacity=".7"/>
    <circle cx="24" cy="24" r="2.2" fill="#6b3d17"/>
    <path d="M14 14 Q18 12 20 16" fill="none" stroke="#fff" stroke-width="1.5" opacity=".4" stroke-linecap="round"/>`,

  flour: (p) => `${shadow()}<defs>${lin(`${p}-s`, [[0, '#fffdf7'], [0.6, '#eadfcb'], [1, '#bfae8e']])}</defs>
    <path d="M14 12 C14 8 34 8 34 12 L40 42 C40 44 8 44 8 42 Z" fill="url(#${p}-s)" ${LINE}/>
    <path d="M14 12 C18 15 30 15 34 12" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".5"/>
    <path d="M18 22 H30" stroke="#9c8a6a" stroke-width="1.4" stroke-linecap="round" opacity=".5"/>
    <path d="M15 24 L13 40" stroke="#fff" stroke-width="2" opacity=".5" stroke-linecap="round"/>
    <path d="M18 32 H30 V37 H18 Z" fill="#c24d2c" opacity=".75"/>`,

  juice: (p) => `${shadow()}<defs>${lin(`${p}-g`, [[0, '#ffffff'], [0.5, '#f5efe0'], [1, '#d7cdb8']], 0, 0, 1, 0)}${lin(`${p}-j`, [[0, '#ffc85a'], [1, '#e07b10']])}</defs>
    <path d="M14 14 H34 L37 43 Q37 44 36 44 H12 Q11 44 11 43 Z" fill="url(#${p}-g)" ${LINE}/>
    <path d="M15.5 22 H32.5 L35 43 Q35 43.5 34.5 43.5 H13.5 Q13 43.5 13 43 Z" fill="url(#${p}-j)" opacity=".92"/>
    <path d="M14 14 H34" stroke="${INK}" stroke-width="1.5"/>
    <path d="M30 14 L34 4" stroke="#e4572e" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M18 30 L19 40" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,

  bread: (p) => `${shadow()}<defs>${rad(`${p}-b`, [[0, '#ffe2a0'], [0.4, '#e0a050'], [1, '#8a4a1a']], 0.35, 0.3, 0.9)}</defs>
    <path d="M6 37 C4 24 13 13 24 13 C35 13 44 24 42 37 C41 40 38 41 36 41 H12 C10 41 7 40 6 37 Z" fill="url(#${p}-b)" ${LINE}/>
    <path d="M14 22 C18 17 22 17 24 19 M24 19 C26 17 30 17 34 22" fill="none" stroke="#fff3c8" stroke-width="2" stroke-linecap="round" opacity=".8"/>
    <path d="M12 30 L16 27 M22 33 L27 28 M31 33 L35 30" fill="none" stroke="#8a4a1a" stroke-width="1" opacity=".5" stroke-linecap="round"/>`,

  glass: (p) => `${shadow()}<defs>${lin(`${p}-g`, [[0, '#f2fbff'], [0.5, '#a9d8f0'], [1, '#5fa9d0']])}</defs>
    <rect x="8" y="7" width="32" height="34" rx="2" fill="url(#${p}-g)" ${LINE}/>
    <rect x="8" y="7" width="32" height="34" rx="2" fill="none" stroke="#fff" stroke-width="1" opacity=".7" transform="translate(1 1)"/>
    <path d="M14 36 L36 14" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>
    <path d="M20 40 L37 23" stroke="#fff" stroke-width="1.4" opacity=".5" stroke-linecap="round"/>`,

  cement: (p) => `${shadow()}<defs>${lin(`${p}-b`, [[0, '#dfe2e6'], [0.5, '#b4b9bf'], [1, '#7e858c']])}</defs>
    <path d="M10 12 H38 L42 44 H6 Z" fill="url(#${p}-b)" ${LINE}/>
    <path d="M10 12 L16 6 H32 L38 12 Z" fill="#eef0f2" ${LINE}/>
    <path d="M14 22 H34 M12 30 H36" stroke="#6b737b" stroke-width="1" opacity=".4"/>
    <g fill="#6b737b" opacity=".35"><circle cx="16" cy="38" r=".9"/><circle cx="26" cy="36" r=".9"/><circle cx="34" cy="40" r=".9"/><circle cx="20" cy="41" r=".9"/></g>
    <path d="M14 14 L12 36" stroke="#fff" stroke-width="2" opacity=".4" stroke-linecap="round"/>`,

  steel: (p) => `${shadow()}<defs>${lin(`${p}-m`, [[0, '#eef2f5'], [0.35, '#aab3bb'], [0.6, '#6f7a84'], [1, '#434c55']], 0, 0, 0, 1)}</defs>
    <path d="M6 8 H42 V15 H28 V33 H42 V40 H6 V33 H20 V15 H6 Z" fill="url(#${p}-m)" ${LINE}/>
    <circle cx="10.5" cy="11.5" r="1.1" fill="#2a3138"/><circle cx="37.5" cy="11.5" r="1.1" fill="#2a3138"/>
    <circle cx="10.5" cy="36.5" r="1.1" fill="#2a3138"/><circle cx="37.5" cy="36.5" r="1.1" fill="#2a3138"/>
    <path d="M8 10 H20" stroke="#fff" stroke-width="1.2" opacity=".6" stroke-linecap="round"/>`,

  furniture: (p) => `${shadow()}<defs>${lin(`${p}-w`, [[0, '#d6955c'], [0.5, '#a8632f'], [1, '#6e3c17']])}${lin(`${p}-s`, [[0, '#e8a870'], [1, '#9a5a28']])}</defs>
    <path d="M13 6 H35 Q37 6 37 8 V26 H13 Z" fill="url(#${p}-w)" ${LINE}/>
    <path d="M17 10 V22 M24 10 V22 M31 10 V22" stroke="#5a3418" stroke-width="1" opacity=".35"/>
    <path d="M8 24 Q8 22 10 22 H40 Q42 22 42 24 V30 H8 Z" fill="url(#${p}-s)" ${LINE}/>
    <path d="M12 30 V42 M36 30 V42" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M12 30 V42 M36 30 V42" stroke="#6e3c17" stroke-width="1.6" stroke-linecap="round"/>`,

  windows: (p) => `${shadow()}<defs>${lin(`${p}-f`, [[0, '#f7f3ea'], [1, '#b9ad97']])}${lin(`${p}-g`, [[0, '#e6f7ff'], [0.5, '#8fcbeb'], [1, '#3c86b8']])}</defs>
    <rect x="6" y="6" width="36" height="36" rx="2" fill="url(#${p}-f)" ${LINE}/>
    <rect x="11" y="11" width="11" height="12" fill="url(#${p}-g)" ${LINE}/>
    <rect x="26" y="11" width="11" height="12" fill="url(#${p}-g)" ${LINE}/>
    <rect x="11" y="27" width="11" height="10" fill="url(#${p}-g)" ${LINE}/>
    <rect x="26" y="27" width="11" height="10" fill="url(#${p}-g)" ${LINE}/>
    <path d="M13 21 L17 13 M28 21 L32 13" stroke="#fff" stroke-width="1.5" opacity=".7" stroke-linecap="round"/>
    <rect x="4" y="42" width="40" height="3" rx="1" fill="#9a8c74" ${LINE}/>`,

  machinery: (p) => `${shadow()}<defs>${rad(`${p}-m`, [[0, '#f0f5f4'], [0.45, '#8fd2c4'], [0.8, '#1f9d8a'], [1, '#0d5f54']], 0.35, 0.3, 0.9)}${lin(`${p}-h`, [[0, '#f3f5f7'], [1, '#6f7a84']])}</defs>
    ${[0,45,90,135,180,225,270,315].map((a)=>`<rect x="21" y="2" width="6" height="8" rx="1.5" fill="url(#${p}-m)" ${LINE} transform="rotate(${a} 24 24)"/>`).join('')}
    <circle cx="24" cy="24" r="15" fill="url(#${p}-m)" ${LINE}/>
    <circle cx="24" cy="24" r="6.5" fill="url(#${p}-h)" ${LINE}/>
    <circle cx="24" cy="24" r="2.4" fill="${INK}" opacity=".8"/>
    <path d="M14 18 Q17 13 22 12" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6" stroke-linecap="round"/>`,
};

const FALLBACK = (p) => `${shadow()}<defs>${lin(`${p}-f`, [[0, '#eef1f4'], [1, '#c5ccd3']])}</defs>
  <rect x="8" y="12" width="32" height="28" rx="3" fill="url(#${p}-f)" ${LINE}/><path d="M8 22 H40" fill="none" ${LINE}/>`;

export function resIcon(slug, size = 32) {
  const make = ICONS[slug] ?? FALLBACK;
  const body = make(`ic-${String(slug).replace(/[^a-z0-9]/gi, '')}`);
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const hasIcon = (slug) => slug in ICONS;
