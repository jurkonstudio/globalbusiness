// One place for number, money, duration and date formatting so every page reads the same.
// Money is always USD with a "$" prefix; the minus sign sits before the "$".
const nf = (min, max) => new Intl.NumberFormat('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const N0 = nf(0, 0), N2 = nf(2, 2), Q = nf(0, 2);

export const money = (n) => (Number(n) < 0 ? '-$' : '$') + N0.format(Math.abs(Number(n) || 0));
export const money2 = (n) => (Number(n) < 0 ? '-$' : '$') + N2.format(Math.abs(Number(n) || 0));
// Cash-flow style: always shows + or -.
export const signed2 = (n) => (Number(n) < 0 ? '-$' : '+$') + N2.format(Math.abs(Number(n) || 0));
export const qty = (n) => Q.format(Number(n) || 0);
export const compact = (n) => {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace('.0', '') + 'k';
  return Q.format(n);
};
export const percent = (n, d = 0) => nf(d, d).format(Number(n) || 0) + '%';

// 3725 -> "1h 2m", 95 -> "1m 35s", 40 -> "40s"
export const duration = (s) => {
  s = Math.max(0, Math.ceil(Number(s) || 0));
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
};
export const dateTime = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const clock = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const timeAgo = (d) => {
  const s = Math.round((Date.now() - new Date(d)) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return Math.round(s / 60) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
};
