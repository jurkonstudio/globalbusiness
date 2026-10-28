import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { esc } from '../../core/escape.js';
import { skeleton, errorBlock, stateBlock, busy, confirmDialog } from '../../components/ui.js';
import { money, qty } from '../../core/format.js';
import { toast } from '../../components/toast.js';

export function render() {
  return shell('Contracts', 'Incoming (Market)', `
    <p class="muted" style="margin-top:0">Fulfill buy orders from other companies. You deliver the goods, you get paid instantly.</p>
    <div id="incoming-list">${skeleton(3, 100)}</div>`);
}

export async function mount() {
  const list = document.getElementById('incoming-list');
  if (!list) return;

  const myCompanyId = state.company?.id;

  async function loadContracts() {
    // Ambil kontrak yang statusnya 'open' dan BUKAN milik kita sendiri
    const { data, error } = await supabase
      .from('contracts')
      .select('id, quantity, price_per_unit, total_value, resources(name), companies!buyer_id(name)')
      .eq('status', 'open')
      .neq('buyer_id', myCompanyId)
      .order('created_at', { ascending: false });

    if (error) { list.innerHTML = errorBlock('Could not load contracts.'); return; }
    if (!data || data.length === 0) {
      list.innerHTML = stateBlock({ icon: 'contract', title: 'No open contracts', text: 'Check back later or create your own in Outgoing.' });
      return;
    }

    list.innerHTML = `<div class="list-group">${data.map(c => `
      <article class="card" style="margin-bottom:12px; padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <div>
            <h3 style="margin:0 0 4px 0; font-size:1.1rem;">${esc(c.companies.name)} needs goods</h3>
            <span class="chip" style="font-size:0.8rem; padding:2px 8px;">${esc(c.resources.name)}</span>
          </div>
          <div style="text-align:right;">
            <b class="num" style="color:var(--teal); font-size:1.2rem;">${money(c.total_value)}</b><br>
            <small class="muted">${money(c.price_per_unit)} / unit</small>
          </div>
        </div>
        <dl class="sum" style="margin-bottom:16px;">
          <div><dt>Quantity Required</dt><dd class="num"><b>${qty(c.quantity)}</b> units</dd></div>
        </dl>
        <button class="btn" data-accept="${c.id}" style="width:100%;">Accept & Deliver Goods</button>
      </article>
    `).join('')}</div>`;

    list.querySelectorAll('[data-accept]').forEach(btn => {
      btn.onclick = () => busy(btn, async () => {
        const ok = await confirmDialog({
          title: 'Accept Contract?',
          rows: [['Action', 'Deliver goods from warehouse']],
          note: 'Goods will be deducted immediately, and cash will be added to your account.',
          confirmLabel: 'Deliver Now'
        });
        if (!ok) return;

        const { error: err } = await supabase.rpc('accept_contract', { p_contract: btn.dataset.accept });
        if (err) return toast(err.message, true);
        toast('Contract fulfilled! Cash added to your account.');
        loadContracts(); // Refresh list
        // Trigger global update for topbar
        window.dispatchEvent(new Event('hashchange'));
      });
    });
  }

  loadContracts();
}
