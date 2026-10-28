// Original line icons (24x24, stroke = currentColor). Replace freely with your own artwork.
const P = {
  map: '<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4z"/><path d="M9 4v13M15 7v13"/>',
  warehouse: '<rect x="8" y="3" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 5 5"/>',
  chat: '<path d="M4 5h16v11H10l-5 4v-4H4z"/>',
  exchange: '<path d="M4 8h15m-4-4 4 4-4 4"/><path d="M20 16H5m4-4-4 4 4 4"/>',
  chart: '<path d="M3 20h18"/><path d="M4 17l5-6 4 3 5-8 2 2v12H4z"/>',
  contract: '<path d="M5 20V4h10l3 3v4"/><path d="M8 9h6M8 13h4"/><path d="m13 20 1-3 6-6 2 2-6 6z"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7"/>',
  bars: '<path d="M4 4v16h16"/><path d="M8 9h8M8 13h11M8 17h5"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M8 15h8"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bubble: '<path d="M3 4h18v12H10l-5 4v-4H3z"/>',
  star: '<path d="m12 2 3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z"/>',
  buy: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h3l2.5 11H19l2-8H7"/>',
  sell: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
  orders: '<path d="M5 6h14M5 12h14M5 18h9"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/>',
  send: '<path d="M3 11 21 3l-6 18-3-7z"/>',
  hq: '<path d="M4 20V9l8-5 8 5v11z"/><path d="M10 20v-6h4v6"/>',
  exec: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/>',
  store: '<path d="M4 9l2-5h12l2 5"/><path d="M5 9v11h14V9"/><path d="M4 9a3 3 0 0 0 5 0 3 3 0 0 0 6 0 3 3 0 0 0 5 0"/>',
  bank: '<path d="M3 9l9-5 9 5z"/><path d="M5 11v7M10 11v7M14 11v7M19 11v7M3 20h18"/>',
  trophy: '<path d="M8 4h8v6a4 4 0 0 1-8 0z"/><path d="M8 6H4c0 3 1 4 4 5M16 6h4c0 3-1 4-4 5M12 14v4M8 20h8"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  build: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
};

export const ic = (name, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] ?? P.globe}</svg>`;

// Phase 2 additions (status + drawer icons)
Object.assign(P, {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 10v5M12 17.5v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  up: '<path d="M12 20V5m-6 6 6-6 6 6"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  book: '<path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M5 16a4 4 0 0 1 4-4h9"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M3 9h18M12 9v11M12 9c-3 0-4-4-1.5-4S12 9 12 9zm0 0c3 0 4-4 1.5-4S12 9 12 9z"/>',
  note: '<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8m-3 3 3 3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-4 3.2-6 6.5-6s5.700 2 6.500 6"/><path d="M16 5a3.500 3.500 0 0 1 0 7M18 14c2 .8 3.200 2.700 3.500 6"/>',
  wallet: '<path d="M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z"/><path d="M4 7V6a2 2 0 0 1 2-2h11"/><circle cx="16" cy="13.500" r="1.200"/>',
});

// Header icons (cash coin + Global Token hexagon)
Object.assign(P, {
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6.500v11M14.700 9.300c-.6-.9-1.600-1.300-2.700-1.300-1.500 0-2.600.8-2.600 2s1.100 1.700 2.600 2 2.600.8 2.600 2-1.100 2-2.600 2c-1.100 0-2.100-.4-2.700-1.300"/>',
  gt: '<path d="M12 2.500 20 7v10l-8 4.500L4 17V7z"/><path d="M15.200 9.600A3.800 3.800 0 1 0 15.200 14.400V12h-2.800"/>',
});
