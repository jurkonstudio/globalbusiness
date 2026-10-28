// Flat SVG icons for every resource. One palette, one stroke style, so the Warehouse, Market and Stores look consistent.
// Usage: resIcon('apples', 32) returns an inline <svg> string. Unknown slugs get a neutral crate.
const INK = '#0d1b2a';
const S = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

const BODY = {
  power:     `<polygon points="27,4 12,27 22,27 19,44 36,19 26,19" fill="#e0a526" ${S}/>`,
  water:     `<path d="M24 5 C24 5 11 21 11 30 a13 13 0 0 0 26 0 C37 21 24 5 24 5Z" fill="#1f9d8a" ${S}/><path d="M17 31 a7 7 0 0 0 5 6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  seeds:     `<path d="M24 44 V22" fill="none" ${S}/><ellipse cx="16" cy="18" rx="8" ry="5" fill="#6fbf5a" ${S} transform="rotate(-25 16 18)"/><ellipse cx="32" cy="16" rx="8" ry="5" fill="#6fbf5a" ${S} transform="rotate(25 32 16)"/>`,
  apples:    `<path d="M24 14 C16 8 6 14 8 28 C10 40 18 44 24 41 C30 44 38 40 40 28 C42 14 32 8 24 14Z" fill="#e4572e" ${S}/><path d="M24 14 V9" fill="none" ${S}/><path d="M25 9 C28 3 34 4 35 6 C31 9 28 10 25 9Z" fill="#6fbf5a" ${S}/>`,
  oranges:   `<circle cx="24" cy="26" r="16" fill="#f29a2e" ${S}/><path d="M24 10 V6" fill="none" ${S}/><path d="M24 8 C27 4 32 5 33 7 C30 9 27 9 24 8Z" fill="#6fbf5a" ${S}/>`,
  grapes:    `<circle cx="17" cy="22" r="5" fill="#7b4fa0" ${S}/><circle cx="29" cy="22" r="5" fill="#7b4fa0" ${S}/><circle cx="23" cy="30" r="5" fill="#7b4fa0" ${S}/><circle cx="35" cy="30" r="5" fill="#7b4fa0" ${S}/><circle cx="17" cy="38" r="5" fill="#7b4fa0" ${S}/><circle cx="29" cy="38" r="5" fill="#7b4fa0" ${S}/><path d="M24 14 V6 M24 8 C30 4 36 6 36 8" fill="none" ${S}/>`,
  grain:     `<path d="M24 44 V8" fill="none" ${S}/><path d="M24 20 C18 18 16 14 16 10 C21 11 24 15 24 20Z M24 20 C30 18 32 14 32 10 C27 11 24 15 24 20Z M24 30 C18 28 16 24 16 20 C21 21 24 25 24 30Z M24 30 C30 28 32 24 32 20 C27 21 24 25 24 30Z" fill="#e0a526" ${S}/>`,
  minerals:  `<polygon points="24,5 40,20 24,44 8,20" fill="#5bb3e6" ${S}/><polygon points="24,5 32,20 24,20 16,20" fill="#bfe3f7" ${S}/>`,
  clay:      `<path d="M16 10 H32 C34 16 40 20 38 32 C36 42 30 44 24 44 C18 44 12 42 10 32 C8 20 14 16 16 10Z" fill="#b5673a" ${S}/><path d="M14 10 H34" fill="none" ${S}/>`,
  limestone: `<path d="M8 36 L14 18 L24 12 L34 16 L40 34 L30 42 L14 42Z" fill="#9aa3ab" ${S}/><path d="M24 12 L22 26 L14 42 M22 26 L34 22" fill="none" stroke="${INK}" stroke-width="1.5" opacity=".5"/>`,
  sand:      `<path d="M4 38 Q16 22 28 34 Q36 26 44 36 V44 H4Z" fill="#e0c27a" ${S}/><path d="M6 28 Q16 14 26 24" fill="none" ${S}/>`,
  bricks:    `<rect x="6" y="14" width="36" height="12" fill="#c0583a" ${S}/><rect x="6" y="28" width="36" height="12" fill="#c0583a" ${S}/><path d="M24 14 V26 M14 28 V40 M34 28 V40" fill="none" ${S}/>`,
  planks:    `<rect x="6" y="8" width="36" height="8" fill="#c89a5b" ${S}/><rect x="6" y="20" width="36" height="8" fill="#c89a5b" ${S}/><rect x="6" y="32" width="36" height="8" fill="#c89a5b" ${S}/>`,
  timber:    `<rect x="8" y="10" width="32" height="28" rx="14" fill="#8a5a34" ${S}/><circle cx="24" cy="24" r="9" fill="#c89a5b" ${S}/><circle cx="24" cy="24" r="4" fill="none" ${S}/>`,
  flour:     `<path d="M12 14 H36 L40 44 H8Z" fill="#f3eee4" ${S}/><path d="M12 14 L18 8 H30 L36 14" fill="#e6dccb" ${S}/><path d="M18 26 H30" fill="none" ${S}/>`,
  juice:     `<path d="M14 12 H34 L36 44 H12Z" fill="#f5a623" ${S}/><path d="M14 12 H34" fill="none" ${S}/><path d="M30 12 L34 4" fill="none" ${S}/><circle cx="24" cy="30" r="4" fill="#fff" opacity=".6"/>`,
  bread:     `<path d="M8 36 C6 24 14 14 24 14 C34 14 42 24 40 36 Z" fill="#d9a05b" ${S}/><path d="M16 26 L20 20 M24 24 L28 18 M30 30 L34 26" fill="none" ${S}/>`,
  glass:     `<rect x="8" y="8" width="32" height="32" rx="2" fill="#a9d8f0" ${S}/><path d="M14 36 L36 14" fill="none" stroke="#fff" stroke-width="2" opacity=".8"/>`,
  cement:    `<path d="M10 12 H38 L42 44 H6Z" fill="#b8bcc2" ${S}/><path d="M10 12 L18 6 H30 L38 12" fill="#d7dade" ${S}/><path d="M16 26 H32" fill="none" ${S}/>`,
  steel:     `<path d="M8 10 H40 V16 H28 V32 H40 V38 H8 V32 H20 V16 H8Z" fill="#7d8790" ${S}/>`,
  furniture: `<path d="M14 8 H34 V28 H14Z" fill="#a0522d" ${S}/><path d="M10 26 H38 V34 H10Z" fill="#c07a4c" ${S}/><path d="M14 34 V44 M34 34 V44" fill="none" ${S}/>`,
  windows:   `<rect x="8" y="8" width="32" height="32" fill="#a9d8f0" ${S}/><path d="M24 8 V40 M8 24 H40" fill="none" ${S}/>`,
  machinery: `<circle cx="24" cy="24" r="14" fill="#1f9d8a" ${S}/><circle cx="24" cy="24" r="5" fill="#fff" ${S}/><path d="M24 4 V10 M24 38 V44 M4 24 H10 M38 24 H44" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`,
};

const FALLBACK = `<rect x="8" y="12" width="32" height="28" rx="3" fill="#d9dde2" ${S}/><path d="M8 22 H40" fill="none" ${S}/>`;

export function resIcon(slug, size = 32) {
  const body = BODY[slug] ?? FALLBACK;
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true" focusable="false">${body}</svg>`;
}
export const hasIcon = (slug) => slug in BODY;
