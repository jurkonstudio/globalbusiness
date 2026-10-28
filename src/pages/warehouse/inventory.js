import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';

export function render() {
  return shell('Warehouse', 'Inventory', '<div class="card scroll-x" id="inv">Loading…</div>');
}

export async function mount() {
  const el = document.getElementById('inv');
  const [r, i] = await Promise.all([
    supabase.from('resources').select('*').order('category').order('name'),
    supabase.from('inventory').select('resource_id, quantity'),
  ]);
  if (r.error || !r.data?.length) { el.textContent = 'No resources found. Run migration 002.'; return; }
  const stock = Object.fromEntries((i.data ?? []).map((x) => [x.resource_id, Number(x.quantity)]));
  const mk = Number(state.economy?.npc_markup ?? 1.5);

  el.innerHTML = `<table class="tbl"><tr><th>Resource</th><th>Stock</th><th>NPC price</th><th></th></tr>
    ${r.data.map((x) => `<tr><td>${x.name}<br><span class="muted">${x.category}</span></td>
      <td>${(stock[x.id] ?? 0).toLocaleString()}</td>
      <td>${x.npc_sells ? '$' + (x.base_price * mk).toFixed(2) : '—'}</td>
      <td>${x.npc_sells ? `<div class="row"><input type="number" min="1" value="10" />
        <button class="btn" data-buy="${x.id}">Buy</button></div>` : ''}</td></tr>`).join('')}</table>`;

  el.onclick = async (e) => {
    const id = e.target.dataset.buy;
    if (!id) return;
    const qty = Number(e.target.closest('.row').querySelector('input').value);
    e.target.disabled = true;
    const { data, error } = await supabase.rpc('buy_from_npc', { p_resource: Number(id), p_qty: qty });
    if (error) { toast(error.message, true); e.target.disabled = false; return; }
    toast(`Bought for $${data}`);
    window.dispatchEvent(new Event('hashchange'));
  };
}
