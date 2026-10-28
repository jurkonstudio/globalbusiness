import { supabase } from '../../core/supabase.js';
import { state } from '../../core/state.js';
import { shell } from '../../components/shell.js';
import { toast } from '../../components/toast.js';
import { esc } from '../../core/escape.js';
import { stateBlock, errorBlock, skeleton, confirmDialog, busy, classifyError } from '../../components/ui.js';
import { fetchContracts, effectiveStatus, isMine, myRole, totalOf, contractCard, otherName, refreshPage } from '../../components/contracts.js';
import { money2, qty as fq } from '../../core/format.js';

export function render() {
  return shell('Contracts', 'Incoming', `<div id="ci">${skeleton(2, 120)}</div>`);
}

export async function mount() {
  const el = document.getElementById('ci');
  const [{ rows, byId, error }, inv] = await Promise.all([fetchContracts(), supabase.from('inventory').select('resource_id, quantity')]);
  if (!el) return;
  if (error || inv.error) { el.innerHTML = errorBlock('Your contracts could not be loaded.'); return; }
  const stock = Object.fromEntries((inv.data ?? []).map((x) => [x.resource_id, Number(x.quantity)]));
  const open = rows.filter((k) => !isMine(k) && effectiveStatus(k) === 'pending');
  if (!open.length) {
    el.innerHTML = stateBlock({ icon: 'contract', title: 'No contract offers for you', text: 'When another company sends you an offer, it appears here until it expires.', action: { href: '#/contracts/outgoing', label: 'Make an offer' } });
    return;
  }
  const cash = Number(state.company.cash);
  el.innerHTML = `<div class="stack">${open.map((k) => {
    const role = myRole(k), short = role === 'seller' ? (stock[k.resource_id] ?? 0) < Number(k.qty) : cash < totalOf(k);
    const warn = short ? `<p class="err" role="alert" style="margin:0">${role === 'seller' ? `You only have ${fq(stock[k.resource_id] ?? 0)} in stock.` : `You have ${money2(cash)}, you need ${money2(totalOf(k))}.`}</p>` : '';
    return contractCard(k, byId, `${warn}<div class="row end"><button class="btn-ghost" data-no="${k.id}">Decline</button><button class="btn" data-yes="${k.id}">Accept</button></div>`);
  }).join('')}</div>
  <p class="honest">Accepting swaps goods and cash immediately. If the stock or cash is missing on either side at that moment, nothing happens. Offers expire on their own.</p>`;

  el.onclick = async (e) => {
    const b = e.target.closest('[data-yes],[data-no]');
    if (!b) return;
    const accept = 'yes' in b.dataset, k = open.find((x) => x.id === (b.dataset.yes ?? b.dataset.no));
    if (!k) return;
    const name = byId[k.resource_id]?.name ?? '', role = myRole(k);
    const ok = await confirmDialog({
      title: accept ? 'Accept this contract?' : 'Decline this contract?', confirmLabel: accept ? 'Accept' : 'Decline', danger: !accept,
      rows: [['Company', esc(otherName(k))], ['Resource', esc(name)], ['Quantity', fq(k.qty)], ['Price per unit', money2(k.unit_price)],
        [role === 'seller' ? 'You receive' : 'You pay', `<b>${money2(totalOf(k))}</b>`]],
      note: accept ? (role === 'seller' ? 'The goods leave your warehouse right away.' : 'The cash leaves your account right away.') : '' });
    if (!ok) return;
    busy(b, async () => {
      const { data, error: err } = await supabase.rpc('respond_contract', { p_contract: k.id, p_accept: accept });
      if (err) { toast(classifyError(err).text, true); refreshPage(); return; }
      toast(data === 'accepted' ? 'Contract accepted' : data === 'declined' ? 'Contract declined' : 'This offer had expired');
      refreshPage();
    });
  };
}
