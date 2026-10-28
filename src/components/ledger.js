// Shared view of the `transactions` table (the cash ledger written by apply_cash on the server).
// Income vs expense is decided by the sign of `amount`, never guessed from the kind.
import { supabase } from '../core/supabase.js';
import { esc } from '../core/escape.js';
import { qty, money2, signed2, dateTime } from '../core/format.js';

export const KIND_LABEL = {
  npc_buy: 'Bought from NPC', npc_sell: 'Sold to NPC', build: 'Construction', upgrade: 'Upgrade',
  freight: 'Freight fee', mission: 'Mission reward', exchange_buy: 'Bought on Market', exchange_sell: 'Sold on Market',
};
export const kindLabel = (k) => KIND_LABEL[k] ?? k;
export const GOODS_KINDS = ['npc_buy', 'npc_sell', 'exchange_buy', 'exchange_sell', 'freight'];
export const PAGE_CAP = 1000;   // Supabase returns at most this many rows per request

// -> { rows, error, capped }.  `capped` = the request hit the row cap, so totals may be incomplete.
export async function fetchLedger({ since = null, kinds = null, limit = 100 } = {}) {
  let q = supabase.from('transactions')
    .select('id, kind, amount, balance_after, qty, note, created_at, resources(name)')
    .order('created_at', { ascending: false }).limit(limit);
  if (since) q = q.gte('created_at', new Date(since).toISOString());
  if (kinds) q = q.in('kind', kinds);
  const { data, error } = await q;
  return { rows: data ?? [], error, capped: !!data && data.length >= limit && limit >= PAGE_CAP };
}

export function sumFlows(rows) {
  let income = 0, expense = 0;
  const byKind = {};
  for (const t of rows) {
    const a = Number(t.amount);
    if (a >= 0) income += a; else expense += -a;
    const k = (byKind[t.kind] ??= { income: 0, expense: 0, n: 0 });
    if (a >= 0) k.income += a; else k.expense += -a;
    k.n++;
  }
  return { income, expense, net: income - expense, count: rows.length, byKind };
}

export function ledgerRow(t) {
  const a = Number(t.amount);
  const what = t.resources?.name ? `${esc(t.resources.name)}${t.qty ? ' × ' + qty(t.qty) : ''}` : esc(t.note ?? '');
  return `<li class="fi"><div class="tx"><b>${esc(kindLabel(t.kind))}</b>
      <small>${what ? what + ' · ' : ''}${dateTime(t.created_at)}</small></div>
    <div style="text-align:right"><span class="amt ${a < 0 ? 'neg' : 'pos'}">${signed2(a)}</span>
      <small class="num" style="display:block;color:#5b6672;font-size:.74rem">Balance ${money2(t.balance_after)}</small></div></li>`;
}

export const ledgerList = (rows) => `<ul class="feed">${rows.map(ledgerRow).join('')}</ul>`;
