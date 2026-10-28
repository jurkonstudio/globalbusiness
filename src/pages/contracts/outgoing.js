import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock, busy, statusChip, confirmDialog } from '../../components/ui.js';
import { money, qty, dateTime } from '../../core/format.js';
import { toast } from '../../components/toast.js';

export function render() {
  return shell('Contracts', 'Outgoing (My Offers)', `
    <p class="muted" style="margin-top:0">Post a buy order. Your cash is held in escrow until a seller fulfills it.</p>
    
    <div class="card" style="margin-bottom:24px;">
      <h3>Create New Contract</h3>
      <div class="stack" id="create-form">
        <div class="fld">
          <label>Resource</label>
          <select id="c-resource"><option>Loading...</option></select>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="fld">
            <label>Quantity</label>
            <input id="c-qty" type="number" min="1" step="1" placeholder="e.g. 50" />
          </div>
          <div class="fld">
            <label>Price per unit ($)</label>
            <input id="c-price" type="number" min="0.01" step="0.01" placeholder="e.g. 15.00" />
          </div>
        </div>
        <p class="muted" id="c-total" style="font-weight:bold;">Total Value: $0.00</p>
        <button class="btn" id="c-submit" disabled>Place Buy Order</button>
      </div>
    </div>

    <h3>My Active Orders</h3>
    <div id="outgoing-list">${skeleton(2, 100)}</div>`);
}

export async function mount() {
  const myCompanyId = state.company?.id;
  const selRes = document.getElementById('c-resource');
  const inQty = document.getElementById('c-qty');
  const inPrice = document.getElementById('c-price');
  const txtTotal = document.getElementById('c-total');
  const btnSubmit = document.getElementById('c-submit');
  const list = document.getElementById('outgoing-list');

  // 1. Load resources into dropdown
  const { data: resources } = await supabase.from('resources').select('id, name').order('name');
  if (resources) {
    selRes.innerHTML = resources.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');
  }

  // 2. Hitung Total otomatis saat mengetik
  const calcTotal = () => {
    const q = parseFloat(inQty.value) || 0;
    const p = parseFloat(inPrice.value) || 0;
    const total = q * p;
    txtTotal.textContent = `Total Value: ${money(total)}`;
    btnSubmit.disabled = !(q > 0 && p > 0 && total <= (state.company?.cash || 0));
  };
  inQty.oninput = calcTotal;
  inPrice.oninput = calcTotal;

  // 3. Submit Kontrak Baru
  btnSubmit.onclick = () => busy(btnSubmit, async () => {
    const p_resource = parseInt(selRes.value);
    const p_quantity = parseFloat(inQty.value);
    const p_price = parseFloat(inPrice.value);

    const { error } = await supabase.rpc('create_contract', { p_resource, p_quantity, p_price });
    if (error) return toast(error.message, true);
    
    toast('Buy order placed! Cash moved to escrow.');
    inQty.value = ''; inPrice.value = ''; calcTotal();
    loadMyContracts();
    window.dispatchEvent(new Event('hashchange')); // Refresh topbar cash
  });

  // 4. Load Kontrak Milikku
  async function loadMyContracts() {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, quantity, price_per_unit, total_value, status, created_at, resources(name), companies!seller_id(name)')
      .eq('buyer_id', myCompanyId)
      .order('created_at', { ascending: false });

    if (error) { list.innerHTML = errorBlock('Could not load your orders.'); return; }
    if (!data || data.length === 0) {
      list.innerHTML = stateBlock({ icon: 'contract', title: 'No active orders', text: 'Create one above.' });
      return;
    }

    list.innerHTML = data.map(c => {
      const isOpen = c.status === 'open';
      const tone = isOpen ? 'warn' : c.status === 'completed' ? 'ok' : 'idle';
      return `<article class="card" style="margin-bottom:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <h3 style="margin:0;">${qty(c.quantity)}x ${esc(c.resources.name)}</h3>
            <small class="muted">Posted ${dateTime(c.created_at)}</small>
          </div>
          ${statusChip(c.status.toUpperCase(), tone)}
        </div>
        <dl class="sum" style="margin-bottom:12px;">
          <div><dt>Price</dt><dd class="num">${money(c.price_per_unit)} / unit</dd></div>
          <div><dt>Total Escrow</dt><dd class="num">${money(c.total_value)}</dd></div>
        </dl>
        ${isOpen ? `<button class="btn-ghost" data-cancel="${c.id}" style="width:100%;">Cancel Order (Refund Escrow)</button>` : ''}
        ${c.companies ? `<p class="muted" style="margin:8px 0 0 0; font-size:0.85rem;">Fulfilled by: <b>${esc(c.companies.name)}</b></p>` : ''}
      </article>`;
    }).join('');

    list.querySelectorAll('[data-cancel]').forEach(btn => {
      btn.onclick = () => busy(btn, async () => {
        const ok = await confirmDialog({
          title: 'Cancel Order?',
          rows: [['Action', 'Return cash from escrow']],
          note: 'This will remove the contract from the market.',
          confirmLabel: 'Cancel Order', danger: true
        });
        if (!ok) return;

        const { error: err } = await supabase.rpc('cancel_contract', { p_contract: btn.dataset.cancel });
        if (err) return toast(err.message, true);
        toast('Order cancelled. Cash refunded.');
        loadMyContracts();
        window.dispatchEvent(new Event('hashchange'));
      });
    });
  }

  loadMyContracts();
}
