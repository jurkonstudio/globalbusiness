// Shared helpers for the three Contracts pages. Rules mirror the server (create_contract / respond_contract);
// the server stays the authority, these only give instant, readable feedback.
import { supabase } from '../core/supabase.js';
import { state } from '../core/state.js';
import { esc } from '../core/escape.js';
import { statusChip } from './ui.js';
import { money2, qty as fq, timeAgo, dateTime } from '../core/format.js';
import { cents } from './market.js';

// -> { rows, byId (resources), error }. RLS already limits rows to contracts the player is part of.
export async function fetchContracts() {
  const [res, k] = await Promise.all([
    supabase.from('resources').select('id, name, base_price').order('name'),
    supabase.from('contracts').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  return {
    error: res.error || k.error,
    rows: k.data ?? [],
    byId: Object.fromEntries((res.data ?? []).map((r) => [r.id, r])),
  };
}

// An open contract past its expiry is shown as expired even before the server marks it.
export const effectiveStatus = (k, now = Date.now()) =>
  k.status === 'pending' && new Date(k.expires_at) <= now ? 'expired' : k.status;

export const isMine = (k) => k.proposer_id === state.company.id;
export const otherName = (k) => (isMine(k) ? k.counterparty_name : k.proposer_name);
// My side of the deal: 'seller' delivers goods, 'buyer' pays cash.
export const myRole = (k) => ((k.proposer_role === 'seller') === isMine(k) ? 'seller' : 'buyer');
export const totalOf = (k) => cents(Number(k.qty) * Number(k.unit_price));

const TONE = { pending: 'info', accepted: 'ok', declined: 'bad', cancelled: 'idle', expired: 'idle' };
const LABEL = { pending: 'Open', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired' };
export const statusOf = (k) => { const s = effectiveStatus(k); return statusChip(LABEL[s], TONE[s]); };

export const timeLeft = (iso, now = Date.now()) => {
  const ms = new Date(iso) - now;
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : h ? `${h}h ${m}m left` : `${m}m left`;
};

// One contract as a card. `actions` is trusted HTML (buttons). `detail` = what the player gives and gets.
export function contractCard(k, byId, actions = '') {
  const name = byId[k.resource_id]?.name ?? 'Unknown';
  const role = myRole(k);
  const who = isMine(k) ? `To ${esc(otherName(k))}` : `From ${esc(otherName(k))}`;
  const detail = role === 'seller'
    ? `You deliver ${fq(k.qty)} ${esc(name)} and receive <b>${money2(totalOf(k))}</b>`
    : `You pay <b>${money2(totalOf(k))}</b> and receive ${fq(k.qty)} ${esc(name)}`;
  const when = effectiveStatus(k) === 'pending' ? timeLeft(k.expires_at)
    : k.resolved_at ? dateTime(k.resolved_at) : timeAgo(k.created_at);
  return `<article class="order"><div class="top"><div><b>${esc(name)} × ${fq(k.qty)}</b>
      <div class="meta"><span>${who}</span><span>${when}</span></div></div>
      <div class="px">${money2(k.unit_price)}<small style="display:block;font:500 .72rem var(--font-body);color:#5b6672">per unit</small></div></div>
    <p style="margin:0">${detail}</p>${statusOf(k)}${actions}</article>`;
}

export const refreshPage = () => window.dispatchEvent(new Event('hashchange'));
