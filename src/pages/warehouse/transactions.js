import { supabase } from '../../core/supabase.js';
import { shell } from '../../components/shell.js';

const LABEL = { npc_buy: 'Bought from NPC', npc_sell: 'Sold to NPC', build: 'Construction',
  upgrade: 'Upgrade', freight: 'Freight', mission: 'Mission reward' };
const money = (n) => (n < 0 ? '-$' : '+$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function render() {
  return shell('Warehouse', 'Transactions', '<div id="tx" class="stack">Loading…</div>');
}

export async function mount() {
  const el = document.getElementById('tx');
  const { data, error } = await supabase.from('transactions')
    .select('id, kind, amount, balance_after, qty, note, created_at, resources(name)')
    .order('created_at', { ascending: false }).limit(100);
  if (error) { el.innerHTML = '<div class="empty">Ledger unavailable. Run migration 007.</div>'; return; }
  if (!data.length) { el.innerHTML = '<div class="empty">No transactions yet.</div>'; return; }
  el.innerHTML = data.map((t) => {
    const what = t.resources?.name ? `${esc(t.resources.name)}${t.qty ? ' × ' + Number(t.qty) : ''}` : esc(t.note);
    return `<div class="card row" style="justify-content:space-between">
      <div><b>${esc(LABEL[t.kind] ?? t.kind)}</b><br><span class="muted">${what} · ${new Date(t.created_at).toLocaleString()}</span></div>
      <div style="text-align:right"><b style="color:${t.amount < 0 ? '#e5736b' : '#4ec98a'}">${money(Number(t.amount))}</b><br>
      <span class="muted">Balance $${Number(t.balance_after).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div></div>`;
  }).join('');
}
