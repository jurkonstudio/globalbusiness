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
  { id: 'exchange',  title: 'Exchange',  icon: 'exchange',  to: '#/marketplace/buy' },
];

export const HUBS = {
  map: { modules: ['map', 'buildings'], items: [] },
  warehouse: { items: [
    { icon: 'chart',    title: 'Statistics',   match: ['headquarters/statistics'] },
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
  // Opened from the avatar (top-left). Not a bottom tab.
  company: { items: [
    { icon: 'hq',     title: 'Overview',  match: ['headquarters/overview'] },
    { icon: 'exec',   title: 'Executives',match: ['executives/*'] },
    { icon: 'store',  title: 'Retail',    match: ['retail/*'] },
    { icon: 'bank',   title: 'Banking',   match: ['banking/*'] },
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
  { title: 'About',            to: '#/menu/about' },
  { title: 'Library',          to: '#/menu/library' },
  { title: 'Encyclopedia',     to: '#/encyclopedia/resources' },
  { title: 'Referral program', to: '#/menu/referral' },
  { title: 'Creators club',    to: '#/menu/creators-club' },
  { title: 'Achievements',     to: '#/menu/achievements' },
  { title: 'Notes',            to: '#/menu/notes' },
  { title: 'Redeem code',      to: '#/menu/redeem-code' },
  { title: 'Realms',           to: '#/menu/realms' },
  { title: 'Settings',         to: '#/settings/profile' },
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
