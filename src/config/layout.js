import { MODULES } from './modules.js';

// Single source of truth for navigation (Sim Companies-style shell).
//   Bottom tabs  -> main areas
//   Sub-bar      -> icon row above the bottom tabs, per area ("hub")
//   Drawer       -> hamburger menu
// Routes are '#/<module>/<section>' and still map to src/pages/<module>/<section>.js.
// A match of 'module/*' claims every section of a module (they get the in-page tab row).

export const TABS = [
  { id: 'map',       title: 'Map',       icon: 'map',       to: '#/map/world' },
  { id: 'warehouse', title: 'Warehouse', icon: 'warehouse', to: '#/warehouse/inventory' },
  { id: 'search',    title: 'Search',    icon: 'search',    to: '#/search/companies' },
  { id: 'chat',      title: 'Chat',      icon: 'chat',      to: '#/messages/inbox' },
  { id: 'exchange',  title: 'Market',    icon: 'exchange',  to: '#/marketplace/buy' },
];

export const HUBS = {
  // No chip row on the world map itself (full-bleed); on every other map or building page the chips show.
  map: { modules: ['map', 'buildings'], items: [
    { icon: 'map',   title: 'Map',       match: ['map/*'] },
    { icon: 'build', title: 'Buildings', match: ['buildings/*'] },
  ] },
  warehouse: { items: [
    { icon: 'warehouse',title: 'Inventory',    match: ['warehouse/inventory'] },
    { icon: 'contract', title: 'Contracts',    match: ['contracts/*'] },
    { icon: 'doc',      title: 'Transactions', match: ['warehouse/transactions'] },
    { icon: 'bars',     title: 'Storage',      match: ['warehouse/storage-upgrades'] },
    { icon: 'flask',    title: 'Research',     match: ['research/*'] },
  ] },
  search: { modules: ['search'], items: [] },
  chat: { items: [
    { icon: 'inbox', title: 'Inbox', match: ['messages/inbox'] },
    { icon: 'send',  title: 'Sent',  match: ['messages/sent'] },
  ] },
  exchange: { items: [
    { icon: 'buy',      title: 'Buy',       match: ['marketplace/buy'] },
    { icon: 'sell',     title: 'Sell',      match: ['marketplace/sell'] },
    { icon: 'orders',   title: 'My orders', match: ['marketplace/my-orders'] },
    { icon: 'bars',     title: 'Listings',  match: ['exchange/listings'] },
    { icon: 'exchange', title: 'Trades',    match: ['exchange/trades'] },
    { icon: 'chart',    title: 'Prices',    match: ['exchange/price-charts', 'marketplace/price-history'] },
  ] },
  // Opened from the company name (top-left). Not a bottom tab.
  company: { items: [
    { icon: 'hq',     title: 'Overview',  match: ['headquarters/overview'] },
    { icon: 'chart',  title: 'Statistics',match: ['headquarters/statistics'] },
    { icon: 'wallet', title: 'Finance',   match: ['banking/*'] },
    { icon: 'exec',   title: 'Executives',match: ['executives/*'] },
    { icon: 'store',  title: 'Retail',    match: ['retail/*'] },
    { icon: 'trophy', title: 'Ranking',   match: ['ranking/*'] },
    { icon: 'bell',   title: 'Alerts',    match: ['headquarters/notifications'] },
  ] },
};
// Each item links to its first route.
for (const h of Object.values(HUBS)) {
  for (const it of h.items) {
    const [mod, sub] = it.match[0].split('/');
    it.to = '#/' + mod + '/' + (sub === '*' ? MODULES.find((m) => m.id === mod).subs[0].id : sub);
  }
}

export const DRAWER = [
  { icon: 'info', title: 'About',            to: '#/menu/about' },
  { icon: 'book', title: 'Library',          to: '#/menu/library' },
  { icon: 'doc', title: 'Encyclopedia',     to: '#/encyclopedia/resources' },
  { icon: 'gift', title: 'Referral program', to: '#/menu/referral' },
  { icon: 'star', title: 'Creators club',    to: '#/menu/creators-club' },
  { icon: 'trophy', title: 'Achievements',     to: '#/menu/achievements' },
  { icon: 'note', title: 'Notes',            to: '#/menu/notes' },
  { icon: 'key', title: 'Redeem code',      to: '#/menu/redeem-code' },
  { icon: 'globe', title: 'Realms',           to: '#/menu/realms' },
  { icon: 'cog', title: 'Settings',         to: '#/settings/profile' },
];

// Where does a route live? -> { hub, item, tabs }
export function locate(moduleId, subId) {
  const key = `${moduleId}/${subId}`;
  for (const [hub, h] of Object.entries(HUBS)) {
    const item = h.items.findIndex((it) => it.match.some((m) => m === key || m === `${moduleId}/*`));
    if (item >= 0) return { hub, item, tabs: h.items[item].match.includes(`${moduleId}/*`) };
  }
  for (const [hub, h] of Object.entries(HUBS)) if (h.modules?.includes(moduleId)) return { hub, item: -1, tabs: !(moduleId === 'map' && subId === 'world') };
  return { hub: null, item: -1, tabs: true };
}
