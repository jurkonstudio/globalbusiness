// Escapes text before it is placed into innerHTML. Use for anything a player can type (company names).
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => MAP[ch]);
